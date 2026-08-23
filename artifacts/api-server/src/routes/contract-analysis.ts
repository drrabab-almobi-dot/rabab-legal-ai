import { Router, type IRouter } from "express";
import { sanitizeOutput, PROHIBITION_RULE } from "../lib/content-filter.js";
import { charterSystemMsg } from "../lib/legal-charter.js";
import multer from "multer";
import { requireAuth } from "../middlewares/auth";
import { checkAndReserveService, commitService, releaseService } from "../lib/quota";
import { db, contractDraftsTable, serviceSessionsTable } from "@workspace/db";
import { eq, and, desc, sql } from "drizzle-orm";

const router: IRouter = Router();

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 20 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    const allowed = [
      "application/pdf", "text/plain",
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      "image/jpeg", "image/jpg", "image/png", "image/webp",
    ];
    if (allowed.includes(file.mimetype) || file.originalname.match(/\.(pdf|txt|docx|jpg|jpeg|png|webp)$/i)) {
      cb(null, true);
    } else {
      cb(new Error("يُسمح فقط بملفات PDF أو TXT أو DOCX أو صور (JPG/PNG/WEBP)"));
    }
  },
});

async function extractText(buffer: Buffer, mimetype: string, filename: string): Promise<{ text: string; pageCount?: number }> {
  if (mimetype === "text/plain" || filename.toLowerCase().endsWith(".txt")) {
    return { text: buffer.toString("utf-8") };
  }
  if (mimetype === "application/pdf" || filename.toLowerCase().endsWith(".pdf")) {
    try {
      const { default: pdfParse } = await import("pdf-parse/lib/pdf-parse.js" as any);
      const data = await pdfParse(buffer);
      return { text: data.text ?? "", pageCount: data.numpages ?? undefined };
    } catch {
      const pdfMod = await import("pdf-parse" as any);
      const fn = pdfMod.default ?? pdfMod;
      const data = await fn(buffer);
      return { text: data.text ?? "", pageCount: data.numpages ?? undefined };
    }
  }
  if (mimetype.includes("wordprocessingml") || filename.toLowerCase().endsWith(".docx")) {
    const mammoth = await import("mammoth");
    const result = await mammoth.extractRawText({ buffer });
    return { text: result.value ?? "" };
  }
  // صور — OCR باستخدام OpenAI Vision
  if (mimetype.startsWith("image/") || filename.toLowerCase().match(/\.(jpg|jpeg|png|webp)$/)) {
    const { default: OpenAI } = await import("openai");
    const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
    const base64 = buffer.toString("base64");
    const response = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [{
        role: "user",
        content: [
          { type: "image_url", image_url: { url: `data:${mimetype};base64,${base64}`, detail: "high" } },
          { type: "text", text: "استخرج جميع النصوص العربية والإنجليزية من هذه الصورة بدقة. حافظ على الترتيب الطبيعي للنص وبنيته. أعد النص فقط بدون تعليقات." },
        ],
      }],
      max_tokens: 4096,
      temperature: 0,
    });
    return { text: response.choices[0]?.message?.content ?? "", pageCount: 1 };
  }
  throw new Error("نوع الملف غير مدعوم");
}

const EXTRACT_CHAR_LIMIT = 40_000;
const SCANNED_THRESHOLD = 80; // أقل من هذا → على الأرجح ملف مصوّر
const TRIAL_PAGE_LIMIT   = 10;

// POST /api/contract/extract — returns extracted text, max 40000 chars
router.post("/contract/extract", requireAuth, upload.single("file"), async (req, res): Promise<void> => {
  if (!req.file) { res.status(400).json({ error: "لم يُرفق ملف" }); return; }
  try {
    const { text, pageCount } = await extractText(req.file.buffer, req.file.mimetype, req.file.originalname);
    const trimmed = text.trim();
    const isPdf = req.file.mimetype === "application/pdf" || req.file.originalname.toLowerCase().endsWith(".pdf");
    const isScanned = isPdf && trimmed.length < SCANNED_THRESHOLD;

    if (isScanned) {
      res.status(422).json({
        error: "الملف مصوّر ضوئياً",
        isScanned: true,
        charCount: trimmed.length,
        hint: "هذا الملف يحتوي على صور لا نصوص — لا يمكن استخراج النص منه تلقائياً. الحلول: (١) ارفع نسخة PDF نصية من نفس العقد، (٢) افتح الملف في Word أو Google Docs لتحويله، (٣) الصق نص العقد مباشرة في حقل الرسالة.",
      });
      return;
    }

    // فحص حد الصفحات لمستخدمي التجربة المجانية
    if (pageCount && pageCount > TRIAL_PAGE_LIMIT) {
      const { getQuotaStatus } = await import("../lib/quota.js");
      const quotaStatus = await getQuotaStatus((req as any).user.userId);
      const isTrial = !quotaStatus.subscription || quotaStatus.subscription.type === 'free';
      if (isTrial) {
        res.status(403).json({
          error: `يمكن للتجربة المجانية تحليل حتى ${TRIAL_PAGE_LIMIT} صفحات (الملف يحتوي على ${pageCount} صفحة). اشترك للوصول الكامل.`,
          trialLimit: true,
          pageCount,
          limit: TRIAL_PAGE_LIMIT,
        });
        return;
      }
    }

    const truncated = trimmed.slice(0, EXTRACT_CHAR_LIMIT);
    res.json({
      filename: req.file.originalname,
      extractedText: truncated,
      charCount: trimmed.length,
      pageCount,
      wasTruncated: trimmed.length > EXTRACT_CHAR_LIMIT,
      isScanned: false,
    });
  } catch (err: any) {
    res.status(422).json({ error: err.message || "فشل استخراج النص" });
  }
});

// ─── POST /api/contract/draft ─────────────────────────────────────────────────
// ─── متطلبات الصياغة المشتركة — مستقاة من دليل أوامر صياغة العقود السعودية ──
const SA_COMMON = `
أنت باحثة قانونية سعودية متخصصة في صياغة العقود، تعمل ضمن منصة RABAB LEGAL AI.
${PROHIBITION_RULE}

متطلبات الصياغة الإلزامية (تُطبَّق على كل عقد بلا استثناء):

هيكل العقد:
- ابدأ بـ "بسم الله الرحمن الرحيم" ثم عنوان العقد.
- قسّم العقد إلى: تمهيد → تعريفات → مواد مرقمة → ملاحق. التمهيد والملاحق جزء لا يتجزأ من العقد.
- الديباجة: "تم إبرام هذا العقد بتاريخ [......] هـ الموافق [......] م بمدينة [...] بين كلٍّ من:"
- كل مادة تحمل رقماً وعنواناً. الفقرات الفرعية تُرمز بالحروف (أ، ب، ج). الأرقام هجرية ثم ميلادية بين قوسين.

قواعد الصياغة:
- استخدم مصطلحات قانونية سعودية دقيقة. لا تستخدم مصطلحات أجنبية إلا عند الضرورة مع ذكر مقابلها العربي.
- اكتب الالتزامات بصياغة محددة قابلة للقياس والتنفيذ. تجنّب العبارات العامة أو الفضفاضة.
- لا تكرر الحكم ذاته في أكثر من مادة.
- ميّز بين الإخلال الجوهري والإخلال القابل للمعالجة، وحدد مدد الإشعار والمعالجة بوضوح.
- لا تذكر أرقام مواد نظامية إلا إن وردت صراحةً في المصادر المسترجعة؛ يكفي الإشارة إلى اسم النظام.

البنود الإلزامية في كل عقد:
١. القانون الحاكم: "يخضع هذا العقد وتُفسَّر أحكامه وفق أحكام الشريعة الإسلامية والأنظمة المرعية في المملكة العربية السعودية."
٢. تسوية النزاعات: يُسوَّى الخلاف ودياً خلال ثلاثين يوماً، فإن تعذّر أُحيل إلى التحكيم أو المحكمة المختصة في المملكة العربية السعودية.
٣. القوة القاهرة والظروف الطارئة: تعريفها، الإخطار الفوري، التعليق لا الإنهاء (حداً أقصى تسعين يوماً).
٤. الإنهاء: ميّز بين انتهاء المدة، الإنهاء بالاتفاق، الإنهاء دون سبب، الفسخ بسبب الإخلال. حدد المستحقات المالية وما يبقى سارياً بعد الإنهاء.
٥. الإشعارات: الوسيلة المعتمدة، العنوان، تاريخ الاعتبار.
٦. عدم التنازل: لا يجوز لأي طرف التنازل عن حقوقه أو نقل التزاماته إلا بموافقة خطية مسبقة.
٧. استقلالية البنود: بطلان بند لا يُسري على بقية العقد.
٨. التعديل الكتابي: لا يعتدّ بأي تعديل إلا إذا كان مكتوباً وموقَّعاً من الطرفين.
٩. عدم التنازل الضمني: التأخر في استعمال الحق أو التغاضي عن إخلال لا يُعدّ تنازلاً.

الخاتمة:
- مسطرة التوقيعات: جدول يتضمن اسم كل طرف، الصفة، التوقيع، التاريخ (هجري وميلادي)، الختم إن وُجد.
- ملاحظات قانونية في النهاية: اذكر البنود التي تحتاج معلومات إضافية أو تحققاً نظامياً، ووضع [يستكمل] عند كل معلومة ناقصة.
- المخرج هو نص العقد والملاحظات فقط — لا تعليقات خارجية ولا مقدمات أكاديمية.
- يُمنع منعاً باتاً إنهاء الرد بأي توقيع أو اسم شخصي أو رقم هاتف أو بريد إلكتروني أو رابط موقع أو عبارة ختامية ترحيبية (سعدنا بخدمتكم، بإشراف، للتواصل، وما شابهها).
`;

