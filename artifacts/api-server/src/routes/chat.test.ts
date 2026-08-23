/**
 * Integration tests: quota safety on POST /api/consultations/:id/chat
 *
 * Run with:
 *   node ./test-build.mjs src/routes/chat.test.ts
 *
 * Covered scenarios:
 *   1. OpenAI network error (ECONNREFUSED) → session released, user message removed, isError:true
 *   2. OpenAI 429 → session released, user message removed, isError:true
 *   3. Successful reply → session committed (counted=true), user message kept
 */

import assert from "node:assert/strict";
import http from "node:http";
import { AddressInfo } from "node:net";
import { v4 as uuidv4 } from "uuid";

// ─── helpers ──────────────────────────────────────────────────────────────────

let passed = 0;
let failed = 0;
const cleanupActions: Array<() => Promise<void>> = [];

function test(name: string, fn: () => Promise<void>): Promise<void> {
  return fn()
    .then(() => {
      console.log(`  ✓ ${name}`);
      passed++;
    })
    .catch((err: any) => {
      console.error(`  ✗ ${name}`);
      console.error(`    ${err?.message ?? err}`);
      failed++;
    });
}

async function api(
  base: string,
  method: string,
  path: string,
  opts: { token?: string; body?: unknown } = {},
): Promise<{ status: number; body: any }> {
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (opts.token) headers["Authorization"] = `Bearer ${opts.token}`;

  const res = await fetch(`${base}${path}`, {
    method,
    headers,
    body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined,
  });

  let body: any;
  try { body = await res.json(); } catch { body = null; }
  return { status: res.status, body };
}

// ─── Mock OpenAI server ───────────────────────────────────────────────────────
// A configurable stub that the real app will hit when OPENAI_BASE_URL is overridden.

type MockMode = "success" | "429" | "close";
let mockMode: MockMode = "success";

const MOCK_SUCCESS_BODY = JSON.stringify({
  id: "chatcmpl-test",
  object: "chat.completion",
  choices: [
    {
      index: 0,
      message: { role: "assistant", content: "هذا رد اختباري من OpenAI." },
      finish_reason: "stop",
    },
  ],
  usage: { prompt_tokens: 10, completion_tokens: 5, total_tokens: 15 },
});

const MOCK_429_BODY = JSON.stringify({
  error: {
    message: "Rate limit reached",
    type: "requests",
    code: "rate_limit_exceeded",
  },
});

const mockOpenAI = http.createServer((req, res) => {
  if (mockMode === "close") {
    // Simulate network drop — destroy socket immediately
    req.socket.destroy();
    return;
  }
  if (mockMode === "429") {
    res.writeHead(429, { "Content-Type": "application/json" });
    res.end(MOCK_429_BODY);
    return;
  }
  // success
  res.writeHead(200, { "Content-Type": "application/json" });
  res.end(MOCK_SUCCESS_BODY);
});

await new Promise<void>((resolve) => mockOpenAI.listen(0, "127.0.0.1", resolve));
const mockPort = (mockOpenAI.address() as AddressInfo).port;

// Point the OpenAI SDK at the mock server BEFORE importing the app.
// The SDK reads OPENAI_BASE_URL at client construction time (inside getOpenAI()).
process.env["OPENAI_BASE_URL"] = `http://127.0.0.1:${mockPort}`;
// Ensure the key passes getOpenAI() validation (must start with "sk-")
process.env["OPENAI_API_KEY"] = "sk-test-key-for-unit-tests-only";

// ─── App server bootstrap ─────────────────────────────────────────────────────

const { default: app } = await import("../app.js");
const {
  db,
  usersTable,
  packagesTable,
  subscriptionsTable,
  consultationsTable,
  consultationMessagesTable,
  serviceSessionsTable,
} = await import("@workspace/db");
const { eq, and, desc } = await import("drizzle-orm");

const appServer = http.createServer(app);
await new Promise<void>((resolve) => appServer.listen(0, "127.0.0.1", resolve));
const { port } = appServer.address() as AddressInfo;
const BASE = `http://127.0.0.1:${port}`;
console.log(`\n💳 Chat quota-safety tests  (app :${port}  mock-openai :${mockPort})\n`);

