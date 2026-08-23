/**
 * One-time backfill script — sets `used_live_search = true` on historical
 * assistant messages that were answered using Tavily web results.
 *
 * HEURISTIC: a message used live search if its persisted `sources` JSONB
 * array contains at least one entry with `sourceType = "web"`.  This is
 * reliable for all messages saved after the `sources` column was added.
 * Messages predating that column have `sources = NULL` and cannot be
 * recovered — they are left untouched and documented at the end.
 *
 * The operation is fully IDEMPOTENT: it only touches rows where
 * `used_live_search` is currently false, so running it multiple times is safe.
 *
 * Run with:
 *   pnpm --filter @workspace/api-server exec ts-node --esm \
 *     src/scripts/backfill-live-search.ts
 */

import { db, consultationMessagesTable } from "@workspace/db";
import { eq, and, isNotNull, sql } from "drizzle-orm";

async function main() {
  console.log("\n🔍  Backfill: used_live_search flag on historical chat replies\n");

  // ── 1. Count candidates before update ─────────────────────────────────────
  const [{ candidateCount }] = await db
    .select({ candidateCount: sql<number>`count(*)::int` })
    .from(consultationMessagesTable)
    .where(
      and(
        eq(consultationMessagesTable.role, "assistant"),
        eq(consultationMessagesTable.usedLiveSearch, false),
        isNotNull(consultationMessagesTable.sources),
        sql`jsonb_typeof(${consultationMessagesTable.sources}) = 'array'`,
        sql`EXISTS (
              SELECT 1
              FROM jsonb_array_elements(${consultationMessagesTable.sources}) AS s
              WHERE s->>'sourceType' = 'web'
            )`,
      ),
    );

  console.log(`  ↳ Candidate rows (used Tavily, not yet marked): ${candidateCount}`);

  if (candidateCount === 0) {
    console.log("  ✅  Nothing to update — all qualifying rows already marked.\n");
    process.exit(0);
  }

  // ── 2. Perform the update ─────────────────────────────────────────────────
  await db
    .update(consultationMessagesTable)
    .set({ usedLiveSearch: true })
    .where(
      and(
        eq(consultationMessagesTable.role, "assistant"),
        eq(consultationMessagesTable.usedLiveSearch, false),
        isNotNull(consultationMessagesTable.sources),
        sql`jsonb_typeof(${consultationMessagesTable.sources}) = 'array'`,
        sql`EXISTS (
              SELECT 1
              FROM jsonb_array_elements(${consultationMessagesTable.sources}) AS s
              WHERE s->>'sourceType' = 'web'
            )`,
      ),
    );

  // ── 3. Count rows that still could not be recovered (no sources column) ───
  const [{ unknownCount }] = await db
    .select({ unknownCount: sql<number>`count(*)::int` })
    .from(consultationMessagesTable)
    .where(
      and(
        eq(consultationMessagesTable.role, "assistant"),
        eq(consultationMessagesTable.usedLiveSearch, false),
        sql`${consultationMessagesTable.sources} IS NULL`,
      ),
    );

  console.log(`  ✅  Updated ${candidateCount} rows → used_live_search = true`);
  console.log(
    `  ℹ️   ${unknownCount} assistant messages have no saved sources and cannot be` +
    ` recovered (pre-date the sources column).  These are left as-is.`,
  );
  console.log("\n  Rationale for non-recovery:");
  console.log(
    "  Messages without a `sources` value were saved before the verification layer",
  );
  console.log(
    "  was added.  There is no reliable signal in the message content alone to",
  );
  console.log(
    "  distinguish a Tavily-backed answer from a KB-only answer, so they remain",
  );
  console.log(
    "  with used_live_search = false to avoid false positives.\n",
  );

  process.exit(0);
}

main().catch((err) => {
  console.error("❌  Backfill failed:", err);
  process.exit(1);
});