const CONTRACT_TEMPLATES: Record<string, { label: string; systemPrompt: string; fields: string[] }> = {
  employment: {
    label: "عقد عمل",
    fields: ["partyA","partyB","jobTitle","nationalityB","idNumberB","salary","duration","workHours","probation","gosiNumber","city"],
    systemPrompt: `أنت مستشار قانوني سعودي متخصص في قانون العمل. صِغ عقد عمل كاملاً يستوفي متطلبات نظام العمل السعودي الصادر بالمرسوم الملكي م/51 بتاريخ 23/8/1426هـ وتعديلاته بموجب المرسوم م/46 لعام 1436هـ، ولوائحه التنفيذية.

البنود الإلزامية التي يجب تضمينها مع ذكر المادة القانونية:
• اسم صاحب العمل وعنوانه ورقم السجل التجاري (المادة الخامسة عشرة)
• اسم العامل وجنسيته ومؤهله ورقم هويته أو إقامته (المادة الخامسة عشرة)
• المسمى الوظيفي والمهام التفصيلية (المادة الخامسة عشرة)
• الراتب الأساسي والبدلات مفصّلةً (المادة الخامسة عشرة)
• مدة العقد: محدد/غير محدد (المادة السابعة والثلاثون والثامنة والثلاثون)
• فترة التجربة ألا تتجاوز تسعين يوماً قابلة للتمديد إلى مائة وثمانين يوماً (المادة الثالثة والخمسون)
• ساعات العمل: لا تزيد على ثماني ساعات يومياً وثمانٍ وأربعين أسبوعياً (المادة التاسعة والتسعون)
• الإجازة السنوية: واحد وعشرون يوماً تزيد إلى ثلاثين بعد خمس سنوات (المادة التاسعة بعد المئة)
• إجازة المرض وفق المواد من المائة وثلاثة عشر إلى المائة وخمسة عشر
• التزام التأمين على العامل في التأمينات الاجتماعية (نظام التأمينات الاجتماعية م/33 لعام 1421هـ)
• إنهاء العقد: مكافأة نهاية الخدمة بواقع شهر عن كل سنة للأولى خمس سنوات ونصف شهر بعدها (المادة الرابعة والثمانون)
• حظر العمل لدى المنافسين لمدة سنتين بعد انتهاء العقد إن اتُّفق عليه (المادة الثالثة وثمانون)
• التزام صاحب العمل بسداد بدل الإسكان أو توفير مسكن لائق (المادة الثالثة والستون)

${SA_COMMON}`,
  },

  // ─── عقود الإيجار محذوفة — من اختصاص منصة إيجار الحكومية ───────────────────

  sales: {
    label: "عقد بيع",
    fields: ["partyA","idNumberA","partyB","idNumberB","itemDescription","itemCondition","price","vatIncluded","paymentMethod","deliveryDate","deliveryPlace","warranty","city"],
    systemPrompt: `أنت مستشار قانوني سعودي متخصص في عقود البيع والتجارة. صِغ عقد بيع كاملاً متوافقاً مع:
• نظام المعاملات المدنية الصادر بالمرسوم م/191 لعام 1443هـ (المواد 54-200 في أحكام البيع)
• نظام التجارة الصادر بالمرسوم م/30 لعام 1412هـ
• نظام ضريبة القيمة المضافة الصادر بالمرسوم م/113 لعام 1438هـ (15%)
• نظام ضمان المنتجات

البنود الإلزامية:
• وصف المبيع وصفاً دقيقاً نافياً للجهالة المفضية إلى النزاع (م 55-60 معاملات مدنية)
• حالة المبيع (جديد/مستعمل/كما هو) وشهادة الفحص إن وُجدت
• الثمن المحدد: الرقم والكتابة + الموقف من ضريبة القيمة المضافة (م 86)
• طريقة السداد: نقداً / تحويلاً / شيكاً مصرفياً مع بيانات التحويل
• تسليم المبيع: المكان والزمان وآلية نقل الملكية (م 92-95)
• ضمان العيوب الخفية: لمدة لا تقل عن ستة أشهر (م 120-130)
• ضمان استحقاق المبيع وخلوه من الحقوق للغير (م 107-115)
• حق المشتري في الفسخ وإعادة الثمن عند وجود عيب (م 124)
• أحكام السلعة التالفة قبل التسليم وبعده (م 95)
• التزام البائع بتسليم مستندات الملكية كاملة (خاصة للعقار والمركبات)

${SA_COMMON}`,
  },

  services: {
    label: "عقد خدمات مهنية",
    fields: ["partyA","crNumberA","partyB","idOrCrB","serviceDescription","totalFee","vatIncluded","duration","deliverables","paymentSchedule","penaltyRate","ipOwnership","city"],
    systemPrompt: `أنت مستشار قانوني سعودي متخصص في عقود الخدمات والاستشارات المهنية. صِغ عقد خدمات كاملاً متوافقاً مع:
• نظام المعاملات المدنية م/191 لعام 1443هـ (المواد 580-650 في عقد المقاولة والخدمات)
• نظام مكافحة الجرائم المعلوماتية م/17 لعام 1428هـ (لحماية البيانات والسرية)
• نظام الملكية الفكرية: نظام حق المؤلف م/41 لعام 1424هـ
• نظام ضريبة القيمة المضافة م/113 لعام 1438هـ

البنود الإلزامية:
• نطاق الخدمات وصفاً دقيقاً تفصيلياً مع استثناء صريح لما هو خارج النطاق (م 581)
• المخرجات والنتائج المتوقعة مع معايير القبول والجودة (م 582)
• الجدول الزمني ومعالم التسليم (Milestones) (م 584)
• الأتعاب: القيمة الإجمالية، جدول الدفع المرتبط بالمخرجات، الموقف من الضريبة (م 586)
• غرامة التأخير: لا تتجاوز 10% من قيمة العقد وفق المبادئ القضائية السعودية (م 588)
• السرية وحماية البيانات وفق نظام حماية البيانات الشخصية م/19 لعام 1443هـ
• ملكية الأعمال الفكرية المنجزة: إذا كانت للعميل فبشكل صريح (نظام حق المؤلف م 4)
• حظر تعارض المصالح والعمل لدى المنافسين خلال مدة العقد وسنتين بعده (م 590)
• إنهاء العقد: الإشعار المطلوب (ثلاثون يوماً)، التسويات المالية عند الإنهاء (م 594)
• الاستقلالية المهنية: المقاول مستقل وليس موظفاً وغير مشمول بنظام العمل (م 580)

${SA_COMMON}`,
  },

  construction: {
    label: "عقد مقاولة",
    fields: ["partyA","crNumberA","partyB","crNumberB","projectDescription","projectLocation","contractValue","vatIncluded","duration","startDate","paymentSchedule","penaltyPerDay","performanceBond","defectsLiability","city"],
    systemPrompt: `أنت مستشار قانوني سعودي متخصص في عقود الإنشاء والمقاولات. صِغ عقد مقاولة كاملاً متوافقاً مع:
• نظام المعاملات المدنية م/191 لعام 1443هـ (المواد 580-650 عقد المقاولة)
• نظام المنافسات والمشتريات الحكومية م/م/128 لعام 1440هـ (مرجعية للقطاع الخاص)
• لوائح هيئة المقاولين السعوديين
• اشتراطات الرقابة والتفتيش العمراني (أمانة المنطقة / البلدية)

البنود الإلزامية:
• وصف المشروع: الموقع، المساحة، المخططات المعتمدة، المواصفات الفنية بالمرفقات (م 582)
• رخصة البناء / تصاريح الموقع وجهة إصدارها
• القيمة التعاقدية: إجمالياً وتفصيلاً (مواد + أجور + ضريبة القيمة المضافة) (م 586)
• جدول المستخلصات: دفعة المقدم (لا تتجاوز 20%)، المستخلصات الدورية، دفعة الاستلام (م 587)
• خطاب ضمان حسن التنفيذ (Performance Bond): 5% من قيمة العقد (م 588)
• خطاب ضمان صيانة (Defects Liability): 5% لمدة سنة بعد الاستلام (م 589)
• الجدول الزمني: تاريخ البدء والانتهاء، المراحل الرئيسية (م 584)
• غرامة التأخير: يومياً بنسبة لا تتجاوز 1/1000 من قيمة العقد بحد أقصى 10% (م مرجعية المنافسات)
• تعديلات الأعمال (Variations): الإجراء والتسعير وحدود 25% زيادة أو نقصاً (م 592)
• السلامة المهنية وفق لوائح المؤسسة العامة للتأمينات الاجتماعية ونظام العمل
• الاستلام الابتدائي والنهائي وشروط كل منهما (م 596)
• إنهاء العقد لإخلال جوهري مع إشعار مدته سبعة أيام (م 594)

${SA_COMMON}`,
  },

  partnership: {
    label: "عقد شراكة (مضاربة / شركة أشخاص)",
    fields: ["partyA","idNumberA","partyB","idNumberB","companyName","businessActivity","capitalA","capitalB","profitShareA","profitShareB","lossShareA","lossShareB","duration","managingPartner","city"],
    systemPrompt: `أنت مستشار قانوني سعودي متخصص في قانون الشركات والشراكات. صِغ عقد شراكة كاملاً متوافقاً مع:
• نظام الشركات السعودي الجديد الصادر بالمرسوم م/132 لعام 1443هـ وتعديلاته
• اللوائح التنفيذية الصادرة عن وزارة التجارة ووزارة الاستثمار
• نظام ضريبة الدخل والزكاة (هيئة الزكاة والضريبة والجمارك)
• اشتراطات التسجيل في منصة "مارس" لوزارة التجارة

البنود الإلزامية:
• هوية الشركاء وجنسياتهم وصفاتهم القانونية (م 1 نظام الشركات)
• اسم الشركة ومقرها الرئيسي ونشاطها التجاري المحدد (م 15-17)
• رأس المال: قيمته، حصة كل شريك، نوع الحصة (نقد/عيني) وتقييمها (م 22-25)
• توزيع الأرباح والخسائر بالنسب المئوية الصريحة مع تحريم اشتراط ضمان الربح (م 28 + مبدأ شرعي)
• الشريك المدير: صلاحياته وحدودها، الأعمال التي تستلزم إجماع الشركاء (م 30-35)
• حظر المنافسة: ألا يعمل الشريك في نشاط مماثل لصالحه أو لصالح الغير (م 38)
• انتقال الحصص وشروطه وحق الشفعة للشركاء (م 42-45)
• أسباب انقضاء الشركة وإجراءات التصفية وتوزيع الموجودات (م 50-58)
• النصاب والتصويت في قرارات الجمعية العمومية (م 48-49)
• القوائم المالية السنوية والمراجع الخارجي إن وجب (م 60-65)
• الالتزامات الضريبية: الزكاة للمواطنين، ضريبة الدخل لغير السعوديين

${SA_COMMON}`,
  },

  nda: {
    label: "اتفاقية عدم الإفصاح (NDA)",
    fields: ["partyA","idOrCrA","partyB","idOrCrB","purpose","confidentialInfoScope","excludedInfo","duration","returnOfInfo","penalties","city"],
    systemPrompt: `أنت مستشار قانوني سعودي متخصص في حماية المعلومات والملكية الفكرية. صِغ اتفاقية عدم إفصاح كاملة متوافقة مع:
• نظام مكافحة الجرائم المعلوماتية الصادر بالمرسوم م/17 لعام 1428هـ
• نظام حماية البيانات الشخصية الصادر بالمرسوم م/19 لعام 1443هـ
• نظام الملكية التجارية: نظام العلامات التجارية م/م/21 لعام 1423هـ
• نظام حق المؤلف م/41 لعام 1424هـ
• نظام المعاملات المدنية م/191 لعام 1443هـ (مبدأ حسن النية والسرية التعاقدية)

البنود الإلزامية:
• تعريف "المعلومات السرية" تعريفاً جامعاً مانعاً: ما يُوصف كتابةً بالسرية + ما يُفصح شفهياً ويُؤكَّد خطياً خلال خمسة أيام (م 1)
• المعلومات المستثناة من السرية: المعلومات العامة، المستقلة، المفصَح عنها بحكم قضائي، المعروفة قبل الاتفاقية (م 2)
• الغرض الوحيد المسموح: يُذكر صراحةً ويحظر أي استخدام آخر (م 3)
• التزامات الطرف المتلقي: الحفاظ على السرية، تحديد المطلعين، حظر النسخ والتوزيع (م 4)
• مدة السرية: خلال العلاقة وبعد انقضائها (سنتان/خمس سنوات) (م 5)
• إعادة أو إتلاف المعلومات السرية عند الانتهاء مع شهادة إتلاف (م 6)
• الجزاء التعويضي: قابلية المطالبة بالتعويض عن الضرر الفعلي + طلب وقف التعدي كأمر مستعجل أمام المحاكم السعودية (م 7)
• التزام الطرف الملتزم بحماية المعلومات من وصول غير مصرح (معايير "العناية المعقولة") (م 8)
• الإفصاح القسري: الالتزام بإخطار الطرف الآخر فور تلقي أمر قضائي بالكشف (م 9)
• الاستقلالية: الاتفاقية لا تُنشئ شراكة أو وكالة أو علاقة عمل (م 10)

${SA_COMMON}`,
  },

  agency: {
    label: "عقد وكالة تجارية",
    fields: ["partyA","crNumberA","partyB","crNumberB","agencyScope","territory","commission","commissionBase","duration","exclusivity","minimumSales","terminationNotice","city"],
    systemPrompt: `أنت مستشار قانوني سعودي متخصص في التجارة والوكالات. صِغ عقد وكالة تجارية كاملاً متوافقاً مع:
• نظام الوكالات التجارية الصادر بالمرسوم م/11 لعام 1382هـ وتعديلاته م/31 لعام 1409هـ
• لوائح وزارة التجارة للوكالات التجارية
• نظام المعاملات المدنية م/191 لعام 1443هـ (المواد 280-330 الوكالة)
• اشتراطات التسجيل في سجل الوكالات التجارية

البنود الإلزامية:
• بيانات الموكّل (الشركة الأصلية): اسمها القانوني، جنسيتها، مقرها، رقم ترخيصها (م 3 نظام الوكالات)
• بيانات الوكيل: السجل التجاري، الممثل القانوني المفوّض، نطاق التفويض (م 4)
• نطاق الوكالة: المنتجات أو الخدمات الممثَّلة تحديداً، مع استثناء صريح لكل ما عداها (م 5)
• النطاق الجغرافي: المناطق الإدارية المحددة بالاسم (م 5)
• الحصرية: حصري / غير حصري مع الشروط والتوقعات (م 6)
• العمولة: النسبة، الأساس الذي تحتسب عليه (صافي البيع / إجمالي)، التوقيت، العملة (م 7)
• الحد الأدنى من المبيعات: هدف سنوي مع نتيجة عدم التحقيق (فقدان الحصرية / إنهاء) (م 8)
• التزامات الوكيل: الترويج، التقارير، تدريب فريق المبيعات، عدم تمثيل المنافسين (م 9)
• التزامات الموكّل: تقديم الدعم الفني والتسويقي، إشعار مسبق بتغيير الأسعار (م 10)
• مدة العقد والتجديد التلقائي (م 11)
• إنهاء العقد: مدة الإشعار لا تقل عن ثلاثة أشهر + تعويض الوكيل عن حصته في العملاء الذين أحضرهم (م 12-14 - حماية الوكيل)
• التزام التسجيل في سجل الوكالات التجارية بوزارة التجارة (م 2)

${SA_COMMON}`,
  },

  // ─── عقد التوريد محذوف بطلب المستخدم ───────────────────────────────────────
};

