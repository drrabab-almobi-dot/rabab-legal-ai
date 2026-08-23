import { index, pgTable, text, jsonb, timestamp } from "drizzle-orm/pg-core";

/**
 * Persistent cross-session cache for the AI re-ranker (rerankChunks).
 *
 * ── Why persistent? ──────────────────────────────────────────────────────────
 * The in-memory Map used previously was wiped on every server restart or when
 * running multiple Node workers, causing redundant GPT-4o-mini calls for
 * identical (query + chunk-set) combinations across different user sessions.
 *
 * ── Cache key ────────────────────────────────────────────────────────────────
 * SHA-256 hex of "<query>||<first-80-chars of each chunk joined by |>".
 * Compact enough for a primary key and collision-resistant for practical loads.
 *
 * ── Stored value ─────────────────────────────────────────────────────────────
 * `keep_indices` — the array of 0-based positions that the re-ranker decided
 * to KEEP. We store indices (not full chunk content) so that the same cache
 * entry can be applied to any matching chunk array regardless of chunk types.
 *
 * ── TTL & cleanup ────────────────────────────────────────────────────────────
 * TTL is 10 minutes. Rows are written with an `expires_at` timestamp.
 * A startup purge and occasional eviction calls remove expired rows so the
 * table stays at O(distinct active queries) rows — tiny in practice.
 * The index on `expires_at` makes the DELETE fast even after extended downtime.
 */
export const rerankCacheTable = pgTable(
  "rerank_cache",
  {
    /** SHA-256 hex of the composite cache key */
    cacheKey: text("cache_key").primaryKey(),
    /** 0-based indices of chunks kept after re-ranking */
    keepIndices: jsonb("keep_indices").$type<number[]>().notNull(),
    /** Row expires after TTL — reader treats expired rows as misses */
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => ({
    /** Efficient DELETE WHERE expires_at < NOW() for cleanup */
    expiresAtIdx: index("idx_rerank_cache_expires_at").on(table.expiresAt),
  }),
);
