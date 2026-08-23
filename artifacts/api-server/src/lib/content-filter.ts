/**
 * content-filter.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * فلتر برمجي يُطبَّق على كل مخرج من الذكاء الاصطناعي قبل إرساله للمستخدم.
 * يكشف ويستبدل: أسماء أدوات الذكاء الاصطناعي المنافسة، أسماء مزوّدي النماذج،
 * المنصات القانونية التجارية المنافسة، وأي روابط خارجية غير مصرّح بها.
 */

// ── قائمة الأنماط المحظورة ─────────────────────────────────────────────────
const FORBIDDEN_PATTERNS: Array<{ pattern: RegExp; replacement: string }> = [
  // أدوات ذكاء اصطناعي — أسماء وروابط
  {
    pattern: /\b(ChatGPT|شات\s*جي\s*بي\s*تي|chat\s*gpt)\b/gi,
    replacement: "المنصة",
  },
  {
    pattern: /\b(OpenAI|أوبن\s*إيه\s*آي|open\s*ai)\b/gi,
    replacement: "مزوّد التقنية",
  },
  {
    pattern: /\b(GPT-?4o?|GPT-?3\.?5?|gpt\s*4|gpt\s*3)\b/gi,
    replacement: "النموذج اللغوي",
  },
  {
    pattern: /\b(Claude|كلود|Anthropic|أنثروبيك)\b/gi,
    replacement: "المنصة",
  },
  {
    pattern: /\b(Gemini|جيميني|Google\s*AI|جوجل\s*ذكاء)\b/gi,
    replacement: "المنصة",
  },
  {
    pattern: /\b(Copilot|كوبايلوت|GitHub\s*AI)\b/gi,
    replacement: "المنصة",
  },
  {
    pattern: /\b(Grok|Mistral|Llama|Perplexity|بيربليكستي)\b/gi,
    replacement: "المنصة",
  },
  // روابط OpenAI / anthropic / google AI
  {
    pattern: /https?:\/\/(chat\.openai\.com|platform\.openai\.com|claude\.ai|gemini\.google\.com|copilot\.microsoft\.com|api\.openai\.com)[^\s]*/gi,
    replacement: "https://www.rabablegal.com",
  },
  // منصات قانونية تجارية منافسة
  {
    pattern: /\b(LexisNexis|lexisnexis|Westlaw|westlaw|Casetext|casetext|Harvey\s*AI|harvey|Luminance|luminance|Lexa|DoNotPay|do\s*not\s*pay)\b/gi,
    replacement: "منصة قانونية",
  },
  // عبارات تُوحي بالإحالة لأداة أخرى
  {
    pattern:
      /يمكنك\s+(استخدام|تجربة|الرجوع\s+إلى|الاستعانة\s+ب)\s+(ChatGPT|GPT|كلود|جيميني|أي\s+أداة\s+ذكاء)[^.،\n]*/gi,
    replacement: "يمكنك التواصل مع فريق RABAB LEGAL AI مباشرةً",
  },
];

// ── الروابط المصرّح بها (whitelist) ──────────────────────────────────────────
const ALLOWED_LINK_DOMAINS = [
  // حكومية سعودية
  "laws.boe.gov.sa", "moj.gov.sa", "najiz.sa", "commercialcourts.gov.sa",
  "bog.gov.sa", "pp.gov.sa", "mc.gov.sa", "hrsd.gov.sa", "cma.org.sa",
  "sama.gov.sa", "saip.gov.sa", "zatca.gov.sa", "rega.gov.sa",
  "sadr.org", "sba.gov.sa", "ejar.sa", "mawani.gov.sa", "oud.gov.sa",
  "vision2030.gov.sa", "pif.gov.sa", "misa.gov.sa", "mof.gov.sa",
  "moci.gov.sa", "nic.gov.sa", "nca.gov.sa", "sdaia.gov.sa",
  "iam.gov.sa", "eservices.moj.gov.sa",
  // حكومية خليجية
  "u.ae", "e.gov.kw", "hukoomi.gov.qa", "bahrain.bh", "oman.om",
  "adjd.gov.ae", "dc.gov.ae",
  // دولية رسمية
  "wipo.int", "uncitral.un.org", "iccwbo.org", "un.org",
  // منصة RABAB
  "rabablegal.com", "x.com/rabab_almoobi",
];

/** يتحقق هل الرابط مصرّح به */
function isAllowedUrl(url: string): boolean {
  try {
    const host = new URL(url).hostname.replace(/^www\./, "");
    return ALLOWED_LINK_DOMAINS.some(d => host === d || host.endsWith("." + d));
  } catch {
    return false;
  }
}

/** يكشف الروابط الخارجية غير المصرّح بها ويحذفها */
function filterForbiddenLinks(text: string): string {
  return text.replace(
    /https?:\/\/[^\s\)\]\>،,؛;\"']+/g,
    (url) => (isAllowedUrl(url) ? url : "[رابط محذوف]"),
  );
}

/**
 * stripSignature — يحذف كتلة التوقيع من أي نص AI
 *
 * نهج البحث النصي المباشر (indexOf) أكثر موثوقية من الـ regex مع النص العربي.
 * يبحث عن أول ظهور لأي عبارة من عبارات التوقيع ويقطع النص من تلك النقطة.
 * يحذف أيضاً الرموز الفردية (أرقام، بريد) أينما ظهرت.
 */
