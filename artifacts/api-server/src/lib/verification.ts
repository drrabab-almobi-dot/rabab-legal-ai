/**
 * Legal Response Verification Layer
 * ─────────────────────────────────
 * Runs after every AI response, before the reply reaches the client.
 * Verifies citations against retrieved sources, flags unverified text,
 * computes a confidence score, and builds the sources panel for the UI.
 *
 * Philosophy: do not silently drop legal content — replace or annotate it so
 * the user always knows what is source-backed and what is not.
 */

// ─── Types ────────────────────────────────────────────────────────────────────

export interface SourceChunk {
  content: string;
  documentName: string;
  similarity: number;
  documentId?: number;
  pageStart?: number | null;
  pageEnd?: number | null;
  literalMatch?: boolean;
}

export interface TavilyResult {
  title: string;
  url?: string;
  content: string;
  score?: number;
}

export type ConfidenceLevel = "high" | "medium" | "low";

export interface CitationCheck {
  raw: string;
  type: "article" | "decree" | "circular" | "date";
  verified: boolean;
  foundIn?: "kb" | "web";
}

export interface QuotationCheck {
  raw: string;
  similarity: number;    // 0–100
  verified: boolean;     // similarity >= 45
}

export interface SourcePanelItem {
  name: string;
  similarity: number;    // 0–100
  verified: boolean;     // similarity >= 42
  snippet: string;
  sourceType: "kb" | "web";
  url?: string;
  documentId?: number;
  pageStart?: number | null;
  pageEnd?: number | null;
}

export interface VerificationSummary {
  confidence: ConfidenceLevel;
  confidenceScore: number;     // 0–100
  blockedCount: number;        // unverified citations annotated
  sufficientSources: boolean;  // ≥ 3 high-quality sources
  sources: SourcePanelItem[];
  citationChecks: CitationCheck[];
  quotationChecks: QuotationCheck[];
  auditTs: string;
}

export interface VerificationResult {
  processedText: string;
  summary: VerificationSummary;
}

export interface ArticleVerificationResult {
  law: string;
  article: string;
  text: string;
  relevance: string;
  verified: boolean;
  foundIn?: "kb" | "web";
}

// ─── Arabic text utilities ────────────────────────────────────────────────────

/** Normalise Arabic for fuzzy matching (collapse variants, remove diacritics) */
function normalizeAr(text: string): string {
  return text
    .replace(/[\u064B-\u065F\u0670]/g, "")   // diacritics & tatweel
    .replace(/[أإآ]/g, "ا")
    .replace(/ة/g, "ه")
    .replace(/ى/g, "ي")
    .replace(/\s+/g, " ")
    .toLowerCase()
    .trim();
}

/** Jaccard token overlap on normalised Arabic tokens (words > 2 chars) */
function tokenOverlap(a: string, b: string): number {
  const tokens = (s: string) =>
    new Set(normalizeAr(s).split(/\s+/).filter((t) => t.length > 2));
  const A = tokens(a);
  const B = tokens(b);
  if (!A.size || !B.size) return 0;
  let intersection = 0;
  for (const t of A) if (B.has(t)) intersection++;
  return intersection / Math.min(A.size, B.size);
}

// ─── Citation patterns ────────────────────────────────────────────────────────

const CITATION_PATTERNS: Array<{
  re: RegExp;
  type: CitationCheck["type"];
}> = [
  // e.g. "المادة 15" or "المادة (15) من نظام العمل"
  {
    re: /المادة\s+\(?\d+(?:\s*[-–]\s*\d+)?\)?(?:\s+(?:من|و|أو)\s+[\u0600-\u06FF\s]{3,35})?/g,
    type: "article",
  },
  // Royal decrees and numbered codes: "م/51" or "المرسوم الملكي رقم م/41"
  { re: /(?:المرسوم\s+الملكي\s+رقم\s*|م\/)[\w\/\-\d]+/g, type: "decree" },
  // Circulars: "التعميم رقم 123" or "التعميم 45"
  { re: /التعميم\s+(?:رقم\s+)?(?:\d+|[\w\/\-]{3,20})/g, type: "circular" },
  // Hijri and Gregorian years
  { re: /\b(?:14|13)\d{2}هـ\b|\b(?:19|20)\d{2}م\b/g, type: "date" },
];