const FIELD_LABELS: Record<string, string> = {
  // ─── أطراف العقد ───────────────────────────────────────────────────────────
  partyA:            "الطرف الأول — الاسم الكامل أو الكيان القانوني",
  partyB:            "الطرف الثاني — الاسم الكامل أو الكيان القانوني",
  idNumberA:         "رقم الهوية الوطنية / الإقامة — الطرف الأول",
  idNumberB:         "رقم الهوية الوطنية / الإقامة — الطرف الثاني",
  idOrCrA:           "رقم الهوية / السجل التجاري — الطرف الأول",
  idOrCrB:           "رقم الهوية / السجل التجاري — الطرف الثاني",
  crNumberA:         "رقم السجل التجاري — الطرف الأول",
  crNumberB:         "رقم السجل التجاري — الطرف الثاني",
  nationalityB:      "جنسية الموظف",
  // ─── عقد العمل ─────────────────────────────────────────────────────────────
  jobTitle:          "المسمى الوظيفي",
  salary:            "الراتب الأساسي الشهري (بالريال السعودي)",
  workHours:         "ساعات العمل اليومية (الأصل 8 ساعات)",
  probation:         "مدة فترة التجربة (الأصل 90 يوماً — الحد الأقصى 180)",
  gosiNumber:        "رقم التأمينات الاجتماعية لصاحب العمل (GOSI)",
  // ─── البيع ──────────────────────────────────────────────────────────────────
  itemDescription:   "وصف المبيع وصفاً دقيقاً نافياً للجهالة (النوع، الماركة، الحالة، التسلسل)",
  itemCondition:     "حالة المبيع (جديد / مستعمل / كما هو)",
  price:             "الثمن الإجمالي (بالأرقام والكتابة — بالريال السعودي)",
  vatIncluded:       "هل الثمن/الأتعاب شامل ضريبة القيمة المضافة 15%؟ (نعم / لا — يُضاف عليه)",
  paymentMethod:     "طريقة السداد (نقداً / تحويل بنكي / شيك مصرفي — اذكر التفاصيل)",
  deliveryDate:      "تاريخ التسليم المتفق عليه (هجري وميلادي)",
  deliveryPlace:     "مكان التسليم",
  warranty:          "مدة الضمان (أشهر / سنوات)",
  // ─── الخدمات ────────────────────────────────────────────────────────────────
  serviceDescription:"وصف الخدمة وصفاً تفصيلياً (النطاق، المنهجية، الاستثناءات)",
  totalFee:          "إجمالي الأتعاب (بالريال)",
  deliverables:      "المخرجات المتفق عليها (اذكر كل مخرج بوضوح)",
  paymentSchedule:   "جدول الدفع (مثال: 30% مقدم، 40% منتصف المشروع، 30% التسليم)",
  penaltyRate:       "نسبة غرامة التأخير اليومية (مثال: 0.1% من إجمالي الأتعاب يومياً)",
  ipOwnership:       "ملكية الأعمال الفكرية المنجزة (العميل / المقاول / مشترك)",
  // ─── المقاولة ───────────────────────────────────────────────────────────────
  projectDescription:"وصف المشروع (النوع، الموقع، المساحة، المواصفات الرئيسية)",
  projectLocation:   "موقع المشروع الكامل",
  contractValue:     "قيمة العقد الإجمالية (بالريال — أرقام وكتابة)",
  duration:          "المدة الإجمالية للتنفيذ",
  startDate:         "تاريخ البدء المتفق عليه (هجري وميلادي)",
  penaltyPerDay:     "غرامة التأخير اليومية (مبلغاً ثابتاً أو نسبة من القيمة)",
  performanceBond:   "ضمان حسن التنفيذ (نسبة أو مبلغ — الأصل 5%)",
  defectsLiability:  "مدة ضمان عيوب ما بعد الاستلام (الأصل سنة كاملة)",
  // ─── الشراكة ────────────────────────────────────────────────────────────────
  companyName:       "الاسم التجاري للشركة / الشراكة",
  businessActivity:  "النشاط التجاري (وصف دقيق وفق تصنيف الأنشطة الاقتصادية)",
  capitalA:          "حصة الطرف الأول في رأس المال (بالريال ونسبة %)",
  capitalB:          "حصة الطرف الثاني في رأس المال (بالريال ونسبة %)",
  profitShareA:      "نسبة الطرف الأول في الأرباح %",
  profitShareB:      "نسبة الطرف الثاني في الأرباح %",
  lossShareA:        "نسبة الطرف الأول في الخسائر % (الأصل = نسبة رأس المال)",
  lossShareB:        "نسبة الطرف الثاني في الخسائر % (الأصل = نسبة رأس المال)",
  managingPartner:   "الشريك المدير (الاسم وصلاحياته وحدودها)",
  // ─── NDA ────────────────────────────────────────────────────────────────────
  purpose:           "الغرض من الاتفاقية (مثال: دراسة إمكانية الاندماج، تقديم عرض فني)",
  confidentialInfoScope: "نطاق المعلومات السرية (بيانات مالية / تقنية / عملاء / استراتيجية ...)",
  excludedInfo:      "المعلومات المستثناة من السرية (إن وُجدت — أو اكتب 'وفق الاستثناءات القانونية')",
  confidentialInfo:  "طبيعة المعلومات السرية",
  returnOfInfo:      "مصير المعلومات السرية عند الانتهاء (إعادة / إتلاف موثّق)",
  penalties:         "الجزاء التعويضي عن الإخلال (مبلغ محدد أو 'التعويض عن الضرر الفعلي')",
  // ─── الوكالة التجارية ────────────────────────────────────────────────────────
  agencyScope:       "نطاق الوكالة (المنتجات أو الخدمات الممثَّلة — حدداً وافياً)",
  territory:         "المنطقة الجغرافية (المناطق الإدارية المحددة بالاسم)",
  commission:        "نسبة العمولة %",
  commissionBase:    "أساس احتساب العمولة (صافي المبيعات / الإجمالي / الربح)",
  exclusivity:       "نوع الوكالة (حصرية / غير حصرية — مع الشرط)",
  minimumSales:      "الحد الأدنى من المبيعات السنوية المستهدفة (بالريال)",
  terminationNotice: "مدة إشعار الإنهاء (الحد الأدنى 90 يوماً)",
  // ─── مشترك ──────────────────────────────────────────────────────────────────
  city:              "مدينة إبرام العقد",
};

