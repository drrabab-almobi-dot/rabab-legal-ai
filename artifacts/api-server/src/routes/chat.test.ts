/**
 * Integration tests: quota safety on POST /api/consultations/:id/chat
 *
 * Run with:
 *   node ./test-build.mjs src/routes/chat.test.ts
 *
 * Covered scenarios:
 *   1. OpenAI network error → session released, user message preserved, isError:true
 *   2. OpenAI 429 → session released, user message preserved, isError:true
 *   3. Missing live legal verifier → session released, user message preserved, no charge
 *   4. Attachment intake → one material question per turn, Tavily only after facts are ready
 *   5. Successful verified reply → service session committed once
 */

import assert from "node:assert/strict";
import http from "node:http";
import { AddressInfo } from "node:net";
import { v4 as uuidv4 } from "uuid";

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
    req.socket.destroy();
    return;
  }
  if (mockMode === "429") {
    res.writeHead(429, { "Content-Type": "application/json" });
    res.end(MOCK_429_BODY);
    return;
  }
  res.writeHead(200, { "Content-Type": "application/json" });
  res.end(mockSuccessBody());
});

await new Promise<void>((resolve) => mockOpenAI.listen(0, "127.0.0.1", resolve));
const mockPort = (mockOpenAI.address() as AddressInfo).port;

process.env["OPENAI_BASE_URL"] = `http://127.0.0.1:${mockPort}`;
process.env["OPENAI_API_KEY"] = "sk-test-key-for-unit-tests-only";
process.env["TAVILY_API_KEY"] = "tvly-test-key-for-unit-tests-only";

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
const { eq } = await import("drizzle-orm");
const { loadServiceModule } = await import("../lib/legal-charter.js");

const appServer = http.createServer(app);
await new Promise<void>((resolve) => appServer.listen(0, "127.0.0.1", resolve));
const { port } = appServer.address() as AddressInfo;
const BASE = `http://127.0.0.1:${port}`;
console.log(`\n💳 Chat quota-safety tests  (app :${port}  mock-openai :${mockPort})\n`);

