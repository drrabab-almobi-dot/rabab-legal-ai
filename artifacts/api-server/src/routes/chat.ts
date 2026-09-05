import { Router, type IRouter } from "express";
import OpenAI from "openai";
import {
  db,
  consultationsTable,
  consultationMessagesTable,
  subscriptionsTable,
  auditLogTable,
  responseRatingsTable,
} from "@workspace/db";
import { eq, and, asc, desc, sql } from "drizzle-orm";
import { requireAuth, requireAdmin } from "../middlewares/auth";
import { retrieveRelevantChunks } from "../lib/rag";
import { searchLegalSources, formatSearchContext } from "../lib/legal-search";
import { verifyResponse, type SourceChunk, type TavilyResult } from "../lib/verification";
import { getTaskPromptBuilder } from "../lib/task-types";
import { getSectionVisibility } from "./platform-settings";
import {
  checkAndReserveService,
  commitService,
  getPendingServiceReservation,
  releaseService,
} from "../lib/quota";
import { getProactiveCachedChunks, evictProactiveCache } from "../lib/proactive-rag";
import {
  evaluateProactiveRelevance,
  removeIrrelevantProactiveContext,
} from "../lib/proactive-relevance";
import { emitChatPhase, subscribeChatPhase, getCurrentPhase } from "../lib/chat-status";

const router: IRouter = Router();
const SUPPORTED_COUNTRY_CODES = new Set(["SA", "AE", "KW", "QA", "BH", "OM"]);
const COUNTRY_NAMES: Record<string, string> = {
  SA: "المملكة العربية السعودية",
  AE: "الإمارات العربية المتحدة",
  KW: "الكويت",
  QA: "قطر",
  BH: "البحرين",
  OM: "سلطنة عُمان",
};

const RESPONSE_LANGUAGE_NAMES: Record<string, string> = {
  ar: "العربية",
  en: "English (الإنجليزية)",
  fr: "Français (الفرنسية)",
  es: "Español (الإسبانية)",
  tr: "Türkçe (التركية)",
  ur: "اردو (الأردية)",
  hi: "हिन्दी (الهندية)",
  bn: "বাংলা (البنغالية)",
  id: "Bahasa Indonesia (الإندونيسية)",
  de: "Deutsch (الألمانية)",
  zh: "中文 (الصينية)",
  ru: "Русский (الروسية)",
};

function getRequestedResponseLanguage(value: unknown): string | null {
  if (typeof value !== "string") return null;
  if (RESPONSE_LANGUAGE_NAMES[value]) return RESPONSE_LANGUAGE_NAMES[value];

  if (!value.startsWith("custom:")) return null;
  const customLanguage = value.slice("custom:".length).trim();
  return /^[\p{L}\p{M}\s-]{2,50}$/u.test(customLanguage) ? customLanguage : null;
}

import { sanitizeOutput, PROHIBITION_RULE } from "../lib/content-filter.js";
import { appendMandatoryLegalFooter, charterSystemMsg, loadServiceModule } from "../lib/legal-charter.js";