router.get("/contract/types", requireAuth, (_req, res) => {
  const types = Object.entries(CONTRACT_TEMPLATES).map(([key, val]) => ({
    key,
    label: val.label,
    fields: val.fields.map(f => ({ key: f, label: FIELD_LABELS[f] ?? f })),
  }));
  res.json({ types });
});

router.post("/contract/draft", requireAuth, async (req, res): Promise<void> => {
  const { contractType, fields, clientSession } = req.body as { contractType: string; fields: Record<string, string>; clientSession?: string };
  const template = CONTRACT_TEMPLATES[contractType];
  if (!template) { res.status(400).json({ error: "نوع العقد غير مدعوم" }); return; }

  // ── Quota check ────────────────────────────────────────────────────────────
  let sessionId: number | undefined;
  if (req.userRole !== "admin") {
    const result = await checkAndReserveService(req.userId!, "contract_draft", clientSession);
    if (!result.ok) {
      res.status(403).json({
        error: result.message ?? "لا توجد صلاحية لصياغة عقد جديد",
        code: result.needsUpgrade ? "TRIAL_EXHAUSTED" : "QUOTA_EXHAUSTED",
        needsUpgrade: result.needsUpgrade,
      });
      return;
    }
    sessionId = result.sessionId;
  }

  // ── بناء رسالة المستخدم وفق هيكل الأمر الأساسي الشامل (القسم الأول من الدليل)
  const f = (key: string) => fields[key]?.trim() || "[يستكمل]";
  const fieldLines = template.fields
    .map(k => `- ${FIELD_LABELS[k] ?? k}: ${f(k)}`)
    .join("\n");

  const today = new Date().toLocaleDateString("ar-SA", { year: "numeric", month: "long", day: "numeric", calendar: "islamic" });

  const userMsg = `تصرّف بصفتك محامياً سعودياً متخصصاً في صياغة العقود والاتفاقيات، وأعد مسودة ${template.label} وفق الأنظمة السعودية النافذة، بأسلوب قانوني احترافي، واضح، متوازن، وقابل للتنفيذ.

بيانات العقد:
${fieldLines}

القانون الواجب التطبيق: الأنظمة المرعية في المملكة العربية السعودية.
تاريخ اليوم (تقريبي): ${today}

الالتزامات الإضافية:
- حدد طبيعة العلاقة التعاقدية والغرض منها في التمهيد.
- فصّل التزامات كل طرف في مواد مستقلة.
- ضع عبارة واضحة [يستكمل] عند كل معلومة ناقصة ولا تخترع وقائع.
- نفّذ متطلبات الصياغة كاملة كما في تعليماتك.
- في نهاية المسودة: أضف "ملاحظات قانونية" تتضمن البنود التي تحتاج تحققاً أو معلومات إضافية.`;

  try {
    const OpenAI = (await import("openai")).default;
    const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
    const completion = await client.chat.completions.create({
      model: "gpt-4o",
      messages: [
        charterSystemMsg(),
        { role: "system", content: template.systemPrompt },
        { role: "user",   content: userMsg },
      ],
      temperature: 0.15,
      max_tokens: 4000,
    });

    const contractText = sanitizeOutput(completion.choices[0]?.message?.content ?? "");
    // Commit quota after successful generation
    if (sessionId) await commitService(sessionId);
    res.json({ contractText, wordCount: contractText.split(/\s+/).length });
  } catch (err: any) {
    if (sessionId) await releaseService(sessionId).catch(() => {});
    res.status(500).json({ error: err?.message ?? "فشل توليد العقد" });
  }
});

