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
const tavilyL1 = new Map<string, L1Entry>();

const inFlight = new Map<string, Promise<LegalSearchResult[]>>();

function queryCacheKey(query: string): string {
  const normalised = query.trim().toLowerCase().replace(/\s+/g, " ");
  return createHash("sha256").update(normalised).digest("hex");
}

function evictExpiredL1(): void {
  const now = Date.now();
  for (const [key, entry] of tavilyL1) {
    if (entry.expiresAt <= now) tavilyL1.delete(key);
  }
}

async function purgeExpiredDbRows(): Promise<void> {
  try {
    await db.delete(tavilyCacheTable).where(lt(tavilyCacheTable.expiresAt, new Date()));
  } catch {
    // best-effort — never block the request
  }
}

interface TavilyStats {
  httpErrorCount: number;
  networkErrorCount: number;
  lastErrorAt: string | null;
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

export function getTavilyStats(): Readonly<TavilyStats> {
  return { ...tavilyStats };
}

const LEGAL_DOMAINS = [
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
  "uaelegislation.gov.ae",
  "moj.gov.ae",
  "adjd.gov.ae",
  "almeezan.qa",
  "moj.gov.qa",
  "legalaffairs.gov.bh",
  "moj.gov.bh",
  "moj.gov.om",
  "moj.gov.kw",
  "qanoniah.com",
  "sadr.org",
];

export interface LegalSearchResult {
  title: string;
  url: string;
  content: string;
  score: number;
}

export function isLiveLegalVerificationConfigured(): boolean {
  return typeof process.env.TAVILY_API_KEY === "string" && process.env.TAVILY_API_KEY.trim().length > 0;
}

export function isSubstantiveLegalQuery(message: string): boolean {
  const msg = message.trim();
  if (msg.length < 25) return false;

  const skipPatterns = [
    /^(مرحبا|أهلا|هلا|صباح|مساء|شكرا|شكراً|تمام|حسنا|حسناً|نعم|لا)\b/,
    /^(hello|hi|thanks|ok|yes|no)\b/i,
  ];
  if (skipPatterns.some((p) => p.test(msg))) return false;

  const legalKeywords = [
    "نظام", "مادة", "قانون", "لائحة", "قرار", "حق", "حقوق", "التزام",
    "عقد", "دعوى", "محكمة", "طلاق", "نفقة", "عمل", "موظف", "شركة",
    "جريمة", "عقوبة", "ضريبة", "تعميم", "مرسوم", "حكم", "استئناف",
    "تعويض", "ميراث", "وصية", "وقف", "ملكية", "إيجار", "رهن",
    "براءة", "علامة تجارية", "تأمين", "مصرف", "بنك", "استثمار",
  ];
  return legalKeywords.some((kw) => msg.includes(kw));
}

export async function searchLegalSources(
  query: string,
  maxResults = 4
): Promise<LegalSearchResult[]> {
  const apiKey = process.env.TAVILY_API_KEY;
  if (!isSubstantiveLegalQuery(query)) return [];
  if (!apiKey?.trim()) {
    throw Object.assign(
      new Error("Live legal verification is not configured"),
      { tavilyConfigurationError: true },
    );
  }

  evictExpiredL1();
  const cacheKey = queryCacheKey(query);
  const l1 = tavilyL1.get(cacheKey);
  if (l1 && l1.expiresAt > Date.now()) {
    return l1.results;
  }

  try {
    const [dbRow] = await db
      .select()
      .from(tavilyCacheTable)
      .where(eq(tavilyCacheTable.cacheKey, cacheKey))
      .limit(1);

    if (dbRow && dbRow.expiresAt > new Date()) {
      const results = dbRow.results as LegalSearchResult[];
      tavilyL1.set(cacheKey, { results, expiresAt: dbRow.expiresAt.getTime() });
      return results;
    }
  } catch {
    // DB unavailable — proceed to Tavily call
  }

  const existing = inFlight.get(cacheKey);
  if (existing) return existing;

  const promise = (async (): Promise<LegalSearchResult[]> => {
    try {
      const requestedResults = Number.isInteger(maxResults)
        ? Math.min(Math.max(maxResults, 1), 20)
        : 4;
      const response = await fetch("https://api.tavily.com/search", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${apiKey.trim()}`,
        },
        body: JSON.stringify({
          query,
          search_depth: "advanced",
          include_domains: LEGAL_DOMAINS,
          max_results: requestedResults,
          include_raw_content: false,
          include_answer: false,
          include_images: false,
        }),
        signal: AbortSignal.timeout(8000),
      });

      if (!response.ok) {
        const responseBody = await response.json().catch(() => null) as {
          detail?: { error?: unknown } | unknown;
          error?: unknown;
        } | null;
        const rawReason =
          typeof responseBody?.detail === "object" && responseBody.detail !== null &&
          "error" in responseBody.detail && typeof responseBody.detail.error === "string"
            ? responseBody.detail.error
            : typeof responseBody?.error === "string"
              ? responseBody.error
              : "No provider diagnostic returned";
        const safeReason = rawReason
          .replace(/[\r\n\t]/g, " ")
          .replace(/(?:tvly|sk)-[A-Za-z0-9_\-]+/g, "[redacted]")
          .slice(0, 320);

        tavilyStats.httpErrorCount += 1;
        tavilyStats.lastErrorAt = new Date().toISOString();
        tavilyStats.lastHttpStatus = response.status;
        tavilyStats.lastErrorMessage = `HTTP ${response.status}: ${safeReason}`;
        console.warn(JSON.stringify({
          msg: "Tavily request rejected",
          tavilyStatus: response.status,
          tavilyReason: safeReason,
        }));
        throw Object.assign(
          new Error(`Tavily HTTP error ${response.status}`),
          { tavilyStatus: response.status, tavilyReason: safeReason },
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
        .filter((r) => r.score && r.score > 0.3)
        .map((r) => ({
          title: r.title ?? "",
          url: r.url ?? "",
          content: (r.content ?? "").slice(0, 600),
          score: r.score ?? 0,
        }));

      const expiresAt = new Date(Date.now() + CACHE_TTL_MS);
      evictExpiredL1();
      tavilyL1.set(cacheKey, { results, expiresAt: expiresAt.getTime() });

      db.insert(tavilyCacheTable)
        .values({ cacheKey, results, expiresAt })
        .onConflictDoUpdate({
          target: tavilyCacheTable.cacheKey,
          set: { results, expiresAt },
        })
        .then(() => purgeExpiredDbRows())
        .catch(() => {});

      return results;
    } catch (err: any) {
      if (err?.tavilyStatus !== undefined) throw err;
      tavilyStats.networkErrorCount += 1;
      tavilyStats.lastErrorAt = new Date().toISOString();
      tavilyStats.lastHttpStatus = null;
      tavilyStats.lastErrorMessage = err?.message ?? "network error";
      console.error(
        JSON.stringify({ msg: "Tavily network/timeout error", tavilyError: err?.message ?? "unknown" }),
      );
      throw Object.assign(
        new Error(`Tavily network error: ${err?.message ?? "unknown"}`),
        { tavilyNetworkError: true },
      );
    } finally {
      inFlight.delete(cacheKey);
    }
  })();

  inFlight.set(cacheKey, promise);
  return promise;
}

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
