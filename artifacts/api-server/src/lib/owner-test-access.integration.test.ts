import assert from "node:assert/strict";
import http from "node:http";
import type { AddressInfo } from "node:net";

process.env.OWNER_TEST_MODE = "admin_only";
process.env.SESSION_SECRET ??= "owner-access-integration-test-secret";
process.env.DATABASE_URL ??= "postgresql://postgres:postgres@127.0.0.1:5432/rabab_test";
process.env.NODE_ENV ??= "test";

const { default: app } = await import("../app.js");
const server = http.createServer(app);
await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
const { port } = server.address() as AddressInfo;
const base = `http://127.0.0.1:${port}`;

async function request(path: string, method = "GET") {
  const response = await fetch(`${base}${path}`, { method });
  return { status: response.status, body: await response.json().catch(() => null) as any };
}

try {
  const mode = await request("/api/access-mode");
  assert.equal(mode.status, 200);
  assert.equal(mode.body.mode, "admin_only");

  const health = await request("/api/healthz");
  assert.equal(health.status, 200);

  const registration = await request("/api/auth/register", "POST");
  assert.equal(registration.status, 403);

  const protectedData = await request("/api/consultations/1");
  assert.equal(protectedData.status, 403);

  console.log("Owner-only integration access gate passed");
} finally {
  await new Promise<void>((resolve) => server.close(() => resolve()));
}

// Pino worker threads are intentionally retained by the app; this standalone
// harness must terminate explicitly after the server is closed.
process.exit(0);