async function registerTestUser(): Promise<{ token: string; userId: number }> {
  const email = `chat-test-${uuidv4()}@quota-test.local`;
  const password = "TestPass123!";
  const phone = `05${uuidv4().replace(/\D/g, "").slice(0, 8)}`;

  const regRes = await api(BASE, "POST", "/api/auth/register", {
    body: { name: "Chat Test User", email, password, phone },
  });
  assert.equal(regRes.status, 201, `register failed: ${JSON.stringify(regRes.body)}`);
  const verifyToken: string = regRes.body.verifyToken;

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

async function setupConsultation(userId: number): Promise<{
  consultationId: number;
  sessionId: number;
  subscriptionId: number;
  packageId: number;
}> {
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

  const [sub] = await db.insert(subscriptionsTable).values({
    userId,
    packageId: pkg.id,
    status: "active",
    consultationsUsed: 0,
    contractsUsed: 0,
    reviewsUsed: 0,
  }).returning();

  const [cons] = await db.insert(consultationsTable).values({
    userId,
    subscriptionId: sub.id,
    title: "استشارة اختبارية",
    status: "pending",
    chatgptUrl: "https://chatgpt.com",
  }).returning();

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
  await db.delete(usersTable).where(eq(usersTable.id, userId)).catch(() => {});
  await db.delete(packagesTable).where(eq(packagesTable.id, packageId)).catch(() => {});
}

await test("Judicial consultation module is authored and available to the agent", async () => {
  const module = loadServiceModule("judicial");
  assert.ok(module, "judicial service module must be available");
  assert.ok(module.includes("مقابلة قضائية"), "judicial module must contain service instructions");
  assert.ok(!module.includes("قيد التحرير"), "judicial module must not be a placeholder");
});

await test("OpenAI network error → isError:true, user message preserved, session released", async () => {
  const { token, userId } = await registerTestUser();
  const { consultationId, sessionId, packageId } = await setupConsultation(userId);
  cleanupActions.push(() => teardown(userId, packageId));

  mockMode = "close";
  const res = await api(BASE, "POST", `/api/consultations/${consultationId}/chat`, {
    token,
    body: { message: "مرحبا" },
  });

  assert.equal(res.status, 200, `expected 200, got ${res.status}: ${JSON.stringify(res.body)}`);
  assert.equal(res.body.isError, true, "response must have isError:true");

  const messages = await db.select().from(consultationMessagesTable)
    .where(eq(consultationMessagesTable.consultationId, consultationId));
  assert.equal(messages.filter((m) => m.role === "user").length, 1, "client facts must be preserved on provider failure");

  const sessions = await db.select().from(serviceSessionsTable)
    .where(eq(serviceSessionsTable.id, sessionId));
  assert.equal(sessions.length, 0, "service_session should be released on error");
});

await test("OpenAI 429 → isError:true, user message preserved, session released", async () => {
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

  const messages = await db.select().from(consultationMessagesTable)
    .where(eq(consultationMessagesTable.consultationId, consultationId));
  assert.equal(messages.filter((m) => m.role === "user").length, 1, "client message must remain available for retry");

  const sessions = await db.select().from(serviceSessionsTable)
    .where(eq(serviceSessionsTable.id, sessionId));
  assert.equal(sessions.length, 0, "service_session should be released on 429");
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

await test("Missing live legal verifier → 503, message preserved, session released", async () => {
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
    assert.equal(messages.filter((m) => m.role === "user").length, 1, "client message must remain when verification is unavailable");

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
  assert.equal(tavilyRequest.body.include_domains_mode, undefined, "unsupported domain mode field must not be sent");
  assert.match(String((tavilyRequest.body.include_domains as string[]).join(" ")), /laws\.boe\.gov\.sa/);

  const [sub] = await db.select().from(subscriptionsTable).where(eq(subscriptionsTable.id, subscriptionId));
  assert.equal(sub.consultationsUsed, 1, "only the verified final opinion may consume a quota unit");
});

await test("Attachment can be ready on the first turn without forcing an unnecessary question", async () => {
  const { token, userId } = await registerTestUser();
  const { consultationId, subscriptionId, packageId } = await setupConsultation(userId);
  cleanupActions.push(() => teardown(userId, packageId));

  mockMode = "success";
  mockAssistantContent = "وقائع مكتملة: العقد والأطراف والإخلال والطلب محددة. [[RABAB_ATTACHMENT_INTAKE:READY]]";
  tavilyMode = "official-results";
  tavilyRequestCount = 0;

  const result = await api(BASE, "POST", `/api/consultations/${consultationId}/chat`, {
    token,
    body: {
      attachmentName: "complete-agreement.txt",
      message: "[محتوى مرفق للتحليل]\nعقد تجاري بين طرفين، وقع الإخلال بتاريخ محدد، والمطلوب تحديد المسار النظامي للمطالبة.\n[/محتوى مرفق للتحليل]",
    },
  });

  assert.equal(result.status, 200, `complete attachment should proceed without forced intake question: ${JSON.stringify(result.body)}`);
  assert.notEqual(result.body.interviewPhase, "collecting_facts");
  assert.equal(tavilyRequestCount, 1, "ready first-turn attachment should proceed to verification");
  const [sub] = await db.select().from(subscriptionsTable).where(eq(subscriptionsTable.id, subscriptionId));
  assert.equal(sub.consultationsUsed, 1, "only the delivered verified final result may consume quota");
});

await test("Failed Tavily verification after attachment intake preserves facts and does not charge", async () => {
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
  assert.equal(messages.filter((message) => message.role === "user").length, 2, "both intake and final client facts must remain available for retry");
});

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

  const messages = await db.select().from(consultationMessagesTable)
    .where(eq(consultationMessagesTable.consultationId, consultationId));
  const userMsgs = messages.filter(m => m.role === "user");
  const asstMsgs = messages.filter(m => m.role === "assistant");
  assert.equal(userMsgs.length, 1, "user message must be kept on success");
  assert.equal(asstMsgs.length, 1, "assistant message must be saved on success");

  const [session] = await db.select().from(serviceSessionsTable)
    .where(eq(serviceSessionsTable.id, sessionId));
  assert.ok(session, "service_session must still exist after successful reply");
  assert.equal(session.counted, true, "service_session must be counted=true after success");

  const [sub] = await db.select().from(subscriptionsTable)
    .where(eq(subscriptionsTable.id, subscriptionId));
  assert.equal(sub.consultationsUsed, 1, "subscription consultationsUsed must be incremented to 1");
});

for (const action of cleanupActions) {
  await action().catch(() => {});
}

appServer.close();
mockOpenAI.close();
globalThis.fetch = nativeFetch;

console.log(`\n${passed + failed} tests: ${passed} passed, ${failed} failed\n`);
process.exit(failed > 0 ? 1 : 0);
