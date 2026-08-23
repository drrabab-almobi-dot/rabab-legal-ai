/**
 * Tavily Legal Web Search
 * Searches official Saudi/Gulf legal sources in real-time to augment AI answers
 * with verified, up-to-date regulatory content.
 */

import { createHash } from "crypto";
import { db, tavilyCacheTable } from "@workspace/db";
import { eq, lt } from "drizzle-orm";

// ── Cache config ─────────────────────────────────────────────────────────────
const CACHE_TTL_MS = 15 * 60 * 1000; // 15 min

interface L1Entry {
  results: LegalSearchResult[];
  expiresAt: number;
}

// ── L1: In-process cache (survives within the same worker) ───────────────────
interface L1Entry {
  results: LegalSearchResult[];
  expiresAt: number;
}
const tavilyL1 = new Map<string, L1Entry>();

// ── In-flight dedup map — prevents concurrent cold misses from each calling
// Tavily independently for the same query within a single process.
// Key = cache key, Value = the single in-flight Promise for that key.
const inFlight = new Map<string, Promise<LegalSearchResult[]>>();

/** Stable cache key = SHA-256 of the normalised query (lowercased, collapsed whitespace). */
function queryCacheKey(query: string): string {
  const normalised = query.trim().toLowerCase().replace(/\s+/g, " ");
  return createHash("sha256").update(normalised).digest("hex");
}

/** Remove stale L1 entries so the Map doesn't grow indefinitely. */
function evictExpiredL1(): void {
  const now = Date.now();
  for (const [key, entry] of tavilyL1) {
    if (entry.expiresAt <= now) tavilyL1.delete(key);
  }
}

/** Purge expired rows from PostgreSQL (fire-and-forget). */
async function purgeExpiredDbRows(): Promise<void> {
  try {
    await db.delete(tavilyCacheTable).where(lt(tavilyCacheTable.expiresAt, new Date()));
  } catch {
    // best-effort — never block the request
  }
}
// ─────────────────────────────────────────────────────────────────────────────

// ── In-memory Tavily error stats ──────────────────────────────────────────────
// Tracks HTTP-level failures (rate limits, expired keys, etc.) separately from
// network timeouts.  Exported so health/diagnostics endpoints can surface them.
interface TavilyStats {
  httpErrorCount: number;
  networkErrorCount: number;
  lastErrorAt: string | null;   // ISO timestamp
  lastHttpStatus: number | null;
  lastErrorMessage: string | null;
}

const tavilyStats: TavilyStats = {
  httpErrorCount: 0,
  networkErrorCount: 0,
  lastErrorAt: null,
  lastHttpStatus: null,
  lastErrorMessage: null,
};

/** Returns a safe snapshot of Tavily failure counters for monitoring endpoints. */
export function getTavilyStats(): Readonly<TavilyStats> {
  return { ...tavilyStats };
}
// ─────────────────────────────────────────────────────────────────────────────

// Official Saudi & GCC legal domains only
const LEGAL_DOMAINS = [
  // 🇸🇦 Saudi Arabia — official
  "laws.boe.gov.sa",
  "moj.gov.sa",
  "laws.moj.gov.sa",
  "hrsd.gov.sa",
  "sama.gov.sa",
  "zatca.gov.sa",
  "saip.gov.sa",
  "rega.gov.sa",
  "mc.gov.sa",
  "commercialcourts.gov.sa",
  "bog.gov.sa",
  "pp.gov.sa",
  "cma.org.sa",
  "sba.gov.sa",
  "najiz.sa",
  "ejar.sa",
  // 🌍 GCC
  "uaelegislation.gov.ae",
  "moj.gov.ae",
  "adjd.gov.ae",
  "almeezan.qa",
  "moj.gov.qa",
  "legalaffairs.gov.bh",
  "moj.gov.bh",
  "moj.gov.om",
  "moj.gov.kw",
  // Specialized legal platforms
  "qanoniah.com",
  "sadr.org",
];

export interface LegalSearchResult {
  title: string;
  url: string;
  content: string;
  score: number;
}

/**
 * Detects if a message is a substantive legal question worth searching for.
 * Avoids wasting Tavily credits on greetings or very short messages.
 */
function isSubstantiveLegalQuery(message: string): boolean {
  const msg = message.trim();
  if (msg.length < 25) return false;

  // Skip obvious non-legal chatter
  const skipPatterns = [
    /^(مرحبا|أهلا|هلا|صباح|مساء|شكرا|شكراً|تمام|حسنا|حسناً|نعم|لا)\b/,
    /^(hello|hi|thanks|ok|yes|no)\b/i,
  ];
  if (skipPatterns.some((p) => p.test(msg))) return false;

  // Check for legal keywords
  const legalKeywords = [
    "نظام", "مادة", "قانون", "لائحة", "قرار", "حق", "حقوق", "التزام",
    "عقد", "دعوى", "محكمة", "طلاق", "نفقة", "عمل", "موظف", "شركة",
    "جريمة", "عقوبة", "ضريبة", "تعميم", "مرسوم", "حكم", "استئناف",
    "تعويض", "ميراث", "وصية", "وقف", "ملكية", "إيجار", "رهن",
    "براءة", "علامة تجارية", "تأمين", "مصرف", "بنك", "استثمار",
  ];
  return legalKeywords.some((kw) => msg.includes(kw));
}

/**
 * Search official GCC legal sources via Tavily and return formatted context.
 *
 * Uses a two-level cache (L1 in-process + L2 PostgreSQL) and in-flight dedup
 * to avoid redundant Tavily API calls across parallel requests and server
 * restarts.  Throws a structured error (with tavilyStatus or tavilyNetworkError)
 * on any failure so callers can surface a notice to the user.
 */
