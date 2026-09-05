/**
 * Telegram Bot — رباب محاميتك الرقمية (@Rabab_legal_bot)
 *
 * ميزات البوت:
 * • الإجابة على الأسئلة القانونية بالعربية (GPT-4o)
 * • رفع مستندات قاعدة المعرفة (للأدمن فقط): PDF / DOCX / TXT
 * • أوامر: /start، /help، /privacy، /myid
 *
 * الأمان:
 * • الرمز محمي ولا يظهر في السجلات
 * • صلاحيات الأدمن محددة بـ TELEGRAM_ADMIN_ID
 *
 * ملاحظة للمطورين:
 * دعم الإنجليزية يمكن إضافته لاحقاً: أضف أمر /language وأزل شرط
 * "العربية إلزامية بلا استثناء" من SYSTEM_PROMPT.
 */

import TelegramBot, { type Message } from "node-telegram-bot-api";
import OpenAI from "openai";
import { db, knowledgeDocumentsTable } from "@workspace/db";
import { eq, isNull, isNotNull } from "drizzle-orm";
import { createAndIndexDocument } from "./document-indexer";
import { retrieveRelevantChunks } from "./rag";
import { logger } from "./logger";

// ── Singletons ───────────────────────────────────────────────────────────────
let bot: TelegramBot | null = null;
let botUsername = "@Rabab_legal_bot";
let botHealthy = false;

// ── OpenAI ───────────────────────────────────────────────────────────────────
function getOpenAIClient(): OpenAI {
  const apiKey = process.env.OPENAI_API_KEY?.trim();
  if (!apiKey) throw new Error("OPENAI_API_KEY is not configured");
  return new OpenAI({ apiKey });
}

// ── Admin ID ─────────────────────────────────────────────────────────────────
function getAdminId(): number | null {
  const raw = process.env.TELEGRAM_ADMIN_ID?.trim();
  if (!raw) return null;
  const n = parseInt(raw, 10);
  return isNaN(n) ? null : n;
}

function isAdmin(userId: number): boolean {
  const adminId = getAdminId();
  return adminId !== null && userId === adminId;
}

// ── System prompt ─────────────────────────────────────────────────────────────
// ملاحظة: لإضافة دعم الإنجليزية لاحقاً أزل قاعدة "العربية إلزامية بلا استثناء"
const SYSTEM_PROMPT = `أنت رباب محاميتك الرقمية — خبيرة قانونية متخصصة في الأنظمة السعودية والخليجية، تعمل تحت إشراف المحامية والمحكمة التجارية د. رباب أحمد المعبي. إجاباتك يجب أن تعكس دقة ومسؤولية المستشار القانوني المرخّص لا مساعداً عاماً.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
🔰 الهوية والنطاق
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
- الاسم الرسمي الكامل (لا يتغير أبداً): رباب محاميتك الرقمية — RABAB LEGAL AI في الأنظمة السعودية والخليجية
- تحت إشراف: المحامية والمحكمة التجارية د. رباب أحمد المعبي
- النطاق الحصري: أنظمة وتشريعات دول مجلس التعاون الخليجي الست فقط:
  المملكة العربية السعودية • الإمارات • الكويت • قطر • البحرين • عُمان
- قاعدة اللغة الإلزامية: تجيب بالعربية دائماً وفي جميع الأحوال بلا استثناء. لا تستخدم أي لغة أخرى مهما طلب المستخدم.
- لا تُرجع رداً فارغاً أو غير مفيد. قدِّم دائماً محتوى قانونياً موضوعياً ذا قيمة.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
📋 منهجية الرد الإلزامية (بهذا الترتيب)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
لكل استفسار قانوني اتبع هذا التسلسل:
1. تحديد الدولة — حدِّد الدولة المنطبقة. إن لم تُذكر فاسأل قبل المتابعة.
2. الوقائع — لخِّص الوقائع كما وردت.
3. التكييف القانوني — حدِّد الوصف القانوني الدقيق (عقد، جريمة، نزاع، مطالبة، إلخ).
4. الأساس القانوني — استشهد بالنظام أو اللائحة أو القرار الوزاري أو المرسوم الملكي المنطبق مع رقمه وتاريخه ومصدره الرسمي.
5. نصوص المواد — اقتبس المواد حرفياً فقط عند التأكد 100٪. عند أي شك، قل: «لم أتمكن من التثبت من النص الحرفي للمادة، يُرجى مراجعة النص الرسمي على المصدر: [اسم الجهة والرابط].» لا تخمِّن أبداً.
6. التحليل القانوني — تحليل معمّق يشمل نقاط القوة والضعف والدفوع المتاحة والمخاطر المحتملة.
7. التوصيات العملية — خطوات عملية محددة، الجهات المختصة، المواعيد القانونية.
8. الرأي النهائي — رأي تحليلي حاسم مستند إلى وثائق رسمية.

❌ لا تُدرج السوابق القضائية في أي رد تحت أي ظرف.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
🚫 المحظورات الصارمة
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
- لا تكشف عن ملفات داخلية أو قواعد معرفة أو مصادر بيانات.
- إن سُئلت عن مصادرك أجب فقط: «أعتمد على الأنظمة القانونية الخليجية والمراجع المعتمدة وقاعدة معرفية قانونية متخصصة.»
- لا تختلق أرقام مواد أو أحكام أو روابط.
- لا تُحيل إلى ChatGPT أو أي نظام ذكاء اصطناعي خارجي آخر.
- لا تجيب على أسئلة خارج نطاق دول الخليج الست.
- الهلوسة في المواد النظامية محظورة تمامًا ومطلقًا.
- الالتزام بنطاق الاستشارة فقط.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
⚠️ قواعد قانون الأسرة السعودي الحرجة
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
- قضايا النفقة والمسكن والحضانة هي قضايا مستقلة تمامًا.
- عند تناول أي منها يجب التنبيه: «تنبيه مهم: كل طلب (النفقة / المسكن / الحضانة) يُقدَّم في قضية مستقلة ولا يجوز دمجها في دعوى واحدة.»

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
📱 سياق تيليجرام
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
- تجيب عبر تيليجرام. اجعل ردودك منظمة ومناسبة للقراءة على الهاتف.
- اختم كل رد قانوني موضوعي بالعبارة الآتية حرفياً:
  «⚠️ تنبيه: هذه المعلومات للتوعية القانونية فقط، ولا تُنشئ علاقة محاماة، ولا تُغني عن استشارة محامٍ متخصص في قضيتك.»`;

