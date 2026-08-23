/**
 * Authentication integration tests.
 *
 * Covers server-side session issuance and acceptance, as well as JWT revocation
 * and the phone-verification gate. HTTPS browser cookie-policy coverage belongs
 * in an end-to-end preview test, not this local HTTP integration harness.
 *
 * Run with:
 *   pnpm --filter @workspace/api-server test:auth
 */

import assert from "node:assert/strict";
import http from "node:http";
import { AddressInfo } from "node:net";
import { v4 as uuidv4 } from "uuid";

const TEST_PASSWORD = "TestPass123!";
let passed = 0;
let failed = 0;
const cleanupActions: Array<() => Promise<void>> = [];

function test(name: string, fn: () => Promise<void>): Promise<void> {
  return fn()
    .then(() => {
      console.log(`  ✓ ${name}`);
      passed++;
    })
    .catch((err: unknown) => {
      console.error(`  ✗ ${name}`);
      console.error(`    ${err instanceof Error ? err.message : String(err)}`);
      failed++;
    });
}

function uniqueSaudiPhone(): string {
  const digits = uuidv4().replace(/\D/g, "").padEnd(8, "0").slice(0, 8);
  return `05${digits}`;
}

function sessionCookie(setCookie: string | null): string {
  assert.ok(setCookie, "login response must set a session cookie");
  const [cookie] = setCookie.split(";");
  assert.ok(cookie.includes("="), "session cookie must be valid");
  return cookie;
}

async function api(
  base: string,
  method: string,
  path: string,
  opts: { token?: string; body?: unknown; cookie?: string } = {},
): Promise<{ status: number; body: any; setCookie: string | null }> {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    "X-Forwarded-Proto": "https",
  };
  if (opts.token) headers.Authorization = `Bearer ${opts.token}`;
  if (opts.cookie) headers.Cookie = opts.cookie;

  const response = await fetch(`${base}${path}`, {
    method,
    headers,
    body: opts.body === undefined ? undefined : JSON.stringify(opts.body),
  });

  let body: any;
  try {
    body = await response.json();
  } catch {
    body = null;
  }

  return {
    status: response.status,
    body,
    setCookie: response.headers.get("set-cookie"),
  };
}

const { db, usersTable, phoneOtpTokensTable } = await import("@workspace/db");
const { eq } = await import("drizzle-orm");
const { default: app } = await import("../app.js");

async function cleanupUser(userId: number): Promise<void> {
  await db.update(usersTable).set({ isActive: true }).where(eq(usersTable.id, userId));
  await db.delete(usersTable).where(eq(usersTable.id, userId));
}

/**
 * Registers and verifies an isolated account. Each test gets a distinct phone
 * number so previous development records cannot invalidate future test runs.
 */
async function registerVerifiedUser(base: string): Promise<{
  email: string;
  userId: number;
  token: string;
}> {
  const email = `auth-${uuidv4()}@auth-test.local`;
  const register = await api(base, "POST", "/api/auth/register", {
    body: {
      name: "Auth Test User",
      email,
      password: TEST_PASSWORD,
      phone: uniqueSaudiPhone(),
    },
  });
  assert.equal(register.status, 201, `registration failed: ${JSON.stringify(register.body)}`);
  assert.equal(register.body.pendingVerification, true);

  const [otp] = await db
    .select()
    .from(phoneOtpTokensTable)
    .where(eq(phoneOtpTokensTable.verifyToken, register.body.verifyToken));
  assert.ok(otp, "verification token must be stored");

  const verification = await api(base, "POST", "/api/auth/phone-verify/confirm", {
    body: { verifyToken: register.body.verifyToken, code: otp.code },
  });
  assert.equal(verification.status, 200, `phone verification failed: ${JSON.stringify(verification.body)}`);
  assert.ok(verification.body.token, "verification must issue a JWT");
  assert.equal(verification.body.user.phoneVerified, true);

  cleanupActions.push(() => cleanupUser(verification.body.user.id));
  return { email, userId: verification.body.user.id, token: verification.body.token };
}

const server = http.createServer(app);
await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
const { port } = server.address() as AddressInfo;
const BASE = `http://127.0.0.1:${port}`;
console.log(`\n🔐 Auth integration tests (server on :${port})\n`);

await test("valid login issues a session cookie the server accepts on the next request", async () => {
  const { email } = await registerVerifiedUser(BASE);

  const login = await api(BASE, "POST", "/api/auth/login", {
    body: { email, password: TEST_PASSWORD },
  });
  assert.equal(login.status, 200, `login failed: ${JSON.stringify(login.body)}`);
  assert.ok(login.body.token, "login must issue a JWT");

  const me = await api(BASE, "GET", "/api/auth/me", {
    cookie: sessionCookie(login.setCookie),
  });
  assert.equal(me.status, 200, `session cookie was rejected: ${JSON.stringify(me.body)}`);
  assert.equal(me.body.email, email);
});