// ─── بناء بند تسوية النزاعات ديناميكياً ─────────────────────────────────────
// ─── POST /api/contract/chat — محادثة تفاعلية لصياغة العقد ──────────────────────
router.post("/contract/chat", requireAuth, async (req, res): Promise<void> => {
  const { messages, clientSession, reservedSessionId, draftConfig } = req.body as {
    messages: Array<{ role: "user" | "assistant"; content: string }>;
    clientSession?: string;
    reservedSessionId?: number;
    draftConfig?: DraftConfig;
  };

  if (!messages?.length) { res.status(400).json({ error: "لا توجد رسائل" }); return; }

  const userCount = messages.filter(m => m.role === "user").length;

  // Reserve quota only on the FIRST user message
  let sessionId: number | undefined = reservedSessionId;
  if (reservedSessionId && req.userRole !== "admin") {
    const [ownedReservation] = await db.select({ id: serviceSessionsTable.id })
      .from(serviceSessionsTable)
      .where(and(
        eq(serviceSessionsTable.id, reservedSessionId),
        eq(serviceSessionsTable.userId, req.userId!),
        eq(serviceSessionsTable.serviceType, "contract_draft"),
        eq(serviceSessionsTable.counted, false),
        sql`${serviceSessionsTable.graceEnd} > NOW()`,
      ))
      .limit(1);
    if (!ownedReservation) {
      res.status(409).json({ error: "حجز صياغة العقد غير صالح أو انتهت مهلته. ابدئي طلباً جديداً." });
      return;
    }
  }
  if (userCount === 1 && !reservedSessionId && req.userRole !== "admin") {
    const result = await checkAndReserveService(req.userId!, "contract_draft", clientSession);
    if (!result.ok) {
      res.status(403).json({
        error: result.message ?? "لا توجد صلاحية لصياغة عقد جديد",
        code: result.needsUpgrade ? "TRIAL_EXHAUSTED" : "QUOTA_EXHAUSTED",
        needsUpgrade: result.needsUpgrade,
      });
      return;
    }
    sessionId = result.sessionId;
  }

  // حقن إعدادات الصياغة في الـ system prompt إن وُجدت
  const configAddendum = draftConfig ? buildDraftSystemAddendum(draftConfig) : "";

  const SYSTEM = `أنت رباب، مستشارة قانونية ذكية ضمن منصة RABAB LEGAL AI، متخصصة في قانون الشركات والعقود والأنظمة التجارية السعودية والخليجية والدولية.

══════════════════════════════════════════════════
الخطوة الأولى — حدّدي نوع الطلب من مضمون الرسالة
══════════════════════════════════════════════════

**النوع الأول — طلب استشاري أو تكييف قانوني أو رأي قانوني:**
علاماته: أسئلة من نوع "ما هو"، "ما التكييف"، "ما الفرق"، "هل يجوز"، "ما الأفضل"، "كيف يُصنَّف"، "ما الشكل القانوني"، أو أي سؤال يطلب رأياً أو تحليلاً أو مقارنة قانونية.

→ قدّمي تحليلاً قانونياً كاملاً وفق المعايير المذكورة أدناه.
→ لا تطلبي أبداً أسماء الأطراف أو أرقام الهويات أو التواريخ أو رأس المال ما لم يذكرها السائل أولاً.
→ في نهاية التحليل فحسب، اعرضي — في سطر منفصل — خياراً اختيارياً واضحاً:
   "💬 هل تودّين الانتقال إلى صياغة الوثيقة؟ أخبريني وسأطلب البيانات اللازمة."

---

**النوع الثاني — مراجعة أو تحليل مستند مرفق:**
علاماته: رفع ملف أو نص عقد، أو سؤال عن بنود محددة في وثيقة قائمة.

→ حلّلي المستند وأبدي ملاحظاتك القانونية.
→ لا تطلبي بيانات صياغة إلا إذا طُلب تعديل أو إعادة صياغة صريحة.

---

**النوع الثالث — طلب صياغة وثيقة جديدة:**
علاماته: عبارات صريحة مثل "صِيغي عقداً"، "أريد عقد"، "اكتبي اتفاقية"، أو تأكيد الانتقال إلى الصياغة بعد استشارة.

→ إذا كانت المعلومات غير كافية، اطرحي أسئلة مرقّمة تجمع:
   • أسماء وصفات الأطراف (أفراد / شركات + أرقام الهويات إن توفّرت)
   • موضوع العقد والغرض منه بالتفصيل
   • المدة الزمنية وتاريخ البدء
   • المقابل المالي وطريقة الدفع
   • أي شروط خاصة أو ملاحظات
→ لا تسأل عن كل شيء دفعة واحدة — اسأل عن الأهم أولاً.
→ عندما تكتمل البيانات، ابدأ العقد حرفياً بهذا السطر تماماً: ===CONTRACT_START===
   ثم اكتبي العقد كاملاً بصيغة قانونية رسمية.

══════════════════════════════════════════════════
معايير التحليل القانوني الاستشاري
══════════════════════════════════════════════════

عند الإجابة على طلب استشاري (مثال: تكييف نوع الشركة أو اختيار هيكل قانوني):

١. **حلّلي المعطيات التي ذكرها السائل فعلاً** ودلالتها القانونية قبل أي توصية.

٢. **اعرضي الأشكال النظامية المتاحة ومقارنتها** من حيث:
   - عدد الشركاء / المساهمين (الحد الأدنى والأقصى)
   - رأس المال المطلوب وطبيعة الحصص
   - قابلية الحصص للتداول والتنازل
   - هيكل الحوكمة والإدارة
   - إمكانية دخول مستثمرين لاحقاً أو الطرح العام
   - نطاق مسؤولية الشركاء

٣. **استندي إلى نصوص الأنظمة وأرقام موادها** — نظام الشركات السعودي ولائحته التنفيذية، وغيرها من الأنظمة ذات الصلة. إذا تعذّر التحقق من رقم مادة بعينها، صرّحي بذلك ولا تقدّمي الترقيم اجتهاداً.

٤. **راعي اشتراطات النشاط ذاته** — الترخيص، الجهة المشرفة، الاشتراطات الخاصة بالقطاع التي تؤثر في اختيار الكيان.

٥. **رجّحي توصية مسبَّبة** مرتبطة بمعطيات السائل تحديداً، لا ترجيحاً عاماً بلا تعليل. لا تقدّمي ترجيحاً بلا سند نظامي.

══════════════════════════════════════════════════
قواعد عامة
══════════════════════════════════════════════════
- أجيبي دائماً بالعربية.
- لا تخترعي وقائع — ضعي [    ] للبيانات الناقصة داخل العقود.
- الصفحة التي دخل منها المستخدم لا تحدّد نوع إجابتك — مضمون سؤاله هو الذي يحدّدها.
${configAddendum}`;

  try {
    const OpenAI = (await import("openai")).default;
    const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
    const completion = await client.chat.completions.create({
      model: "gpt-4o",
      messages: [charterSystemMsg(), { role: "system", content: SYSTEM }, ...messages],
      temperature: 0.2,
      max_tokens: 4000,
    });

    const rawContent = sanitizeOutput(completion.choices[0]?.message?.content ?? "");
    const isDraft = rawContent.includes("===CONTRACT_START===");
    const reply  = isDraft ? rawContent.replace("===CONTRACT_START===", "").trim() : rawContent;

    // Commit quota when contract is produced
    if (isDraft && sessionId) await commitService(sessionId);

    res.json({ reply, isDraft, sessionId });
  } catch (err: any) {
    if (sessionId) await releaseService(sessionId).catch(() => {});
    res.status(500).json({ error: err?.message ?? "فشل توليد الرد" });
  }
});

