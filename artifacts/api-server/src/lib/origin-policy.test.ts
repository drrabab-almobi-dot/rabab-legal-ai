import assert from "node:assert/strict";
import { createAllowedOrigins, isTrustedFrontendOrigin } from "./origin-policy";

let passed = 0;
function test(name: string, fn: () => void) {
  fn();
  passed++;
  console.log(`  ✓ ${name}`);
}

test("allows the canonical production domain", () => {
  assert.equal(isTrustedFrontendOrigin("https://rabablegal.com"), true);
  assert.equal(isTrustedFrontendOrigin("https://www.rabablegal.com"), true);
});

test("allows the Vercel frontend deployment and branch alias", () => {
  assert.equal(
    isTrustedFrontendOrigin("https://rabab-legal-34cv7c16r-drrabab-almobi-2417s-projects.vercel.app"),
    true,
  );
  assert.equal(
    isTrustedFrontendOrigin("https://rabab-legal-ai-git-design-52a655-drrabab-almobi-2417s-projects.vercel.app"),
    true,
  );
});

test("allows explicitly configured first-party origins", () => {
  const configured = "https://portal.rabablegal.com, https://preview.rabablegal.com";
  assert.equal(isTrustedFrontendOrigin("https://portal.rabablegal.com", configured), true);
  assert.equal(createAllowedOrigins(configured).size >= 6, true);
});

test("rejects untrusted and look-alike origins", () => {
  assert.equal(isTrustedFrontendOrigin("https://evil.example"), false);
  assert.equal(isTrustedFrontendOrigin("https://rabab-legal-attacker.vercel.app"), false);
  assert.equal(isTrustedFrontendOrigin("https://rabab-legal-ai-drrabab-almobi-2417s-projects.evil.example"), false);
});

console.log(`\n${passed} origin-policy tests passed\n`);
