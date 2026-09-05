/**
 * Proactive RAG — pre-fetch knowledge-base chunks at consultation creation time.
 *
 * When a consultation has a specialized taskType (e.g. labor_dispute, arbitration,
 * enforcement), we run retrieveRelevantChunks immediately with query terms derived
 * from the taskType + taskParams and cache the result for 15 minutes.
 *
 * On the first chat message the cached chunks are injected before the regular RAG
 * pass, annotated with [مسترجع مسبقاً] so the model knows they were pre-fetched.
 *
 * SECURITY NOTE: Proactive search always respects the same category exclusion
 * controls as the regular RAG path. Exclusion settings are fetched fresh from
 * the DB at trigger time and stored with the cache entry. Before injecting,
 * chat.ts verifies the current request exclusions are not stricter than those
 * used to build the cache.
 */

import { retrieveRelevantChunks, type RelevantChunk } from "./rag";
import { searchLegalSources, type LegalSearchResult } from "./legal-search";

// ─── Types ────────────────────────────────────────────────────────────────────

export interface ProactiveSearchOptions {
  /** Override exclusion settings (used in tests / admin calls). When omitted the
   *  function fetches the current platform visibility settings from the DB. */
  excludeCategories?: string[];
}

/** What is stored per-consultation in the cache. */
interface CacheEntry {
  chunks: RelevantChunk[];
  /** Proactively fetched Tavily web results (may be empty). */
  tavilyResults: LegalSearchResult[];
  /** The excludeCategories value used when this cache entry was built. */
  excludeCategories: string[];
  expiresAt: number;
}

/** Return type of {@link getProactiveCachedChunks}. */
export interface ProactiveCacheHit {
  chunks: RelevantChunk[];
  tavilyResults: LegalSearchResult[];
}
const CACHE_TTL_MS = 15 * 60 * 1_000; // 15 minutes

const proactiveCache = new Map<number, CacheEntry>();

/** Consultations whose proactive search is currently running (not yet cached). */
const inProgressSearches = new Set<number>();

/**
 * Returns true while the proactive search for a consultation is still running.
 * Returns false once the search has completed (chunks cached) or was never triggered.
 */
export function isProactiveSearchInProgress(consultationId: number): boolean {
  return inProgressSearches.has(consultationId);
}

/** Remove expired entries (called before each write). */
function evictExpired(): void {
  const now = Date.now();
  for (const [key, entry] of proactiveCache) {
    if (entry.expiresAt <= now) proactiveCache.delete(key);
  }
}

// ─── Lazy imports for platform settings (avoid circular imports) ───────────────
async function resolveExclusions(
  opts: ProactiveSearchOptions,
): Promise<{ excludeCategories: string[] }> {
  if (opts.excludeCategories !== undefined) return { excludeCategories: opts.excludeCategories };

  // Fetch live settings from the DB (same logic as chat.ts)
  const { getSectionVisibility } = await import("../routes/platform-settings");

  const visibility = await getSectionVisibility().catch(() => null);

  const excludeCategories: string[] = opts.excludeCategories ?? [];
  if (opts.excludeCategories === undefined) {
    if (!visibility?.showJudicial) excludeCategories.push("judicial");
    if (!visibility?.showCirculars) excludeCategories.push("circular");
    // legal_blog is NOT a valid document_category enum value — legal codex content
    // lives in the separate legal_codices table, not in knowledge_documents.
  }

  return { excludeCategories };
}

// ─── Task-type → search query mapping ────────────────────────────────────────

/**
 * Build a focused Arabic search query from a taskType + taskParams pair.
 * Returns null for task types that don't benefit from proactive KB search
 * (e.g. peer_review, which operates on user-provided text, not KB content).
 */
