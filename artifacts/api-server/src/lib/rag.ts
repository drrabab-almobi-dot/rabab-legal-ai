import OpenAI from "openai";
import { createHash } from "crypto";
import { db, knowledgeChunksTable, knowledgeDocumentsTable, rerankCacheTable } from "@workspace/db";
import { eq, inArray, isNull, and, lt, sql } from "drizzle-orm";
import { assessChunkQuality } from "./arabic-text-fix";

/** Cosine similarity between two vectors */
function cosineSimilarity(a: number[], b: number[]): number {
  let dot = 0, normA = 0, normB = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }
  const denom = Math.sqrt(normA) * Math.sqrt(normB);
  return denom === 0 ? 0 : dot / denom;
}

/**
 * Normalize Arabic-Indic digits (٠١٢٣٤٥٦٧٨٩) to Western digits (0-9).
 * Also normalises alef variants for consistent Arabic matching.
 */
function normalizeArabic(s: string): string {
  return s
    .replace(/[٠-٩]/g, d => String(d.charCodeAt(0) - 0x0660))  // Arabic-Indic → Western
    .replace(/[٠-٩]/g, d => String(d.charCodeAt(0) - 0x06F0))  // Extended Arabic-Indic → Western
    .replace(/[أإآ]/g, "ا")                                       // alef variants → bare alef
    .toLowerCase();
}

/**
 * Build a boundary-aware RegExp for a token so that:
 *  - Numbers: "55" does NOT match inside "155" or "550"
 *  - Arabic words: not matched when embedded in a longer Arabic word
 *  - Latin words: standard \b word boundary
 */
function tokenRegex(token: string): RegExp {
  const escaped = token.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  if (/^\d+$/.test(token)) {
    // Numeric: assert non-digit on both sides
    return new RegExp(`(?<!\\d)${escaped}(?!\\d)`);
  }
  if (/[\u0600-\u06FF]/.test(token)) {
    // Arabic: assert non-Arabic-letter on both sides
    return new RegExp(`(?<![\\u0600-\\u06FF])${escaped}(?![\\u0600-\\u06FF])`);
  }
  // Latin: standard word boundary
  return new RegExp(`\\b${escaped}\\b`);
}

/**
 * Keyword-based text matching score (0–1).
 * Handles Arabic legal queries including circular numbers, article references, exact phrases.
 *
 * Scoring:
 *  - Exact normalised phrase match → 1.0
 *  - Weighted fraction of query tokens found with boundary-aware matching
 *  - Numeric tokens (e.g. "1234") weighted 2× — critical for circular/article numbers
 */
function fullTextScore(query: string, text: string): number {
  const textNorm  = normalizeArabic(text);
  const queryNorm = normalizeArabic(query.trim());

  // Exact phrase match → perfect score
  if (textNorm.includes(queryNorm)) return 1.0;

  // Tokenise: Arabic words (≥2 chars), numbers, Latin words (≥2 chars)
  const tokenize = (s: string) =>
    (s.match(/[\u0600-\u06FF]{2,}|\d+|[a-zA-Z]{2,}/g) ?? []);

  const queryTokens = tokenize(queryNorm);
  if (queryTokens.length === 0) return 0;

  let weightedHits = 0;
  let totalWeight  = 0;

  for (const token of queryTokens) {
    const weight = /^\d+$/.test(token) ? 2 : 1;   // numbers count double
    totalWeight += weight;
    try {
      if (tokenRegex(token).test(textNorm)) weightedHits += weight;
    } catch {
      // Malformed regex edge case — fall back to plain include
      if (textNorm.includes(token)) weightedHits += weight;
    }
  }

  return totalWeight > 0 ? weightedHits / totalWeight : 0;
}

/**
 * Hybrid score: blend semantic (cosine) + keyword (fullText).
 * Weights: 70% semantic, 30% keyword.
 * If exact phrase present, score is boosted to max(hybridScore, 0.9).
 */
function hybridScore(semanticSim: number, textSim: number): number {
  const blended = 0.7 * semanticSim + 0.3 * textSim;
  // Exact phrase match already returns textSim = 1.0 → boost blended floor
  return textSim >= 1.0 ? Math.max(blended, 0.90) : blended;
}

/**
 * Detect if a text chunk looks like a table of contents / index page.
 * Excludes legal article lists ("المادة X — ...") from rejection.
 */
