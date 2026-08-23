/**
 * Integration tests: JWT revocation contract & startup probe.
 *
 * Run with:
 *   pnpm --filter @workspace/api-server test:auth-middleware
 *
 * DATABASE_URL and SESSION_SECRET must be set in the environment.
 *
 * Covered scenarios
 * ─────────────────
 * 1. assertBlocklistTableReachable() resolves when the table exists.
 * 2. assertBlocklistTableReachable() propagates the DB error when the
 *    underlying query throws — simulating a migration that dropped or renamed
 *    the table.  The probe must NOT swallow the exception.
 * 3. End-to-end JWT revocation: issue token → logout → same token → 401 on
 *    every protected endpoint.
 * 4. Revoked token stays rejected even after the account is re-enabled.
 * 5. purgeExpiredBlocklistEntries() removes only expired rows and keeps
 *    unexpired rows intact.
 */

import assert from "node:assert/strict";
import http from "node:http";
import { AddressInfo } from "node:net";
import { v4 as uuidv4 } from "uuid";
import jwt from "jsonwebtoken";

// ─── bootstrap ────────────────────────────────────────────────────────────────

const { default: app }   = await import("../app.js");
const { db }             = await import("@workspace/db");
const { usersTable, tokenBlocklistTable } = await import("@workspace/db");
const { eq, sql }        = await import("drizzle-orm");
const {
  assertBlocklistTableReachable,
  purgeExpiredBlocklistEntries,
  tokenFingerprint,
  JWT_SECRET,
} = await import("../middlewares/auth.js");

const server = http.createServer(app);
await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
const { port } = server.address() as AddressInfo;
const BASE = `http://127.0.0.1:${port}`;
console.log(`\n🔐 Auth middleware tests  (server on :${port})\n`);

// ─── helpers ──────────────────────────────────────────────────────────────────

let passed = 0;
let failed = 0;
const cleanup: Array<() => Promise<void>> = [];

function test(name: string, fn: () => Promise<void>): Promise<void> {
  return fn()
    .then(() => { console.log(`  ✓ ${name}`); passed++; })
    .catch((err: unknown) => {
      console.error(`  ✗ ${name}`);
      console.error(`    ${(err as any)?.message ?? err}`);
      failed++;
    });
}

async function api(
  method: string,
  path: string,
  opts: { token?: string; body?: unknown } = {},
): Promise<{ status: number; body: any }> {
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (opts.token) headers["Authorization"] = `Bearer ${opts.token}`;
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers,
    body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined,
  });
  let body: any;
  try { body = await res.json(); } catch { body = null; }
  return { status: res.status, body };
}

/**
 * Seed a minimal test user using only the columns that exist in the live DB
 * (avoids failures when the schema is ahead of applied migrations), then
 * issue a JWT directly — no HTTP round-trip required.
 */
async function seedUserAndIssueToken(): Promise<{ token: string; userId: number }> {
  const email = `mw-${uuidv4()}@test.local`;

  // Raw INSERT using only columns guaranteed to exist in the live DB.
  // phone_verified = true so the auth middleware's isActive check passes cleanly.
  const rows = await db.execute(
    sql`INSERT INTO users (name, email, password_hash, phone, role, is_active, phone_verified)
        VALUES ('MW Test', ${email}, 'x', '0500000000', 'user', true, true)
        RETURNING id`,
  );
  const userId = (rows.rows[0] as any).id as number;

  const token = jwt.sign({ userId, userRole: "user", jti: uuidv4() }, JWT_SECRET, {
    expiresIn: "30d",
  });

  cleanup.push(async () => {
    await db.delete(usersTable).where(eq(usersTable.id, userId)).catch(() => {});
  });

  return { token, userId };
}

// ═══════════════════════════════════════════════════════════════════════════════
// 1. Startup probe — happy path
// ═══════════════════════════════════════════════════════════════════════════════

await test("assertBlocklistTableReachable() resolves when the table exists", async () => {
  await assertBlocklistTableReachable();
  // If it throws the test fails automatically.
});

// ═══════════════════════════════════════════════════════════════════════════════
// 2. Startup probe — missing-table simulation
//
// Constructing a mock db whose query throws the same PostgreSQL relation-missing
// error (code 42P01) that a gone-wrong migration would produce. Verifies that
// the probe does NOT swallow the error.
// ═══════════════════════════════════════════════════════════════════════════════

await test("startup probe propagates DB error when the blocklist table is unreachable", async () => {
  // Simulate the PostgreSQL "relation does not exist" error (code 42P01) that a
  // gone-wrong migration would produce.  We inject the mock db directly into the
  // real assertBlocklistTableReachable() via its dbOverride parameter so that
  // any future change to the probe implementation (e.g. accidentally swallowing
  // the error) will still be caught by this test.
  const pgError = Object.assign(
    new Error('relation "token_blocklist" does not exist'),
    { code: "42P01" },
  );

  const mockDb = {
    select: () => ({ from: () => ({ limit: () => Promise.reject(pgError) }) }),
  } as unknown as typeof db;

  let caught: Error | null = null;
  try {
    await assertBlocklistTableReachable(mockDb);
  } catch (err) {
    caught = err as Error;
  }

  assert.ok(caught !== null, "assertBlocklistTableReachable() must throw when the DB query fails");
  assert.equal((caught as any).code, "42P01",
    `expected PostgreSQL 42P01, got: ${(caught as any).code}`);
  assert.ok(caught.message.includes("token_blocklist"),
    `error must mention the table: ${caught.message}`);
});