// ── محادثة قصيرة الأمد (آخر 6 رسائل لكل مستخدم) ────────────────────────────
const userHistory = new Map<number, { role: "user" | "assistant"; content: string }[]>();
const MAX_HISTORY = 6;

// ── أنواع الملفات المقبولة ───────────────────────────────────────────────────
const ALLOWED_MIMES: Record<string, string> = {
  "application/pdf": "pdf",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document": "docx",
  "text/plain": "txt",
  "application/zip": "zip",
  "application/x-zip-compressed": "zip",
};
const ALLOWED_EXTENSIONS = /\.(pdf|docx?|pptx?|xlsx?|txt|rtf|csv|zip)$/i;
const MAX_FILE_BYTES = 50 * 1024 * 1024; // 50 MB (ZIP قد يحتوي ملفات كثيرة)

// ── نصوص الأوامر ─────────────────────────────────────────────────────────────

const MSG_START = `السلام عليكم ورحمة الله وبركاته 🌟

أنا *رباب — محاميتك الرقمية* في الأنظمة السعودية والخليجية،
تحت إشراف المحامية والمحكمة التجارية *د. رباب أحمد المعبي*.

أُقدِّم معلومات قانونية متخصصة في أنظمة دول مجلس التعاون الخليجي الست:
🇸🇦 المملكة العربية السعودية | 🇦🇪 الإمارات | 🇰🇼 الكويت
🇶🇦 قطر | 🇧🇭 البحرين | 🇴🇲 عُمان

📌 *إخلاء مسؤولية مهم:*
ما أقدمه معلومات قانونية للتوعية فحسب، لا يُعدّ استشارةً قانونية رسمية، ولا يُنشئ علاقة محاماة، ولا يُغني عن الاستشارة المتخصصة في قضيتك.

💡 اكتب سؤالك القانوني مباشرةً وسأردّ عليك.

📋 للمساعدة: /help
🔒 للخصوصية: /privacy`;

const MSG_HELP = `📋 *دليل الاستخدام*

*كيف تستفيد من البوت؟*
١. اكتب سؤالك القانوني مباشرةً بأكبر قدر من التفاصيل
٢. حدِّد الدولة التي ينطبق عليها السؤال
٣. كلما كانت الوقائع أوضح، كانت الإجابة أدقّ وأشمل

*أمثلة على الأسئلة:*
◈ ما مدة الاعتراض على الحكم الابتدائي في المملكة العربية السعودية؟
◈ ما حقوق العامل عند إنهاء الخدمة تعسفياً في الإمارات؟
◈ ما شروط صحة عقد الإيجار في قطر؟
◈ ما إجراءات إشهار الإفلاس في الكويت؟

*أوامر البوت:*
/start — رسالة الترحيب
/help — دليل الاستخدام
/privacy — سياسة الخصوصية

⚠️ *تنبيه مهم:* هذه البوت تُقدِّم معلومات قانونية للتوعية فحسب، لا استشارة رسمية ولا تُنشئ علاقة محاماة.

🔗 للاستشارات المتخصصة: [rabablegal.com](https://www.rabablegal.com)`;

const MSG_PRIVACY = `🔒 *سياسة الخصوصية والبيانات*

*ما الذي نفعله ببياناتك؟*
◈ رسائلك تُستخدم حصراً لتوليد الرد القانوني المناسب لك.
◈ لا نحتفظ بسجل دائم لمحادثاتك — يُحذف السياق تلقائياً عند إعادة تشغيل الخادم.
◈ لا تُشارَك رسائلك مع أي طرف ثالث.
◈ جميع الردود تمر عبر نموذج ذكاء اصطناعي آمن تحت إشراف بشري متخصص.

*تنبيهات مهمة:*
⚠️ لا تُرسل بياناتك الشخصية الحساسة كأرقام الهوية أو البيانات البنكية.
⚠️ هذا البوت للتوعية القانونية فقط ولا يُغني عن المحامي المرخّص.

*الإشراف والمسؤولية:*
يعمل هذا البوت تحت إشراف المحامية والمحكمة التجارية *د. رباب أحمد المعبي*.

📩 للتواصل المباشر: [@rabab_almoobi](https://x.com/rabab_almoobi)
🌐 الموقع الرسمي: [rabablegal.com](https://www.rabablegal.com)`;

// ── أدوات مساعدة ─────────────────────────────────────────────────────────────

