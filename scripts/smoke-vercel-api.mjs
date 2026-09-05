import assert from "node:assert/strict";
import { createServer } from "node:http";

process.env.NODE_ENV = "test";
delete process.env.SESSION_SECRET;
delete process.env.DATABASE_URL;
delete process.env.OPENAI_API_KEY;
delete process.env.OPENAI_ADMIN_KEY;

const { default: handler } = await import("../api/index.mjs");
const server = createServer((request, response) => {
  Promise.resolve(handler(request, response)).catch((error) => {
    response.statusCode = 500;
    response.end(String(error));
  });
});

await new Promise((resolve, reject) => {
  server.once("error", reject);
  server.listen(0, "127.0.0.1", resolve);
});

let failure;
try {
  const address = server.address();
  assert(address && typeof address === "object");
  const baseUrl = `http://127.0.0.1:${address.port}`;

  for (const pathname of ["/api/health", "/api/healthz"]) {
    const response = await fetch(`${baseUrl}${pathname}`);
    assert.equal(response.status, 200, `${pathname} should return HTTP 200`);
    assert.deepEqual(await response.json(), { status: "ok" });
  }

  const misconfigured = await fetch(`${baseUrl}/api/does-not-exist`);
  assert.equal(misconfigured.status, 503, "missing required configuration should return HTTP 503");
  assert.equal((await misconfigured.json()).code, "SERVICE_MISCONFIGURED");

  process.env.SESSION_SECRET = "ci-only-session-secret-not-for-production";
  process.env.DATABASE_URL = "postgresql://ci:ci@127.0.0.1:5432/ci";

  const response = await fetch(`${baseUrl}/api/does-not-exist`);
  assert.equal(response.status, 404, "unknown API route should reach Express and return HTTP 404");
  assert.deepEqual(await response.json(), {
    error: "المسار غير موجود",
    code: "NOT_FOUND",
  });

  const diagnostics = await fetch(`${baseUrl}/api/diagnostics`);
  assert.equal(diagnostics.status, 403, "diagnostics must require administrator access");

  const csrfRejected = await fetch(`${baseUrl}/api/does-not-exist`, {
    method: "POST",
    headers: {
      Cookie: "connect.sid=fake-session",
      Origin: "https://untrusted.example",
    },
  });
  assert.equal(csrfRejected.status, 403, "untrusted cookie-authenticated writes must be rejected");
  assert.equal((await csrfRejected.json()).code, "CSRF_REJECTED");
} catch (error) {
  failure = error;
} finally {
  await new Promise((resolve, reject) => {
    server.close((error) => (error ? reject(error) : resolve()));
  });
}

if (failure) {
  console.error(failure);
  process.exit(1);
}

console.log("Vercel API smoke test passed");
process.exit(0);