function isTocChunk(text: string): boolean {
  // ── Check 1: single-line catalog dump ────────────────────────────────────
  // OCR from scanned catalogs often collapses many rows into one long line,
  // e.g. "نظام حماية حقوق المؤلف 52 .نسخة وزارة الإعلام 53 .نسخة الهيئة..."
  // We look for ≥ 3 occurrences of a number followed OR preceded by a separator.
  const inlineForward  = (text.match(/\d{1,3}\s*[.،\-–]\s*[\u0600-\u06FF]/g) ?? []).length;
  const inlineBackward = (text.match(/[\u0600-\u06FF]\s+\d{1,3}\s*[.،\-–]/g) ?? []).length;
  if (inlineForward + inlineBackward >= 3) return true;

  // ── Check 2: digit-to-letter ratio ───────────────────────────────────────
  const digits  = (text.match(/\d/g) ?? []).length;
  const letters = (text.match(/[\u0600-\u06FFa-zA-Z]/g) ?? []).length;
  if (letters > 0 && digits / letters > 0.40) return true;

  // ── Check 3: multi-line TOC (requires ≥ 3 lines) ─────────────────────────
  const lines = text.split("\n").filter(l => l.trim().length > 0);
  if (lines.length < 3) return false;

  const articleLinePattern = /^(المادة|الفقرة|البند|القاعدة)\s+\d/;
  const tocEndPattern   = /[\u0600-\u06FF]{2,}[\s\u0600-\u06FF]*\d{1,4}\s*$/;
  const tocStartPattern = /^\d{1,3}\s*[.،\-–]\s*[\u0600-\u06FF]/;

  const tocLines = lines.filter(l => {
    const trimmed = l.trim();
    if (articleLinePattern.test(trimmed)) return false;
    if (trimmed.length > 120) return false;
    return tocEndPattern.test(trimmed) || tocStartPattern.test(trimmed);
  });

  if (tocLines.length / lines.length >= 0.50) return true;

  return false;
}

/**
 * Detect if a chunk contains corrupted / garbled text or reversed Arabic.
 * Uses the comprehensive quality assessment from arabic-text-fix.ts.
 * Returns { corrupted, reason } for logging in admin quality reports.
 */
export function isCorruptedChunk(text: string): boolean {
  const result = assessChunkQuality(text);
  return !result.passed;
}

/** Extended corruption check that returns the reason (for admin reporting) */
export function checkChunkQuality(text: string): { passed: boolean; score: number; reasons: string[]; category: string } {
  return assessChunkQuality(text);
}

/** Split text into overlapping chunks, skipping TOC/index pages and corrupted text */
export function chunkText(text: string, chunkSize = 800, overlap = 200): string[] {
  const chunks: string[] = [];
  let start = 0;
  const normalized = text.replace(/\r\n/g, "\n").replace(/\n{3,}/g, "\n\n").trim();
  while (start < normalized.length) {
    const end = Math.min(start + chunkSize, normalized.length);
    const chunk = normalized.slice(start, end).trim();
    if (chunk.length > 50 && !isTocChunk(chunk) && !isCorruptedChunk(chunk)) chunks.push(chunk);
    if (end === normalized.length) break;
    start += chunkSize - overlap;
  }
  return chunks;
}

// ─── Embedding rate-limit constants ──────────────────────────────────────────
const EMBED_BATCH_SIZE   = 10;     // max chunks per OpenAI request
const EMBED_BATCH_DELAY  = 350;    // ms between batches
const EMBED_MAX_RETRIES  = 8;      // max attempts on 429
const EMBED_BASE_BACKOFF = 1_000;  // initial backoff ms (doubles each retry)

function sleep(ms: number): Promise<void> { return new Promise(r => setTimeout(r, ms)); }

/**
 * Estimate token count (rough: ~4 chars per token for Arabic/English mix).
 */
function estimateTokens(texts: string[]): number {
  return texts.reduce((sum, t) => sum + Math.ceil(t.length / 4), 0);
}

export interface EmbedOptions {
  fileId?:   number;                            // for structured logs
  logger?:   (entry: Record<string, unknown>) => void;
  onRetry?:  (docId: number, batchIdx: number, attempt: number) => Promise<void>;
}

/**
 * Embed a list of texts with:
 *  - small batches (10 per request) to stay within TPM
 *  - 350 ms inter-batch delay
 *  - exponential backoff (up to 8 retries) on HTTP 429
 *  - honour the `retry-after` response header
 */
