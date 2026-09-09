import assert from "node:assert/strict";

const originalMode = process.env.OWNER_TEST_MODE;
const {
  getOwnerTestMode,
  isAdminOnlyTestingEnabled,
  isOwnerTestingPublicPath,
} = await import("./owner-test-access.js");

try {
  delete process.env.OWNER_TEST_MODE;
  assert.equal(getOwnerTestMode(), "off");
  assert.equal(isAdminOnlyTestingEnabled(), false);

  process.env.OWNER_TEST_MODE = "admin_only";
  assert.equal(getOwnerTestMode(), "admin_only");
  assert.equal(isAdminOnlyTestingEnabled(), true);

  assert.equal(isOwnerTestingPublicPath("/auth/login"), true);
  assert.equal(isOwnerTestingPublicPath("/auth/session"), true);
  assert.equal(isOwnerTestingPublicPath("/auth/google/callback"), true);
  assert.equal(isOwnerTestingPublicPath("/consultations/1/chat"), false);

  process.env.OWNER_TEST_MODE = "unexpected";
  assert.equal(getOwnerTestMode(), "off");

  console.log("Owner-only testing access policy passed");
} finally {
  if (originalMode === undefined) delete process.env.OWNER_TEST_MODE;
  else process.env.OWNER_TEST_MODE = originalMode;
}