// ─── Test setup helpers ───────────────────────────────────────────────────────

/**
 * Register and OTP-verify a fresh test user, returning their JWT token + userId.
 * Mirrors the pattern in auth.test.ts.
 */
async function registerTestUser(): Promise<{ token: string; userId: number }> {
  const email = `chat-test-${uuidv4()}@quota-test.local`;
  const password = "TestPass123!";

  const regRes = await api(BASE, "POST", "/api/auth/register", {
    body: { name: "Chat Test User", email, password, phone: "0501234567" },
  });
  assert.equal(regRes.status, 201, `register failed: ${JSON.stringify(regRes.body)}`);
  const verifyToken: string = regRes.body.verifyToken;

  // Fetch OTP from DB (bypasses SMS in dev mode)
  const { phoneOtpTokensTable } = await import("@workspace/db");
  const { eq: eqOtp } = await import("drizzle-orm");
  const [otpRecord] = await db.select().from(phoneOtpTokensTable)
    .where(eqOtp(phoneOtpTokensTable.verifyToken, verifyToken));
  assert.ok(otpRecord, "OTP record must exist");

  const confirmRes = await api(BASE, "POST", "/api/auth/phone-verify/confirm", {
    body: { verifyToken, code: otpRecord.code },
  });
  assert.equal(confirmRes.status, 200, `OTP confirm failed: ${JSON.stringify(confirmRes.body)}`);

  return { token: confirmRes.body.token, userId: confirmRes.body.user.id };
}

/**
 * Create a minimal paid package + active subscription for the user,
 * and a consultation with a pre-reserved (uncounted) service_session,
 * exactly as the consultation-creation route would do.
 */
async function setupConsultation(userId: number): Promise<{
  consultationId: number;
  sessionId: number;
  subscriptionId: number;
  packageId: number;
}> {
  // Insert a minimal paid package
  const [pkg] = await db.insert(packagesTable).values({
    nameAr: "باقة اختبار",
    nameEn: "Test Package",
    price: "100",
    type: "monthly",
    consultationsAllowed: 10,
    contractsAllowed: 0,
    reviewsAllowed: 0,
    isActive: true,
  }).returning();

  // Insert an active subscription
  const [sub] = await db.insert(subscriptionsTable).values({
    userId,
    packageId: pkg.id,
    status: "active",
    consultationsUsed: 0,
    contractsUsed: 0,
    reviewsUsed: 0,
  }).returning();

  // Insert a consultation
  const [cons] = await db.insert(consultationsTable).values({
    userId,
    subscriptionId: sub.id,
    title: "استشارة اختبارية",
    status: "pending",
    chatgptUrl: "https://chatgpt.com",
  }).returning();

  // Insert a pre-reserved (uncounted) service_session — this is what the chat route looks for
  const graceEnd = new Date(Date.now() + 10 * 60 * 1000);
  const [session] = await db.insert(serviceSessionsTable).values({
    userId,
    subscriptionId: sub.id,
    serviceType: "consultation",
    counted: false,
    graceEnd,
  }).returning();

  return { consultationId: cons.id, sessionId: session.id, subscriptionId: sub.id, packageId: pkg.id };
}

async function teardown(userId: number, packageId: number) {
  // Order matters due to FK constraints; cascade on user_id handles most tables
  await db.delete(usersTable).where(eq(usersTable.id, userId)).catch(() => {});
  await db.delete(packagesTable).where(eq(packagesTable.id, packageId)).catch(() => {});
}

// ─── Test 1: OpenAI network error (ECONNREFUSED) ──────────────────────────────