export async function embedTexts(
  texts: string[],
  apiKey: string,
  opts: EmbedOptions = {},
): Promise<number[][]> {
  const openai  = new OpenAI({ apiKey });
  const result: number[][] = [];
  const { fileId, logger, onRetry } = opts;

  for (let batchIdx = 0; batchIdx * EMBED_BATCH_SIZE < texts.length; batchIdx++) {
    const batch = texts.slice(
      batchIdx * EMBED_BATCH_SIZE,
      (batchIdx + 1) * EMBED_BATCH_SIZE,
    );
    const tokenEstimate = estimateTokens(batch);

    let attempt   = 0;
    let backoff   = EMBED_BASE_BACKOFF;

    while (true) {
      try {
        logger?.({ fileId, batchNumber: batchIdx + 1, tokenEstimate, retryCount: attempt, status: "embedding" });

        const resp = await openai.embeddings.create({
          model: "text-embedding-3-small",
          input: batch,
        });
        result.push(...resp.data.map((d) => d.embedding));
        break; // success

      } catch (err: any) {
        const httpStatus = err?.status ?? err?.response?.status ?? 0;
        const errorCode  = err?.code   ?? httpStatus;

        if (httpStatus === 429 && attempt < EMBED_MAX_RETRIES) {
          attempt++;

          // Respect retry-after header if present
          const retryAfterSec = parseInt(
            err?.headers?.["retry-after"] ?? err?.response?.headers?.["retry-after"] ?? "0",
            10,
          );
          const waitMs = retryAfterSec > 0 ? retryAfterSec * 1000 : backoff;
          backoff = Math.min(backoff * 2, 64_000);

          logger?.({
            fileId, batchNumber: batchIdx + 1, tokenEstimate,
            retryCount: attempt, errorCode: 429,
            status: "retrying", waitMs,
          });

          if (onRetry && fileId != null) await onRetry(fileId, batchIdx, attempt);
          await sleep(waitMs);

        } else {
          logger?.({
            fileId, batchNumber: batchIdx + 1, tokenEstimate,
            retryCount: attempt, errorCode,
            status: "failed",
          });
          throw err;
        }
      }
    }

    // Throttle between batches to stay under TPM
    if ((batchIdx + 1) * EMBED_BATCH_SIZE < texts.length) {
      await sleep(EMBED_BATCH_DELAY);
    }
  }

  return result;
}

// ── embedQuery cache ──────────────────────────────────────────────────────────
// Key: query text (trimmed). TTL: 10 minutes.
// Avoids redundant OpenAI Embeddings API calls for repeated identical queries.
const EMBED_QUERY_CACHE_TTL_MS = 10 * 60 * 1000;
const embedQueryCache = new Map<string, { embedding: number[]; expiresAt: number }>();

function evictExpiredEmbedQueryCache(): void {
  const now = Date.now();
  for (const [key, entry] of embedQueryCache) {
    if (entry.expiresAt <= now) embedQueryCache.delete(key);
  }
}
// ─────────────────────────────────────────────────────────────────────────────

/** Embed a single query, with in-process caching (10-minute TTL) */
export async function embedQuery(query: string, apiKey: string): Promise<number[]> {
  const cacheKey = query.trim();
  const cached = embedQueryCache.get(cacheKey);
  if (cached && cached.expiresAt > Date.now()) {
    return cached.embedding;
  }

  const [emb] = await embedTexts([query], apiKey);

  evictExpiredEmbedQueryCache();
  embedQueryCache.set(cacheKey, { embedding: emb, expiresAt: Date.now() + EMBED_QUERY_CACHE_TTL_MS });

  return emb;
}

// ── rerank cache ──────────────────────────────────────────────────────────────
// Two-layer cache for the AI re-ranker:
//   L1 — in-process Map   (zero latency, wiped on restart)
//   L2 — PostgreSQL table (persistent across restarts and workers)
//
// Key:  SHA-256 hex of "<query.trim()>||<first-80-chars of each chunk joined by |>"
// TTL:  10 minutes
// Stored value: array of 0-based keep-indices (not full chunk objects)
// ─────────────────────────────────────────────────────────────────────────────

const RERANK_CACHE_TTL_MS = 10 * 60 * 1000; // 10 min

/** L1: in-memory Map — keyed by SHA-256 hex, stores keep-indices + expiry */
const rerankL1 = new Map<string, { keepIndices: number[]; expiresAt: number }>();
/**
 * Build a compact, stable cache key:
 * SHA-256 hex of "<query.trim()>||<first-80-chars of each chunk content joined by |>"
 */
function buildRerankCacheKey(query: string, contents: string[]): string {
  const raw = `${query.trim()}||${contents.map(c => c.slice(0, 80)).join("|")}`;
  return createHash("sha256").update(raw).digest("hex");
}

