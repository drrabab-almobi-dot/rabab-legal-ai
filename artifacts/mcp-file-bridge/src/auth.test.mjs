import assert from "node:assert/strict";
import test from "node:test";
import { authorizeBearerHeader, tokenFingerprint } from "./auth.mjs";

test("accepts the active token and supports an expiring rotation grace token", () => {
  const before = { ...process.env };
  try {
    process.env.MCP_FILES_TOKEN = "a".repeat(48);
    process.env.MCP_FILES_TOKEN_PREVIOUS = "b".repeat(48);
    process.env.MCP_FILES_TOKEN_PREVIOUS_EXPIRES_AT = "2030-01-01T00:00:00.000Z";
    delete process.env.MCP_FILES_TOKEN_REVOKED_HASHES;

    assert.equal(authorizeBearerHeader(`Bearer ${"a".repeat(48)}`), true);
    assert.equal(authorizeBearerHeader(`Bearer ${"b".repeat(48)}`, Date.parse("2029-01-01T00:00:00.000Z")), true);
    assert.equal(authorizeBearerHeader(`Bearer ${"b".repeat(48)}`, Date.parse("2031-01-01T00:00:00.000Z")), false);

    process.env.MCP_FILES_TOKEN_REVOKED_HASHES = tokenFingerprint("a".repeat(48));
    assert.equal(authorizeBearerHeader(`Bearer ${"a".repeat(48)}`), false);
  } finally {
    for (const key of Object.keys(process.env)) {
      if (!(key in before)) delete process.env[key];
    }
    Object.assign(process.env, before);
  }
});