// ─── POST /api/contract/review — مراجعة قانونية شاملة بـ 17 محوراً (القسم الثالث من الدليل) ──
router.post("/contract/review", requireAuth, upload.single("file"), async (req, res): Promise<void> => {
  const bodyText = req.body?.contractText as string | undefined;
  if (!req.file && !bodyText) { res.status(400).json({ error: "لم يُرفق ملف أو نص عقد" }); return; }

  // ── Quota check ────────────────────────────────────────────────────────────
  let reviewSessionId: number | undefined;
  if (req.userRole !== "admin") {
    const clientSession = req.body?.clientSession as string | undefined;
    const result = await checkAndReserveService(req.userId!, "contract_review", clientSession);
    if (!result.ok) {
      res.status(403).json({
        error: result.message ?? "لا توجد صلاحية لمراجعة عقد جديد",
        code: result.needsUpgrade ? "TRIAL_EXHAUSTED" : "QUOTA_EXHAUSTED",
        needsUpgrade: result.needsUpgrade,
      });
      return;
    }
    reviewSessionId = result.sessionId;
  }
  try {
    const rawText = req.file
      ? await extractText(req.file.buffer, req.file.mimetype, req.file.originalname)
      : bodyText!;
    const snippet = rawText.slice(0, 14000);
    const OpenAI = (await import("openai")).default;
    const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

    const completion = await client.chat.completions.create({
      model: "gpt-4o",
      messages: [
        charterSystemMsg(),
        {
          role: "system",
          content: `أنت باحثة قانونية سعودية متخصصة في الأنظمة السعودية والقضاء التجاري، تعمل ضمن منصة RABAB LEGAL AI.
مهمتك مراجعة قانونية شاملة ومنظّمة للعقود وفق الأنظمة السعودية. لا تكتفِ بالملاحظات العامة؛ حدّد رقم كل مادة وسبب الملاحظة وأثرها القانوني والصياغة المقترحة. لا تختلق أرقام مواد أو أحكام غير موثقة.
يُمنع منعاً باتاً إنهاء الرد بأي توقيع أو اسم شخصي أو رقم هاتف أو بريد أو رابط أو عبارة ختامية (سعدنا بخدمتكم، بإشراف، للتواصل). أنهِ الرد بانتهاء المحتوى القانوني مباشرةً.`,
        },
        {
          role: "user",
          content: `راجع العقد الآتي مراجعة قانونية شاملة وفق الأنظمة السعودية، وقدّم النتيجة وفق الترتيب الآتي حرفياً:

١. ملخص طبيعة العقد
٢. التكييف القانوني الصحيح
٣. البنود الصحيحة والقابلة للتنفيذ
٤. البنود الغامضة (رقم المادة + السبب + الصياغة المقترحة)
٥. البنود المتكررة (أرقام المواد المتكررة + المقترح)
٦. البنود المتعارضة (أرقام المواد + طبيعة التعارض + الحل)
٧. البنود الناقصة (ما يجب إضافته)
٨. الالتزامات غير المتوازنة (الطرف المتضرر + البديل المتوازن)
٩. المخاطر الواقعة على كل طرف
١٠. الشروط التي قد يصعب تنفيذها قضائياً
١١. البنود التي قد تتعارض مع قواعد آمرة في الأنظمة السعودية
١٢. البنود التي تحتاج موافقات أو تراخيص
١٣. المدد غير العملية أو غير المنضبطة
١٤. الثغرات المالية وضريبة القيمة المضافة
١٥. الثغرات المتعلقة بالإنهاء والتعويض
١٦. مقترحات التعديل (مرتّبة بالأولوية: جوهري / مهم / تحسيني)
١٧. صياغة بديلة كاملة لكل بند يحتاج تعديلاً جوهرياً

نص العقد:
${snippet}`,
        },
      ],
      temperature: 0.15,
      max_tokens: 4000,
    });

    const review = sanitizeOutput(completion.choices[0]?.message?.content ?? "");
    if (reviewSessionId) await commitService(reviewSessionId);
    // usedLiveSearch is always false for contract/review (no Tavily call here —
    // contract text must not be forwarded to third-party search providers).
    // The flag is included in the response so the frontend badge infrastructure
    // is wired up and ready for if/when a consent-gated Tavily path is added.
    res.json({ review, filename: req.file?.originalname ?? "contract.txt", usedLiveSearch: false, contractText: snippet });
  } catch (err: any) {
    if (reviewSessionId) await releaseService(reviewSessionId).catch(() => {});
    res.status(422).json({ error: err?.message ?? "فشل المراجعة" });
  }
});

// ─── دليل الأطر القانونية لكل دولة ─────────────────────────────────────────
const COUNTRY_LEGAL_FRAMEWORKS: Record<string, {
  nameAr: string; system: string; courts: string; arbitration: string; notes: string;
}> = {
  sa: {
    nameAr: "المملكة العربية السعودية",
    system: "نظام المعاملات التجارية السعودي ونظام الشركات ونظام العمل",
    courts: "المحاكم التجارية والمحكمة العليا السعودية",
    arbitration: "هيئة التحكيم التجاري السعودية (SCCA) ونظام التحكيم 1433هـ",
    notes: "يُراعى توافق البنود مع أحكام الشريعة الإسلامية وعدم تعارضها مع النظام العام السعودي. يُحظر الفائدة الربوية الصريحة وبعض شروط الإذعان.",
  },
  ae: {
    nameAr: "الإمارات العربية المتحدة",
    system: "قانون المعاملات التجارية الاتحادي رقم 18/1993 وقانون المعاملات المدنية رقم 5/1985، إضافةً إلى أنظمة DIFC وADGM للمناطق الحرة",
    courts: "المحاكم الاتحادية الإماراتية ومحاكم DIFC وADGM (Common Law)",
    arbitration: "مركز دبي للتحكيم الدولي (DIAC) ومركز أبوظبي للتوفيق والتحكيم التجاري",
    notes: "إذا كان العقد خاضعاً لـ DIFC أو ADGM فالإطار المرجعي Common Law بريطاني. للعقود الاتحادية يُراعى قانون المعاملات المدنية.",
  },
  kw: {
    nameAr: "الكويت",
    system: "قانون التجارة الكويتي رقم 68/1980 وقانون المعاملات المدنية رقم 67/1980",
    courts: "المحاكم التجارية الكويتية ومحكمة الاستئناف",
    arbitration: "مركز الكويت للتحكيم وقانون التحكيم رقم 11/1995",
    notes: "يُراعى حظر الفائدة في عقود القروض وضوابط الشرط الجزائي في التقنين المدني الكويتي.",
  },
  qa: {
    nameAr: "قطر",
    system: "القانون المدني القطري رقم 22/2004 وقانون التجارة رقم 27/2006",
    courts: "المحاكم القطرية ومحاكم QFC للمركز المالي",
    arbitration: "مركز قطر الدولي للتوفيق والتحكيم (QICCA) وقانون التحكيم رقم 2/2017",
    notes: "مركز QFC يعمل بالقانون الإنجليزي. العقود الخاضعة لقانون قطري تُراجع وفق القانون المدني والتجاري القطري.",
  },
  bh: {
    nameAr: "البحرين",
    system: "قانون التجارة البحريني رقم 7/1987 والقانون المدني رقم 19/2001",
    courts: "المحاكم التجارية البحرينية ومحكمة الاستئناف",
    arbitration: "مركز التحكيم التجاري الخليجي (GCC-CAC) بالبحرين وقانون التحكيم رقم 9/2015",
    notes: "البحرين تتبنى نموذج UNCITRAL في قانون التحكيم مما يُيسّر التحكيم الدولي.",
  },
  om: {
    nameAr: "سلطنة عُمان",
    system: "قانون التجارة العُماني رقم 55/1990 والقانون المدني رقم 29/2013",
    courts: "المحاكم التجارية العُمانية ومحكمة الاستئناف",
    arbitration: "مركز تسوية النزاعات التجارية العُماني وقانون التحكيم رقم 47/1997",
    notes: "يُراعى قانون العمل العُماني في عقود التوظيف وضرورة نسبة العُمنة.",
  },
  intl: {
    nameAr: "دولي / متعدد الولايات القضائية",
    system: "مبادئ UNIDROIT للعقود التجارية الدولية واتفاقية CISG للبيع الدولي للبضائع",
    courts: "المحاكم الدولية وفق بند الاختصاص القضائي في العقد",
    arbitration: "التحكيم الدولي: ICC / LCIA / SIAC / ICSID — وفق بند التحكيم المتفق عليه",
    notes: "يُحلَّل العقد بمعايير دولية مع الإشارة إلى القانون الواجب التطبيق إن وُجد في العقد، ومدى قابليته للتنفيذ في الولايات القضائية الرئيسية.",
  },
};

// ─── أسماء أنواع العقود بالعربية ─────────────────────────────────────────────
const CONTRACT_TYPE_NAMES_AR: Record<string, string> = {
  employment:    "عقد عمل",
  sales:         "عقد بيع وشراء",
  services:      "عقد خدمات",
  construction:  "عقد مقاولات وإنشاء",
  partnership:   "عقد شراكة",
  nda:           "اتفاقية سرية معلومات",
  agency:        "عقد وكالة تجارية",
  other:         "عقد (نوع آخر)",
};

// ─── DraftConfig + بناء بند تسوية النزاعات ديناميكياً ──────────────────────
interface DraftConfig {
  jurisdictionScope?:  "sa" | "gcc" | "intl";
  country?:           string;
  contractType?:      string;
  amicableDays?:      number;
  resolutionMethod?:  "judiciary" | "arbitration";
  arbitrationSystem?: string;
  arbitratorCount?:   1 | 3;
}