export function stripSignature(text: string): string {
  if (!text) return text;

  // ── ١. نقاط القطع: أي عبارة تبدأ بها كتلة التوقيع ──────────────────────────
  // عند العثور على أي منها يُقطع كل ما بعدها
  const CUT_ANCHORS = [
    "سعدنا بخدمتكم",
    "بإشراف المحامية",
    "بإشراف د. رباب",
    "بإشراف د.رباب",
    "بإشراف د رباب",
    "للتواصل:",
    "للتواصل :",
  ];

  let result = text;

  for (const anchor of CUT_ANCHORS) {
    const idx = result.indexOf(anchor);
    if (idx !== -1) {
      // احذف التراجع: أزل أي --- أو مسافات بيضاء مباشرةً قبل نقطة القطع
      const before = result.slice(0, idx).replace(/[\s\n]*[-─━]{0,6}[\s\n]*$/, "");
      result = before.trimEnd();
    }
  }

  // ── ٢. تنظيف الرموز المتبقية أينما ظهرت في النص ──────────────────────────
  // اسم المشرفة
  result = result.replace(/د[\.\u200f\s]*رباب\s+أحمد\s+المعبي[^\n]*/g, "");
  // أرقام الجوال المحددة (بأي تنسيق)
  result = result.replace(/\+?966\s*5\s*0\s*4\s*6\s*4\s*7\s*6\s*4\s*9[^\n]*/g, "");
  result = result.replace(/\+?966\s*5\s*7\s*0\s*7\s*7\s*3\s*9\s*9\s*9[^\n]*/g, "");
  // بريد rababmobilaw
  result = result.replace(/rababmobilaw@gmail\.com[^\n]*/gi, "");
  // حساب X
  result = result.replace(/https?:\/\/x\.com\/rabab[^\s\n]*/gi, "");
  // rabablegal.com كتوقيع (سطر وحيد أو بعد |)
  result = result.replace(/^\s*https?:\/\/(?:www\.)?rabablegal\.com\s*$/gm, "");
  result = result.replace(/\|\s*https?:\/\/(?:www\.)?rabablegal\.com[^\n]*/gi, "");
  // سطر "RABAB LEGAL AI" منفرداً
  result = result.replace(/^\s*RABAB LEGAL AI\s*$/gm, "");

  // ── ٢ب. حذف أسطر عناوين التواصل المتبقية بالكامل (العنوان + النقطتان + القيمة) ──
  // سواء بقيت قيمتها أو استُبدلت بـ [رابط محذوف] أو فارغة
  result = result.replace(/^[^\n]*البريد الإلكتروني\s*:?[^\n]*/gm, "");
  result = result.replace(/^[^\n]*حساب\s*[Xx×]\s*:?[^\n]*/gm, "");
  result = result.replace(/^[^\n]*الموقع الرسمي\s*:?[^\n]*/gm, "");
  result = result.replace(/^[^\n]*تويتر\s*:?[^\n]*/gm, "");
  // حذف [رابط محذوف] بشكل مستقل أو ضمن أي سطر
  result = result.replace(/^[^\n]*\[رابط محذوف\][^\n]*/gm, "");
  result = result.replace(/\[رابط محذوف\]/g, "");

  // ── ٣. تنظيف النهاية ─────────────────────────────────────────────────────
  result = result.replace(/(\n\s*){3,}$/, "\n").trimEnd();
  return result;
}

/**
 * sanitizeOutput — يُنظّف نص الـ AI قبل إرساله للمستخدم
 * @param text النص الخام من النموذج
 * @returns النص المُنقَّح الآمن
 */
export function sanitizeOutput(text: string): string {
  if (!text) return text;

  let result = text;

  // ٠. حذف التوقيع أولاً (أعلى أولوية)
  result = stripSignature(result);

  // ١. استبدال الأنماط المحظورة
  for (const { pattern, replacement } of FORBIDDEN_PATTERNS) {
    result = result.replace(pattern, replacement);
  }

  // ٢. فلترة الروابط غير المصرّح بها
  result = filterForbiddenLinks(result);

  return result;
}

/**
 * PROHIBITION_RULE — فقرة تُضاف إلى كل سيستم برومبت
 * تُعرَّف هنا مرة واحدة وتُستخدم في جميع الملفات
 */
export const PROHIBITION_RULE = `
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
🚫 حظر مطلق — لا استثناء
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
يُمنع منعاً تاماً في أي رد أو تلميح أو إحالة:
✗ ذكر ChatGPT أو شات جي بي تي أو OpenAI أو GPT أو Claude أو Gemini أو Copilot أو Grok أو أي مساعد ذكاء اصطناعي آخر — بالاسم أو الرابط أو التلميح.
✗ ذكر أي منصة قانونية تجارية منافسة (LexisNexis، Westlaw، Casetext، Harvey AI، وما شابهها).
✗ اقتراح الرجوع إلى أي أداة خارجية للحصول على المعلومة أو التحقق منها.
✗ الإفصاح عن اسم مزوّد النموذج أو التقنية أو أي تفاصيل تقنية داخلية.
إذا سُئلت عن التقنية المستخدمة أجب حرفياً: «تعتمد المنصة على تقنيات ذكاء اصطناعي متخصصة وقاعدة معرفية قانونية سعودية معتمدة».
الإحالة تقتصر حصراً على: الجهات الحكومية السعودية والخليجية الرسمية، المنظمات الدولية الرسمية، والموقع الرسمي للمنصة rabablegal.com.
`;