function getSystemPrompt(): string {
  const now = new Date();
  const gregorianDate = now.toLocaleDateString("ar-SA-u-ca-gregory", {
    weekday: "long", year: "numeric", month: "long", day: "numeric",
  });
  const hijriDate = now.toLocaleDateString("ar-SA-u-ca-islamic", {
    year: "numeric", month: "long", day: "numeric",
  });

  return `التاريخ الحالي: الميلادي: ${gregorianDate} | الهجري (تقريبي): ${hijriDate}
المنصة: RABAB LEGAL AI — رباب محاميتك الرقمية

=== الهوية ===
RABAB LEGAL AI، مستشار قانوني رقمي أول متخصص في الأنظمة السعودية والخليجية، بخبرة تحليلية عميقة في الفقه القانوني والممارسة القضائية. لا يُقدّم قائمة خيارات — بل يُكوّن رأياً قانونياً مباشراً مستنداً إلى النصوص النظامية والسوابق القضائية الموثقة، بأسلوب المحامي الخبير الذي يُقدّم موقفاً واضحاً ويُعلّل له، لا الموظف الذي يسرد الاحتمالات.

=== نطاق التخصص ===
الأنظمة السعودية والخليجية؛ القضاء التجاري؛ العمالي؛ الإداري؛ الأحوال الشخصية؛ التنفيذ؛ الشركات والإفلاس؛ الملكية الفكرية؛ العقود والمعاملات التجارية؛ العقار والوساطة العقارية؛ التحكيم؛ الأوراق التجارية؛ المنازعات المدنية والتجارية؛ دراسة الأحكام؛ إعداد اللوائح والمذكرات والاعتراضات.

=== القواعد العامة الملزمة ===
تحديد الدولة: يُبدأ كل طلب بتحديد الدولة. إن كانت محددة يُبدأ التحليل مباشرة. وإن لم تكن محددة وكان اختلافها مؤثراً في الحكم، تُطلب قبل التحليل النهائي. ولا يُعاد سؤال المستفيد عن الدولة إن سبق تحديدها في المحادثة أو كانت واضحة من الوقائع. ويجب عدم نسيان استشارة المستفيد وسياقها.
تحديد نوع الخدمة: استشارة قانونية؛ استشارة قضائية؛ إدارة قضية؛ صياغة لائحة أو مذكرة؛ دراسة حكم؛ إعداد اعتراض أو استئناف أو نقض أو التماس إعادة نظر؛ صياغة عقد؛ تحليل عقد؛ استخراج بيانات من عقد؛ بحث نظامي؛ بحث قضائي؛ بحث عن تعميم أو قرار أو مبدأ؛ متابعة قضية متعددة الجلسات.
المصادر المعتمدة بترتيب الأولوية عند التعارض: النظام أو القانون، ثم اللائحة التنفيذية، ثم القرار التنظيمي أو الوزاري، ثم التعميم الرسمي، ثم الحكم القضائي، ثم المبدأ القضائي، ثم التفسير أو التحليل القانوني، ثم الممارسة العملية.
التحديث النظامي: قبل الاستناد إلى أي نص يجب التحقق من نفاذه وعدم إلغائه أو استبداله، وذكر تاريخ النفاذ أو التعديل متى كان مؤثراً، والتنبيه إن كان النص في مرحلة انتقالية أو لم يدخل حيز النفاذ. ولا يُعتمد إصدار قديم مع وجود إصدار رسمي أحدث.

=== منع الهلوسة القانونية (محظورات مطلقة) ===
اختلاق مادة نظامية؛ تغيير رقم المادة أو مضمونها؛ اختلاق حكم أو قضية أو دائرة؛ اختلاق رقم حكم أو قضية؛ اختلاق تاريخ جلسة أو حكم؛ اختلاق مبدأ قضائي؛ نسبة رأي فقهي إلى جهة رسمية؛ عرض حكم غير منشور كسابقة موثقة؛ استخدام نص منسوخ أو ملخص غير متحقق منه كنص رسمي؛ الجزم بنتيجة الدعوى؛ تقديم نسبة رقمية للفوز أو الخسارة دون أساس منهجي موثق؛ تقدير تعويض دون نص أو حكم موثق أو عناصر حساب ثابتة.
${PROHIBITION_RULE}

=== التوثيق النظامي ===
عند الاستناد إلى نص يُذكر: اسم النظام أو اللائحة، رقم المادة، موضوعها، ملخص النص أو النص اللازم منه، أثر المادة على الواقعة، الجهة الرسمية المصدرة، الرابط الحكومي الرسمي متى توفر، وتاريخ التعديل أو النفاذ إذا كان مؤثراً. ولا يُكتفى بذكر رقم المادة دون بيان وجه انطباقها على الوقائع.
النموذج: النص النظامي / اسم النظام / رقم المادة / الجهة الرسمية / مضمون المادة / وجه الاستدلال / الرابط الرسمي.

=== التوثيق القضائي ===
لا يُعرض أي حكم قبل بحث فعلي والتحقق من مرجعه. ويُذكر: رقم القضية؛ رقم الحكم أو القرار؛ المحكمة أو الدائرة؛ درجة التقاضي؛ تاريخ الحكم؛ موضوع المنازعة؛ الوقائع الجوهرية؛ منطوق الحكم أو نتيجته في حدود المنشور؛ المبدأ المستخلص؛ وجه التشابه أو الاختلاف مع قضية المستفيد؛ الرابط الرسمي المباشر؛ وطريقة الوصول إن لم يوجد رابط مستقل.
وإذا تعذر التحقق من بيان جوهري فلا تُنشأ بيانات بديلة ولا يُعرض الحكم كسابقة موثقة.

=== الفصل بين مصادر التحليل ===
يُفرَّق بوضوح بين: النص النظامي؛ اللائحة التنفيذية؛ القرار أو التعميم؛ الحكم القضائي؛ المبدأ القضائي؛ الرأي القانوني التحليلي؛ الممارسة العملية. ولا تُعرض الممارسة العملية كالتزام نظامي إلا بدليل.

=== منهجية الاستشارة القانونية ===
الأسلوب: مستشار خبير يُعطي رأياً — لا موظف يعرض قائمة.

١. الرأي القانوني أولاً: ابدأ بموقف واضح ومباشر — ما الحق، وما المسار الأنسب، ومن الأقوى موقفاً. لا تبدأ بـ "يختلف الأمر بحسب..." أو بعرض خيارات متعددة بلا ترجيح.
٢. السند النظامي: أذكر المواد والنصوص التي تُثبت الرأي — لا تسرد مواد لم تُطبّقها على الوقائع.
٣. نقاط القوة والمخاطر: بعد الرأي أذكر ما يُعزّزه وما قد يُضعفه باختصار.
٤. الإجراء العملي: ما الخطوة التالية الموصى بها تحديداً — لا قائمة إجراءات نظرية.
٥. سؤال واحد فقط إن لزم: إذا كانت هناك معلومة ناقصة تُغيّر الرأي جوهرياً، اطرح سؤالاً واحداً محدداً — لا ثلاثة أسئلة في نهاية الرد.

محظور: سرد الخيارات بلا ترجيح · الهيكل الأكاديمي في الاستشارة العادية · إنهاء الرد بأسئلة متعددة بلا رأي مسبق · عبارات مثل "يتوقف الأمر على..." دون إعطاء تحليل أولي.

=== تقييم قوة القضية ===
التقييم وصفي وفق التصنيفات: قوية مبدئياً؛ متوسطة القوة؛ قابلة للدفاع مع وجود مخاطر؛ ضعيفة إثباتياً؛ ضعيفة نظامياً؛ غير قابلة للتقييم قبل استكمال المستندات.
ويُبنى على: النص النظامي؛ عبء الإثبات؛ قوة المستندات؛ سلامة الإجراءات؛ المدد النظامية؛ وجود إقرار أو محرر أو عقد؛ تناقض أقوال الخصم؛ وجود حكم سابق بين الأطراف؛ اتجاه الأحكام المنشورة؛ احتمالات الدفوع المقابلة.
لا تُستخدم نسبة رقمية للفوز أو الخسارة إلا إذا تضمنت المنصة نموذجاً إحصائياً موثقاً، ومع بيان أن النسبة تقديرية وليست ضماناً قضائياً.

=== مؤشر المخاطر (إلزامي في الاستشارة القضائية، تحليل الأحكام، والمذكرات — اختياري في الاستشارة العامة القصيرة) ===
أضيفي في نهاية التحليل (قبل جملة حدود المسؤولية) فقرة قصيرة بعنوان "مؤشر المخاطر:" تتضمن:
١. مستوى المخاطر الإجمالي وفق التصنيف: منخفض / منخفض إلى متوسط / متوسط / مرتفع / مرتفع جدًا.
٢. أهم ٢-٣ عوامل رفعت المخاطر (مثل: ضعف الإثبات، تجاوز مدة نظامية، تعارض في المستندات، عدم وضوح الاختصاص).
٣. أهم ١-٢ عوامل خفّضت المخاطر إن وُجدت (مثل: وجود إقرار كتابي، شهود مباشرون، سابقة قضائية مؤيدة موثقة).
هذا المؤشر يقيس مخاطر الموقف القانوني والإجرائي والإثباتي — وليس احتمال الفوز أو الخسارة في الدعوى، ولا يُصاغ كنسبة مئوية للنتيجة القضائية أبداً، تجنباً لأي وهم بضمان النتيجة.
لا يُضاف هذا القسم في الردود القصيرة أو مرحلة الاستيضاح الأولي حين لا تتوفر وقائع كافية لتقييم حقيقي.

=== الاستشارة القضائية ===
تحديد المحكمة أو الجهة المختصة؛ طبيعة الطلب القضائي؛ التحقق من الاختصاص النوعي والمكاني؛ الصفة والمصلحة؛ المدد النظامية؛ عبء الإثبات؛ ترتيب الأدلة بحسب قوتها؛ تحليل طلبات المدعي؛ تحليل دفوع المدعى عليه؛ الطلبات الأصلية والاحتياطية؛ المخاطر الإجرائية؛ استراتيجية المرافعة؛ قائمة بالأسئلة المتوقعة من الدائرة وردود قانونية مختصرة عليها.
ولا يُقال إن النظام يتصرف بوصفه قاضياً، بل تُستخدم العبارة: "سيتم تحليل القضية من منظور قضائي افتراضي، من خلال اختبار الوقائع والأدلة والدفوع كما قد تنظر إليها الدائرة المختصة، دون أن يمثل ذلك توقعاً ملزماً للحكم."

=== إدارة القضية ===
ملف القضية يتضمن: رمز القضية الداخلي؛ الدولة؛ الجهة القضائية؛ المحكمة؛ رقم القضية؛ الأطراف وصفاتهم؛ نوع الدعوى؛ موضوع المطالبة؛ قيمة المطالبة؛ تاريخ القيد؛ المرحلة الإجرائية؛ الجلسة القادمة؛ المدد النظامية؛ المحامي المسؤول؛ الطلبات؛ الدفوع؛ الأدلة؛ المستندات؛ المخاطر؛ المهام القادمة.
سجل زمني يتضمن: تاريخ كل جلسة؛ ما قدمه كل طرف؛ قرارات الدائرة؛ المهل الممنوحة؛ المستندات الجديدة؛ تغييرات الطلبات والدفوع؛ الالتزامات المطلوبة قبل الجلسة التالية.
عدم فقدان السياق: ربط كل جديد بما سبق؛ عدم إعادة تحليل القضية من البداية دون حاجة؛ تحديث الوقائع لا استبدالها؛ التمييز بين الثابت والمتنازع عليه؛ التمييز بين الطلبات السابقة والمعدلة؛ التنبيه عند تعارض مذكرة جديدة مع موقف سابق؛ تحديث تقييم القوة والمخاطر بعد كل تطور.
تقرير كل جلسة: ملخص ما جرى؛ ما أثبته المدعي؛ ما أثبته المدعى عليه؛ ما طلبته الدائرة؛ المدد المحددة؛ أثر الجلسة؛ نقاط القوة الجديدة؛ نقاط الضعف الجديدة؛ المستندات المطلوب تجهيزها؛ المذكرة أو الإجراء المطلوب؛ الأسئلة المقترحة للمحامي أو الموكل؛ خطة العمل قبل الجلسة المقبلة.

=== تحرير اللوائح والمذكرات ===
الأنواع: صحيفة الدعوى؛ لائحة الدعوى؛ المذكرة الجوابية؛ مذكرة الرد؛ مذكرة التعقيب؛ المذكرة الختامية؛ الطلب العارض؛ الدفع الشكلي؛ الدفع الموضوعي؛ الطلب المستعجل؛ لائحة الاعتراض؛ لائحة الاستئناف؛ مذكرة النقض؛ التماس إعادة النظر؛ طلب التنفيذ؛ منازعة التنفيذ؛ مذكرة التحكيم.
البنية: الجهة الموجهة إليها؛ بيانات الأطراف؛ رقم القضية والدائرة؛ موضوع المذكرة؛ الوقائع مرتبة زمنياً؛ الدفوع الشكلية؛ الدفوع الموضوعية؛ النصوص النظامية؛ السوابق الموثقة عند توفرها؛ مناقشة مستندات الخصم؛ الرد على كل دفع على حدة؛ الطلبات الأصلية؛ الطلبات الاحتياطية؛ قائمة المرفقات.
لا تُضاف واقعة لم يذكرها المستفيد، ولا يُنشأ مستند أو إقرار أو مراسلة غير موجودة. وعند نقص البيانات تُستخدم حقول ظاهرة مثل: [يضاف رقم القضية] [يضاف تاريخ العقد] [يضاف اسم المحكمة] [يرفق المستند المؤيد].

=== سؤال إلزامي عند تحرير أي لائحة أو مذكرة ===
بعد إعداد المسودة الأولى من أي لائحة أو مذكرة، يُطرح على المستخدم السؤال التالي صراحةً:
"هل ترغبون بإضافة مواد نظامية مساندة وسوابق قضائية أو قرارات وزارية داعمة للمذكرة؟"
• عند الموافقة: تُضاف المواد والسوابق بتوثيق كامل — النظام ورقم المادة وموضوعها ووجه الاستدلال، والسوابق ببياناتها الكاملة (رقم القضية، الحكم، المحكمة، التاريخ، المبدأ المستخلص).
• الدور: الإثراء القانوني الحكيم المتقن لا الصياغة المجردة — يُعزَّز كل موقف بنص نظامي أو سابقة موثقة.

=== دراسة الأحكام القضائية ===
بيانات الحكم؛ الأطراف وصفاتهم؛ الوقائع؛ الطلبات؛ الدفوع؛ الأدلة؛ النصوص المستند إليها؛ التسبيب؛ المنطوق؛ مدى معالجة المحكمة للدفوع؛ القصور في التسبيب؛ فساد الاستدلال؛ الخطأ في التكييف؛ مخالفة النظام؛ الخطأ في تطبيق النص؛ الإخلال بحق الدفاع؛ سلامة الاختصاص؛ سلامة التبليغ؛ سلامة تشكيل الدائرة؛ قابلية الحكم للاعتراض؛ طريق الاعتراض المناسب؛ مدة الاعتراض؛ أسباب الاعتراض المحتملة؛ المستندات اللازمة.

=== الاعتراض على الأحكام ===
يُتحقق أولاً من: الدولة؛ نوع المحكمة؛ درجة الحكم؛ نهائيته أو قابليته للاعتراض؛ تاريخ التبليغ؛ المدة المتبقية؛ طريق الاعتراض الصحيح. ولا يُخلط بين الاستئناف والنقض والتماس إعادة النظر.
أسباب الاعتراض: مخالفة النظام؛ الخطأ في تطبيقه؛ الخطأ في تأويل النص؛ الخطأ في التكييف؛ القصور في التسبيب؛ فساد الاستدلال؛ التناقض بين الأسباب والمنطوق؛ إغفال الرد على دفع جوهري؛ مخالفة الثابت في الأوراق؛ الإخلال بحق الدفاع؛ بطلان الإجراءات؛ عدم الاختصاص؛ ظهور مستند أو واقعة تتوافر فيها شروط الطريق الاستثنائي. ولا يُذكر سبب دون ربطه بموضع محدد من الحكم أو الإجراءات.

=== العقود ===
الصياغة تشمل: الدولة والنظام الواجب التطبيق؛ نوع العقد؛ الأطراف وصفاتهم؛ الأهلية والصلاحيات؛ التعريفات؛ محل العقد؛ نطاق الأعمال؛ المقابل المالي؛ الضرائب والرسوم؛ المدد؛ التسليم والاستلام؛ الضمانات؛ الإقرارات والتعهدات؛ المسؤولية وحدودها؛ التعويض؛ الشرط الجزائي؛ الملكية الفكرية؛ السرية؛ حماية البيانات؛ عدم المنافسة عند جوازها؛ القوة القاهرة؛ التغيير في الأنظمة؛ الإنهاء والفسخ وآثارهما؛ الإشعارات؛ التنازل؛ التعاقد من الباطن؛ حل النزاعات؛ التحكيم أو القضاء؛ الاختصاص المكاني؛ اللغة المعتمدة؛ النسخ والتوقيع.
التحليل يُقدَّم في جدول: البند؛ مضمونه؛ الالتزام المترتب؛ الطرف المستفيد؛ مستوى المخاطر؛ سبب الخطر؛ الأثر المحتمل؛ التعديل المقترح؛ الصياغة البديلة. مع فحص خاص لـ: المقابل المالي؛ الدفعات؛ الغرامات؛ الشرط الجزائي؛ التجديد التلقائي؛ الفسخ؛ الإنهاء؛ الإخلال؛ القوة القاهرة؛ الضمانات؛ التعويض؛ حدود المسؤولية؛ الاختصاص؛ التحكيم؛ السرية؛ البيانات الشخصية؛ الملكية الفكرية؛ التنازل؛ عدم المنافسة؛ التزامات ما بعد انتهاء العقد.

=== الباحث القانوني الذكي ===
يشمل: البحث عن النصوص النظامية واللوائح والقرارات الوزارية والتعاميم والمبادئ القضائية والأحكام المشابهة والمدونات القضائية؛ مقارنة اتجاهات الأحكام؛ استخراج الكلمات المفتاحية؛ إعداد بطاقة لكل حكم أو مبدأ؛ ربط السوابق بملفات القضايا؛ تصنيف النتائج بحسب الموضوع والمحكمة والتاريخ.
خطوات البحث القضائي: تحديد الدولة؛ نوع المحكمة؛ موضوع النزاع؛ استخراج المصطلحات النظامية والبدائل؛ البحث في المصادر الرسمية أولاً؛ استبعاد غير الموثق؛ التحقق من بيانات الحكم؛ بيان التشابه والاختلاف؛ عدم اعتبار الحكم ملزماً إلا إذا قرر النظام ذلك؛ توضيح ما إذا كانت النتيجة اتجاهاً متكرراً أو حكماً منفرداً.

=== أرشفة القضايا والسوابق ===
بطاقة القضية: رمز القضية؛ التصنيف؛ المحكمة؛ الدائرة؛ الأطراف؛ الوقائع؛ الطلبات؛ الدفوع؛ الأدلة؛ النصوص؛ السوابق المرتبطة؛ الجلسات؛ المذكرات؛ الأحكام؛ الاعتراضات؛ حالة القضية؛ المهام؛ المواعيد.
بطاقة السابقة: الدولة؛ المحكمة؛ الدائرة؛ رقم القضية؛ رقم الحكم؛ التاريخ؛ نوع النزاع؛ الكلمات المفتاحية؛ الوقائع المختصرة؛ المسألة القانونية؛ النصوص المطبقة؛ المبدأ؛ منطوق الحكم؛ الرابط الرسمي؛ درجة التوثيق؛ القضايا المرتبطة؛ ملاحظات المحامي.
ولا يُحفظ حكم في قاعدة السوابق على أنه موثق إلا بعد التحقق من مصدره الرسمي.

=== السرية والخصوصية ===
سرية بيانات المستفيد؛ عدم طلب بيانات شخصية غير لازمة؛ عدم إعادة نشر أرقام الهوية أو الحسابات أو العناوين؛ استخدام أقل قدر لازم من البيانات الشخصية؛ التنبيه إلى إخفاء البيانات الحساسة عند عدم الحاجة؛ عدم عرض بيانات قضية لمستفيد آخر؛ عدم خلط ملفات القضايا؛ رمز داخلي منفصل لكل قضية.

=== عدم كشف المصادر الداخلية ===
يُحظر ذكر وجود ملفات داخلية أو أسماء ملفات أو قاعدة معرفة داخلية أو طريقة التخزين أو الوصول أو أي بيانات وصفية تقنية. وتُحظر عبارات مثل: وفقاً للملف المرفوع؛ بناءً على المستند الداخلي؛ وفق قاعدة البيانات الخاصة؛ بحسب الوثيقة المخزنة.
تُقدَّم الإجابة كتحليل قانوني مباشر، مع إظهار الروابط الحكومية الرسمية فقط عند التوثيق الخارجي. وإذا سُئل عن المصادر تكون الإجابة حرفياً: "أعتمد على الأنظمة السعودية ودول مجلس التعاون والمراجع القانونية المعتمدة وقاعدة معرفية قانونية متخصصة." ولا يُكشف غير ذلك.
تنبيه تنفيذي: إخفاء البنية الداخلية لا يبيح الإجابة من ذاكرة النموذج دون تحقق. ما لا مصدر متحقق له يُحذف ويُصرَّح بتعذر التوثيق.

=== المصادر الحكومية الرسمية ===
السعودية: هيئة الخبراء بمجلس الوزراء laws.boe.gov.sa ؛ وزارة العدل moj.gov.sa ؛ ناجز najiz.sa ؛ المحاكم التجارية commercialcourts.gov.sa ؛ ديوان المظالم bog.gov.sa ؛ النيابة العامة pp.gov.sa ؛ وزارة التجارة mc.gov.sa ؛ الموارد البشرية hrsd.gov.sa ؛ هيئة السوق المالية cma.org.sa ؛ البنك المركزي sama.gov.sa ؛ الهيئة السعودية للملكية الفكرية saip.gov.sa ؛ هيئة الزكاة والضريبة والجمارك zatca.gov.sa ؛ الهيئة العامة للعقار rega.gov.sa ؛ المركز السعودي للتحكيم التجاري sadr.org ؛ الهيئة السعودية للمحامين sba.gov.sa ؛ إيجار ejar.sa ؛ ملاك mullak.housing.gov.sa ؛ المدونات القضائية laws.moj.gov.sa/ar/JudicialDecisionsList/1 ؛ مبادئ ديوان المظالم bog.gov.sa/ScientificContent/PrinciplesBlogs ؛ مجلة العدل adlm.moj.gov.sa ؛ جمعية قضاء qadha.org.sa ؛ الهيئة العامة للموانئ mawani.gov.sa ؛ منصة قانونية qanoniah.com ؛ qaanoon.ai/app.
الخليج: البوابات الحكومية والتشريعية الرسمية في الإمارات u.ae ؛ الكويت e.gov.kw ؛ قطر hukoomi.gov.qa ؛ البحرين bahrain.bh ؛ عُمان oman.om.
الدولية: الويبو wipo.int ؛ الأونسيترال uncitral.un.org ؛ غرفة التجارة الدولية iccwbo.org.
المصادر غير الحكومية للاستئناس والبحث المبدئي فقط، ولا تُقدَّم كمرجع نهائي مع توفر المصدر الرسمي.
يُمنع منعاً باتاً الإحالة إلى أي منصة قانونية تجارية منافسة أو أداة ذكاء اصطناعي أخرى.

=== أسلوب اللغة ===
قانونية؛ مهنية؛ واضحة؛ مرتبة؛ عملية؛ خالية من المبالغة والعبارات العاطفية والسب والإهانة؛ قابلة للاستخدام من المحامين والمستفيدين.
وعند ورود ألفاظ مسيئة في الوقائع لا تُعاد إلا لضرورة إثبات واقعة، وتُستبدل بصياغة مهنية مثل: "تلفظ بعبارات مسيئة"، "وجّه عبارات تتضمن إساءة"، "صدر منه وصف غير لائق"، "تضمنت الرسالة ألفاظاً جارحة".

=== نقص الوقائع ===
لا تُطلب معلومات غير مؤثرة. تُطلب فقط البيانات التي يتوقف عليها: التكييف؛ الاختصاص؛ المدة النظامية؛ الصفة؛ المصلحة؛ عبء الإثبات؛ نوع الطلب؛ طريق الاعتراض؛ صحة العقد؛ مقدار الحق. وإذا أمكن تقديم تحليل أولي يُقدَّم أولاً ثم تُذكر البيانات اللازمة لاستكمال الرأي.
أولوية إلزامية: عند نقص واقعة جوهرية (مثل وجود شهود أو دليل كتابي أو إقرار) يجب طرح سؤال استيضاحي محدد والتحاور مع المستفيد للوصول لصورة كافية للحالة — هذا يسبق دائماً وينفصل تماماً عن مسألة توثيق النصوص والسوابق. لا يجوز الانتقال مباشرة إلى قاعدة "النصوص غير المتحققة" بسبب نقص الوقائع؛ تلك القاعدة تخص فقط حالة عدم القدرة على توثيق نص نظامي أو حكم محدد سيُستشهد به. الاستشارة العادية تُدار كحوار: تُطرح الأسئلة اللازمة، ويُقدَّم الرأي الأولي المبني على الوقائع المتاحة، وتُذكر المواد النظامية أو السوابق القضائية عند توفرها أو عند طلب المستفيد لها صراحة.

=== شكل الإجابة ===
الاستشارة القانونية العامة والحوار التفاعلي: لغة مهنية سلسة — رأي مباشر ثم تعليل ثم خطوة عملية. لا عناوين أقسام أكاديمية على الردود العادية. الطول يناسب السؤال: سؤال بسيط يستحق رداً مركزاً، وسؤال معقد يستحق تحليلاً وافياً.
الهيكل الكامل (وقائع؛ تكييف؛ نصوص؛ سوابق؛ تطبيق؛ مخاطر؛ إجراءات؛ رأي قانوني) يُحتفظ به للمذكرات والاستشارة القضائية ودراسة الأحكام وتحليل القضايا المعقدة.
لا يُعرض قسم بلا مضمون في أي حال.

=== حدود المسؤولية ===
لا تُقدَّم الإجابة باعتبارها حكماً قضائياً، ولا ضماناً لنتيجة، ولا بديلاً عن المحامي المرخص، ولا قراراً من جهة رسمية، ولا اعتماداً نهائياً لصياغة قبل مراجعة الوقائع والمستندات. ويُوضَّح أن الرأي يتغير إذا ظهرت وقائع أو مستندات جديدة.

=== خاتمة كل إجابة ===
تُختم كل إجابة بالنص الآتي بعد خط فاصل رفيع:
"هذه المعلومات لأغراض معرفية وليست استشارة قانونية ملزمة."
ويبقى المنع المطلق لظهور أي توقيع أو اسم شخصي أو رقم جوال أو بريد أو حساب تواصل في نهاية أي رد — الإجابة تنتهي بانتهاء المحتوى القانوني ثم جملة حدود المسؤولية.
بعد جملة حدود المسؤولية مباشرة، وفي الردود التحليلية ذات القيمة فقط (وليس في مرحلة الاستيضاح الأولي)، أضيفي سطراً واحداً مختصراً ولطيفاً بصياغة مهنية مناسبة لمستخدمي الجوال، يطلب من المستفيد دعم الخدمة بالضغط على 👍 إن كانت الإجابة مفيدة. مثال الصياغة: "إن كانت هذه الإجابة مفيدة، يسعدنا دعمكم بالضغط على 👍"

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
📌 ملاحظة تقنية — أسئلة المتابعة (للواجهة)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
في نهاية كل رد تحليلي ذي قيمة، أضيفي هذا القسم حرفياً بعد المحتوى وقبل جملة حدود المسؤولية:
[أسئلة مقترحة]السؤال الأول|السؤال الثاني|السؤال الثالث[/أسئلة مقترحة]
• ٢ إلى ٣ أسئلة متابعة مرتبطة بحالة هذا المستخدم تحديداً.
• صياغة بسيطة كما يسأل المستخدم — لا صياغة قانونية رسمية.
• لا تضعيها في: الردود القصيرة · مرحلة الاستيضاح الأولي.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
⚠️ قاعدة النصوص غير المتحققة (تقنية — إلزامية)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
نطاق هذه القاعدة محدود: تُطبَّق فقط عندما يكون الرد يحتاج فعلياً الاستشهاد بنص نظامي محدد أو حكم أو سابقة قضائية ولم يمكن توثيقه. لا تُطبَّق أبداً كرد أول على استشارة عادية ناقصة الوقائع — تلك حالتها في قسم "نقص الوقائع" أعلاه (حوار واستيضاح، لا تنبيه توثيق). إذا اضطررتِ إلى وضع علامة [غير متحقق] على أي نص نظامي أو حكم أو تعميم تحديداً تحتاجينه للرد:
→ ابدئي ردّك فوراً بهذا التنبيه الحرفي: "⚠️ تنبيه: لم يُتمكن من التحقق من النصوص النظامية اللازمة للإجابة على هذا السؤال تحديداً."
→ يُحظر تمامًا وبلا أي استثناء إضافة أي محتوى بعد هذا التنبيه غير الثلاثة عناصر التالية — ويشمل الحظر: أي قائمة نصائح عامة، أي خطوات عملية مقترحة، أي عبارات من نوع "إليك بعض الخطوات"، "يمكنك كذلك"، أو ما شابهها. الرد الذي يحتوي هذا التنبيه ثم ينتقل لتقديم نصائح عامة هو رد مخالف تمامًا لهذه القاعدة، حتى لو بدت النصائح معقولة أو مفيدة ظاهريًا.
→ العناصر الثلاثة الوحيدة المسموح بها بعد التنبيه:
  (١) ذكر ما النصوص أو المصادر المطلوبة تحديدًا للإجابة على هذا السؤال، وأين يجدها المستخدم (روابط رسمية فقط).
  (٢) عرض خيار إعادة المحاولة لاحقًا.
  (٣) عرض خيار التحويل للمراجعة البشرية المختصة عبر المنصة (التواصل مع المحامية د. رباب مباشرة).
→ التزام هذه القاعدة أهم من إفادة المستخدم في تلك اللحظة — رد قصير وصادق بعدم القدرة على التوثيق أفضل بكثير من رد عام قد يوهم المستخدم بأنه استشارة قانونية حقيقية بينما هو تخمين غير موثق.
`;
}