/** Evict expired L1 entries to prevent unbounded Map growth */
function evictExpiredL1(): void {
  const now = Date.now();
  for (const [k, v] of rerankL1) {
    if (v.expiresAt <= now) rerankL1.delete(k);
  }
}
/**
 * AI re-ranker: filters out chunks that are not topically relevant to the query.
 * Uses GPT-4o-mini in a SINGLE batched request for minimum latency.
 * Results are cached in-memory for 10 minutes keyed by (query + chunk contents)
 * so repeated identical queries skip the GPT call entirely.
 * Gracefully returns all chunks unchanged if the AI call fails.
 *
 * Labels:
 *  "نعم"  — directly relevant, keep
 *  "ربما" — tangentially relevant, keep
 *  "لا"   — unrelated, drop
 */
async function rerankChunks<T extends { content: string }>(
  query: string,
  chunks: T[],
  apiKey: string
): Promise<T[]> {
  if (chunks.length === 0) return chunks;

  const cacheKey = buildRerankCacheKey(query, chunks.map(c => c.content));
  const now = Date.now();

  // ── L1 lookup (in-memory) ──────────────────────────────────────────────────
  const l1 = rerankL1.get(cacheKey);
  if (l1 && l1.expiresAt > now) {
    return l1.keepIndices.map(i => chunks[i]).filter(Boolean) as T[];
  }

  // ── L2 lookup (PostgreSQL) ─────────────────────────────────────────────────
  try {
    const [dbRow] = await db
      .select()
      .from(rerankCacheTable)
      .where(eq(rerankCacheTable.cacheKey, cacheKey))
      .limit(1);

    if (dbRow && dbRow.expiresAt > new Date()) {
      const keepIndices = dbRow.keepIndices;
      const result = keepIndices.map((i: number) => chunks[i]).filter(Boolean) as T[];
      if (result.length > 0) {
        // Warm L1 from DB hit
        rerankL1.set(cacheKey, { keepIndices, expiresAt: dbRow.expiresAt.getTime() });
        return result;
      }
    }
  } catch {
    // DB unavailable — proceed to AI call
  }

  // ── AI re-ranking ──────────────────────────────────────────────────────────
  const openai = new OpenAI({ apiKey });

  const chunkList = chunks
    .map((c, i) => `[${i + 1}]\n${c.content.slice(0, 400)}`)
    .join("\n\n---\n\n");

  const userMsg = `أنت محكّم صلة في نظام بحث قانوني سعودي.
الاستعلام: "${query}"

قيّم صلة كل نص بالاستعلام:
• "نعم"  — النص يتناول الاستعلام مباشرةً
• "ربما" — النص ذو صلة جانبية أو سياقية
• "لا"   — النص لا علاقة له بالاستعلام (مثال: البحث عن "فسخ عقد العمل" يعيد نص عن "فسخ النكاح" → لا)

النصوص:
${chunkList}

أجب بـ JSON فقط — مصفوفة باسم "results":
{"results":[{"i":1,"r":"نعم"},{"i":2,"r":"لا"},{"i":3,"r":"ربما"},...]}`;

  try {
    const resp = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      temperature: 0,
      response_format: { type: "json_object" },
      messages: [{ role: "user", content: userMsg }],
      max_tokens: 300,
    });

    const raw = resp.choices[0]?.message?.content ?? "{}";
    let decisions: Array<{ i: number; r: string }> = [];
    try {
      const parsed = JSON.parse(raw);
      decisions = Array.isArray(parsed)
        ? parsed
        : (parsed.results ?? parsed.decisions ?? []);
    } catch {
      return chunks; // parse failed → return all
    }

    const dropSet = new Set(
      decisions.filter(d => d.r === "لا").map(d => Number(d.i) - 1)
    );

    const keepIndices = chunks
      .map((_, i) => i)
      .filter(i => !dropSet.has(i));

    // Safety net: if AI dropped everything, keep all
    const finalIndices = keepIndices.length > 0 ? keepIndices : chunks.map((_, i) => i);
    const result = finalIndices.map(i => chunks[i]) as T[];

    const expiresAt = new Date(now + RERANK_CACHE_TTL_MS);

    // ── L1 write ──
    evictExpiredL1();
    rerankL1.set(cacheKey, { keepIndices: finalIndices, expiresAt: expiresAt.getTime() });

    // ── L2 write (upsert) — fire-and-forget, non-blocking ──
    db.insert(rerankCacheTable)
      .values({ cacheKey, keepIndices: finalIndices, expiresAt })
      .onConflictDoUpdate({
        target: rerankCacheTable.cacheKey,
        set: { keepIndices: finalIndices, expiresAt },
      })
      .then(() => purgeExpiredRerankCacheRows())
      .catch(() => {}); // never block the request on DB write

    return result;
  } catch {
    // Network / API error → return all chunks unchanged
    return chunks;
  }
}