await test("OpenAI network error → isError:true, user message removed, session deleted", async () => {
  const { token, userId } = await registerTestUser();
  const { consultationId, sessionId, packageId } = await setupConsultation(userId);
  cleanupActions.push(() => teardown(userId, packageId));

  mockMode = "close"; // mock server will close socket immediately

  const res = await api(BASE, "POST", `/api/consultations/${consultationId}/chat`, {
    token,
    body: { message: "ما حكم الفسخ في عقد الإيجار؟" },
  });

  // Response must still be HTTP 200 with isError flag
  assert.equal(res.status, 200, `expected 200, got ${res.status}: ${JSON.stringify(res.body)}`);
  assert.equal(res.body.isError, true, "response must have isError:true");

  // User message must have been removed
  const messages = await db.select().from(consultationMessagesTable)
    .where(eq(consultationMessagesTable.consultationId, consultationId));
  assert.equal(messages.length, 0, `user message should be deleted on error, found ${messages.length} rows`);

  // Service session must be deleted (released)
  const sessions = await db.select().from(serviceSessionsTable)
    .where(eq(serviceSessionsTable.id, sessionId));
  assert.equal(sessions.length, 0, `service_session should be deleted on error, found ${sessions.length} rows`);
});

// ─── Test 2: OpenAI 429 ───────────────────────────────────────────────────────

await test("OpenAI 429 → isError:true, user message removed, session deleted", async () => {
  const { token, userId } = await registerTestUser();
  const { consultationId, sessionId, packageId } = await setupConsultation(userId);
  cleanupActions.push(() => teardown(userId, packageId));

  mockMode = "429";

  const res = await api(BASE, "POST", `/api/consultations/${consultationId}/chat`, {
    token,
    body: { message: "ما حكم الفسخ في عقد الإيجار؟" },
  });

  assert.equal(res.status, 200, `expected 200, got ${res.status}: ${JSON.stringify(res.body)}`);
  assert.equal(res.body.isError, true, "response must have isError:true on 429");

  // User message must have been removed
  const messages = await db.select().from(consultationMessagesTable)
    .where(eq(consultationMessagesTable.consultationId, consultationId));
  assert.equal(messages.length, 0, `user message should be deleted on 429, found ${messages.length} rows`);

  // Service session must be deleted (released)
  const sessions = await db.select().from(serviceSessionsTable)
    .where(eq(serviceSessionsTable.id, sessionId));
  assert.equal(sessions.length, 0, `service_session should be deleted on 429, found ${sessions.length} rows`);
});

// ─── Test 3: Successful reply ─────────────────────────────────────────────────

await test("Successful OpenAI reply → session committed (counted=true), user message kept", async () => {
  const { token, userId } = await registerTestUser();
  const { consultationId, sessionId, subscriptionId, packageId } = await setupConsultation(userId);
  cleanupActions.push(() => teardown(userId, packageId));

  mockMode = "success";

  const res = await api(BASE, "POST", `/api/consultations/${consultationId}/chat`, {
    token,
    body: { message: "ما حكم الفسخ في عقد الإيجار؟" },
  });

  assert.equal(res.status, 200, `expected 200, got ${res.status}: ${JSON.stringify(res.body)}`);
  assert.ok(!res.body.isError, "successful response must NOT have isError");
  assert.ok(res.body.reply, "successful response must include a reply");

  // User message AND assistant message must both be in DB
  const messages = await db.select().from(consultationMessagesTable)
    .where(eq(consultationMessagesTable.consultationId, consultationId));
  const userMsgs = messages.filter(m => m.role === "user");
  const asstMsgs = messages.filter(m => m.role === "assistant");
  assert.equal(userMsgs.length, 1, "user message must be kept on success");
  assert.equal(asstMsgs.length, 1, "assistant message must be saved on success");

  // Service session must be committed (counted=true), NOT deleted
  const [session] = await db.select().from(serviceSessionsTable)
    .where(eq(serviceSessionsTable.id, sessionId));
  assert.ok(session, "service_session must still exist after successful reply");
  assert.equal(session.counted, true, "service_session must be counted=true after success");

  // Subscription consultationsUsed counter must have incremented
  const [sub] = await db.select().from(subscriptionsTable)
    .where(eq(subscriptionsTable.id, subscriptionId));
  assert.equal(sub.consultationsUsed, 1, "subscription consultationsUsed must be incremented to 1");
});

// ─── cleanup + summary ────────────────────────────────────────────────────────

for (const action of cleanupActions) {
  await action().catch(() => {});
}

appServer.close();
mockOpenAI.close();

console.log(`\n${passed + failed} tests: ${passed} passed, ${failed} failed\n`);
// Force-exit: pino worker threads keep the process alive otherwise.
process.exit(failed > 0 ? 1 : 0);
