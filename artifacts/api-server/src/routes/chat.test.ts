/**
 * Integration tests: quota safety on POST /api/consultations/:id/chat
 *
 * Run with:
 *   node ./test-build.mjs src/routes/chat.test.ts
 *
 * Covered scenarios:
 *   1. OpenAI network error (ECONNREFUSED) → session released, user message removed, isError:true
 *   2. OpenAI 429 → session released, user message removed, isError:true
 *   3. Missing live legal verifier → session released and no charge
 *   4. Successful reply → session committed (counted=true), user message kept
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
let mockAssistantContent = "هذا رد اختباري من OpenAI.";

function mockSuccessBody(content = mockAssistantContent): string {
  return JSON.stringify({
    id: "chatcmpl-test",
    object: "chat.completion",
    choices: [
      {
        index: 0,
        message: { role: "assistant", content },
        finish_reason: "stop",
      },
    ],
    usage: { prompt_tokens: 10, completion_tokens: 5, total_tokens: 15 },
  });
}

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
  res.end(mockSuccessBody());
});

await new Promise<void>((resolve) => mockOpenAI.listen(0, "127.0.0.1", resolve));
const mockPort = (mockOpenAI.address() as AddressInfo).port;

// Point the OpenAI SDK at the mock server BEFORE importing the app.
// The SDK reads OPENAI_BASE_URL at client construction time (inside getOpenAI()).
process.env["OPENAI_BASE_URL"] = `http://127.0.0.1:${mockPort}`;
// Ensure the key passes getOpenAI() validation (must start with "sk-")
process.env["OPENAI_API_KEY"] = "sk-test-key-for-unit-tests-only";
process.env["TAVILY_API_KEY"] = "tvly-test-key-for-unit-tests-only";

// Intercept only Tavily. OpenAI requests continue to the local mock server.
const nativeFetch = globalThis.fetch;
let tavilyMode: "official-results" | "bad-request" = "official-results";
let tavilyRequestCount = 0;
interface CapturedTavilyRequest {
  headers: Headers;
  body: Record<string, unknown>;
}
let lastTavilyRequest: CapturedTavilyRequest | null = null;
function getCapturedTavilyRequest(): CapturedTavilyRequest {
  if (!lastTavilyRequest) throw new Error("Tavily request details were not captured");
  return lastTavilyRequest;
}
globalThis.fetch = async (input, init) => {
  const url = input instanceof Request ? input.url : String(input);
  if (url !== "https://api.tavily.com/search") return nativeFetch(input, init);

  tavilyRequestCount += 1;
  const request = new Request(input, init);
  lastTavilyRequest = {
    headers: request.headers,
    body: JSON.parse(await request.text()) as Record<string, unknown>,
  };
  if (tavilyMode === "bad-request") {
    return new Response(JSON.stringify({ detail: { error: "Invalid test field" } }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }
  return new Response(JSON.stringify({
    results: [
      { title: "نظام الأحوال الشخصية | هيئة الخبراء", url: "https://laws.boe.gov.sa/", content: "نص نظامي رسمي سعودي متعلق بالأحوال الشخصية.", score: 0.91 },
      { title: "وزارة العدل", url: "https://moj.gov.sa/", content: "خدمة رسمية لوزارة العدل في المملكة العربية السعودية.", score: 0.86 },
      { title: "ناجز", url: "https://najiz.sa/", content: "منصة ناجز الرسمية للخدمات العدلية.", score: 0.82 },
    ],
  }), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
};

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
const { loadServiceModule } = await import("../lib/legal-charter.js");

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
  const phone = `05${uuidv4().replace(/\D/g, "").slice(0, 8)}`;

  const regRes = await api(BASE, "POST", "/api/auth/register", {
    body: { name: "Chat Test User", email, password, phone },
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
  await db.update(consultationsTable)
    .set({ serviceSessionId: session.id })
    .where(eq(consultationsTable.id, cons.id));

  return { consultationId: cons.id, sessionId: session.id, subscriptionId: sub.id, packageId: pkg.id };
}

async function teardown(userId: number, packageId: number) {
  // Order matters due to FK constraints; cascade on user_id handles most tables
  await db.delete(usersTable).where(eq(usersTable.id, userId)).catch(() => {});
  await db.delete(packagesTable).where(eq(packagesTable.id, packageId)).catch(() => {});
}

await test("Judicial consultation module is authored and available to the agent", async () => {
  const module = loadServiceModule("judicial");
  assert.ok(module, "judicial service module must be available");
  assert.ok(module.includes("مقابلة قضائية"), "judicial module must contain service instructions");
  assert.ok(!module.includes("قيد التحرير"), "judicial module must not be a placeholder");
});

// ─── Test 1: OpenAI network error (ECONNREFUSED) ──────────────────────────────

await test("OpenAI network error → isError:true, user message removed, session deleted", async () => {
  const { token, userId } = await registerTestUser();
  const { consultationId, sessionId, packageId } = await setupConsultation(userId);
  cleanupActions.push(() => teardown(userId, packageId));

  mockMode = "close"; // mock server will close socket immediately

  const res = await api(BASE, "POST", `/api/consultations/${consultationId}/chat`, {
    token,
    body: { message: "مرحبا" },
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
    body: { message: "مرحبا" },
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

await test("OpenAI connection failure → explicit non-billable error", async () => {
  const { token, userId } = await registerTestUser();
  const { consultationId, sessionId, packageId } = await setupConsultation(userId);
  cleanupActions.push(() => teardown(userId, packageId));

  mockMode = "close";
  const res = await api(BASE, "POST", `/api/consultations/${consultationId}/chat`, {
    token,
    body: { message: "مرحبا" },
  });

  assert.equal(res.status, 200, `expected 200, got ${res.status}: ${JSON.stringify(res.body)}`);
  assert.equal(res.body.isError, true);
  assert.equal(res.body.code, "AI_PROVIDER_FAILURE");
  assert.match(res.body.reply, /لم تُحتسب/);

  const sessions = await db.select().from(serviceSessionsTable)
    .where(eq(serviceSessionsTable.id, sessionId));
  assert.equal(sessions.length, 0, "service session must be released when the provider connection fails");
});

// ─── Test 3: missing verifier must be no-charge ────────────────────────────────

await test("Missing live legal verifier → 503, message removed, session released", async () => {
  const { token, userId } = await registerTestUser();
  const { consultationId, sessionId, subscriptionId, packageId } = await setupConsultation(userId);
  cleanupActions.push(() => teardown(userId, packageId));

  const originalVerifierKey = process.env.TAVILY_API_KEY;
  delete process.env.TAVILY_API_KEY;
  try {
    const res = await api(BASE, "POST", `/api/consultations/${consultationId}/chat`, {
      token,
      body: { message: "ما هي الإجراءات النظامية لفسخ عقد الإيجار السكني عند إخلال المستأجر؟" },
    });
    assert.equal(res.status, 503, `expected 503, got ${res.status}: ${JSON.stringify(res.body)}`);
    assert.equal(res.body.code, "LEGAL_VERIFICATION_UNAVAILABLE");
    assert.equal(res.body.retryable, true);

    const messages = await db.select().from(consultationMessagesTable)
      .where(eq(consultationMessagesTable.consultationId, consultationId));
    assert.equal(messages.length, 0, "provisional user message must be removed when verification is unavailable");

    const sessions = await db.select().from(serviceSessionsTable)
      .where(eq(serviceSessionsTable.id, sessionId));
    assert.equal(sessions.length, 0, "service session must be released when verification is unavailable");

    const [sub] = await db.select().from(subscriptionsTable)
      .where(eq(subscriptionsTable.id, subscriptionId));
    assert.equal(sub.consultationsUsed, 0, "unverified consultation must not consume a quota unit");
  } finally {
    if (originalVerifierKey === undefined) delete process.env.TAVILY_API_KEY;
    else process.env.TAVILY_API_KEY = originalVerifierKey;
  }
});

// ─── Attachment fact intake: Tavily only after facts are complete ──────────────

async function startAttachmentIntake(token: string, consultationId: number): Promise<{ status: number; body: any }> {
  mockMode = "success";
  mockAssistantContent = "الوقائع الظاهرة: يوجد عقد ونزاع بشأن الإخلال. ما تاريخ الإخلال الذي تستند إليه؟ [[RABAB_ATTACHMENT_INTAKE:MORE]]";
  tavilyRequestCount = 0;
  return api(BASE, "POST", `/api/consultations/${consultationId}/chat`, {
    token,
    body: {
      attachmentName: "agreement.txt",
      message: "[محتوى مرفق للتحليل]\nعقد تجاري ونزاع حول الإخلال.\n[/محتوى مرفق للتحليل]",
    },
  });
}

await test("Attachment intake asks one question without Tavily or quota charge", async () => {
  const { token, userId } = await registerTestUser();
  const { consultationId, sessionId, subscriptionId, packageId } = await setupConsultation(userId);
  cleanupActions.push(() => teardown(userId, packageId));

  tavilyMode = "bad-request";
  const intake = await startAttachmentIntake(token, consultationId);
  assert.equal(intake.status, 200);
  assert.equal(intake.body.interviewPhase, "collecting_facts");
  assert.equal(tavilyRequestCount, 0, "Tavily must not run while facts are being collected");
  assert.equal((intake.body.reply.match(/[؟?]/g) ?? []).length, 1, "intake must ask exactly one question");

  const [sub] = await db.select().from(subscriptionsTable).where(eq(subscriptionsTable.id, subscriptionId));
  assert.equal(sub.consultationsUsed, 0, "fact intake must not consume a quota unit");
  const sessions = await db.select().from(serviceSessionsTable).where(eq(serviceSessionsTable.id, sessionId));
  assert.equal(sessions.length, 0, "fact-intake reservation must be released");
});

await test("Attachment facts trigger official Tavily request only when ready", async () => {
  const { token, userId } = await registerTestUser();
  const { consultationId, subscriptionId, packageId } = await setupConsultation(userId);
  cleanupActions.push(() => teardown(userId, packageId));

  const intake = await startAttachmentIntake(token, consultationId);
  assert.equal(intake.status, 200);
  assert.equal(tavilyRequestCount, 0);

  mockAssistantContent = "وقائع مكتملة: عقد تجاري، إخلال مزعوم، والمطلوب تحديد المسار النظامي. [[RABAB_ATTACHMENT_INTAKE:READY]]";
  tavilyMode = "official-results";
  tavilyRequestCount = 0;
  lastTavilyRequest = null;
  const final = await api(BASE, "POST", `/api/consultations/${consultationId}/chat`, {
    token,
    body: { message: "أطلب معرفة المسار النظامي للمطالبة بسبب الإخلال بالعقد." },
  });
  assert.equal(final.status, 200, `expected verified reply, got ${final.status}: ${JSON.stringify(final.body)}`);
  assert.equal(tavilyRequestCount, 1, "Tavily must run once facts are complete");

  const tavilyRequest = getCapturedTavilyRequest();
  assert.equal(tavilyRequest.headers.get("authorization"), "Bearer tvly-test-key-for-unit-tests-only");
  assert.equal(tavilyRequest.body.api_key, undefined, "legacy api_key body field must not be sent");
  assert.equal(tavilyRequest.body.search_depth, "advanced");
  assert.equal(tavilyRequest.body.max_results, 6);
  assert.equal(tavilyRequest.body.include_domains_mode, "filter");
  assert.match(String((tavilyRequest.body.include_domains as string[]).join(" ")), /laws\.boe\.gov\.sa/);

  const [sub] = await db.select().from(subscriptionsTable).where(eq(subscriptionsTable.id, subscriptionId));
  assert.equal(sub.consultationsUsed, 1, "only the verified final opinion may consume a quota unit");
});

await test("Failed Tavily verification after attachment intake does not charge", async () => {
  const { token, userId } = await registerTestUser();
  const { consultationId, subscriptionId, packageId } = await setupConsultation(userId);
  cleanupActions.push(() => teardown(userId, packageId));

  const intake = await startAttachmentIntake(token, consultationId);
  assert.equal(intake.status, 200);

  mockAssistantContent = "وقائع مكتملة: عقد تجاري، إخلال مزعوم، والمطلوب تحديد المسار النظامي. [[RABAB_ATTACHMENT_INTAKE:READY]]";
  tavilyMode = "bad-request";
  tavilyRequestCount = 0;
  const failedVerification = await api(BASE, "POST", `/api/consultations/${consultationId}/chat`, {
    token,
    body: { message: "تاريخ الإخلال هو 1 محرم 1447هـ وأطلب المسار النظامي." },
  });
  assert.equal(failedVerification.status, 503);
  assert.equal(failedVerification.body.code, "LEGAL_VERIFICATION_UNAVAILABLE");
  assert.equal(tavilyRequestCount, 1);

  const { getTavilyStats } = await import("../lib/legal-search");
  const tavilyStats = getTavilyStats();
  assert.equal(tavilyStats.lastHttpStatus, 400);
  assert.match(tavilyStats.lastErrorMessage ?? "", /Invalid test field/);
  assert.doesNotMatch(tavilyStats.lastErrorMessage ?? "", /tvly-/);

  const [sub] = await db.select().from(subscriptionsTable).where(eq(subscriptionsTable.id, subscriptionId));
  assert.equal(sub.consultationsUsed, 0, "failed final verification must not consume a quota unit");
  const messages = await db.select().from(consultationMessagesTable)
    .where(eq(consultationMessagesTable.consultationId, consultationId));
  assert.equal(messages.filter((message) => message.role === "user").length, 1, "failed final request must be removed");
});

// ─── Test 4: Successful reply ─────────────────────────────────────────────────

await test("Successful OpenAI reply → session committed (counted=true), user message kept", async () => {
  const { token, userId } = await registerTestUser();
  const { consultationId, sessionId, subscriptionId, packageId } = await setupConsultation(userId);
  cleanupActions.push(() => teardown(userId, packageId));

  mockMode = "success";
  mockAssistantContent = "هذا رد اختباري من OpenAI.";

  const res = await api(BASE, "POST", `/api/consultations/${consultationId}/chat`, {
    token,
    body: { message: "مرحبا" },
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
globalThis.fetch = nativeFetch;

console.log(`\n${passed + failed} tests: ${passed} passed, ${failed} failed\n`);
// Force-exit: pino worker threads keep the process alive otherwise.
process.exit(failed > 0 ? 1 : 0);