type DocCategory = "judicial" | "circular" | "regulation" | "contract" | "general";

// ═══════════════════════════════════════════════════════════════════════════════
// PHASE 1 — Unified Legal Research Engine
// Rules applied programmatically (not only in prompts):
//   1. Literal match (circular number, article number, exact phrase) ALWAYS wins
//      — no semantic threshold required for a chunk with a literal hit.
//   2. True RRF (Reciprocal Rank Fusion) merges semantic rank + keyword rank.
//   3. Multi-query: keyword scoring runs against several variants of the query
//      (original, stripped connectors, number-only, article expansion, synonyms).
//   4. Auto-link: extract article/circular refs from found chunks and attach
//      related documents that mention the same references.
// ═══════════════════════════════════════════════════════════════════════════════

// ── Legal reference detection ─────────────────────────────────────────────────
/**
 * Returns true when the query contains a specific legal reference that demands
 * literal-match priority regardless of semantic score:
 *   - Circular / decision / decree numbers (≥3 digit standalone number)
 *   - Article reference   ("المادة N", "م. N", "المادتين N و N")
 *   - Decree / resolution ("مرسوم رقم N", "قرار رقم N", "تعميم N")
 *   - Quoted exact phrase  ("..." or «...»)
 */
export function hasLegalReference(query: string): boolean {
  const n = normalizeArabic(query);
  return (
    /(?<!\d)\d{3,}(?!\d)/.test(n) ||                                // 3+ digit number
    /(المادة|الفقرة|البند|المادتان|المادتين|المواد)\s*\d/.test(n) || // article ref
    /(مرسوم|قرار|تعميم|أمر|منشور)\s*(رقم\s*)?\d/.test(n) ||        // decree/circular ref
    /["""«»].{5,}["""«»]/.test(n)                                    // quoted phrase
  );
}

// ── Connectors and noise words stripped for compact variants ──────────────────
const ARABIC_CONNECTORS = /\b(و|أو|من|في|على|عن|إلى|ب|ال|هذا|هذه|تلك|ذلك|عند|حال|بشأن|حول|نحو|بموجب)\b/g;

/**
 * Generate up to 5 query variants for multi-query keyword scoring.
 * Each variant probes a different surface form of the same intent.
 *
 * Variants:
 *   1. Original (always)
 *   2. Connectors-stripped (e.g. "فسخ و إنهاء العقد" → "فسخ إنهاء العقد")
 *   3. Numbers-only (when query contains 3+ digit numbers)
 *   4. Article expansion ("المادة 77" → "مادة 77 نص")
 *   5. Circular expansion ("تعميم 1234" → "رقم 1234 تعميم")
 */
export function generateQueryVariants(query: string): string[] {
  const seen = new Set<string>();
  const add = (v: string) => {
    const t = v.trim();
    if (t.length >= 3 && !seen.has(t)) seen.add(t);
  };

  add(query);

  // Connectors stripped
  const stripped = query.replace(ARABIC_CONNECTORS, " ").replace(/\s{2,}/g, " ").trim();
  add(stripped);

  // Numbers only (for circular / decree number lookup)
  const numbers = normalizeArabic(query).match(/(?<!\d)\d{3,}(?!\d)/g);
  if (numbers) add(numbers.join(" "));

  // Article reference expansion
  const art = normalizeArabic(query).match(/(المادة|م\.?)\s*(\d+)/);
  if (art) {
    add(`مادة ${art[2]} نص`);
    add(`المادة ${art[2]}`);
  }

  // Circular / decision number expansion
  const circ = normalizeArabic(query).match(/(تعميم|قرار|مرسوم|أمر)\s*(رقم\s*)?(\d+)/);
  if (circ) {
    add(`${circ[1]} ${circ[3]}`);
    add(`رقم ${circ[3]}`);
  }

  return [...seen].slice(0, 5);
}

// ── Reciprocal Rank Fusion ────────────────────────────────────────────────────
/**
 * RRF score for a document given its rank in two ordered lists.
 * Standard k = 60.
 * Higher is better.
 */
function rrfScore(rankA: number, rankB: number, k = 60): number {
  return 1 / (k + rankA) + 1 / (k + rankB);
}