// ═══════════════════════════════════════════════════════════════════════════════
// 3. End-to-end revocation: issue → use → logout → same token → 401
// ═══════════════════════════════════════════════════════════════════════════════

await test("issued token is accepted on a protected endpoint before logout", async () => {
  const { token } = await seedUserAndIssueToken();

  const res = await api("GET", "/api/auth/me", { token });
  assert.equal(res.status, 200,
    `expected 200 before logout, got ${res.status}: ${JSON.stringify(res.body)}`);
});

await test("token is rejected with 401 immediately after logout (end-to-end)", async () => {
  const { token } = await seedUserAndIssueToken();

  // Sanity: token must work first.
  const before = await api("GET", "/api/auth/me", { token });
  assert.equal(before.status, 200, `expected 200 before logout, got ${before.status}`);

  // Logout via the real route — server adds fingerprint to the blocklist.
  const logoutRes = await api("POST", "/api/auth/logout", { token });
  assert.equal(logoutRes.status, 200, `logout must succeed, got ${logoutRes.status}`);
  assert.equal(logoutRes.body?.success, true, "logout must return { success: true }");

  // The fingerprint must be present in the table.
  const fp = tokenFingerprint(token);
  const [row] = await db
    .select({ tokenKey: tokenBlocklistTable.tokenKey })
    .from(tokenBlocklistTable)
    .where(eq(tokenBlocklistTable.tokenKey, fp));
  assert.ok(row, "token fingerprint must be in token_blocklist after logout");

  // Same token must be rejected on every protected endpoint.
  const afterMe = await api("GET", "/api/auth/me", { token });
  assert.equal(afterMe.status, 401,
    `expected 401 on /api/auth/me after logout, got ${afterMe.status}: ${JSON.stringify(afterMe.body)}`);

  const afterRefresh = await api("POST", "/api/auth/refresh", { token });
  assert.equal(afterRefresh.status, 401,
    `expected 401 on /api/auth/refresh after logout, got ${afterRefresh.status}: ${JSON.stringify(afterRefresh.body)}`);
});

await test("revoked token stays rejected even after the account is re-enabled", async () => {
  const { token, userId } = await seedUserAndIssueToken();

  // Logout → token blocklisted.
  await api("POST", "/api/auth/logout", { token });

  // Re-enable the account to confirm the blocklist is what rejects, not account status.
  await db.execute(sql`UPDATE users SET is_active = true WHERE id = ${userId}`);

  const res = await api("GET", "/api/auth/me", { token });
  assert.equal(res.status, 401,
    `expected 401 for blocklisted token after re-enable, got ${res.status}`);
});

// ═══════════════════════════════════════════════════════════════════════════════
// 4. purgeExpiredBlocklistEntries — selective cleanup
// ═══════════════════════════════════════════════════════════════════════════════

await test("purgeExpiredBlocklistEntries() removes expired rows and keeps unexpired ones", async () => {
  const expiredKey = `expired-${uuidv4()}`;
  const validKey   = `valid-${uuidv4()}`;
  const past   = new Date(Date.now() -  1_000);   // 1 s ago
  const future = new Date(Date.now() + 60_000);   // 60 s ahead

  await db.insert(tokenBlocklistTable).values([
    { tokenKey: expiredKey, expiresAt: past },
    { tokenKey: validKey,   expiresAt: future },
  ]);

  cleanup.push(async () => {
    await db.delete(tokenBlocklistTable).where(eq(tokenBlocklistTable.tokenKey, validKey)).catch(() => {});
    await db.delete(tokenBlocklistTable).where(eq(tokenBlocklistTable.tokenKey, expiredKey)).catch(() => {});
  });

  const removed = await purgeExpiredBlocklistEntries();
  assert.ok(removed >= 1, `expected ≥ 1 row removed, got ${removed}`);

  const [expiredRow] = await db
    .select()
    .from(tokenBlocklistTable)
    .where(eq(tokenBlocklistTable.tokenKey, expiredKey));
  assert.equal(expiredRow, undefined, "expired row must be purged");

  const [validRow] = await db
    .select()
    .from(tokenBlocklistTable)
    .where(eq(tokenBlocklistTable.tokenKey, validKey));
  assert.ok(validRow, "unexpired row must remain in the blocklist");
});

// ─── cleanup & summary ────────────────────────────────────────────────────────

await Promise.allSettled(cleanup.map((fn) => fn()));
await new Promise<void>((resolve) => server.close(() => resolve()));

const total = passed + failed;
console.log(`\n${total} tests: ${passed} passed, ${failed} failed\n`);
if (failed > 0) process.exit(1);