// Quoted text in Arabic: double-quotes or guillemets, 25-400 chars
const QUOTE_RE = /"([^"]{25,400})"|«([^»]{25,400})»/g;

// ─── Source searching ─────────────────────────────────────────────────────────

/** Returns which source type (kb/web) the needle was found in, or null if not found. */
function findInSources(
  needle: string,
  chunks: SourceChunk[],
  web: TavilyResult[]
): "kb" | "web" | null {
  const norm = normalizeAr(needle);
  if (norm.length < 4) return "kb"; // too short to meaningfully verify
  for (const c of chunks) {
    if (normalizeAr(c.content).includes(norm)) return "kb";
  }
  for (const r of web) {
    if (normalizeAr(r.content).includes(norm)) return "web";
  }
  return null;
}

// ─── Main verification ────────────────────────────────────────────────────────

/**
 * Verify a free-text AI response against the retrieved sources.
 * Returns cleaned text (unverified citations replaced/annotated) and a summary.
 */
export function verifyResponse(
  text: string,
  chunks: SourceChunk[],
  tavilyResults: TavilyResult[] = []
): VerificationResult {
  const noSources = chunks.length === 0 && tavilyResults.length === 0;
  const highQualityKB = chunks.filter((c) => c.similarity >= 0.42);

  // ── 1. Build sources panel ────────────────────────────────────────────────
  const sources: SourcePanelItem[] = [
    ...highQualityKB.map((c) => ({
      name: c.documentName,
      similarity: Math.round(c.similarity * 100),
      verified: true,
      snippet:
        c.content.slice(0, 200).trim() + (c.content.length > 200 ? "…" : ""),
      sourceType: "kb" as const,
      documentId: c.documentId,
      pageStart: c.pageStart ?? null,
      pageEnd: c.pageEnd ?? null,
    })),
    ...tavilyResults.slice(0, 4).map((r) => ({
      name: r.title || "مصدر ويب",
      similarity: Math.round((r.score ?? 0.5) * 100),
      verified: true,
      snippet:
        r.content.slice(0, 200).trim() + (r.content.length > 200 ? "…" : ""),
      sourceType: "web" as const,
      url: r.url,
    })),
  ];

  // ── 2. Sufficient sources? ────────────────────────────────────────────────
  const sufficientSources =
    highQualityKB.length >= 3 ||
    (highQualityKB.length >= 1 && tavilyResults.length >= 2) ||
    tavilyResults.length >= 3;

  // ── 3. Citation checks ────────────────────────────────────────────────────
  const citationChecks: CitationCheck[] = [];
  const seenRaw = new Set<string>();

  for (const { re, type } of CITATION_PATTERNS) {
    re.lastIndex = 0;
    let m: RegExpExecArray | null;
    while ((m = re.exec(text)) !== null) {
      const raw = m[0].trim();
      if (seenRaw.has(raw) || raw.length < 4) continue;
      seenRaw.add(raw);

      // Dates: pass through (too many false positives from training knowledge)
      if (type === "date") {
        citationChecks.push({ raw, type, verified: true });
        continue;
      }

      // لا يوجد مصدر يعني أنه لا يمكن اعتماد مرجع قانوني؛ لا نمرّر
      // أرقام المواد أو المراسيم من ذاكرة النموذج كأنها موثقة.
      if (noSources) {
        citationChecks.push({ raw, type, verified: false });
        continue;
      }

      const foundIn = findInSources(raw, chunks, tavilyResults);
      citationChecks.push({ raw, type, verified: foundIn !== null, foundIn: foundIn ?? undefined });
    }
  }

  // ── 4. Quotation checks ───────────────────────────────────────────────────
  const quotationChecks: QuotationCheck[] = [];
  QUOTE_RE.lastIndex = 0;
  let qm: RegExpExecArray | null;
  while ((qm = QUOTE_RE.exec(text)) !== null) {
    const inner = (qm[1] ?? qm[2] ?? "").trim();
    if (inner.length < 25) continue;
    let bestSim = 0;
    for (const c of chunks)
      bestSim = Math.max(bestSim, tokenOverlap(inner, c.content));
    for (const r of tavilyResults)
      bestSim = Math.max(bestSim, tokenOverlap(inner, r.content));
    quotationChecks.push({
      raw: qm[0],
      similarity: Math.round(bestSim * 100),
      verified: !noSources && bestSim >= 0.45,
    });
  }

  // ── 5. Process text — annotate unverified citations ───────────────────────
  let processedText = text;
  const unverifiedCitations = citationChecks.filter(
    (c) => !c.verified && c.type !== "date"
  );

  // Replace longest first to avoid substring conflicts
  for (const cit of [...unverifiedCitations].sort(
    (a, b) => b.raw.length - a.raw.length
  )) {
    const typeLabel =
      cit.type === "article" ? "رقم مادة" :
      cit.type === "decree"  ? "رقم مرسوم" :
      cit.type === "circular"? "رقم تعميم" : "مرجع";
    processedText = processedText.split(cit.raw).join(
      `[⚠ ${typeLabel} غير موجود في المصادر المسترجعة — تم حجبه تلقائياً. للتحقق: بوابة هيئة الخبراء]`
    );
  }

  // Annotate unverified quotations
  for (const q of quotationChecks.filter((q) => !q.verified)) {
    processedText = processedText.replace(
      q.raw,
      `[اقتباس غير مؤكد من المصادر المتاحة] ${q.raw}`
    );
  }

  // ── 6. Confidence score ───────────────────────────────────────────────────
  const avgSim =
    chunks.length > 0
      ? chunks.reduce((s, c) => s + c.similarity, 0) / chunks.length
      : 0;

  const checkableCitations = citationChecks.filter((c) => c.type !== "date");
  const citRate =
    checkableCitations.length > 0
      ? checkableCitations.filter((c) => c.verified).length /
        checkableCitations.length
      : 1;

  const sourceScore = Math.min(highQualityKB.length / 3, 1);
  const rawScore = avgSim * 0.40 + citRate * 0.35 + sourceScore * 0.25;
  const confidenceScore = Math.round(rawScore * 100);

  const confidence: ConfidenceLevel =
    confidenceScore >= 65 ? "high" : confidenceScore >= 35 ? "medium" : "low";

  return {
    processedText,
    summary: {
      confidence,
      confidenceScore,
      blockedCount: unverifiedCitations.length,
      sufficientSources,
      sources,
      citationChecks,
      quotationChecks,
      auditTs: new Date().toISOString(),
    },
  };
}