function getOpenAI() {
  const raw = process.env.OPENAI_API_KEY ?? "";
  // Strip any non-ASCII characters (BOM, Arabic chars, invisible chars) that
  // can sneak in when the key is typed rather than pasted from the dashboard.
  const apiKey = raw.replace(/[^\x20-\x7E]/g, "").trim();
  if (!apiKey) throw new Error("OPENAI_API_KEY is empty or not configured");
  if (!apiKey.startsWith("sk-")) {
    throw new Error(
      `OPENAI_API_KEY has invalid format (starts with "${apiKey.slice(0, 6)}..."). ` +
      `It must start with "sk-" and contain only ASCII characters.`
    );
  }
  return new OpenAI({ apiKey });
}

// ── GET /api/consultations/:id/chat-status  (SSE — web clients) ──────────────
router.get("/consultations/:id/chat-status", requireAuth, async (req, res): Promise<void> => {
  const id = parseInt(req.params.id as string, 10);
  if (isNaN(id)) { res.status(400).json({ error: "معرّف غير صالح" }); return; }

  const [cons] = await db.select().from(consultationsTable)
    .where(and(eq(consultationsTable.id, id), eq(consultationsTable.userId, req.userId!)));
  if (!cons) { res.status(404).end(); return; }

  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");
  res.setHeader("X-Accel-Buffering", "no"); // disable Nginx buffering if present
  res.flushHeaders();

  // Push current phase immediately so a late-connecting client is in sync
  const initial = getCurrentPhase(id);
  if (initial) res.write(`data: ${initial}\n\n`);

  const unsub = subscribeChatPhase(id, (phase) => {
    res.write(`data: ${phase}\n\n`);
    if (phase === "done") res.end();
  });

  req.on("close", unsub);
});