// ── Auto-link: extract legal references from found chunks ─────────────────────
/**
 * Patterns that identify legal reference mentions inside chunk text.
 * Used to automatically search for related documents.
 */
const REF_PATTERNS = [
  /المادة\s*(\d+)/g,
  /م\.\s*(\d+)/g,
  /تعميم\s*(رقم\s*)?(\d{3,})/g,
  /قرار\s*(رقم\s*)?(\d{3,})/g,
  /مرسوم\s*(ملكي\s*)?(رقم\s*)?[م/]?\s*(\d+)/g,
];

/**
 * Extract distinct legal reference tokens from chunk content.
 * Returns strings like "المادة 77", "تعميم 1234", "مرسوم م/53".
 */
export function extractLegalRefs(content: string): string[] {
  const refs = new Set<string>();
  const n = normalizeArabic(content);
  for (const pat of REF_PATTERNS) {
    let m: RegExpExecArray | null;
    pat.lastIndex = 0;
    while ((m = pat.exec(n)) !== null) {
      refs.add(m[0].trim().slice(0, 30));
    }
  }
  return [...refs];
}

export interface RelevantChunk {
  content: string;
  documentName: string;
  documentId: number;
  similarity: number;
  pageStart?: number | null;
  pageEnd?: number | null;
  caseMetadata?: Record<string, any> | null;
  /** true when chunk matched by literal (number / exact phrase) — no semantic threshold applied */
  literalMatch?: boolean;
  /** legal references extracted from this chunk for auto-linking */
  extractedRefs?: string[];
}

/** Max candidate chunks fetched via SQL FTS before loading embeddings */
const FTS_CANDIDATE_LIMIT = 300;
/**
 * Find the top-K most relevant knowledge chunks for a given query.
 * Phase 1 rules:
 *   - FTS pre-filter: keyword matching runs in PostgreSQL (search_vector @@ tsquery)
 *     so only matching chunks are loaded — no full table scan in application memory.
 *   - Multi-query: keyword scored against up to 5 variants; best score used.
 *   - Literal match: any chunk with exact phrase or 3+ digit number match
 *     ALWAYS passes the threshold filter (semantic score not required).
 *   - RRF: final ranking uses Reciprocal Rank Fusion of semantic rank + keyword rank.
 *   - Auto-link: when opts.autoLink=true, extracts refs from top chunks and
 *     fetches related documents that mention those refs.
 */