function splitMessage(text: string, limit = 4096): string[] {
  if (text.length <= limit) return [text];
  const parts: string[] = [];
  let remaining = text;
  while (remaining.length > limit) {
    let cut = remaining.lastIndexOf("\n", limit);
    if (cut < limit * 0.5) cut = remaining.lastIndexOf(" ", limit);
    if (cut < 1) cut = limit;
    parts.push(remaining.slice(0, cut));
    remaining = remaining.slice(cut).trimStart();
  }
  if (remaining.length > 0) parts.push(remaining);
  return parts;
}

async function sendSafe(chatId: number, text: string): Promise<void> {
  if (!bot) return;
  for (const part of splitMessage(text)) {
    await bot.sendMessage(chatId, part, { parse_mode: "Markdown" }).catch(async () => {
      await bot!.sendMessage(chatId, part).catch((err) => {
        logger.error({ chatId, err: err?.message }, "telegram: فشل إرسال الرسالة");
      });
    });
  }
}

/** تحميل ملف من تيليجرام كـ Buffer */
async function downloadTelegramFile(fileId: string): Promise<Buffer> {
  if (!bot) throw new Error("البوت غير مهيأ");
  const fileInfo = await bot.getFile(fileId);
  const filePath = fileInfo.file_path;
  if (!filePath) throw new Error("مسار الملف غير متاح");

  const token = process.env.TELEGRAM_BOT_TOKEN!.trim();
  const url = `https://api.telegram.org/file/bot${token}/${filePath}`;
  const res = await fetch(url, { signal: AbortSignal.timeout(60_000) });
  if (!res.ok) throw new Error(`فشل تحميل الملف: ${res.status}`);
  return Buffer.from(await res.arrayBuffer());
}

// ── ردود الذكاء الاصطناعي مع RAG ────────────────────────────────────────────

async function getAIResponse(userId: number, userMessage: string): Promise<string> {
  const history = userHistory.get(userId) ?? [];
  history.push({ role: "user", content: userMessage });

  // استرجاع الأجزاء ذات الصلة من قاعدة المعرفة
  let ragContext = "";
  try {
    const apiKey = process.env.OPENAI_API_KEY?.replace(/[^\x20-\x7E]/g, "").trim() ?? "";
    const chunks = await retrieveRelevantChunks(userMessage, apiKey, 5, 0.3);
    if (chunks.length > 0) {
      ragContext =
        "\n\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n" +
        "📚 معلومات من قاعدة المعرفة القانونية:\n" +
        "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n" +
        chunks.map((c) => `[${c.documentName}]\n${c.content}`).join("\n\n---\n\n") +
        "\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n" +
        "استخدم هذه المعلومات إن كانت ذات صلة بالسؤال، وأشر إلى المصدر بذكر اسم المستند.";
    }
  } catch {
    // فشل RAG لا يوقف الرد — يستمر بدونه
  }

  const systemWithRag = ragContext ? SYSTEM_PROMPT + ragContext : SYSTEM_PROMPT;

  try {
    const openai = getOpenAIClient();
    const completion = await openai.chat.completions.create({
      model: "gpt-4o",
      temperature: 0.3,
      max_tokens: 2000,
      messages: [{ role: "system", content: systemWithRag }, ...history],
    });

    const reply = completion.choices[0]?.message?.content?.trim() ?? "";
    if (!reply) throw new Error("empty_response");

    history.push({ role: "assistant", content: reply });
    if (history.length > MAX_HISTORY * 2) history.splice(0, 2);
    userHistory.set(userId, history);
    return reply;
  } catch (err: any) {
    logger.warn({ userId, code: err?.status ?? err?.code ?? "unknown" }, "telegram: خطأ OpenAI");
    if (err?.status === 429) return "عذراً، الخدمة مشغولة حالياً. يرجى المحاولة بعد لحظات. 🙏";
    if (err?.status === 503 || err?.code === "ECONNREFUSED")
      return "عذراً، خدمة الذكاء الاصطناعي غير متاحة مؤقتاً. يرجى المحاولة لاحقاً.";
    return "حدث خطأ أثناء معالجة سؤالك. يرجى إعادة المحاولة أو صياغة السؤال بشكل مختلف.";
  }
}

// ── فحص مفتاح الاستيراد ──────────────────────────────────────────────────────
async function isTelegramImportEnabled(): Promise<boolean> {
  try {
    const { db, platformSettingsTable } = await import("@workspace/db");
    const { eq } = await import("drizzle-orm");
    const rows = await db
      .select()
      .from(platformSettingsTable)
      .where(eq(platformSettingsTable.key, "telegram_import"));
    return (rows[0]?.value as any)?.enabled === true;
  } catch {
    return false;
  }
}

// ── معالجة رفع المستندات (الأدمن فقط) ───────────────────────────────────────

