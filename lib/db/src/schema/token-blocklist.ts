import { index, pgTable, serial, text, timestamp } from "drizzle-orm/pg-core";

/**
 * Stores revoked token fingerprints (SHA-256 of the raw JWT string) so that
 * logged-out or admin-disabled tokens are rejected even before their natural
 * expiry. Using the full-token hash means every token — including legacy ones
 * issued before the `jti` claim was introduced — can be immediately revoked.
 *
 * ── Table growth & cleanup ────────────────────────────────────────────────
 * Rows accumulate only while a token is still within its validity window.
 * The server-side JWT lifetime is 30 days, so at most one row exists per
 * active user session. For N concurrent users the table stays at O(N) rows.
 *
 * A startup purge and an hourly scheduled job both call
 * `purgeExpiredBlocklistEntries()` which runs:
 *
 *   DELETE FROM token_blocklist WHERE expires_at < NOW()
 *
 * The btree index `idx_token_blocklist_expires_at` on `expires_at` makes
 * this DELETE an efficient range scan (no sequential table scan) even if
 * millions of old rows somehow accumulate after a prolonged server outage.
 *
 * ── Why not a partial index WHERE expires_at > NOW()? ─────────────────────
 * PostgreSQL requires index predicate functions to be IMMUTABLE. NOW() is
 * STABLE (re-evaluated each query) so it cannot appear in a partial index
 * predicate — the engine will throw:
 *   "ERROR: functions in index predicate must be marked IMMUTABLE"
 * The full btree on expires_at is therefore the correct and sufficient choice
 * for the cleanup query. The unique btree on token_key already makes the
 * per-request revocation lookup O(log N).
 *
 * ── Indexes ──────────────────────────────────────────────────────────────
 * • token_blocklist_token_key_key  UNIQUE btree (token_key)   — auth lookup
 * • idx_token_blocklist_expires_at        btree (expires_at)  — cleanup DELETE
 */
export const tokenBlocklistTable = pgTable(
  "token_blocklist",
  {
    id: serial("id").primaryKey(),
    /** SHA-256 hex digest of the raw JWT string */
    tokenKey: text("token_key").notNull().unique(),
    /**
     * Mirrors the JWT `exp` claim. Rows with expiresAt < NOW() are
     * functionally dead and safe to purge — the cleanup job handles this
     * automatically on startup and every hour.
     */
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => ({
    /**
     * Supports the hourly cleanup: DELETE … WHERE expires_at < NOW()
     * Turns an otherwise sequential table scan into a fast range seek,
     * keeping the purge cheap even after extended server downtime.
     */
    expiresAtIdx: index("idx_token_blocklist_expires_at").on(table.expiresAt),
  }),
);