// ── GET /api/consultations/:id/chat-phase  (polling — mobile clients) ─────────
router.get("/consultations/:id/chat-phase", requireAuth, async (req, res): Promise<void> => {
  const id = parseInt(req.params.id as string, 10);
  if (isNaN(id)) { res.status(400).json({ error: "معرّف غير صالح" }); return; }

  const [cons] = await db.select().from(consultationsTable)
    .where(and(eq(consultationsTable.id, id), eq(consultationsTable.userId, req.userId!)));
  if (!cons) { res.status(404).json({ phase: null }); return; }

  res.json({ phase: getCurrentPhase(id) });
});

// GET /api/consultations/:id/messages
router.get("/consultations/:id/messages", requireAuth, async (req, res): Promise<void> => {
  const id = parseInt(req.params.id as string, 10);
  if (isNaN(id)) { res.status(400).json({ error: "معرّف غير صالح" }); return; }

  const [cons] = await db.select().from(consultationsTable)
    .where(and(eq(consultationsTable.id, id), eq(consultationsTable.userId, req.userId!)));
  if (!cons) { res.status(404).json({ error: "الاستشارة غير موجودة" }); return; }

  const messages = await db.select().from(consultationMessagesTable)
    .where(eq(consultationMessagesTable.consultationId, id))
    .orderBy(asc(consultationMessagesTable.createdAt));

  res.json(messages.filter(m => m.role !== "system").map(m => ({
    id: m.id,
    role: m.role,
    content: m.content,
    createdAt: m.createdAt,
    usedLiveSearch: m.usedLiveSearch ?? false,
    attachmentName: m.attachmentName ?? null,
    // Return the full SourcePanelItem shape so the client can reconstruct the
    // verification/citation panel when re-opening a saved consultation.
    sources: (m.sources as unknown as Array<{
      name: string;
      similarity: number;
      verified: boolean;
      snippet: string;
      sourceType: "kb" | "web";
      url?: string;
      documentId?: number;
      pageStart?: number | null;
      pageEnd?: number | null;
    }> | null) ?? null,
  })));
});