export async function retrieveRelevantChunks(
  query: string,
  apiKey: string,
  topK = 5,
  minSimilarity = 0.42,
  category?: DocCategory,
  opts: { multiQuery?: boolean; autoLink?: boolean; excludeCategories?: string[]; excludeTelegramDocs?: boolean } = {},
): Promise<RelevantChunk[]> {
  const { multiQuery = true, autoLink = false, excludeCategories = [], excludeTelegramDocs = false } = opts;

  // ── Document-level WHERE clause (shared by main query + auto-link) ───────────
  const docWhere = and(
    eq(knowledgeDocumentsTable.status, "indexed"),
    isNull(knowledgeDocumentsTable.archivedAt),
    ...(category ? [eq(knowledgeDocumentsTable.category as any, category)] : []),
    ...(excludeCategories.length > 0
      ? [sql`${knowledgeDocumentsTable.category} NOT IN (${sql.join(excludeCategories.map(c => sql`${c}`), sql`, `)})`]
      : []),
    ...(excludeTelegramDocs
      ? [sql`${(knowledgeDocumentsTable as any).sourceType} != 'telegram'`]
      : []),
  );

  // ── FTS pre-filter: run text matching in SQL, collect candidate chunk IDs ────
  // This avoids loading all embeddings into memory when the KB is large.
  // Falls back to full load if the FTS column is not yet populated or returns
  // fewer than topK matches (which signals a purely semantic / conceptual query).
  let candidateIds: number[] | null = null;
  try {
    const normalizedQuery = normalizeArabic(query.trim());
    if (normalizedQuery.length >= 2) {
      const ftsResult = await db.execute(sql`
        SELECT kc.id
        FROM   knowledge_chunks    kc
        INNER JOIN knowledge_documents kd ON kc.document_id = kd.id
        WHERE  kd.status      = 'indexed'
          AND  kd.archived_at IS NULL
          ${category ? sql`AND kd.category = ${category}` : sql``}
          ${excludeCategories.length > 0
            ? sql`AND kd.category NOT IN (${sql.join(excludeCategories.map(c => sql`${c}`), sql`, `)})`
            : sql``}
          ${excludeTelegramDocs ? sql`AND kd.source_type != 'telegram'` : sql``}
          AND  kc.search_vector IS NOT NULL
          AND  kc.search_vector @@ plainto_tsquery('simple', ${normalizedQuery})
        ORDER BY ts_rank(kc.search_vector, plainto_tsquery('simple', ${normalizedQuery})) DESC
        LIMIT  ${FTS_CANDIDATE_LIMIT}
      `);
      const ids = (ftsResult.rows as Array<{ id: number | string }>).map(r => Number(r.id));
      // Use FTS candidates only when we have at least topK hits.
      // Fewer hits → conceptual/semantic query → fall back to full load.
      if (ids.length >= topK) {
        candidateIds = ids;
      }
    }
  } catch {
    // search_vector column not yet populated or other transient error → full load
    candidateIds = null;
  }

  // Short-circuit: FTS returned 0 results and we attempted a non-trivial query
  // while candidateIds is explicitly [] (not null) — would produce IN () SQL error.
  // (candidateIds is only assigned when ids.length >= topK, so this is defensive.)
  if (candidateIds !== null && candidateIds.length === 0) return [];

  // ── Load chunks (FTS-filtered set or full table) ─────────────────────────────
  const chunkWhere = and(
    docWhere,
    ...(candidateIds !== null ? [inArray(knowledgeChunksTable.id, candidateIds)] : []),
  );

  const rows = await db
    .select({
      content:      knowledgeChunksTable.content,
      embedding:    knowledgeChunksTable.embedding,
      documentId:   knowledgeChunksTable.documentId,
      pageStart:    knowledgeChunksTable.pageStart,
      pageEnd:      knowledgeChunksTable.pageEnd,
      caseMetadata: knowledgeDocumentsTable.caseMetadata,
    })
    .from(knowledgeChunksTable)
    .innerJoin(knowledgeDocumentsTable, eq(knowledgeChunksTable.documentId, knowledgeDocumentsTable.id))
    .where(chunkWhere);

  if (rows.length === 0) return [];

  // ── Embed the main query (single OpenAI call) ─────────────────────────────
  const queryEmb = await embedQuery(query, apiKey);

  // ── Build query variants for keyword scoring ──────────────────────────────
  const variants = multiQuery ? generateQueryVariants(query) : [query];
  const queryHasRef = hasLegalReference(query);

  // ── Score every chunk ─────────────────────────────────────────────────────
  type ScoredRow = {
    content: string; documentId: number;
    pageStart: number | null; pageEnd: number | null;
    caseMetadata: Record<string, any> | null;
    semScore: number; textScore: number; combined: number;
    isLiteral: boolean;
  };

  const scored: ScoredRow[] = rows
    .filter((r) => Array.isArray(r.embedding) && (r.embedding as number[]).length > 0)
    .map((r) => {
      const semScore = cosineSimilarity(queryEmb, r.embedding as number[]);

      // Multi-query keyword: best score across all variants
      let textScore = fullTextScore(query, r.content);
      if (multiQuery && variants.length > 1) {
        for (let i = 1; i < variants.length; i++) {
          const s = fullTextScore(variants[i], r.content);
          if (s > textScore) textScore = s;
        }
      }

      const combined = hybridScore(semScore, textScore);

      // Literal match: exact phrase (textScore=1.0) OR
      // query has a 3+ digit reference AND this chunk has a strong text hit
      const isLiteral = textScore >= 1.0 || (queryHasRef && textScore >= 0.55);

      return {
        content:      r.content,
        documentId:   r.documentId,
        pageStart:    r.pageStart   ?? null,
        pageEnd:      r.pageEnd     ?? null,
        caseMetadata: r.caseMetadata ?? null,
        semScore, textScore, combined, isLiteral,
      };
    });

  // ── RRF ranking ───────────────────────────────────────────────────────────
  // Build rank maps from two independent orderings
  const bySem  = [...scored].sort((a, b) => b.semScore  - a.semScore);
  const byText = [...scored].sort((a, b) => b.textScore - a.textScore);

  const semRank  = new Map(bySem .map((r, i) => [r.content, i]));
  const textRank = new Map(byText.map((r, i) => [r.content, i]));

  const withRrf = scored.map(r => ({
    ...r,
    rrf: rrfScore(
      semRank.get(r.content)  ?? 9999,
      textRank.get(r.content) ?? 9999,
    ),
  }));

  // ── Filter (Phase 1 rule: literal always passes) ──────────────────────────
  const filtered = withRrf
    .filter((r) => {
      // ❶ Literal match — always passes, no semantic requirement
      if (r.isLiteral) return true;
      // ❷ Semantic threshold
      return r.semScore >= minSimilarity;
    })
    .filter((r) => !isTocChunk(r.content))
    .filter((r) => !isCorruptedChunk(r.content));

  if (filtered.length === 0) return [];

  // ── Sort by RRF, boost literal matches to top ─────────────────────────────
  const sorted = filtered
    .map(r => ({
      ...r,
      finalRrf: r.isLiteral ? r.rrf + 1.0 : r.rrf, // +1 guarantees literal > any non-literal
    }))
    .sort((a, b) => b.finalRrf - a.finalRrf)
    .slice(0, topK * 2); // fetch extra before re-rank

  // ── AI re-ranking (drops topically unrelated) ─────────────────────────────
  const reranked = sorted.length > 1
    ? await rerankChunks(query, sorted, apiKey)
    : sorted;

  const topChunks = reranked.slice(0, topK);

  // ── Resolve document names ────────────────────────────────────────────────
  const docIds = [...new Set(topChunks.map((s) => s.documentId))];
  const docs = await db
    .select({ id: knowledgeDocumentsTable.id, filename: knowledgeDocumentsTable.filename })
    .from(knowledgeDocumentsTable)
    .where(inArray(knowledgeDocumentsTable.id, docIds));
  const docMap = new Map(docs.map((d) => [d.id, d.filename]));

  const primary: RelevantChunk[] = topChunks.map((s) => ({
    content:      s.content,
    documentName: docMap.get(s.documentId) ?? "مستند",
    documentId:   s.documentId,
    similarity:   Math.max(s.combined, s.isLiteral ? 0.92 : 0),
    pageStart:    s.pageStart ?? null,
    pageEnd:      s.pageEnd   ?? null,
    caseMetadata: s.caseMetadata ?? null,
    literalMatch: s.isLiteral,
    extractedRefs: s.isLiteral ? extractLegalRefs(s.content) : undefined,
  }));

  // ── Auto-link: expand with related documents (opt-in) ────────────────────
  if (!autoLink || primary.length === 0) return primary;

  // Collect refs from top chunks; search for documents mentioning them
  const allRefs = primary.flatMap(c => c.extractedRefs ?? []);
  const uniqueRefs = [...new Set(allRefs)].slice(0, 4);
  if (uniqueRefs.length === 0) return primary;

  const linkedChunks: RelevantChunk[] = [];
  const primaryDocIds = new Set(primary.map(c => c.documentId));

  for (const ref of uniqueRefs) {
    const refRows = await db
      .select({
        content:      knowledgeChunksTable.content,
        documentId:   knowledgeChunksTable.documentId,
        pageStart:    knowledgeChunksTable.pageStart,
        pageEnd:      knowledgeChunksTable.pageEnd,
        caseMetadata: knowledgeDocumentsTable.caseMetadata,
      })
      .from(knowledgeChunksTable)
      .innerJoin(knowledgeDocumentsTable, eq(knowledgeChunksTable.documentId, knowledgeDocumentsTable.id))
      .where(and(docWhere));

    const refNorm = normalizeArabic(ref);
    const related = refRows
      .filter(r => normalizeArabic(r.content).includes(refNorm))
      .filter(r => !primaryDocIds.has(r.documentId))
      .slice(0, 2);

    const relDocIds = [...new Set(related.map(r => r.documentId))];
    const relDocs = await db
      .select({ id: knowledgeDocumentsTable.id, filename: knowledgeDocumentsTable.filename })
      .from(knowledgeDocumentsTable).where(inArray(knowledgeDocumentsTable.id, relDocIds));
    const relDocMap = new Map(relDocs.map(d => [d.id, d.filename]));

    for (const r of related) {
      linkedChunks.push({
        content:      r.content,
        documentName: relDocMap.get(r.documentId) ?? "مستند مرتبط",
        documentId:   r.documentId,
        similarity:   0.75,   // fixed score for auto-linked results
        pageStart:    r.pageStart ?? null,
        pageEnd:      r.pageEnd   ?? null,
        caseMetadata: r.caseMetadata ?? null,
        literalMatch: true,
        extractedRefs: [ref],
      });
      primaryDocIds.add(r.documentId);
    }
  }

  return [...primary, ...linkedChunks];
}

/** Delete expired rows from the DB (called opportunistically) */
async function purgeExpiredRerankCacheRows(): Promise<void> {
  try {
    await db.delete(rerankCacheTable).where(lt(rerankCacheTable.expiresAt, new Date()));
  } catch {
    // Non-critical — ignore failures
  }
}