async function handleDocumentUpload(msg: Message, silentMode = false): Promise<void> {
  const chatId = msg.chat.id;
  const userId = msg.from?.id ?? chatId;

  // في القنوات (silentMode) البوت مُضاف كمشرف — لا حاجة للتحقق من المستخدم
  if (!silentMode && !isAdmin(userId)) {
    await sendSafe(chatId, "⛔ هذه الخاصية متاحة للمشرف فقط.");
    return;
  }

  // فحص مفتاح الاستيراد من لوحة الإدارة
  const importEnabled = await isTelegramImportEnabled();
  if (!importEnabled) {
    if (!silentMode) {
      await sendSafe(chatId,
        "⏸ *استيراد تيليجرام متوقف حالياً*\n\n" +
        "تم إيقاف استيراد الملفات من تيليجرام من لوحة الإدارة.\n" +
        "لإعادة التفعيل، طلب من المدير تفعيل مصدر تيليجرام في صفحة حالة المصادر."
      );
    }
    logger.info({ filename: msg.document?.file_name }, "telegram: رفع ملف مرفوض — الاستيراد معطّل");
    return;
  }

  const doc = msg.document;
  if (!doc) return;

  const filename = doc.file_name ?? `document_${Date.now()}`;
  const mimetype = doc.mime_type ?? "application/octet-stream";
  const fileSize = doc.file_size ?? 0;

  // لا قيود على الأدمن — تُقبل جميع الأنواع والأحجام

  const isZip =
    mimetype === "application/zip" ||
    mimetype === "application/x-zip-compressed" ||
    filename.toLowerCase().endsWith(".zip");

  await sendSafe(
    chatId,
    isZip
      ? `⏳ جارٍ فك ضغط الملف وفهرسة المستندات بداخله: *${filename}*\nهذا قد يستغرق بعض الوقت...`
      : `⏳ جارٍ معالجة الملف: *${filename}*\nيرجى الانتظار...`,
  );
  await bot!.sendChatAction(chatId, "upload_document").catch(() => {});

  try {
    const buffer = await downloadTelegramFile(doc.file_id);

    // ── ملف ZIP: فهرسة كل ملف بداخله ──────────────────────────────────────
    if (isZip) {
      const AdmZip = (await import("adm-zip" as any)).default;
      const zip = new AdmZip(buffer);
      const entries = zip.getEntries() as any[];

      const supported = entries.filter((e: any) => {
        if (e.isDirectory) return false;
        return ALLOWED_EXTENSIONS.test(e.entryName) && !e.entryName.toLowerCase().endsWith(".zip");
      });

      if (supported.length === 0) {
        await sendSafe(chatId, "⚠️ لا توجد ملفات مدعومة داخل ZIP.\nالأنواع المقبولة: PDF، Word، PowerPoint، Excel، TXT.");
        return;
      }

      await sendSafe(chatId, `📦 وُجد *${supported.length}* ملف قابل للفهرسة — جارٍ المعالجة...`);

      let success = 0, failed = 0;
      const errors: string[] = [];

      for (const entry of supported) {
        const entryName: string = entry.entryName.split("/").pop() ?? entry.entryName;
        const ext = entryName.split(".").pop()?.toLowerCase() ?? "";
        const { detectMime } = await import("./document-indexer");
        const entryMime = detectMime(entryName, "application/octet-stream");

        try {
          const entryBuffer = Buffer.from(entry.getData());
          await createAndIndexDocument(entryBuffer, entryMime, entryName, { sourceType: "telegram" });
          success++;
          logger.info({ filename: entryName }, "telegram: ملف من ZIP أُفهرس");
        } catch (err: any) {
          failed++;
          errors.push(`• \`${entryName}\`: ${err?.message ?? "خطأ"}`);
          logger.warn({ filename: entryName, err: err?.message }, "telegram: فشل فهرسة ملف من ZIP");
        }
      }

      const summary =
        `✅ *اكتملت فهرسة الملفات*\n\n` +
        `📦 إجمالي الملفات: ${supported.length}\n` +
        `✅ نجح: ${success}\n` +
        (failed > 0 ? `❌ فشل: ${failed}\n\n*تفاصيل الأخطاء:*\n${errors.join("\n")}` : "") +
        `\n\nجميع الملفات الناجحة متاحة الآن في قاعدة المعرفة.`;

      await sendSafe(chatId, summary);
      return;
    }

    // ── ملف منفرد ──────────────────────────────────────────────────────────
    const { docId, chunks } = await createAndIndexDocument(buffer, mimetype, filename, { sourceType: "telegram" });
    logger.info({ docId, filename, chunks }, "telegram: مستند أُضيف لقاعدة المعرفة");

    await sendSafe(
      chatId,
      `✅ *تمت إضافة المستند بنجاح!*\n\n` +
      `📄 الملف: \`${filename}\`\n` +
      `🗂 المعرِّف: #${docId}\n` +
      `📦 عدد الأجزاء المُفهرَسة: ${chunks}\n\n` +
      `المستند متاح الآن في قاعدة المعرفة وسيُستخدم في الردود القانونية.`,
    );
  } catch (err: any) {
    logger.error({ filename, err: err?.message }, "telegram: فشل فهرسة المستند");
    const errMsg = err?.message ?? "";
    const isRateLimit = errMsg.includes("ضغط مؤقت") || errMsg.includes("قائمة الانتظار") || errMsg.includes("429");
    const isUnreadable = errMsg.includes("غير قابل للقراءة") || errMsg.includes("صورة ممسوحة");
    if (isRateLimit) {
      await sendSafe(
        chatId,
        `⏳ *يوجد ضغط مؤقت على خدمة المعالجة*\n\n` +
        `الملف: \`${filename}\`\n` +
        `تم وضع الملف في قائمة الانتظار وستُعاد معالجته تلقائياً — لا حاجة لإعادة الإرسال.`,
      );
    } else if (isUnreadable) {
      await sendSafe(
        chatId,
        `❌ *الملف غير قابل للقراءة*\n\n` +
        `الملف: \`${filename}\`\n` +
        `تأكد أن الملف يحتوي على نص فعلي وليس صورة ممسوحة ضوئياً بدون OCR.`,
      );
    } else {
      await sendSafe(
        chatId,
        `❌ *فشلت معالجة الملف*\n\n` +
        `الملف: \`${filename}\`\n` +
        `السبب: ${errMsg || "خطأ غير معروف"}`,
      );
    }
  }
}

// ── فهرسة رابط URL ────────────────────────────────────────────────────────────
function htmlToText(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, "")
    .replace(/<style[\s\S]*?<\/style>/gi, "")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ").replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">")
    .replace(/\s{2,}/g, " ").trim();
}

