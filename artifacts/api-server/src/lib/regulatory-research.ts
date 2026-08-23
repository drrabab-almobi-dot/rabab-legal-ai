/**
 * Regulatory Research Engine — Phase 1
 * Arabic legal synonym dictionary, multi-source BOE search, structured types.
 *
 * Rules enforced programmatically (not just in prompts):
 * - fetchedAt stored with every source
 * - Unverified article text flagged programmatically via isTextVerified()
 * - Only official domains queried
 * - نظام / لائحة / قرار / تعميم hierarchy preserved in types
 */

// ── Arabic Legal Synonym Dictionary ──────────────────────────────────────────
export const LEGAL_SYNONYMS: Record<string, string[]> = {
  // عقود
  'فسخ':          ['إنهاء', 'انحلال', 'زوال العقد', 'انفساخ', 'إلغاء'],
  'تعويض':        ['ضرر', 'ضمان', 'مسؤولية', 'جبر الضرر', 'غرامة'],
  'إخلال':        ['عدم التنفيذ', 'تأخر', 'امتناع', 'مخالفة', 'عدم الوفاء'],
  'إشعار':        ['إخطار', 'تبليغ', 'إعلان', 'إنذار'],
  'عقد':          ['اتفاقية', 'اتفاق', 'صك', 'وثيقة'],
  'شرط':          ['بند', 'التزام تعاقدي', 'نص عقدي'],
  // تقادم وسقوط
  'تقادم':        ['سقوط', 'عدم سماع الدعوى', 'انقضاء المدة', 'مرور الزمن'],
  'مدة':          ['أجل', 'مهلة', 'ميعاد', 'مدة التقادم'],
  // أشخاص
  'شركة':         ['منشأة', 'شخص اعتباري', 'تاجر', 'مؤسسة', 'كيان تجاري'],
  'عامل':         ['موظف', 'أجير', 'مستخدم'],
  'صاحب عمل':    ['مستخدِم', 'رب العمل', 'المنشأة'],
  'مستأجر':       ['مستأجر', 'الطرف الثاني في الإيجار'],
  // أنواع الحقوق
  'إيجار':        ['استئجار', 'كراء', 'تأجير', 'عقد إيجار'],
  'بيع':          ['عقد بيع', 'نقل ملكية', 'صفقة', 'شراء'],
  'رهن':          ['تأمين عيني', 'رهن تجاري', 'ضمان عيني', 'رهن عقاري'],
  'كفالة':        ['ضمان', 'تضامن', 'التزام تبعي'],
  // تشريع
  'نظام':         ['قانون', 'تشريع', 'تنظيم', 'نص نظامي'],
  'لائحة':        ['تعليمات تنفيذية', 'ضوابط', 'قواعد', 'آلية تنفيذية'],
  'تعميم':        ['منشور', 'توجيه', 'تعليمات إدارية'],
  'مرسوم':        ['أمر ملكي', 'قرار مجلس الوزراء', 'قرار وزاري'],
  'نفاذ':         ['سريان', 'تطبيق', 'صدور'],
  'إلغاء':        ['نسخ', 'تجاوز', 'استبدال', 'التخلي عن النص'],
  // جزاء
  'بطلان':        ['انعدام', 'عدم الصحة', 'قابلية الإبطال'],
  'عقوبة':        ['جزاء', 'غرامة مالية', 'سجن', 'توقيف'],
  'مسؤولية':      ['التزام', 'ضمان', 'مسؤولية جنائية', 'مسؤولية مدنية'],
  // إجراءات
  'دعوى':         ['قضية', 'شكوى', 'طلب', 'مطالبة'],
  'اختصاص':       ['صلاحية', 'اختصاص قضائي', 'اختصاص مكاني', 'اختصاص نوعي'],
  'استئناف':      ['طعن', 'اعتراض', 'تمييز', 'إعادة نظر'],
  'تحكيم':        ['الفصل في النزاع', 'هيئة تحكيمية', 'تسوية بديلة'],
  // عقار وأموال
  'ملكية':        ['حيازة', 'تصرف', 'حق عيني', 'انتقال الملكية'],
  'نزاع عقاري':  ['خلاف على الأرض', 'النزاع على العقار', 'ملكية الأرض'],
  // عمل
  'فصل':          ['إنهاء الخدمة', 'إنهاء العقد', 'الصرف من العمل', 'الفصل التعسفي'],
  'أجر':          ['راتب', 'مكافأة', 'أجرة', 'مقابل العمل'],
  'إجازة':        ['راحة', 'عطلة', 'إجازة سنوية', 'إجازة الأمومة'],
};