await test("logout revokes the JWT and rejects subsequent protected requests", async () => {
  const { token } = await registerVerifiedUser(BASE);

  const before = await api(BASE, "GET", "/api/auth/me", { token });
  assert.equal(before.status, 200);

  const logout = await api(BASE, "POST", "/api/auth/logout", { token });
  assert.equal(logout.status, 200);
  assert.equal(logout.body.success, true);

  const after = await api(BASE, "GET", "/api/auth/me", { token });
  assert.equal(after.status, 401);
});

await test("unverified phone accounts receive an OTP challenge instead of a session", async () => {
  const email = `unverified-${uuidv4()}@auth-test.local`;
  const register = await api(BASE, "POST", "/api/auth/register", {
    body: {
      name: "Unverified User",
      email,
      password: TEST_PASSWORD,
      phone: uniqueSaudiPhone(),
    },
  });
  assert.equal(register.status, 201);

  const [user] = await db.select().from(usersTable).where(eq(usersTable.email, email));
  assert.ok(user);
  cleanupActions.push(() => cleanupUser(user.id));

  const login = await api(BASE, "POST", "/api/auth/login", {
    body: { email, password: TEST_PASSWORD },
  });
  assert.equal(login.status, 403);
  assert.equal(login.body.pendingVerification, true);
  assert.ok(login.body.verifyToken);
});

async function createAdminAndLogin(base: string): Promise<{ token: string; userId: number }> {
  const admin = await registerVerifiedUser(base);
  await db.update(usersTable).set({ role: "admin" }).where(eq(usersTable.id, admin.userId));

  const login = await api(base, "POST", "/api/auth/login", {
    body: { email: admin.email, password: TEST_PASSWORD },
  });
  assert.equal(login.status, 200, `admin login failed: ${JSON.stringify(login.body)}`);
  return { token: login.body.token, userId: admin.userId };
}

await test("disabling an account immediately blocks its existing token", async () => {
  const victim = await registerVerifiedUser(BASE);
  const admin = await createAdminAndLogin(BASE);

  const disable = await api(BASE, "PATCH", `/api/admin/users/${victim.userId}`, {
    token: admin.token,
    body: { isActive: false },
  });
  assert.equal(disable.status, 200, `disable failed: ${JSON.stringify(disable.body)}`);

  const blocked = await api(BASE, "GET", "/api/auth/me", { token: victim.token });
  assert.equal(blocked.status, 401);
});

await test("re-enabling an account requires a fresh login", async () => {
  const victim = await registerVerifiedUser(BASE);
  const admin = await createAdminAndLogin(BASE);

  await api(BASE, "PATCH", `/api/admin/users/${victim.userId}`, {
    token: admin.token,
    body: { isActive: false },
  });
  const reenable = await api(BASE, "PATCH", `/api/admin/users/${victim.userId}`, {
    token: admin.token,
    body: { isActive: true },
  });
  assert.equal(reenable.status, 200);

  const staleToken = await api(BASE, "GET", "/api/auth/me", { token: victim.token });
  assert.equal(staleToken.status, 401);

  const freshLogin = await api(BASE, "POST", "/api/auth/login", {
    body: { email: victim.email, password: TEST_PASSWORD },
  });
  assert.equal(freshLogin.status, 200);
  const freshToken = await api(BASE, "GET", "/api/auth/me", { token: freshLogin.body.token });
  assert.equal(freshToken.status, 200);
});

await test("production-mode login does not expose an OTP challenge when SMS delivery fails", async () => {
  const email = `sms-failure-${uuidv4()}@auth-test.local`;
  const register = await api(BASE, "POST", "/api/auth/register", {
    body: {
      name: "SMS Failure Test",
      email,
      password: TEST_PASSWORD,
      phone: uniqueSaudiPhone(),
    },
  });
  assert.equal(register.status, 201);

  const [user] = await db.select().from(usersTable).where(eq(usersTable.email, email));
  assert.ok(user);
  cleanupActions.push(() => cleanupUser(user.id));

  const previousNodeEnv = process.env.NODE_ENV;
  const previousSid = process.env.TWILIO_ACCOUNT_SID;
  delete process.env.TWILIO_ACCOUNT_SID;
  process.env.NODE_ENV = "production";
  try {
    const login = await api(BASE, "POST", "/api/auth/login", {
      body: { email, password: TEST_PASSWORD },
    });
    assert.equal(login.status, 503, `expected 503: ${JSON.stringify(login.body)}`);
    assert.ok(!login.body.verifyToken, "OTP token must not be exposed after an SMS failure");
  } finally {
    process.env.NODE_ENV = previousNodeEnv;
    if (previousSid === undefined) delete process.env.TWILIO_ACCOUNT_SID;
    else process.env.TWILIO_ACCOUNT_SID = previousSid;
  }
});

await Promise.allSettled(cleanupActions.map((cleanup) => cleanup()));
await new Promise<void>((resolve) => server.close(() => resolve()));

const total = passed + failed;
console.log(`\n${total} tests: ${passed} passed, ${failed} failed\n`);
// The shared PostgreSQL pool deliberately stays open in the application. This
// standalone test process has no server to keep alive after the assertions,
// so terminate explicitly to prevent CI/workflow timeouts.
process.exit(failed > 0 ? 1 : 0);