export function buildProactiveQuery(
  taskType: string,
  taskParams: Record<string, string>,
): string | null {
  // Helper: pull first non-empty value from params keys
  const pick = (...keys: string[]) =>
    keys.map(k => (taskParams[k] ?? "").trim()).find(Boolean) ?? "";

  switch (taskType) {
    case "labor_dispute":
      return [
        "نظام العمل السعودي مكافأة نهاية الخدمة فسخ عقد العمل",
        pick("service_details", "facts"),
      ].filter(Boolean).join(" — ").slice(0, 300);

    case "arbitration":
      return [
        "نظام التحكيم السعودي هيئة التحكيم مركز التسوية اتفاق التحكيم",
        pick("arbitration_clause", "facts"),
      ].filter(Boolean).join(" — ").slice(0, 300);

    case "arbitration_session_management":
      return [
        "نظام التحكيم السعودي إدارة جلسات التحكيم الإجراءات هيئة التحكيم",
        pick("arbitration_session_details", "events"),
      ].filter(Boolean).join(" — ").slice(0, 300);

    case "arbitration_minutes":
      return [
        "نظام التحكيم السعودي محضر جلسة التحكيم الإجراءات",
        pick("session_notes"),
      ].filter(Boolean).join(" — ").slice(0, 300);

    case "arbitration_award_analysis":
      return [
        "نظام التحكيم السعودي حكم التحكيم بطلان تنفيذ تصحيح تفسير",
        pick("arbitration_award"),
      ].filter(Boolean).join(" — ").slice(0, 300);

    case "enforcement":
      return [
        "نظام التنفيذ السند التنفيذي حجز أموال التنفيذ القضائي",
        pick("enforcement_deed", "facts"),
      ].filter(Boolean).join(" — ").slice(0, 300);

    case "commercial_dispute":
      return [
        "نظام المحاكم التجارية العقود التجارية نزاع تجاري",
        pick("facts"),
      ].filter(Boolean).join(" — ").slice(0, 300);

    case "real_estate_dispute":
      return [
        "نظام التسجيل العقاري الصكوك العقارية حقوق عينية نزاع عقاري",
        pick("property_info", "facts"),
      ].filter(Boolean).join(" — ").slice(0, 300);

    case "contract_termination":
      return [
        "فسخ العقد إنهاء العقد الشرط الجزائي الإخلال الجوهري",
        pick("termination_clause", "facts"),
      ].filter(Boolean).join(" — ").slice(0, 300);

    case "contractual_liability":
      return [
        "المسؤولية العقدية الإخلال بالالتزام التعويض العقدي",
        pick("contract_terms", "facts"),
      ].filter(Boolean).join(" — ").slice(0, 300);

    case "tortious_liability":
      return [
        "المسؤولية التقصيرية الضرر الإهمال التعويض التقصيري",
        pick("facts"),
      ].filter(Boolean).join(" — ").slice(0, 300);

    case "personal_status":
      return [
        "نظام الأحوال الشخصية النفقة الحضانة الطلاق",
        pick("facts"),
      ].filter(Boolean).join(" — ").slice(0, 300);

    case "evidence_analysis":
      return [
        "نظام الإثبات المستند الرسمي الإثبات الإلكتروني الشهادة",
        pick("documents", "facts"),
      ].filter(Boolean).join(" — ").slice(0, 300);

    case "jurisdiction":
      return [
        "الاختصاص القضائي المحكمة التجارية المحكمة العمالية تنازع الاختصاص",
        pick("dispute_type", "facts"),
      ].filter(Boolean).join(" — ").slice(0, 300);

    case "deadlines":
      return [
        "مدد التقادم المواعيد الإجرائية التقادم الاستئناف",
        pick("dispute_type", "facts"),
      ].filter(Boolean).join(" — ").slice(0, 300);

    case "damages":
      return [
        "التعويض الأضرار المادية الأرباح الفائتة تقدير التعويض",
        pick("facts"),
      ].filter(Boolean).join(" — ").slice(0, 300);

    case "comprehensive":
      return pick("facts")
        ? pick("facts").slice(0, 300)
        : null;

    case "claims":
      return [
        "الطلبات القضائية الحجز التحفظي التدابير المستعجلة",
        pick("facts"),
      ].filter(Boolean).join(" — ").slice(0, 300);

    case "settlement":
      return [
        "التسوية الودية الصلح مراكز التسوية وساطة",
        pick("facts"),
      ].filter(Boolean).join(" — ").slice(0, 300);

    case "risk_analysis":
      return [
        "المخاطر القانونية المخاطر الإجرائية",
        pick("planned_action", "facts"),
      ].filter(Boolean).join(" — ").slice(0, 300);

    // Task types that operate on user text or don't need KB pre-fetch
    case "peer_review":
    case "fact_gathering":
    case "legal_classification":
    case "gap_analysis":
    case "case_strength":
    case "strengths_weaknesses":
    case "opponent_defenses":
    case "legal_opinion":
    case "timeline":
      return null;

    default:
      // Unknown task type: try a generic search from facts if provided
      return pick("facts") ? pick("facts").slice(0, 200) : null;
  }
}

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Run a proactive knowledge-base search for a consultation and cache the result.
 * Safe to call fire-and-forget (all errors are caught internally).
 *
 * SECURITY: Category-visibility exclusions are resolved from the live DB before
 * retrieval. The resolved settings are stored with the cache entry so the chat
 * route can validate them before injection.
 *
 * @param consultationId  The consultation DB id (used as cache key).
 * @param taskType        The task type string from the consultation.
 * @param taskParams      The task params from the consultation.
 * @param apiKey          OpenAI API key for embeddings.
 * @param opts            Optional explicit exclusions (defaults to live DB values).
 */