async function handleUrlIndex(chatId: number, url: string, silentMode = false): Promise<void> {
  if (!silentMode) await sendSafe(chatId, `⏳ جارٍ جلب وفهرسة الرابط:\n\`${url}\``);
  await bot!.sendChatAction(chatId, "typing").catch(() => {});

  try {
    const res = await fetch(url, {
      headers: { "User-Agent": "Mozilla/5.0 (compatible; RababLegalBot/1.0)", Accept: "text/html,text/plain" },
      signal: AbortSignal.timeout(20_000),
    });
    if (!res.ok) throw new Error(`فشل جلب الرابط: ${res.status} ${res.statusText}`);

    const ct = res.headers.get("content-type") ?? "";
    const body = await res.text();
    const text = ct.includes("text/plain") ? body : htmlToText(body);

    if (!text || text.trim().length < 20)
      throw new Error("الصفحة لا تحتوي على نص كافٍ قابل للفهرسة.");

    const label = new URL(url).hostname + " — " + new Date().toLocaleDateString("ar-SA");
    const [doc] = await db
      .insert(knowledgeDocumentsTable)
      .values({ filename: label, mimeType: "text/html", sourceUrl: url, status: "pending" })
      .returning();

    // فهرسة النص عبر pipeline المعتادة
    const { chunkText, embedTexts } = await import("./rag");
    const apiKey = process.env.OPENAI_API_KEY?.replace(/[^\x20-\x7E]/g, "").trim() ?? "";
    const chunks = chunkText(text);
    const embeddings = await embedTexts(chunks, apiKey);

    const { knowledgeChunksTable } = await import("@workspace/db");
    await db.insert(knowledgeChunksTable).values(
      chunks.map((content, i) => ({ documentId: doc.id, chunkIndex: i, content, embedding: embeddings[i] }))
    );
    await db.update(knowledgeDocumentsTable)
      .set({ status: "indexed", totalChunks: chunks.length, extractedText: text.slice(0, 100_000), updatedAt: new Date() })
      .where(eq(knowledgeDocumentsTable.id, doc.id));

    logger.info({ docId: doc.id, url, chunks: chunks.length }, "telegram: رابط مُفهرَس");
    if (!silentMode) await sendSafe(chatId,
      `✅ *تمت فهرسة الرابط بنجاح*\n\n🔗 \`${url}\`\n🗂 المعرِّف: #${doc.id}\n📦 ${chunks.length} جزء مُفهرَس`);
  } catch (err: any) {
    logger.error({ url, err: err?.message }, "telegram: فشل فهرسة الرابط");
    if (!silentMode) await sendSafe(chatId, `❌ *فشلت فهرسة الرابط*\n\nالسبب: ${err?.message ?? "خطأ غير معروف"}`);
    throw err;
  }
}

// ── رفع الصور ─────────────────────────────────────────────────────────────────
async function handlePhotoUpload(msg: Message, silentMode = false): Promise<void> {
  const chatId = msg.chat.id;
  const photos = msg.photo;
  if (!photos || photos.length === 0) return;

  // اختر أعلى دقة متاحة
  const photo = photos[photos.length - 1];
  const filename = `photo_${Date.now()}.jpg`;

  if (!silentMode) await sendSafe(chatId, `⏳ جارٍ حفظ الصورة...`);
  await bot!.sendChatAction(chatId, "upload_photo").catch(() => {});

  try {
    const buffer = await downloadTelegramFile(photo.file_id);
    const [doc] = await db
      .insert(knowledgeDocumentsTable)
      .values({
        filename,
        mimeType: "image/jpeg",
        status: "indexed",
        fileData: buffer,
        fileSize: buffer.length,
        totalChunks: 0,
        extractedText: null,
      })
      .returning();

    logger.info({ docId: doc.id, filename }, "telegram: صورة مُحفظة");
    if (!silentMode) {
      await sendSafe(chatId,
        `✅ *تم حفظ الصورة*\n\n🖼 المعرِّف: #${doc.id}\n📦 ${(buffer.length / 1024).toFixed(1)} KB\n\n_الصور محفوظة للرجوع إليها ولا تُفهرَس للبحث النصي._`);
    }
  } catch (err: any) {
    logger.error({ err: err?.message }, "telegram: فشل حفظ الصورة");
    if (!silentMode) await sendSafe(chatId, "❌ فشل حفظ الصورة.");
  }
}

// ── تهيئة البوت ───────────────────────────────────────────────────────────────