// ── Official Saudi regulatory domains ─────────────────────────────────────────
export const REGULATORY_DOMAINS_BOE = [
  "laws.boe.gov.sa",       // بوابة هيئة الخبراء — المصدر الأول
  "uqn.gov.sa",            // أم القرى الجريدة الرسمية
];

export const REGULATORY_DOMAINS_MOJ = [
  "moj.gov.sa",
  "laws.moj.gov.sa",
];

export const REGULATORY_DOMAINS_ALL = [
  "laws.boe.gov.sa",
  "uqn.gov.sa",
  "moj.gov.sa",
  "laws.moj.gov.sa",
  "hrsd.gov.sa",
  "sama.gov.sa",
  "zatca.gov.sa",
  "saip.gov.sa",
  "rega.gov.sa",
  "mc.gov.sa",
  "sba.gov.sa",
  "mci.gov.sa",
  "cma.org.sa",
  "bog.gov.sa",
];

// ── Types ─────────────────────────────────────────────────────────────────────
export interface RegulatorySource {
  title: string;
  url: string;
  content: string;           // Capped at 3000 chars per source
  fetchedAt: string;         // ISO — required by fetch rule
  score?: number;
  category?: 'main' | 'exec-reg' | 'amendment' | 'circular' | 'kb';
}

export interface RegulatoryArticle {
  articleNumber: string;
  articleText: string;       // quoted only if literally in sources
  law: string;
  relevance: string;
  verified: boolean;         // programmatic check via isTextVerified()
  sourceUrl?: string;
}

/**
 * Document types in descending hierarchy:
 * نظام > لائحة تنفيذية > قرار وزاري > تعميم > دليل إرشادي
 */
export type LegalDocType =
  | 'نظام'
  | 'لائحة تنفيذية'
  | 'قرار وزاري'
  | 'تعميم'
  | 'ضوابط'
  | 'دليل إرشادي'
  | 'أمر ملكي'
  | 'نموذج معتمد';

export type LegalDocStatus = 'نافذ' | 'ملغى' | 'معدّل' | 'غير محدد';

export interface LegislativeMapItem {
  type: LegalDocType;
  name: string;
  issuingDecree?: string;
  date?: string;
  status: LegalDocStatus;
  relation: string;          // وجه الارتباط بالنظام الرئيسي
  verified: boolean;
  sourceUrl?: string;
}

export interface Amendment {
  date: string;
  decree: string;            // رقم المرسوم / القرار
  description: string;
  publishDate?: string;      // نشر في أم القرى
  effectiveDate?: string;
  articles?: string;         // المواد المعدّلة
  verified: boolean;
}

export interface RegulatoryResult {
  fetchedAt: string;
  query: string;
  synonymsUsed: string[];
  searchTermsUsed: string[];

  // 1. التكييف القانوني
  legalClassification: string;
  // 2. السؤال النظامي
  legalQuestion: string;
  // 3. الكلمات المفتاحية والمرادفات
  keywords: string[];

  // 4. النظام الرئيسي
  mainLaw: {
    name: string;
    issuingDecree?: string;
    publishDate?: string;
    effectiveDate?: string;
    status: LegalDocStatus;
    issuingAuthority?: string;
    sourceUrl?: string;
    verified: boolean;
  } | null;

  // 7. اللوائح والقرارات المكملة → الخريطة التشريعية
  legislativeMap: LegislativeMapItem[];

  // تتبع التعديلات
  amendments: Amendment[];

  // 6. المواد المنطبقة
  applicableArticles: RegulatoryArticle[];

