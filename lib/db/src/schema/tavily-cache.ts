import { index, pgTable, text, jsonb, timestamp } from "drizzle-orm/pg-core";

/**
 * Persistent cross-session cache for Tavily legal web search results.
 *
 * ── Why persistent? ──────────────────────────────────────────────────────────
 * The previous in-memory Map was wiped on every server restart or when running
 * multiple Node workers, causing redundant Tavily API calls (and credit drain)
 * for identical queries across different user sessions.
 *
 * ── Cache key ────────────────────────────────────────────────────────────────
 * SHA-256 hex of the normalised query (trimmed, lowercased, collapsed whitespace).
 * Collision-resistant for practical query loads.
 *
 * ── Stored value ─────────────────────────────────────────────────────────────
 * `results` — the array of LegalSearchResult objects returned by Tavily.
 *
 * ── TTL & cleanup ────────────────────────────────────────────────────────────
 * TTL is 15 minutes. Rows are written with an `expires_at` timestamp.
 * A startup purge and occasional eviction calls remove expired rows so the
 * table stays at O(distinct active queries) rows.
 * The index on `expires_at` makes the DELETE fast even after extended downtime.
 */
export const tavilyCacheTable = pgTable(
  "tavily_cache",
  {
    /** SHA-256 hex of the normalised query */
    cacheKey: text("cache_key").primaryKey(),
    /** JSON array of LegalSearchResult objects */
    results: jsonb("results").$type<object[]>().notNull(),
    /** Row expires after TTL — reader treats expired rows as misses */
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => ({
    /** Efficient DELETE WHERE expires_at < NOW() for cleanup */
    expiresAtIdx: index("idx_tavily_cache_expires_at").on(table.expiresAt),
  }),
);