export async function searchLegalSources(
  query: string,
  maxResults = 4
): Promise<LegalSearchResult[]> {
  const apiKey = process.env.TAVILY_API_KEY;
  if (!apiKey) return [];
  if (!isSubstantiveLegalQuery(query)) return [];

  // ── L1 cache lookup (in-process) ─────────────────────────────────────────
  evictExpiredL1();
  const cacheKey = queryCacheKey(query);
  const l1 = tavilyL1.get(cacheKey);
  if (l1 && l1.expiresAt > Date.now()) {
    return l1.results; // L1 hit — no Tavily credit consumed
  }

  // ── L2 cache lookup (PostgreSQL — survives restarts & parallel workers) ──
  try {
    const [dbRow] = await db
      .select()
      .from(tavilyCacheTable)
      .where(eq(tavilyCacheTable.cacheKey, cacheKey))
      .limit(1);

    if (dbRow && dbRow.expiresAt > new Date()) {
      const results = dbRow.results as LegalSearchResult[];
      // Warm L1 from DB hit
      tavilyL1.set(cacheKey, { results, expiresAt: dbRow.expiresAt.getTime() });
      return results; // L2 hit — no Tavily credit consumed
    }
  } catch {
    // DB unavailable — proceed to Tavily call
  }
  // ─────────────────────────────────────────────────────────────────────────

  // ── In-flight dedup — if another request is already fetching the same key,
  // piggyback on it instead of issuing a second Tavily call. ────────────────
  const existing = inFlight.get(cacheKey);
  if (existing) return existing;

  const promise = (async (): Promise<LegalSearchResult[]> => {
    try {
      const response = await fetch("https://api.tavily.com/search", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          api_key: apiKey,
          query: query,
          search_depth: "advanced",
          include_domains: LEGAL_DOMAINS,
          max_results: maxResults,
          include_raw_content: false,
          include_answer: false,
          include_images: false,
        }),
        signal: AbortSignal.timeout(8000), // 8s timeout — don't block chat
      });

      if (!response.ok) {
        // Record structured stats so monitoring endpoints can surface this
        tavilyStats.httpErrorCount += 1;
        tavilyStats.lastErrorAt = new Date().toISOString();
        tavilyStats.lastHttpStatus = response.status;
        tavilyStats.lastErrorMessage = `HTTP ${response.status}`;
        // Throw so callers know this was an API-level failure (not "zero results")
        throw Object.assign(
          new Error(`Tavily HTTP error ${response.status}`),
          { tavilyStatus: response.status },
        );
      }

      const data = (await response.json()) as {
        results?: Array<{
          title?: string;
          url?: string;
          content?: string;
          score?: number;
        }>;
      };

      const results = (data.results ?? [])
        .filter((r) => r.score && r.score > 0.3) // only relevant results
        .map((r) => ({
          title: r.title ?? "",
          url: r.url ?? "",
          content: (r.content ?? "").slice(0, 600), // cap per result
          score: r.score ?? 0,
        }));

      const expiresAt = new Date(Date.now() + CACHE_TTL_MS);

      // ── L1 write ────────────────────────────────────────────────────────
      evictExpiredL1();
      tavilyL1.set(cacheKey, { results, expiresAt: expiresAt.getTime() });

      // ── L2 write (PostgreSQL upsert) — fire-and-forget, non-blocking ────
      db.insert(tavilyCacheTable)
        .values({ cacheKey, results, expiresAt })
        .onConflictDoUpdate({
          target: tavilyCacheTable.cacheKey,
          set: { results, expiresAt },
        })
        .then(() => purgeExpiredDbRows())
        .catch(() => {}); // never block the request on DB write

      return results;
    } catch (err: any) {
      // Re-throw HTTP errors (rate-limit, expired key, etc.) — callers handle these
      if (err?.tavilyStatus !== undefined) throw err;
      // Network error or timeout — record stats, log, then throw so callers can
      // set tavilyFailed and surface the unavailability notice to the user.
      tavilyStats.networkErrorCount += 1;
      tavilyStats.lastErrorAt = new Date().toISOString();
      tavilyStats.lastHttpStatus = null;
      tavilyStats.lastErrorMessage = err?.message ?? "network error";
      // Log with a structured field for server-side visibility
      console.error(
        JSON.stringify({ msg: "Tavily network/timeout error", tavilyError: err?.message ?? "unknown" }),
      );
      throw Object.assign(
        new Error(`Tavily network error: ${err?.message ?? "unknown"}`),
        { tavilyNetworkError: true },
      );
    } finally {
      // Always release the in-flight slot so future requests use fresh cache
      inFlight.delete(cacheKey);
    }
  })();

  inFlight.set(cacheKey, promise);
  return promise;
}

/**
 * Format search results as a system context block for OpenAI.
 */
export function formatSearchContext(results: LegalSearchResult[]): string {
  if (results.length === 0) return "";

  const blocks = results
    .map(
      (r, i) =>
        `[مصدر رسمي ${i + 1}: ${r.title}]\n` +
        `الرابط: ${r.url}\n` +
        `${r.content}`
    )
    .join("\n\n---\n\n");

  return (
    `فيما يلي نتائج بحث فوري في المصادر القانونية الرسمية السعودية والخليجية — ` +
    `استخدمها لتأكيد المواد النظامية وتحديث إجابتك بأحدث المراجع:\n\n` +
    blocks
  );
}