function buildDraftSystemAddendum(config: DraftConfig): string {
  const country     = config.country ?? "sa";
  const framework   = COUNTRY_LEGAL_FRAMEWORKS[country] ?? COUNTRY_LEGAL_FRAMEWORKS["sa"];
  const scopeLabel = config.jurisdictionScope === "gcc"
    ? "دول مجلس التعاون الخليجي"
    : config.jurisdictionScope === "intl"
      ? "عقد دولي"
      : "النظام السعودي";
  const typeLabel   = CONTRACT_TYPE_NAMES_AR[config.contractType ?? ""] ?? "";
  const amicable    = config.amicableDays ?? 30;
  const method      = config.resolutionMethod ?? "judiciary";
  const arbSystem   = config.arbitrationSystem ?? framework.arbitration;
  const arbCount    = config.arbitratorCount ?? 1;

  let disputeClause: string;
  if (method === "judiciary") {
    disputeClause = `تُسوَّى النزاعات الناشئة عن هذا العقد أو المتعلقة به وفق المراحل الآتية بالترتيب:
أولاً — التسوية الودية: يلتزم الطرفان بمحاولة تسوية أي نزاع بالتفاوض المباشر خلال (${amicable}) يوماً من تاريخ الإخطار الكتابي.
ثانياً — القضاء: إن تعذّرت التسوية الودية، يُحال النزاع إلى المحاكم المختصة في ${framework.nameAr} (${framework.courts}) للفصل فيه وفق القانون الواجب التطبيق.`;
  } else {
    const arbCountLabel = arbCount === 1
      ? "محكّم منفرد يُختار باتفاق الطرفين، أو تُعيّنه الهيئة المختصة عند الخلاف"
      : "ثلاثة محكّمين: يُعيّن كل طرف محكّماً، ويتّفق المحكّمان على رئيس الهيئة";
    disputeClause = `تُسوَّى النزاعات الناشئة عن هذا العقد أو المتعلقة به وفق المراحل الآتية بالترتيب:
أولاً — التسوية الودية: يلتزم الطرفان بمحاولة تسوية أي نزاع بالتفاوض المباشر خلال (${amicable}) يوماً من تاريخ الإخطار الكتابي.
ثانياً — التحكيم: إن تعذّرت التسوية الودية، يُحال النزاع إلى التحكيم النهائي الملزم وفق لوائح ${arbSystem}، وتتشكّل هيئة التحكيم من ${arbCountLabel}، وتكون لغة التحكيم العربية، ويُنفَّذ الحكم وفق أحكام القانون المعمول به في ${framework.nameAr}.`;
  }

  return `
══════════════════════════════════════════════════
إعدادات الصياغة المحددة من قِبل المستخدم (مُلزِمة)
══════════════════════════════════════════════════

**الدولة / الإطار القانوني:** ${framework.nameAr}
**نطاق الصياغة المختار:** ${scopeLabel}
**النظام القانوني المرجعي:** ${framework.system}
**الجهة القضائية المختصة:** ${framework.courts}
${typeLabel ? `**نوع العقد المطلوب:** ${typeLabel}` : ""}

**بند تسوية النزاعات الواجب إدراجه حرفياً في العقد:**
${disputeClause}

**متطلبات الصياغة الخاصة بـ ${framework.nameAr}:**
${framework.notes}

يجب أن يخضع العقد بأحكامه وتفسيره للقانون الواجب التطبيق في ${framework.nameAr}.
يُراعى عند الصياغة توافق البنود مع الإطار القانوني المحدد.
بند تسوية النزاعات المذكور أعلاه يُدرج كما هو في العقد دون تعديل في الجوهر إلا بطلب صريح من المستخدم.
`;
}

// ─── POST /api/contract/enforce-check — تحليل المخاطر والتوصيات (القسم السادس) ──
router.post("/contract/enforce-check", requireAuth, upload.single("file"), async (req, res): Promise<void> => {
  const bodyText    = req.body?.contractText  as string | undefined;
  const country     = (req.body?.country     as string | undefined) ?? "sa";
  const contractType = (req.body?.contractType as string | undefined) ?? "other";
  if (!req.file && !bodyText) { res.status(400).json({ error: "لم يُرفق ملف أو نص عقد" }); return; }

  const framework = COUNTRY_LEGAL_FRAMEWORKS[country] ?? COUNTRY_LEGAL_FRAMEWORKS["sa"];
  const typeLabel  = CONTRACT_TYPE_NAMES_AR[contractType] ?? "عقد";

  try {
    const rawText = req.file
      ? await extractText(req.file.buffer, req.file.mimetype, req.file.originalname)
      : bodyText!;
    const snippet = rawText.slice(0, 14000);
    const OpenAI = (await import("openai")).default;
    const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

    const systemPrompt = `أنت باحثة قانونية متخصصة في القضاء التجاري والتحكيم، تعمل ضمن منصة RABAB LEGAL AI.
مهمتك تحليل مخاطر العقود وتقديم توصيات عملية وفق الإطار القانوني للدولة المحددة، مع بيان أثر البنود على قابلية التنفيذ.

الإطار القانوني المرجعي:
- الدولة: ${framework.nameAr}
- النظام القانوني: ${framework.system}
- الجهة القضائية: ${framework.courts}
- التحكيم: ${framework.arbitration}
- ملاحظات خاصة: ${framework.notes}

لا تختلق أرقام مواد أو أحكام غير موثقة. يُمنع منعاً باتاً إنهاء الرد بأي توقيع أو اسم شخصي أو رقم هاتف أو بريد أو رابط أو عبارة ختامية. أنهِ الرد بانتهاء المحتوى القانوني مباشرةً. ${PROHIBITION_RULE}`;

    const userPrompt = `حلّل مخاطر هذا ${typeLabel} وقدّم توصيات عملية لتحسينه قبل التوقيع أو التقاضي في ${framework.nameAr}.

لكل بند صنّفه إلى إحدى الفئات:
✅ قابل للتنفيذ | ⚠️ يحتاج تعديلاً | 🔴 مرتفع المخاطر | ❓ غير واضح | 🔍 يحتاج تحققاً نظامياً

ركّز على المحاور التالية مع مراعاة الإطار القانوني المحدد:
- وضوح محل الالتزام وإمكانية إثبات التنفيذ أو الإخلال
- وضوح المقابل المالي ومواعيد الاستحقاق، ومدى توافقه مع القانون المحلي
- شروط المطالبة والإعذارات والمهل التصحيحية
- الشرط الجزائي وحدود المسؤولية وشروط التعويض — وما إذا كانت تتوافق مع السقف القانوني المحلي
- القوة القاهرة وشروط الفسخ والإنهاء
- تسليم الأعمال والمستندات المقبولة كدليل وفق الإجراءات المحلية
- الصلاحيات والتوقيعات ومدى استيفائها لمتطلبات الشكل في ${framework.nameAr}
- بند الاختصاص القضائي أو التحكيمي ومدى قابليته للتنفيذ محلياً

اختم بـ:
**تقرير الحكم النهائي** — هل العقد صالح للتقاضي في ${framework.nameAr} كما هو؟
**أبرز 3 نقاط حرجة** تستوجب المعالجة الفورية قبل التوقيع أو التقاضي.

نص العقد:
${snippet}`;

    const completion = await client.chat.completions.create({
      model: "gpt-4o",
      messages: [
        charterSystemMsg(),
        { role: "system", content: systemPrompt },
        { role: "user",   content: userPrompt   },
      ],
      temperature: 0.15,
      max_tokens: 3500,
    });

    res.json({
      result: sanitizeOutput(completion.choices[0]?.message?.content ?? ""),
      filename: req.file?.originalname ?? "contract.txt",
      usedLiveSearch: false,
      contractText: snippet,
      country,
      contractType,
    });
  } catch (err: any) {
    res.status(422).json({ error: err?.message ?? "فشل تحليل المخاطر والتوصيات" });
  }
});