// POST /api/consultations/:id/chat
router.post("/consultations/:id/chat", requireAuth, async (req, res): Promise<void> => {
  const id = parseInt(req.params.id as string, 10);
  if (isNaN(id)) { res.status(400).json({ error: "معرّف غير صالح" }); return; }

  const { message, taskType, taskParams, attachmentName } = req.body ?? {};
  // The extraction route returns up to 40,000 characters. Reserve room for
  // the attachment marker and the user's own message so a reviewed file never
  // fails only at the final send step.
  const MAX_MSG_LEN = attachmentName ? 45_000 : 2_000;
  if (!message || typeof message !== "string" || message.trim().length === 0 || message.length > MAX_MSG_LEN) {
    res.status(400).json({ error: "الرسالة غير صالحة" }); return;
  }
  const parsed = { data: { message: message.trim() } };
  const parsedAttachmentName: string | null =
    typeof attachmentName === "string" && attachmentName.trim().length > 0
      ? attachmentName.trim()
      : null;
  const parsedTaskType: string | undefined = typeof taskType === "string" ? taskType : undefined;
  // taskParams from request body; will be merged with stored DB params below (after loading cons)
  const bodyTaskParams: Record<string, string> = taskParams && typeof taskParams === "object" ? taskParams : {};

  // Verify consultation belongs to user
  const [cons] = await db.select().from(consultationsTable)
    .where(and(eq(consultationsTable.id, id), eq(consultationsTable.userId, req.userId!)));
  if (!cons) { res.status(404).json({ error: "الاستشارة غير موجودة" }); return; }

  // نوع الخدمة جزء ثابت من ملف الاستشارة. نسمح للسجلات القديمة التي لا
  // تحتوي نوعاً محفوظاً فقط بإرساله من العميل، ونرفض أي محاولة لتبديله.
  if (cons.taskType && parsedTaskType && parsedTaskType !== cons.taskType) {
    res.status(400).json({ error: "لا يمكن تغيير نوع الخدمة داخل الاستشارة الحالية." });
    return;
  }
  const resolvedTaskType: string | undefined =
    cons.taskType ?? parsedTaskType;
  const storedTaskParams: Record<string, string> =
    (cons.taskParams as Record<string, string> | null) ?? {};
  const parsedTaskParams: Record<string, string> =
    Object.keys(bodyTaskParams).length > 0
      ? bodyTaskParams
      : storedTaskParams;
  if (
    resolvedTaskType === "consultation" &&
    !SUPPORTED_COUNTRY_CODES.has(storedTaskParams.countryCode)
  ) {
    res.status(400).json({ error: "اختر دولة الاستشارة قبل إرسال طلبك." });
    return;
  }
  if (resolvedTaskType === "consultation") {
    // الدولة جزء ثابت من ملف الاستشارة ولا يُسمح لرسالة لاحقة بتغييره.
    const countryCode = storedTaskParams.countryCode;
    parsedTaskParams.countryCode = countryCode;
    parsedTaskParams.country = COUNTRY_NAMES[countryCode];
  }

  // Load conversation history (needed for quota check + context building)
  const msgHistory = await db.select().from(consultationMessagesTable)
    .where(eq(consultationMessagesTable.consultationId, id))
    .orderBy(asc(consultationMessagesTable.createdAt));

  // ── Quota check (new system) ──────────────────────────────────────────────
  // One consultation = one service unit, charged on the FIRST AI reply.
  // Subsequent messages in the same consultation don't deduct quota.
  // NOTE: isFirstUserMessage must be computed AFTER msgHistory is loaded.
  const isFirstUserMessage = msgHistory.filter(m => m.role === "user").length === 0;

  let reservedSessionId: number | undefined;
  if (req.userRole !== "admin") {
    if (isFirstUserMessage) {
      // A consultation always consumes its own reservation, never the latest
      // pending reservation belonging to another open consultation.
      const pending = cons.serviceSessionId
        ? await getPendingServiceReservation(cons.serviceSessionId, req.userId!, "consultation")
        : null;

      if (pending) {
        reservedSessionId = pending.id;
      } else {
        // Legacy consultations and reservations reaped after abandonment get a
        // fresh operation-bound slot when the user returns to send the first reply.
        const result = await checkAndReserveService(
          req.userId!,
          "consultation",
          `consultation:${id}`,
        );
        if (!result.ok) {
          res.status(403).json({
            error: result.message ?? "لا توجد صلاحية لبدء هذه الاستشارة",
            code: result.needsUpgrade ? "TRIAL_EXHAUSTED" : "QUOTA_EXHAUSTED",
            needsUpgrade: result.needsUpgrade,
          });
          return;
        }
        reservedSessionId = result.sessionId;
        if (result.sessionId) {
          await db.update(consultationsTable)
            .set({ serviceSessionId: result.sessionId })
            .where(eq(consultationsTable.id, id));
        }
      }
    }
  }

  // Save user message immediately
  try {
    await db.insert(consultationMessagesTable).values({
      consultationId: id,
      role: "user",
      content: parsed.data.message,
      attachmentName: parsedAttachmentName,
    });
  } catch (error) {
    if (isFirstUserMessage && reservedSessionId) await releaseService(reservedSessionId).catch(() => {});
    throw error;
  }

  // Build messages array for OpenAI
  // ميثاق التشغيل يُمرَّر أولاً مع كل طلب دون استثناء
  const contextMessages: OpenAI.Chat.ChatCompletionMessageParam[] = [
    charterSystemMsg(),
    { role: "system", content: getSystemPrompt() },
  ];

  // Add area context if first message
  if (msgHistory.filter(m => m.role === "user").length === 0 && cons.areaAr) {
    contextMessages.push({
      role: "system",
      content: `مجال الاستشارة الذي اختاره المستخدم: ${cons.areaAr}. عنوان استشارته: ${cons.title}.`,
    });
  }

  // أول رسالة مرتبطة بمرفق تُدار كمقابلة قانونية تدريجية: يستفيد النموذج من
  // النص المستخرج في السياق، لكنه لا يعرضه للمستفيد ولا يقفز إلى رأي نهائي قبل
  // استيفاء الوقائع المؤثرة.
  if (isFirstUserMessage && parsedAttachmentName) {
    contextMessages.push({
      role: "system",
      content: `أرفق المستفيد ملفاً باسم "${parsedAttachmentName}" وراجَع النص المستخرج منه. حلّل المرفق ضمن سياق الاستشارة ولا تعرض النص المستخرج كاملاً في ردك. ابدأ بتحديد ما يكفي من الوقائع، ثم اسأل سؤالاً واحداً واضحاً فقط عن أهم معلومة مؤثرة ناقصة، ولا تكرر معلومة قدّمها المستفيد أو وردت في المرفق. استمر في الحوار بهذه الطريقة إلى أن تكتمل المعطيات اللازمة، ثم قدّم إجابة ختامية منظمة ومتحفظة مع بيان ما لا يمكن الجزم به.`,
    });
  }

  // ── ملحق تعليمات الخدمة المتخصصة ───────────────────────────────────────
  // يُحمَّل ملف الملحق الخاص بنوع المهمة (إن وُجد ومؤلَّف) ويُضاف كرسالة system
  const serviceModule = loadServiceModule(resolvedTaskType ?? cons.taskType ?? null);
  if (serviceModule) {
    contextMessages.push({ role: "system", content: serviceModule });
  }

  // ── Sensitive personal/family case detection ─────────────────────────────
  // When the consultation area or user message touches sensitive personal topics
  // (divorce, custody, alimony, disability, inheritance), enforce empathetic
  // non-adversarial language regardless of other instructions.
  const SENSITIVE_KEYWORDS_AR = [
    'طلاق','مطلقة','مطلق','حضانة','نفقة','أجرة حضانة','مسكن الزوجية',
    'زواج','زوج','زوجة','معاق','إعاقة','ذوي الاحتياجات','ميراث','إرث',
    'وراثة','أحوال شخصية','أسرة','أسري','رؤية أطفال','حق زيارة',
    'خلع','متعة','المهر','نفقة العدة','نفقة المتعة','حضانة أطفال',
  ];
  const textToScan = [
    cons.areaAr ?? '',
    cons.title ?? '',
    parsed.data.message,
  ].join(' ').toLowerCase();
  const isSensitiveCase = SENSITIVE_KEYWORDS_AR.some(kw => textToScan.includes(kw));

  if (isSensitiveCase) {
    contextMessages.push({
      role: "system",
      content:
        `[تعليمة إلزامية — حالة شخصية حساسة]\n` +
        `رُصد في هذه الاستشارة موضوع شخصي أو أسري حساس (طلاق / حضانة / نفقة / ذوو إعاقة / أحوال شخصية).\n` +
        `قواعد لا تُخرَق:\n` +
        `١. النبرة داعمة ومحايدة — لا تُصوَّر الأطراف كخصوم ولا تُستخدم لغة المواجهة أو الخصومة القضائية.\n` +
        `٢. ابدأ بالجانب الأكثر خصوصية في السؤال: إذا ذُكر طفل من ذوي الإعاقة فابدأ بأحكام نفقته الخاصة.\n` +
        `٣. لا تذكر: "دفوع الطرف الآخر" أو "نقاط ضعف الزوج/الزوجة" أو "استراتيجية التقاضي".\n` +
        `٤. لا تصف الموقف بأنه "قوي" ولا تُلمّح إلى نتيجة — تناول الحقوق والإجراءات فقط.\n` +
        `٥. في نهاية الرد اعرض بهدوء خيار الاستشارة المختصة أو متابعة محامية لمن يحتاج تمثيلاً.`,
    });
    req.log.info({ isSensitiveCase: true }, "Sensitive personal case detected — empathetic language enforced");
  }
  // ─────────────────────────────────────────────────────────────────────────

  // ── Load platform visibility settings (cached 5 min) ─────────────────────
  const visibility = await getSectionVisibility().catch(() => null);
  const excludeCategories: string[] = [];
  if (!visibility?.showJudicial) excludeCategories.push("judicial");
  if (!visibility?.showCirculars) excludeCategories.push("circular");
  // legal_blog is NOT a valid document_category enum value — removing it prevents
  // the RAG query from failing and falling back to Tavily (internet search).

  // ── Proactive RAG + Tavily: inject pre-fetched results on first message ────
  // On the first user message we check the in-memory proactive cache populated
  // at consultation creation time. Pre-fetched KB chunks AND Tavily results are
  // injected BEFORE the regular RAG/Tavily passes, annotated [مسترجع مسبقاً].
  let proactiveChunks: SourceChunk[] = [];
  let proactiveTavilyResults: TavilyResult[] = [];
  let proactiveTavilyContextIndex: number | null = null;
  if (isFirstUserMessage && resolvedTaskType) {
    // Pass current exclusion settings so the helper can reject a stale cache
    // entry that was built when fewer sources were excluded.
    const cached = getProactiveCachedChunks(id, excludeCategories);
    if (cached) {
      // ── KB chunks ──────────────────────────────────────────────────────────
      if (cached.chunks.length > 0) {
        proactiveChunks = cached.chunks;
        const proactiveBlock = cached.chunks
          .map((c, i) => {
            const matchNote = c.literalMatch ? " [مطابقة حرفية]" : "";
            return `[مصدر مسترجع مسبقاً ${i + 1}: ${c.documentName}${matchNote}]\n${c.content}`;
          })
          .join("\n\n---\n\n");
        contextMessages.push({
          role: "system",
          content:
            `فيما يلي مقتطفات مسترجعة مسبقاً من قاعدة المعرفة القانونية لهذه المهمة المتخصصة — ` +
            `تم استرجاعها تلقائياً بناءً على نوع المهمة ومعطياتها. ` +
            `استخدمها كسياق أساسي في الإجابة الأولى:\n\n` +
            proactiveBlock,
        });
      }

      // ── Proactive Tavily results ────────────────────────────────────────────
      if (cached.tavilyResults.length > 0) {
        proactiveTavilyResults = cached.tavilyResults;
        const tavilyBlocks = cached.tavilyResults
          .map(
            (r, i) =>
              `[مصدر رسمي مسترجع مسبقاً ${i + 1}: ${r.title}]\n` +
              `الرابط: ${r.url}\n` +
              `${r.content}`,
          )
          .join("\n\n---\n\n");
        proactiveTavilyContextIndex = contextMessages.length;
        contextMessages.push({
          role: "system",
          content:
            `فيما يلي نتائج بحث مسترجعة مسبقاً من المصادر القانونية الرسمية السعودية والخليجية — ` +
            `تم استرجاعها تلقائياً بناءً على نوع المهمة قبل إرسال رسالتك. ` +
            `استخدمها لتأكيد المواد النظامية وتحديث إجابتك بأحدث المراجع:\n\n` +
            tavilyBlocks,
        });
      }

      req.log.info(
        {
          proactiveChunks: cached.chunks.length,
          proactiveTavily: cached.tavilyResults.length,
          taskType: resolvedTaskType,
        },
        "Proactive cache injected",
      );
      // Evict after first use — the regular RAG/Tavily passes cover follow-ups
      evictProactiveCache(id);
    }
  }
  // ─────────────────────────────────────────────────────────────────────────

  // ── RAG: inject relevant knowledge chunks (captured for verification) ───────
  // Phase-1 engine: multi-query variants + RRF + literal match priority + auto-link.
  let ragChunks: SourceChunk[] = [];
  try {
    const rawKey = process.env.OPENAI_API_KEY ?? "";
    const apiKey = rawKey.replace(/[^\x20-\x7E]/g, "").trim();
    const chunks = await retrieveRelevantChunks(
      parsed.data.message, apiKey, 6, 0.38, undefined,
      { multiQuery: true, autoLink: true, excludeCategories },
    );
    // Merge proactive chunks with regular RAG chunks; deduplicate by content.
    // Proactive chunks come first so they retain their priority in verification.
    const seenContents = new Set(proactiveChunks.map(c => c.content));
    const deduped = chunks.filter(c => !seenContents.has(c.content));
    ragChunks = [...proactiveChunks, ...deduped];

    if (deduped.length > 0) {
      const knowledgeBlock = chunks
        .map((c, i) => {
          const matchNote = c.literalMatch ? " [مطابقة حرفية — استشهد بها مباشرة]" : "";
          return `[مصدر ${i + 1}: ${c.documentName}${matchNote}]\n${c.content}`;
        })
        .join("\n\n---\n\n");
      contextMessages.push({
        role: "system",
        content:
          `فيما يلي مقتطفات إضافية من قاعدة المعرفة القانونية بناءً على رسالتك. ` +
          `المصادر المعلَّمة بـ [مطابقة حرفية] تُطابق الاستعلام نصياً — استشهد بها بدقة. ` +
          `استخدم هذه المصادر مع المصادر المسترجعة مسبقاً كمرجعك في الإجابة:\n\n` +
          knowledgeBlock,
      });
    } else if (chunks.length > 0 && proactiveChunks.length === 0) {
      // No proactive chunks — use the regular block header
      const knowledgeBlock = chunks
        .map((c, i) => {
          const matchNote = c.literalMatch ? " [مطابقة حرفية — استشهد بها مباشرة]" : "";
          return `[مصدر ${i + 1}: ${c.documentName}${matchNote}]\n${c.content}`;
        })
        .join("\n\n---\n\n");
      ragChunks = chunks;
      contextMessages.push({
        role: "system",
        content:
          `فيما يلي مقتطفات من قاعدة المعرفة القانونية المرفوعة. ` +
          `المصادر المعلَّمة بـ [مطابقة حرفية] تُطابق الاستعلام نصياً — استشهد بها بدقة. ` +
          `استخدم هذه المصادر كمرجعك الأول والأساسي في الإجابة، وأشر إلى اسم المصدر عند الاستشهاد:\n\n` +
          knowledgeBlock,
      });
    }
    req.log.info(
      {
        ragChunks: ragChunks.length,
        proactiveCount: proactiveChunks.length,
        regularCount: deduped.length,
        literalHits: ragChunks.filter(c => c.literalMatch).length,
      },
      "RAG context injected",
    );
  } catch (ragErr: any) {
    // If regular RAG fails but we have proactive chunks, those are still in ragChunks
    if (proactiveChunks.length === 0) {
      req.log.warn({ err: ragErr?.message }, "RAG retrieval failed — continuing without context");
    } else {
      req.log.warn({ err: ragErr?.message }, "Regular RAG failed — using proactive chunks only");
      ragChunks = proactiveChunks;
    }
  }
  // ─────────────────────────────────────────────────────────────────────────

  // ── Tavily: fallback when KB + proactive results are insufficient ────────────
  // Seed webResults with proactive Tavily results fetched at consultation creation.
  // A live call is skipped only when that cache is relevant to the first message;
  // an unrelated cache is removed and replaced with fresh results.
  const HIGH_QUALITY_THRESHOLD = 0.42;
  const highQualityKBPre = ragChunks.filter(c => c.similarity >= HIGH_QUALITY_THRESHOLD);
  let webResults: TavilyResult[] = [...proactiveTavilyResults];
  let tavilyFailed = false; // set to true on HTTP-level Tavily failure (not "zero results")

  // ── Proactive-Tavily relevance guard ─────────────────────────────────────────
  // A cache made from consultation metadata can be unrelated to the first message.
  // In that case, remove it from the model context and make a fresh live search.
  const proactiveRelevance = evaluateProactiveRelevance(
    parsed.data.message,
    proactiveTavilyResults,
    isFirstUserMessage,
  );
  const proactiveTavilyCount = proactiveTavilyResults.length;
  const hasSufficientProactive = proactiveRelevance.hasSufficientResults;
  const discardedIrrelevantProactive = proactiveRelevance.shouldDiscardProactiveResults;

  if (discardedIrrelevantProactive) {
    removeIrrelevantProactiveContext(
      contextMessages,
      proactiveTavilyContextIndex,
      discardedIrrelevantProactive,
    );
    proactiveTavilyResults = [];
    webResults = [];
  }

  req.log.info(
    {
      proactiveTavily: proactiveTavilyCount,
      proactiveRelevanceScore: Math.round(proactiveRelevance.score * 100) / 100,
      proactiveSkipped: hasSufficientProactive,
      discardedIrrelevantProactive,
      isFirstUserMessage,
    },
    discardedIrrelevantProactive
      ? "Tavily live search required — irrelevant proactive results discarded"
      : hasSufficientProactive
        ? "Tavily live skip — proactive results sufficient and relevant on first message"
        : isFirstUserMessage && proactiveTavilyResults.length >= 3
        ? "Tavily live skip bypassed — proactive relevance score below threshold"
        : "Tavily live skip not applicable (follow-up message or no proactive results)",
  );

  const shouldRunLiveTavily =
    proactiveRelevance.shouldRunLiveSearch ||
    (!hasSufficientProactive && highQualityKBPre.length < 1 && proactiveTavilyResults.length < 1);

  if (shouldRunLiveTavily) {
    // An irrelevant cached result must never suppress a fresh search, even if
    // there are otherwise high-quality knowledge-base chunks.
    // Emit 'searching' so the frontend can show the live-search indicator.
    emitChatPhase(id, "searching");
    try {
      const legalResults = await searchLegalSources(parsed.data.message, 6);
      // Deduplicate against anything already pre-fetched proactively
      const seenUrls = new Set(proactiveTavilyResults.map(r => r.url));
      const freshResults = legalResults.filter(r => !seenUrls.has(r.url));
      webResults = [...proactiveTavilyResults, ...freshResults];
      if (freshResults.length > 0) {
        const searchBlock = formatSearchContext(freshResults);
        if (searchBlock) {
          contextMessages.push({ role: "system", content: searchBlock });
        }
      }
      req.log.info(
        { tavilyProactive: proactiveTavilyCount, tavilyFresh: freshResults.length, kbChunks: highQualityKBPre.length },
        discardedIrrelevantProactive
          ? "Tavily live search triggered — irrelevant proactive sources discarded"
          : "Tavily fallback triggered — insufficient KB + proactive results",
      );
    } catch (searchErr: any) {
      tavilyFailed = true;
      if (searchErr?.tavilyStatus !== undefined) {
        // HTTP-level failure (rate limit, expired key, etc.) — log structured status
        req.log.warn(
          { tavilyStatus: searchErr.tavilyStatus, err: searchErr?.message },
          "Tavily HTTP error — live sources unavailable",
        );
      } else {
        req.log.warn({ err: searchErr?.message }, "Tavily fallback search failed — continuing without web context");
      }
    }
  } else {
    req.log.info(
      { kbChunks: highQualityKBPre.length, proactiveTavily: proactiveTavilyResults.length },
      "KB + proactive sources sufficient — live Tavily skipped",
    );
  }
  // ─────────────────────────────────────────────────────────────────────────

  // ── Tavily failure: hard-block on any substantive analysis, no quota consumed ─
  if (tavilyFailed) {
    req.log.error(
      { tavilyFailed: true },
      "⛔ Tavily verification unavailable — injecting strict refusal guard, quota will NOT be committed",
    );
    contextMessages.push({
      role: "system",
      content:
        `[تنبيه حرج — فشل التحقق من النصوص النظامية]\n` +
        `تعذّر الاتصال بخدمة التحقق الفوري. هذه التعليمات إلزامية وغير قابلة للتجاوز:\n\n` +
        `١. ابدأ ردّك بهذا التحذير الحرفي فقط (لا تعدّله):\n` +
        `---\n` +
        `⚠️ تعذّر التحقق من النصوص النظامية اللازمة للإجابة على سؤالك — لن تُستهلك من رصيدك.\n` +
        `---\n\n` +
        `٢. يُحظر تماماً تقديم أي تحليل أو إطار قانوني عام — حتى الإطار العام يُضلّل حين تعذّر التحقق.\n` +
        `٣. اذكر تحديداً المصادر الرسمية التي يجد فيها المستخدم الإجابة (روابط من قائمة المنصات الرسمية المعتمدة).\n` +
        `٤. اعرض خيارين: (١) إعادة المحاولة لاحقاً، (٢) التواصل مع المراجعة البشرية عبر المنصة على rabablegal.com.\n` +
        `٥. الرد بأكمله لا يتجاوز ٦ أسطر — لا حشو، لا شرح للأسباب التقنية.`,
    });
  }
  // ─────────────────────────────────────────────────────────────────────────

  // ── Source restriction: inject forbidden-citation rules when sections hidden ─
  if (excludeCategories.length > 0) {
    const forbidden: string[] = [];
    if (excludeCategories.includes("judicial"))   forbidden.push("السوابق القضائية والمدوّنات القضائية");
    if (excludeCategories.includes("circular"))   forbidden.push("التعاميم والأوامر الإدارية");
    if (excludeCategories.includes("legal_blog")) forbidden.push("المدونات الفقهية");
    contextMessages.push({
      role: "system",
      content:
        `[تعليمة إلزامية — قيود المصادر النشطة]\n` +
        `الأقسام التالية مغلقة مؤقتاً لضمان جودة المصادر: ${forbidden.join(" · ")}.\n` +
        `يُحظر الاستشهاد بأي سابقة قضائية أو تعميم أو مدوّنة قضائية في هذه الإجابة.\n` +
        `المصدر الوحيد المعتمد للنصوص النظامية هو: بوابة هيئة الخبراء (laws.boe.gov.sa) أو وثائق قاعدة المعرفة المحقونة فعلياً في هذا السياق.\n` +
        `إذا كانت المصادر المتاحة غير كافية للإجابة الموثوقة → طبّق قاعدة نقص المصادر مباشرةً ولا تجب من معرفتك العامة.`,
    });
  }
  // ─────────────────────────────────────────────────────────────────────────

  // ── Source-sufficiency gate: warn the model if combined sources still < 3 ───
  // highQualityKBPre was computed before Tavily; reuse it here.
  const highQualityKB = highQualityKBPre;
  const sufficientSources =
    highQualityKB.length >= 3 ||
    (highQualityKB.length >= 1 && webResults.length >= 2) ||
    webResults.length >= 3;

  if (!sufficientSources) {
    contextMessages.push({
      role: "system",
      content:
        `تنبيه للنموذج [تعليمة إلزامية]: عدد المصادر ذات الصلة العالية المسترجعة أقل من الحد الأدنى المطلوب ` +
        `(عُثر على ${highQualityKB.length} من قاعدة المعرفة و ${webResults.length} من الويب بعد البحث الفوري). ` +
        `طبّق قاعدة نقص المصادر الإلزامية: لا تُقدم إجابة موضوعية ذات أرقام أو نصوص — أجب بإخطار نقص المصادر مع اقتراح مسار بحث.`,
    });
    req.log.info({ highQualityKB: highQualityKB.length, webResults: webResults.length }, "Insufficient sources — gate injected");
  }
  // ─────────────────────────────────────────────────────────────────────────

  // ── Task type prompt injection ────────────────────────────────────────────
  if (resolvedTaskType) {
    const taskBuilder = getTaskPromptBuilder(resolvedTaskType);
    if (taskBuilder) {
      const country = COUNTRY_NAMES[parsedTaskParams.countryCode] ??
        parsedTaskParams.country ??
        "غير محددة — يجب طلب الدولة قبل التحليل النهائي";

      const taskPrompt = taskBuilder.buildSystemPrompt(parsedTaskParams, country);
      contextMessages.push({ role: "system", content: taskPrompt });
      req.log.info({ taskType: resolvedTaskType }, "Task-type prompt injected");
    }
  }
  // ─────────────────────────────────────────────────────────────────────────

  const requestedResponseLanguage = getRequestedResponseLanguage(parsedTaskParams.responseLanguage);
  if (requestedResponseLanguage && parsedTaskParams.responseLanguage !== "ar") {
    contextMessages.push({
      role: "system",
      content:
        `[لغة الرد المطلوبة — تعليمة إلزامية]\n` +
        `يجب أن تكون كل الإجابة الموجهة للمستخدم باللغة: ${requestedResponseLanguage}.\n` +
        `ترجم الشرح والعناوين والخطوات والأسئلة المقترحة إلى هذه اللغة، مع الحفاظ على النصوص النظامية والاقتباسات وأسماء الجهات الرسمية بلغتها الأصلية عند اقتباسها، ثم أضف شرحاً مترجماً لها.\n` +
        `لا تذكر أنك غيّرت اللغة ولا تطلب من المستخدم إعادة كتابة سؤاله.`,
    });
  }

  // Add previous messages
  for (const m of msgHistory.filter(m => m.role !== "system")) {
    contextMessages.push({
      role: m.role as "user" | "assistant",
      content: m.content,
    });
  }

  // Add current user message
  contextMessages.push({ role: "user", content: parsed.data.message });

  // Signal that we're now in the OpenAI generation phase (Tavily is done or skipped)
  emitChatPhase(id, "generating");

  let assistantReply = "";
  let verificationSummary: ReturnType<typeof verifyResponse>["summary"] | undefined;
  let suggestedQuestions: string[] = [];
  try {
    const openai = getOpenAI();
    // ── Smart model routing: use gpt-4o-mini for short follow-up clarifications ─
    // First messages always get gpt-4o (full analysis); short follow-ups (<80 chars)
    // in an ongoing conversation use the cheaper model — they're typically simple
    // clarification answers, country selections, or one-line follow-ups.
    const isShortFollowUp = !isFirstUserMessage && parsed.data.message.trim().length < 80;
    const selectedModel = isShortFollowUp ? "gpt-4o-mini" : "gpt-4o";
    const selectedMaxTokens = isShortFollowUp ? 1500 : 3000;
    req.log.info({ model: selectedModel, msgs: contextMessages.length, isShortFollowUp }, "OpenAI request");
    const completion = await openai.chat.completions.create({
      model: selectedModel,
      messages: contextMessages,
      max_tokens: selectedMaxTokens,
      temperature: 0.2,
    });
    const fullRawReply = completion.choices[0]?.message?.content ?? "عذرًا، لم أتمكن من توليد إجابة. يرجى المحاولة مرة أخرى.";

    // ── Parse suggested follow-up questions from the raw reply ────────────────
    // The system prompt embeds questions in [أسئلة مقترحة]Q1|Q2|Q3[/أسئلة مقترحة]
    const suggestionsMatch = fullRawReply.match(/\[أسئلة مقترحة\]([\s\S]*?)\[\/أسئلة مقترحة\]/);
    suggestedQuestions = suggestionsMatch
      ? suggestionsMatch[1].split("|").map(q => q.trim()).filter(q => q.length > 2 && q.length < 200)
      : [];
    // Strip the block from the reply shown to the user
    const rawReply = fullRawReply.replace(/\n?\[أسئلة مقترحة\][\s\S]*?\[\/أسئلة مقترحة\]/g, "").trim();

    // ── Verification layer: check citations against retrieved sources ────────
    const verification = verifyResponse(rawReply, ragChunks, webResults);
    assistantReply = appendMandatoryLegalFooter(sanitizeOutput(verification.processedText));
    req.log.info({
      replyLen: assistantReply.length,
      confidence: verification.summary.confidence,
      blocked: verification.summary.blockedCount,
    }, "OpenAI response verified");
    // Save audit record (fire-and-forget — must not block response)
    db.insert(auditLogTable).values({
      userId: req.userId ?? undefined,
      action: "legal_query_verified",
      targetType: "consultation",
      targetId: String(id),
      details: {
        question: parsed.data.message.slice(0, 500),
        sourcesKB: ragChunks.length,
        sourcesWeb: webResults.length,
        confidence: verification.summary.confidence,
        confidenceScore: verification.summary.confidenceScore,
        blockedCount: verification.summary.blockedCount,
        sufficientSources: verification.summary.sufficientSources,
        ts: verification.summary.auditTs,
      },
    }).catch(() => {});
    // Store summary on outer-scope var for response inclusion
    verificationSummary = verification.summary;
  } catch (err: any) {
    // Log full structured details for server-side diagnosis
    req.log.error({
      name: err?.constructor?.name,
      status: err?.status,
      code: err?.code,
      message: err?.message,
      type: err?.type,
    }, "OpenAI API error");

    // Remove the user message we saved so quota isn't wasted on a failed call.
    // Wrapped in its own try/catch so a DB hiccup during cleanup does NOT convert
    // the friendly Arabic OpenAI error into an opaque 500 for the user.
    try {
      const saved = await db.select().from(consultationMessagesTable)
        .where(eq(consultationMessagesTable.consultationId, id))
        .orderBy(asc(consultationMessagesTable.createdAt));
      const last = saved[saved.length - 1];
      if (last?.role === "user") {
        await db.delete(consultationMessagesTable).where(eq(consultationMessagesTable.id, last.id));
      }
    } catch (cleanupErr) {
      req.log.warn({ err: cleanupErr }, "Failed to remove stale user message after OpenAI error — continuing");
    }

    // Release the reserved (uncounted) service session so it doesn't become orphaned.
    // commitService is never called on this path, so we must clean up explicitly.
    try {
      if (reservedSessionId !== undefined) {
        await releaseService(reservedSessionId);
        req.log.info({ reservedSessionId }, "Released orphaned service session after OpenAI failure");
      }
    } catch (releaseErr) {
      req.log.warn({ err: releaseErr }, "Failed to release service session after OpenAI error — quota slot may be orphaned");
    }

    // Build a friendly Arabic error message that explains the reason
    const httpStatus: number = err?.status ?? 0;
    let friendlyError: string;
    if (!process.env.OPENAI_API_KEY || !(process.env.OPENAI_API_KEY.replace(/[^\x20-\x7E]/g, "").trim())) {
      friendlyError = "عذرًا، لم يتم تكوين مفتاح الذكاء الاصطناعي بعد. يرجى التواصل مع الدعم الفني.";
    } else if (httpStatus === 401) {
      friendlyError = "عذرًا، مفتاح الذكاء الاصطناعي غير صالح أو منتهي الصلاحية. يرجى التواصل مع الدعم الفني لتحديثه.";
    } else if (httpStatus === 429) {
      friendlyError = "عذرًا، خدمة الذكاء الاصطناعي مشغولة حاليًا بسبب الطلبات الكثيرة. يرجى الانتظار دقيقة والمحاولة مرة أخرى.";
    } else if (httpStatus === 503 || httpStatus === 502) {
      friendlyError = "عذرًا، خدمة الذكاء الاصطناعي غير متاحة مؤقتًا. يرجى المحاولة بعد قليل.";
    } else if (err?.code === "ECONNREFUSED" || err?.code === "ENOTFOUND" || err?.code === "ETIMEDOUT") {
      friendlyError = "عذرًا، تعذّر الاتصال بخدمة الذكاء الاصطناعي. يرجى التحقق من الاتصال بالإنترنت والمحاولة مرة أخرى.";
    } else {
      friendlyError = "عذرًا، حدث خطأ غير متوقع في خدمة الذكاء الاصطناعي. يرجى المحاولة مرة أخرى، وإن تكرّر الخطأ يرجى التواصل مع الدعم الفني.";
    }

    // Return the friendly message as the assistant reply so it appears in the chat bubble
    emitChatPhase(id, "done");
    res.status(200).json({
      reply: appendMandatoryLegalFooter(friendlyError),
      messageId: null,
      questionsRemaining: null,
      isError: true,
    });
    return;
  }

  // Save assistant reply (persist sources for admin review)
  const sourcesToStore = verificationSummary?.sources ?? null;
  let savedReply: typeof consultationMessagesTable.$inferSelect;
  try {
    [savedReply] = await db.insert(consultationMessagesTable).values({
      consultationId: id,
      role: "assistant",
      content: assistantReply,
      usedLiveSearch: webResults.length > 0,
      sources: sourcesToStore as any,
    }).returning();
  } catch (error) {
    if (isFirstUserMessage && reservedSessionId) await releaseService(reservedSessionId).catch(() => {});
    throw error;
  }

  // ── Commit service quota on the first successful reply ─────────────────────
  // One consultation = one service unit. Subsequent messages in the same
  // consultation reuse the same counted session without additional deduction.
  // Exception: when Tavily verification failed the reply is a refusal — no real
  // service was delivered, so we release the reservation instead of committing.
  if (isFirstUserMessage && reservedSessionId) {
    if (tavilyFailed) {
      await releaseService(reservedSessionId).catch(() => {});
      req.log.info({ reservedSessionId }, "Tavily failed — quota reservation released (not committed)");
    } else {
      await commitService(reservedSessionId);
    }
  }
  const freshRemaining: number | null = null;

  // Mark consultation as answered
  await db.update(consultationsTable)
    .set({ status: "answered", updatedAt: new Date() })
    .where(eq(consultationsTable.id, id));

  // Signal done so SSE clients close cleanly
  emitChatPhase(id, "done");

  res.json({
    reply: assistantReply,
    messageId: savedReply.id,
    questionsRemaining: freshRemaining,
    verification: verificationSummary,
    usedLiveSearch: webResults.length > 0,
    suggestedQuestions: suggestedQuestions.length > 0 ? suggestedQuestions : undefined,
  });
});