// ─── Article verification (for structured JSON reports) ───────────────────────

/**
 * Verify each article in a legal research report against retrieved sources.
 * Used by the /knowledge/legal-research endpoint.
 */
export function verifyArticles(
  articles: Array<{ law: string; article: string; text: string; relevance: string }>,
  chunks: SourceChunk[],
  tavilyResults: TavilyResult[] = []
): ArticleVerificationResult[] {
  const noSources = chunks.length === 0 && tavilyResults.length === 0;
  return articles.map((a) => {
    if (noSources) return { ...a, verified: false };
    // Try to find the article number in sources
    const byNumber = findInSources(`المادة ${a.article}`, chunks, tavilyResults);
    // Also check law name presence (shorter match)
    const lawKey = normalizeAr(a.law).split(" ").slice(0, 3).join(" ");
    const byLaw = lawKey.length >= 4 ? findInSources(lawKey, chunks, tavilyResults) : null;
    const verified = byNumber !== null || byLaw !== null;
    return {
      ...a,
      verified,
      foundIn: byNumber ?? byLaw ?? undefined,
    };
  });
}

// ─── Confidence badge helper (shared between routes) ─────────────────────────

export function confidenceLabel(level: ConfidenceLevel): string {
  return level === "high"
    ? "ثقة عالية — موثق من المصادر"
    : level === "medium"
    ? "ثقة متوسطة — تحقق جزئي"
    : "يحتاج تحقق يدوي";
}