export async function triggerProactiveSearch(
  consultationId: number,
  taskType: string,
  taskParams: Record<string, string>,
  apiKey: string,
  opts: ProactiveSearchOptions = {},
): Promise<void> {
  const query = buildProactiveQuery(taskType, taskParams);
  if (!query) return; // task type doesn't benefit from proactive search

  // Mark as in-progress so clients can poll for readiness
  inProgressSearches.add(consultationId);
  try {
    // Resolve exclusion settings from the DB (same path as chat.ts)
    const { excludeCategories } = await resolveExclusions(opts);

    // Run RAG and Tavily in parallel to minimise latency
    const [chunks, tavilyResults] = await Promise.all([
      retrieveRelevantChunks(
        query,
        apiKey,
        8,      // topK — slightly more than regular RAG (6) to pre-fill context
        0.35,   // slightly lower threshold so borderline-relevant laws are captured
        undefined,
        {
          multiQuery: true,
          autoLink: true,
          excludeCategories,
        },
      ),
      // Tavily proactive search — silent on failure
      searchLegalSources(query, 4).catch(() => [] as LegalSearchResult[]),
    ]);

    evictExpired();
    proactiveCache.set(consultationId, {
      chunks,
      tavilyResults,
      excludeCategories,
      expiresAt: Date.now() + CACHE_TTL_MS,
    });
  } catch {
    // Silent: proactive search is best-effort; the regular RAG pass will still run
  } finally {
    // Always clear in-progress marker so polling clients get an accurate status
    inProgressSearches.delete(consultationId);
  }
}

/**
 * Retrieve proactively cached chunks for a consultation after verifying that
 * the current request's exclusion settings are compatible with the cached ones.
 *
 * Returns null when:
 *  - The cache entry is absent or expired.
 *  - The current request excludes MORE categories than the cache was built with
 *    (i.e. a setting became more restrictive after the cache was populated).
 * In those cases the caller falls back to the regular RAG pass, which always
 * applies the current exclusion settings.
 *
 * @param consultationId      The consultation DB id.
 * @param currentExcludeCategories  The excludeCategories for the current request.
 */
export function getProactiveCachedChunks(
  consultationId: number,
  currentExcludeCategories: string[],
): ProactiveCacheHit | null {
  const entry = proactiveCache.get(consultationId);
  if (!entry || entry.expiresAt <= Date.now()) {
    proactiveCache.delete(consultationId);
    return null;
  }

  // Safety check: current request must not be MORE restrictive than the cache.
  // If any currently-excluded category was NOT excluded when the cache was built,
  // there may be disallowed chunks in the cache → skip it.
  for (const cat of currentExcludeCategories) {
    if (!entry.excludeCategories.includes(cat)) {
      // Cache may contain chunks from a now-hidden category — skip injection
      proactiveCache.delete(consultationId);
      return null;
    }
  }

  return { chunks: entry.chunks, tavilyResults: entry.tavilyResults };
}

/**
 * Returns true when a valid (non-expired) proactive cache entry exists for
 * the given consultation.  Use this to distinguish between:
 *   - search still running  → isProactiveSearchInProgress() === true
 *   - search succeeded      → hasProactiveCacheEntry() === true
 *   - search failed/skipped → both false (entry was never written)
 */
export function hasProactiveCacheEntry(consultationId: number): boolean {
  const entry = proactiveCache.get(consultationId);
  if (!entry) return false;
  if (entry.expiresAt <= Date.now()) {
    proactiveCache.delete(consultationId);
    return false;
  }
  return true;
}

/**
 * Evict the proactive cache entry for a consultation (e.g. after first use).
 * Call this after the chunks have been injected so we don't waste memory.
 */
export function evictProactiveCache(consultationId: number): void {
  proactiveCache.delete(consultationId);
}