// ─── POST /api/contract/final-check — مراجعة نهائية قبل التوقيع (القسم العشرون) ──
router.post("/contract/final-check", requireAuth, upload.single("file"), async (req, res): Promise<void> => {
  const bodyText = req.body?.contractText as string | undefined;
  if (!req.file && !bodyText) { res.status(400).json({ error: "لم يُرفق ملف أو نص عقد" }); return; }
  try {
    const rawText = req.file
      ? await extractText(req.file.buffer, req.file.mimetype, req.file.originalname)
      : bodyText!;
    const snippet = rawText.slice(0, 14000);
    const OpenAI = (await import("openai")).default;
    const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

    const completion = await client.chat.completions.create({
      model: "gpt-4o",
      messages: [
        charterSystemMsg(),
        {
          role: "system",
          content: `أنت باحثة قانونية سعودية متخصصة، تعمل ضمن منصة RABAB LEGAL AI. مهمتك المراجعة النهائية للعقود قبل التوقيع. لا تختلق أرقام مواد أو أحكام غير موثقة. يُمنع منعاً باتاً إنهاء الرد بأي توقيع أو اسم شخصي أو رقم هاتف أو بريد أو رابط أو عبارة ختامية. أنهِ الرد بانتهاء المحتوى القانوني مباشرةً.`,
        },
        {
          role: "user",
          content: `نفّذ مراجعة نهائية شاملة للعقد الآتي قبل التوقيع، وتحقق من كل نقطة بـ ✅ مكتمل / ⚠️ يحتاج انتباهاً / ❌ مفقود أو خاطئ:

□ صحة أسماء الأطراف وبياناتهم الكاملة
□ الصفة والصلاحية في التوقيع (هل الممثل مفوَّض؟)
□ السجل التجاري والتراخيص المطلوبة
□ التواريخ والمدد (هجري وميلادي — متطابقة؟)
□ المبالغ والنسب (الأرقام تطابق الكتابة؟ المجاميع صحيحة؟)
□ الملاحق والإحالات الداخلية (موجودة ومتسقة؟)
□ صفحات التوقيع (مكتملة لجميع الأطراف؟)
□ الأختام والتفويضات المطلوبة
□ شروط النفاذ والمتطلبات السابقة للتوقيع
□ المتطلبات اللاحقة للتوقيع (توثيق، تسجيل، شهر؟)
□ التعارض مع النظام الأساسي أو عقد التأسيس
□ البنود النافذة بعد الإنهاء (مذكورة صراحةً؟)
□ وجود نسخ متطابقة للعقد واللغة المعتمدة

الحكم النهائي (واحد من ثلاثة):
🟢 صالح للتوقيع
🟡 صالح بعد تعديلات محددة — اذكرها
🔴 غير صالح للتوقيع قبل معالجة المخاطر الجوهرية الآتية — اذكرها

نص العقد:
${snippet}`,
        },
      ],
      temperature: 0.1,
      max_tokens: 3000,
    });

    res.json({ result: sanitizeOutput(completion.choices[0]?.message?.content ?? ""), filename: req.file?.originalname ?? "contract.txt", usedLiveSearch: false, contractText: snippet });
  } catch (err: any) {
    res.status(422).json({ error: err?.message ?? "فشل المراجعة النهائية" });
  }
});

// ─── POST /api/contract/extract-data — استخراج بيانات منظّمة ────────────────
router.post("/contract/extract-data", requireAuth, upload.single("file"), async (req, res): Promise<void> => {
  if (!req.file) { res.status(400).json({ error: "لم يُرفق ملف" }); return; }
  try {
    const rawText = await extractText(req.file.buffer, req.file.mimetype, req.file.originalname);
    const snippet = rawText.slice(0, 12000);
    const OpenAI = (await import("openai")).default;
    const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

    const completion = await client.chat.completions.create({
      model: "gpt-4o",
      messages: [
        charterSystemMsg(),
        {
          role: "system",
          content: "أنت متخصص في استخراج بيانات العقود السعودية. استخرج البيانات المطلوبة وأعدها بصيغة JSON فقط بدون أي نص إضافي.",
        },
        {
          role: "user",
          content: `استخرج من نص العقد التالي هذه البيانات كـ JSON:
{
  "contractType": "نوع العقد",
  "legalClassification": "التكييف القانوني",
  "parties": [{"name":"","role":"","idOrCr":""}],
  "effectiveDate": "",
  "expiryDate": "",
  "totalValue": "",
  "currency": "ريال سعودي",
  "vatTreatment": "شامل / غير شامل / غير محدد",
  "paymentSchedule": [""],
  "keyObligationsPartyA": [""],
  "keyObligationsPartyB": [""],
  "penaltyClauses": [""],
  "terminationTriggers": [""],
  "renewalTerms": "",
  "disputeResolution": "",
  "governingLaw": "",
  "missingClauses": ["البنود الناقصة التي يجب إضافتها"],
  "summary": "ملخص في ثلاث جمل"
}

نص العقد:
${snippet}`,
        },
      ],
      temperature: 0.1,
      max_tokens: 2000,
      response_format: { type: "json_object" },
    });

    const raw = completion.choices[0]?.message?.content ?? "{}";
    res.json({ data: JSON.parse(raw), filename: req.file.originalname, usedLiveSearch: false, contractText: snippet });
  } catch (err: any) {
    res.status(422).json({ error: err?.message ?? "فشل استخراج البيانات" });
  }
});

// ─── POST /api/contract/refine — حوار متابعة بعد التحليل / الاستخراج (بلا حصة — المستخدمة دفعت مسبقاً) ──
router.post("/contract/refine", requireAuth, async (req, res): Promise<void> => {
  const { contractText, mode, messages } = req.body as {
    contractText: string;
    mode: string;
    messages: Array<{ role: "user" | "assistant"; content: string }>;
  };

  if (!contractText?.trim()) { res.status(400).json({ error: "نص العقد مطلوب" }); return; }
  if (!Array.isArray(messages) || messages.length === 0) { res.status(400).json({ error: "سجل الحوار مطلوب" }); return; }

  const snippet = contractText.slice(0, 14_000);

  const systemPrompt = mode === "extract"
    ? `أنت متخصصة في استخراج بيانات العقود السعودية. المستفيدة تطلب تعديلات أو استفسارات على البيانات المستخرجة. استجيبي بالعربية. أعيدي البيانات كـ JSON عند طلب التحديث الكامل، أو وضّحي التغيير نصاً. ${PROHIBITION_RULE}`
    : `أنت باحثة قانونية سعودية تراجع عقداً وتستجيبين لملاحظات المستفيدة على التحليل السابق. لديكِ نص العقد كاملاً كمرجع. استجيبي بالعربية بتحليل محدَّث أو توضيح مستهدف بناءً على الملاحظة. ${PROHIBITION_RULE}`;

  try {
    const OpenAI = (await import("openai")).default;
    const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

    const completion = await client.chat.completions.create({
      model: "gpt-4o",
      messages: [
        charterSystemMsg(),
        { role: "system",    content: systemPrompt },
        { role: "user",      content: `نص العقد:\n${snippet}` },
        ...messages,
      ],
      temperature: 0.2,
      max_tokens: 3000,
    });

    const reply = sanitizeOutput(completion.choices[0]?.message?.content ?? "");
    res.json({ reply });
  } catch (err: any) {
    res.status(500).json({ error: err?.message ?? "فشل تحديث التحليل" });
  }
});

// ─── PATCH /api/contract/sessions/:id — save edited draft text ───────────────
router.patch("/contract/sessions/:id", requireAuth, async (req, res): Promise<void> => {
  const sessionId = parseInt(req.params.id, 10);
  if (isNaN(sessionId)) { res.status(400).json({ error: "معرّف الجلسة غير صالح" }); return; }

  const { draftText, usedLiveSearch } = req.body as { draftText?: string; usedLiveSearch?: boolean };
  if (!draftText?.trim()) { res.status(400).json({ error: "نص المسودة مطلوب" }); return; }

  try {
    // Ownership + type check: session must belong to this user and be a contract_draft
    const sessionRows = await db
      .select({ id: serviceSessionsTable.id })
      .from(serviceSessionsTable)
      .where(
        and(
          eq(serviceSessionsTable.id, sessionId),
          eq(serviceSessionsTable.userId, req.userId!),
          eq(serviceSessionsTable.serviceType, "contract_draft"),
        ),
      )
      .limit(1);

    if (sessionRows.length === 0) {
      res.status(403).json({ error: "الجلسة غير موجودة أو لا تملك صلاحية تعديلها" });
      return;
    }

    // True upsert — ON CONFLICT DO UPDATE prevents duplicates under race conditions
    await db
      .insert(contractDraftsTable)
      .values({
        userId: req.userId!,
        serviceSessionId: sessionId,
        draftText: draftText.trim(),
        usedLiveSearch: usedLiveSearch ?? false,
      })
      .onConflictDoUpdate({
        target: [contractDraftsTable.userId, contractDraftsTable.serviceSessionId],
        set: {
          draftText: draftText.trim(),
          usedLiveSearch: usedLiveSearch ?? false,
          updatedAt: new Date(),
        },
      });

    res.json({ ok: true });
  } catch (err: any) {
    res.status(500).json({ error: err?.message ?? "فشل حفظ المسودة" });
  }
});

// ─── GET /api/contract/sessions/latest — load latest saved draft for user ────
router.get("/contract/sessions/latest", requireAuth, async (req, res): Promise<void> => {
  try {
    const rows = await db
      .select({
        id: contractDraftsTable.id,
        serviceSessionId: contractDraftsTable.serviceSessionId,
        draftText: contractDraftsTable.draftText,
        usedLiveSearch: contractDraftsTable.usedLiveSearch,
        updatedAt: contractDraftsTable.updatedAt,
      })
      .from(contractDraftsTable)
      .where(eq(contractDraftsTable.userId, req.userId!))
      .orderBy(desc(contractDraftsTable.updatedAt))
      .limit(1);

    if (rows.length === 0) {
      res.json({ draft: null });
      return;
    }

    res.json({ draft: rows[0] });
  } catch (err: any) {
    res.status(500).json({ error: err?.message ?? "فشل تحميل المسودة" });
  }
});

export default router;
