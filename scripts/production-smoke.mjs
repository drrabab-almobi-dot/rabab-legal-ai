import { writeFile } from "node:fs/promises";

const REPORT_PATH =
  process.env.PRODUCTION_SMOKE_REPORT ?? "production-smoke-report.json";
const REQUEST_TIMEOUT_MS = 15_000;
const MAX_RESPONSE_MS = 10_000;

const checks = [
  {
    name: "frontend-login",
    url: "https://rabablegal.com/login",
    validate: (response) => response.status === 200,
    expected: "HTTP 200",
  },
  {
    name: "api-health",
    url: "https://rabab-legal-ai-api.vercel.app/api/health",
    validate: async (response) =>
      response.status === 200 && (await response.json()).status === "ok",
    expected: "HTTP 200 with { status: 'ok' }",
  },
  {
    name: "auth-providers",
    url: "https://rabablegal.com/api/auth/providers",
    validate: async (response) =>
      response.status === 200 && (await response.json()).google === true,
    expected: "HTTP 200 with Google provider enabled",
  },
  {
    name: "google-oauth-start",
    url: "https://rabablegal.com/api/auth/google",
    redirect: "manual",
    validate: (response) =>
      response.status === 302 &&
      response.headers
        .get("location")
        ?.startsWith("https://accounts.google.com/") === true,
    expected: "HTTP 302 to accounts.google.com",
  },
];

async function runCheck(check) {
  const startedAt = Date.now();
  try {
    const response = await fetch(check.url, {
      redirect: check.redirect ?? "follow",
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      headers: { "User-Agent": "RABAB-LEGAL-AI-production-monitor/1.0" },
    });
    const latencyMs = Date.now() - startedAt;
    const responseValid = await check.validate(response);
    const latencyValid = latencyMs <= MAX_RESPONSE_MS;

    return {
      name: check.name,
      url: check.url,
      ok: responseValid && latencyValid,
      status: response.status,
      latencyMs,
      expected: check.expected,
      failure: responseValid
        ? latencyValid
          ? null
          : `response exceeded ${MAX_RESPONSE_MS}ms`
        : `response did not satisfy ${check.expected}`,
    };
  } catch (error) {
    return {
      name: check.name,
      url: check.url,
      ok: false,
      status: null,
      latencyMs: Date.now() - startedAt,
      expected: check.expected,
      failure: error instanceof Error ? error.message : String(error),
    };
  }
}

const results = await Promise.all(checks.map(runCheck));
const failed = results.filter((result) => !result.ok);
const report = {
  monitoredAt: new Date().toISOString(),
  ok: failed.length === 0,
  timeoutMs: REQUEST_TIMEOUT_MS,
  maxResponseMs: MAX_RESPONSE_MS,
  checks: results,
};

await writeFile(REPORT_PATH, `${JSON.stringify(report, null, 2)}\n`, "utf8");
for (const result of results) {
  const details =
    result.status === null
      ? result.failure
      : `HTTP ${result.status}, ${result.latencyMs}ms`;
  console.log(`${result.ok ? "PASS" : "FAIL"} ${result.name}: ${details}`);
}

if (failed.length > 0) {
  console.error(
    `Production smoke monitor failed: ${failed.map((result) => result.name).join(", ")}`,
  );
  process.exit(1);
}

console.log("Production smoke monitor passed");