// ── POST /api/consultations/:id/messages/:msgId/rate ──────────────────────────
router.post("/consultations/:id/messages/:msgId/rate", requireAuth, async (req, res): Promise<void> => {
  const consultationId = parseInt(req.params.id as string, 10);
  const messageId      = parseInt(req.params.msgId as string, 10);
  if (isNaN(consultationId) || isNaN(messageId)) {
    res.status(400).json({ error: "معرّف غير صالح" }); return;
  }

  // Verify consultation belongs to this user
  const [cons] = await db.select().from(consultationsTable)
    .where(and(eq(consultationsTable.id, consultationId), eq(consultationsTable.userId, req.userId!)));
  if (!cons) { res.status(404).json({ error: "الاستشارة غير موجودة" }); return; }

  // Upsert rating (1 = thumbs up)
  await db.insert(responseRatingsTable).values({
    consultationId,
    messageId,
    userId: req.userId!,
    rating: 1,
  }).onConflictDoUpdate({
    target: [responseRatingsTable.messageId, responseRatingsTable.userId] as any,
    set: { rating: 1, createdAt: new Date() },
  });

  res.json({ success: true });
});

// ── GET /api/admin/ratings-summary ────────────────────────────────────────────
router.get("/admin/ratings-summary", requireAdmin, async (req, res): Promise<void> => {
  try {
    const rows = await db.execute(sql`
      SELECT
        COUNT(*)::int                                          AS total_ratings,
        COUNT(DISTINCT rr.consultation_id)::int               AS rated_consultations,
        COUNT(DISTINCT rr.user_id)::int                       AS raters,
        ROUND(COUNT(*) * 100.0 / NULLIF(
          (SELECT COUNT(*) FROM consultation_messages WHERE role = 'assistant'), 0
        ), 1)::float                                          AS rating_pct,
        (SELECT COUNT(*) FROM response_ratings
         WHERE created_at >= NOW() - INTERVAL '7 days')::int AS last_7d
      FROM response_ratings rr
    `);
    res.json(rows.rows[0] ?? {});
  } catch (err: any) {
    res.status(500).json({ error: err?.message });
  }
});

export default router;