export function startTelegramBot(): void {
  const token = process.env.TELEGRAM_BOT_TOKEN?.trim();
  if (!token) {
    logger.warn("telegram: TELEGRAM_BOT_TOKEN غير مضبوط — البوت معطّل");
    return;
  }

  if (!getAdminId()) {
    logger.warn("telegram: TELEGRAM_ADMIN_ID غير مضبوط — رفع المستندات معطّل");
  }

  // في بيئة الإنتاج نُنشئ البوت بدون polling تجنّباً لخطأ 409 Conflict
  // الذي ينشأ حين تُشغّل بيئة التطوير والإنتاج polling في آنٍ واحد.
  // البوت في الإنتاج يحتفظ بقدرة الإرسال (إشعارات/تنبيهات) لكنه لا يستقبل أوامر.
  const isProduction = process.env.NODE_ENV === "production";

  try {
    bot = isProduction
      ? new TelegramBot(token, { polling: false })
      : new TelegramBot(token, {
          polling: {
            interval: 2000,
            autoStart: true,
            params: { timeout: 10, allowed_updates: [] },
          },
        });
  } catch (err: any) {
    logger.error({ err: err?.message }, "telegram: فشل إنشاء مثيل البوت");
    return;
  }

  if (isProduction) {
    // الإنتاج: إرسال فقط — لا polling، لا معالجات أوامر
    bot
      .getMe()
      .then((me) => {
        botUsername = `@${me.username}`;
        botHealthy = true;
        logger.info(
          { username: botUsername, mode: "send-only" },
          "telegram: البوت في وضع الإرسال فقط (الإنتاج)",
        );
      })
      .catch((err: any) => {
        logger.error({ err: err?.message }, "telegram: فشل getMe في الإنتاج");
        botHealthy = false;
      });
    return;
  }

  // ── فلتر عام: يحجب كل من ليس الأدمن تماماً ──────────────────────────────
  // يعمل قبل أي أمر أو رسالة — البوت لا يردّ على أحد سواكِ
  bot.on("message", (msg) => {
    const userId = msg.from?.id ?? msg.chat.id;
    if (!isAdmin(userId)) {
      // تجاهل صامت — لا ردّ، لا سجل
      return;
    }
  });

  bot.on("channel_post", (msg) => {
    // القنوات مسموح بها دائماً للفهرسة (البوت مضاف كمشرف)
  });

  // /start
  bot.onText(/\/start/, async (msg) => {
    if (!isAdmin(msg.from?.id ?? msg.chat.id)) return;
    await sendSafe(msg.chat.id, MSG_START);
  });

  // /help
  bot.onText(/\/help/, async (msg) => {
    if (!isAdmin(msg.from?.id ?? msg.chat.id)) return;
    await sendSafe(msg.chat.id, MSG_HELP);
  });

  // /privacy
  bot.onText(/\/privacy/, async (msg) => {
    if (!isAdmin(msg.from?.id ?? msg.chat.id)) return;
    await sendSafe(msg.chat.id, MSG_PRIVACY);
  });

  // /myid
  bot.onText(/\/myid/, async (msg) => {
    if (!isAdmin(msg.from?.id ?? msg.chat.id)) return;
    const uid = msg.from?.id ?? msg.chat.id;
    await sendSafe(msg.chat.id, `🆔 معرِّف حسابك في تيليجرام:\n\`${uid}\``);
  });

  // /documents — عرض قائمة المستندات المُفهرَسة (الأدمن فقط)
  bot.onText(/\/documents/, async (msg) => {
    const userId = msg.from?.id ?? msg.chat.id;
    const chatId = msg.chat.id;

    if (!isAdmin(userId)) {
      await sendSafe(chatId, "⛔ هذا الأمر متاح للمشرف فقط.");
      return;
    }

    try {
      const allDocs = await db
        .select({
          id: knowledgeDocumentsTable.id,
          filename: knowledgeDocumentsTable.filename,
          status: knowledgeDocumentsTable.status,
          totalChunks: knowledgeDocumentsTable.totalChunks,
          archivedAt: knowledgeDocumentsTable.archivedAt,
          createdAt: knowledgeDocumentsTable.createdAt,
        })
        .from(knowledgeDocumentsTable)
        .orderBy(knowledgeDocumentsTable.createdAt);

      const active = allDocs.filter((d) => !d.archivedAt);
      const archived = allDocs.filter((d) => d.archivedAt);

      if (allDocs.length === 0) {
        await sendSafe(chatId, "📂 قاعدة المعرفة فارغة — لا توجد مستندات بعد.\n\nأرسلي ملف PDF أو DOCX أو TXT لإضافته.");
        return;
      }

      const statusIcon = (s: string) =>
        s === "indexed" ? "✅" : s === "indexing" ? "⏳" : s === "error" ? "❌" : "🔄";

      const fmtDoc = (d: typeof allDocs[0]) => {
        const date = d.createdAt.toLocaleDateString("ar-SA", { day: "2-digit", month: "2-digit", year: "numeric" });
        return `${statusIcon(d.status)} *#${d.id}* — \`${d.filename}\`\n   📦 ${d.totalChunks} جزء | 📅 ${date}`;
      };

      let msg_text = `📚 *قاعدة المعرفة*\n\n`;

      if (active.length > 0) {
        msg_text += `*نشطة (${active.length}):*\n` + active.map(fmtDoc).join("\n\n");
      }

      if (archived.length > 0) {
        msg_text += `\n\n📦 *مؤرشفة (${archived.length}):*\n` +
          archived.map((d) => `📦 *#${d.id}* — \`${d.filename}\``).join("\n");
      }

      const firstActive = active[0] ?? allDocs[0];
      msg_text +=
        `\n\n*أوامر الإدارة:*\n` +
        `/archive ${firstActive.id} — أرشفة\n` +
        `/unarchive ${firstActive.id} — استعادة\n` +
        `/get ${firstActive.id} — تحميل الملف`;

      await sendSafe(chatId, msg_text);
    } catch (err: any) {
      logger.error({ err: err?.message }, "telegram: خطأ في جلب قائمة المستندات");
      await sendSafe(chatId, "حدث خطأ أثناء جلب القائمة. يرجى المحاولة لاحقاً.");
    }
  });

  // /get [id] — إرسال الملف الأصلي للأدمن (الأدمن فقط)
  bot.onText(/\/get(?:\s+(\d+))?/, async (msg, match) => {
    const userId = msg.from?.id ?? msg.chat.id;
    const chatId = msg.chat.id;

    if (!isAdmin(userId)) {
      await sendSafe(chatId, "⛔ هذا الأمر متاح للمشرف فقط.");
      return;
    }

    const docId = match?.[1] ? parseInt(match[1], 10) : null;
    if (!docId) {
      await sendSafe(chatId, "⚠️ يرجى تحديد رقم المستند.\nمثال: `/get 3`\n\nاستخدمي `/documents` لعرض الأرقام.");
      return;
    }

    try {
      const rows = await db
        .select({
          id: knowledgeDocumentsTable.id,
          filename: knowledgeDocumentsTable.filename,
          mimeType: knowledgeDocumentsTable.mimeType,
          fileData: knowledgeDocumentsTable.fileData,
          fileSize: knowledgeDocumentsTable.fileSize,
        })
        .from(knowledgeDocumentsTable)
        .where(eq(knowledgeDocumentsTable.id, docId));

      if (rows.length === 0) {
        await sendSafe(chatId, `❌ لا يوجد مستند بالرقم #${docId}.`);
        return;
      }

      const doc = rows[0];

      if (!doc.fileData) {
        await sendSafe(
          chatId,
          `⚠️ الملف الأصلي غير محفوظ للمستند *#${docId}* (${doc.filename}).\n\nالمستندات المرفوعة قبل تحديث النظام لا تحتوي على نسخة أصلية. يرجى رفع الملف مجدداً.`,
        );
        return;
      }

      await bot!.sendChatAction(chatId, "upload_document").catch(() => {});
      await bot!.sendDocument(
        chatId,
        doc.fileData,
        { caption: `📄 ${doc.filename}\n📦 ${doc.fileSize ? (doc.fileSize / 1024).toFixed(1) + " KB" : ""}` },
        { filename: doc.filename, contentType: doc.mimeType ?? "application/octet-stream" },
      );

      logger.info({ docId, filename: doc.filename }, "telegram: أُرسل ملف للأدمن");
    } catch (err: any) {
      logger.error({ docId, err: err?.message }, "telegram: خطأ في إرسال الملف");
      await sendSafe(chatId, "حدث خطأ أثناء إرسال الملف. يرجى المحاولة لاحقاً.");
    }
  });

  // /archive [id] — أرشفة مستند (يُخفى من البحث لكن لا يُحذف)
  bot.onText(/\/archive(?:\s+(\d+))?/, async (msg, match) => {
    const userId = msg.from?.id ?? msg.chat.id;
    const chatId = msg.chat.id;
    if (!isAdmin(userId)) { await sendSafe(chatId, "⛔ هذا الأمر متاح للمشرف فقط."); return; }

    const docId = match?.[1] ? parseInt(match[1], 10) : null;
    if (!docId) {
      await sendSafe(chatId, "⚠️ مثال: `/archive 3`\n\nاستخدمي `/documents` لعرض الأرقام.");
      return;
    }
    try {
      const rows = await db
        .select({ id: knowledgeDocumentsTable.id, filename: knowledgeDocumentsTable.filename, archivedAt: knowledgeDocumentsTable.archivedAt })
        .from(knowledgeDocumentsTable).where(eq(knowledgeDocumentsTable.id, docId));
      if (rows.length === 0) { await sendSafe(chatId, `❌ لا يوجد مستند بالرقم #${docId}.`); return; }
      if (rows[0].archivedAt) { await sendSafe(chatId, `⚠️ المستند *#${docId}* مؤرشف بالفعل.\nلاستعادته: \`/unarchive ${docId}\``); return; }

      await db.update(knowledgeDocumentsTable)
        .set({ archivedAt: new Date(), updatedAt: new Date() })
        .where(eq(knowledgeDocumentsTable.id, docId));

      logger.info({ docId, filename: rows[0].filename }, "telegram: مستند أُرشف");
      await sendSafe(chatId,
        `📦 *تمت الأرشفة*\n\n` +
        `الملف: \`${rows[0].filename}\` (#${docId})\n` +
        `المستند محفوظ لكنه لن يُستخدم في البحث.\n\n` +
        `لاستعادته: \`/unarchive ${docId}\``);
    } catch (err: any) {
      logger.error({ docId, err: err?.message }, "telegram: خطأ في الأرشفة");
      await sendSafe(chatId, "حدث خطأ أثناء الأرشفة. يرجى المحاولة لاحقاً.");
    }
  });

  // /unarchive [id] — استعادة مستند مؤرشف
  bot.onText(/\/unarchive(?:\s+(\d+))?/, async (msg, match) => {
    const userId = msg.from?.id ?? msg.chat.id;
    const chatId = msg.chat.id;
    if (!isAdmin(userId)) { await sendSafe(chatId, "⛔ هذا الأمر متاح للمشرف فقط."); return; }

    const docId = match?.[1] ? parseInt(match[1], 10) : null;
    if (!docId) {
      await sendSafe(chatId, "⚠️ مثال: `/unarchive 3`\n\nاستخدمي `/documents` لعرض الأرقام.");
      return;
    }
    try {
      const rows = await db
        .select({ id: knowledgeDocumentsTable.id, filename: knowledgeDocumentsTable.filename, archivedAt: knowledgeDocumentsTable.archivedAt })
        .from(knowledgeDocumentsTable).where(eq(knowledgeDocumentsTable.id, docId));
      if (rows.length === 0) { await sendSafe(chatId, `❌ لا يوجد مستند بالرقم #${docId}.`); return; }
      if (!rows[0].archivedAt) { await sendSafe(chatId, `⚠️ المستند *#${docId}* غير مؤرشف أصلاً.`); return; }

      await db.update(knowledgeDocumentsTable)
        .set({ archivedAt: null, updatedAt: new Date() })
        .where(eq(knowledgeDocumentsTable.id, docId));

      logger.info({ docId, filename: rows[0].filename }, "telegram: مستند استُعيد من الأرشيف");
      await sendSafe(chatId,
        `✅ *تمت الاستعادة*\n\n` +
        `الملف: \`${rows[0].filename}\` (#${docId})\n` +
        `المستند نشط الآن ويُستخدم في البحث.`);
    } catch (err: any) {
      logger.error({ docId, err: err?.message }, "telegram: خطأ في استعادة المستند");
      await sendSafe(chatId, "حدث خطأ أثناء الاستعادة. يرجى المحاولة لاحقاً.");
    }
  });

  // ── رسائل من القنوات (channel_post) — فهرسة تلقائية ──────────────────────
  bot.on("channel_post", async (msg) => {
    if (msg.document) {
      logger.info({ chatId: msg.chat.id, filename: msg.document.file_name }, "telegram: مستند من قناة");
      await handleDocumentUpload(msg, true);
    } else if (msg.photo) {
      logger.info({ chatId: msg.chat.id }, "telegram: صورة من قناة");
      await handlePhotoUpload(msg, true);
    }
  });

  // ── رسائل موجَّهة (forwarded) من الأدمن — فهرسة تلقائية ──────────────────
  // عند إعادة توجيه مستندات من قناة أو محادثة أخرى إلى البوت
  bot.on("message", async (msg) => {
    const userId = msg.from?.id ?? msg.chat.id;

    // ── حجب أي شخص ليس الأدمن — تجاهل صامت تام ──
    if (!isAdmin(userId)) return;

    if (msg.text?.startsWith("/")) return;

    // مستند مُرسَل أو مُعاد توجيهه
    if (msg.document) {
      await handleDocumentUpload(msg);
      return;
    }

    // صورة مُرسَلة — تُحفظ في قاعدة المعرفة
    if (msg.photo) {
      await handlePhotoUpload(msg);
      return;
    }

    // مقاطع صوتية أو مرئية أو ملفات صوتية
    if (msg.video || msg.audio || msg.voice || msg.video_note || msg.sticker) return;

    // رسائل غير نصية
    if (!msg.text) return;

    // ── رابط/روابط URL — تُجلب وتُفهرَس تلقائياً ────────────────────────────
    const urls = [...msg.text.matchAll(/https?:\/\/[^\s\n]+/g)].map(m => m[0]);
    if (urls.length > 0) {
      if (urls.length === 1) {
        await handleUrlIndex(msg.chat.id, urls[0]);
      } else {
        await sendSafe(msg.chat.id, `🔗 وُجد *${urls.length}* رابط — جارٍ الفهرسة واحداً تلو الآخر...`);
        let ok = 0, fail = 0;
        for (const url of urls) {
          try { await handleUrlIndex(msg.chat.id, url, true); ok++; }
          catch { fail++; }
        }
        await sendSafe(msg.chat.id, `✅ اكتملت الفهرسة\n\n✅ نجح: ${ok}\n❌ فشل: ${fail}`);
      }
      return;
    }

    await bot!.sendChatAction(msg.chat.id, "typing").catch(() => {});
    const reply = await getAIResponse(userId, msg.text);
    await sendSafe(msg.chat.id, reply);
  });

  // معالجة أخطاء الاستطلاع
  let pollingRestartTimer: ReturnType<typeof setTimeout> | null = null;

  bot.on("polling_error", (err: any) => {
    const httpCode = err?.response?.statusCode ?? err?.response?.body?.error_code;

    if (httpCode === 401 || httpCode === 404 || httpCode === 403) {
      logger.error({ httpCode }, "telegram: خطأ فادح في الرمز — توقف الاستطلاع");
      botHealthy = false;
      bot?.stopPolling();
    } else if (httpCode === 409) {
      // تعارض: جلسة polling أخرى نشطة — أوقف الاستطلاع وأعد التشغيل بعد 15 ثانية
      if (pollingRestartTimer) return; // تجنب إعادة الجدولة المتعددة
      logger.warn("telegram: تعارض polling (409) — سيُعاد التشغيل بعد 15 ثانية");
      bot?.stopPolling().catch(() => {});
      pollingRestartTimer = setTimeout(() => {
        pollingRestartTimer = null;
        if (!bot) return;
        bot.startPolling({ restart: true }).catch((e: any) => {
          logger.error({ err: e?.message }, "telegram: فشل إعادة تشغيل polling");
        });
      }, 15_000);
    } else {
      // تجاهل أخطاء الشبكة المؤقتة بصمت (ECONNRESET, ETIMEDOUT, إلخ)
    }
  });

  // التحقق من صحة الاتصال
  bot
    .getMe()
    .then((me) => {
      botUsername = `@${me.username}`;
      botHealthy = true;
      const adminId = getAdminId();
      logger.info(
        { username: botUsername, adminConfigured: adminId !== null },
        "telegram: البوت متصل ويعمل",
      );
    })
    .catch((err: any) => {
      logger.error({ err: err?.message }, "telegram: فشل getMe — الرمز قد يكون خاطئاً");
      botHealthy = false;
    });
}

// ── حالة البوت (لنقطة health) ────────────────────────────────────────────────

export function getTelegramBotStatus(): {
  enabled: boolean;
  healthy: boolean;
  username: string;
  adminConfigured: boolean;
} {
  return {
    enabled: bot !== null,
    healthy: botHealthy,
    username: botUsername,
    adminConfigured: getAdminId() !== null,
  };
}