  // 9. النص الواجب التطبيق زمنياً
  temporalApplicability?: {
    applicableVersion: string;
    reason: string;
    transitionalNote?: string;
  };

  // 10. شروط التطبيق والاستثناءات
  conditions: string[];
  exceptions: string[];

  // 11. وجه الانطباق على الواقعة
  applicationAnalysis: string;

  // 12. التعارضات المحتملة
  conflicts: string[];

  // 13. النتيجة
  conclusion: string;

  // 14. المسائل التي تحتاج بحثاً إضافياً
  pendingIssues: string[];

  // 15. المصادر الرسمية — كل مصدر مع تاريخ الجلب (fetchedAt)
  sources: RegulatorySource[];

  // تدقيق نتيجة البحث
  auditStatus: 'موثقة وصالحة للاستخدام' | 'صحيحة مع نقص محدود' | 'تحتاج إعادة تحقق' | 'غير صالحة للاعتماد';
  auditNotes: string[];
}

// ── Synonym expansion ─────────────────────────────────────────────────────────
export function expandWithSynonyms(query: string): string {
  const extra: string[] = [];
  for (const [key, variants] of Object.entries(LEGAL_SYNONYMS)) {
    if (query.includes(key)) {
      extra.push(...variants.slice(0, 2));
    }
  }
  if (extra.length === 0) return query;
  return `${query} ${[...new Set(extra)].slice(0, 6).join(' ')}`;
}

export function getSynonymsUsed(query: string): string[] {
  const used: string[] = [];
  for (const [key, variants] of Object.entries(LEGAL_SYNONYMS)) {
    if (query.includes(key)) {
      used.push(key, ...variants.slice(0, 2));
    }
  }
  return [...new Set(used)];
}

export function buildRegulatorySearchTerms(query: string): string[] {
  const terms = [query];
  const expanded = expandWithSynonyms(query);
  if (expanded !== query) terms.push(expanded);
  return terms;
}

// ── Multi-source Tavily search ────────────────────────────────────────────────
export async function searchRegulatorySource(
  query: string,
  domains: string[] = REGULATORY_DOMAINS_ALL,
  maxResults = 5,
  category: RegulatorySource['category'] = 'main',
): Promise<RegulatorySource[]> {
  const apiKey = process.env.TAVILY_API_KEY;
  if (!apiKey) return [];

  const fetchedAt = new Date().toISOString();
  try {
    const response = await fetch("https://api.tavily.com/search", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        api_key: apiKey,
        query,
        search_depth: "advanced",
        include_domains: domains,
        max_results: maxResults,
        include_raw_content: true,   // get full article text for verbatim checks
        include_answer: false,
        include_images: false,
      }),
      signal: AbortSignal.timeout(14000),
    });

    if (!response.ok) return [];

    const data = (await response.json()) as {
      results?: Array<{
        title?: string;
        url?: string;
        content?: string;
        raw_content?: string;
        score?: number;
      }>;
    };

    return (data.results ?? [])
      .filter(r => (r.score ?? 0) > 0.2)
      .map(r => ({
        title: r.title ?? "",
        url: r.url ?? "",
        // prefer raw_content (full page), fall back to snippet
        content: (r.raw_content ?? r.content ?? "").slice(0, 3000),
        fetchedAt,
        score: r.score ?? 0,
        category,
      }));
  } catch {
    return [];
  }
}

// ── Programmatic article text verification ────────────────────────────────────
/**
 * Check whether articleText (or its first 80 chars) appears in any fetched source.
 * This enforces the rule: no text in quotes unless literally from an official source.
 */
export function isTextVerified(
  text: string,
  sources: RegulatorySource[],
  kbCorpus: string,
): boolean {
  if (!text || text.length < 15) return false;

  // Normalize: strip tashkeel, collapse whitespace
  const norm = (s: string) =>
    s.replace(/[\u064B-\u065F\u0670]/g, '').replace(/\s+/g, ' ').trim();

  const needle = norm(text).slice(0, 80);
  if (needle.length < 10) return false;

  const haystack = norm(
    sources.map(s => s.content).join(' ') + ' ' + kbCorpus
  );
  return haystack.includes(needle);
}
