/**
 * Tests for isCorruptCaseMetadata — the boundary predicate that decides
 * whether a document's caseMetadata should be erased during the
 * extract-all-metadata auto-cleanup step.
 *
 * Run with:
 *   node --loader ts-node/esm src/lib/citation-cleanup.test.ts
 *
 * Uses Node's built-in `assert` — no external test framework required.
 */

import assert from "node:assert/strict";
import { isCorruptCaseMetadata } from "./citation-cleanup.js";

// ─── tiny test harness (mirrors document-indexer.test.ts) ─────────────────────
let passed = 0;
let failed = 0;

function test(name: string, fn: () => void): void {
  try {
    fn();
    console.log(`  ✓ ${name}`);
    passed++;
  } catch (err: any) {
    console.error(`  ✗ ${name}`);
    console.error(`    ${err.message}`);
    failed++;
  }
}

// ─── Cases that SHOULD be cleaned (all three core fields absent) ──────────────
console.log("\nisCorruptCaseMetadata — should be cleaned");

test("returns true when all core fields are null", () => {
  assert.equal(
    isCorruptCaseMetadata({ caseNumber: null, rulingNumber: null, court: null }),
    true,
  );
});

test("returns true when all core fields are empty strings", () => {
  assert.equal(
    isCorruptCaseMetadata({ caseNumber: "", rulingNumber: "", court: "" }),
    true,
  );
});

test("returns true when core fields are missing keys entirely", () => {
  // JSON stored by GPT may simply omit a key instead of setting it to null
  assert.equal(isCorruptCaseMetadata({}), true);
});

test("returns true when only disputeSubject is set (no core fields)", () => {
  assert.equal(
    isCorruptCaseMetadata({
      caseNumber: null,
      rulingNumber: null,
      court: null,
      disputeSubject: "نزاع تجاري حول عقد توريد",
    }),
    true,
  );
});

test("returns true when only hijriDate is set (no core fields)", () => {
  assert.equal(
    isCorruptCaseMetadata({
      hijriDate: "١٤٤٥/٠٣/١٠",
      caseNumber: "",
      rulingNumber: "",
      court: "",
    }),
    true,
  );
});

test("returns true when only deedNumber is set (no core fields)", () => {
  assert.equal(
    isCorruptCaseMetadata({
      deedNumber: "صك-٩٩٩",
      caseNumber: null,
      rulingNumber: null,
      court: "",
    }),
    true,
  );
});

test("returns true when all non-core fields are set but core are empty", () => {
  assert.equal(
    isCorruptCaseMetadata({
      caseNumber: "",
      rulingNumber: "",
      court: "",
      disputeSubject: "موضوع النزاع",
      hijriDate: "١٤٤٤/٠١/٠١",
      deedNumber: "صك-١",
    }),
    true,
  );
});

// ─── Cases that should NOT be cleaned (at least one core field present) ───────
console.log("\nisCorruptCaseMetadata — should NOT be cleaned");

test("returns false when caseNumber is set", () => {
  assert.equal(
    isCorruptCaseMetadata({
      caseNumber: "١٢٣٤/١٤٤٥",
      rulingNumber: null,
      court: null,
    }),
    false,
  );
});

test("returns false when rulingNumber is set", () => {
  assert.equal(
    isCorruptCaseMetadata({
      caseNumber: null,
      rulingNumber: "٤٥/١٤٤٤",
      court: null,
    }),
    false,
  );
});

test("returns false when court is set", () => {
  assert.equal(
    isCorruptCaseMetadata({
      caseNumber: null,
      rulingNumber: null,
      court: "المحكمة التجارية بالرياض",
    }),
    false,
  );
});

test("returns false when all three core fields are set", () => {
  assert.equal(
    isCorruptCaseMetadata({
      caseNumber: "١٢٣/١٤٤٤",
      rulingNumber: "٧٨/١٤٤٤",
      court: "المحكمة العامة",
      disputeSubject: "نزاع عقاري",
      hijriDate: "١٤٤٤/٠٥/١٥",
    }),
    false,
  );
});

test("returns false when caseNumber is whitespace-only (treated as non-empty by real GPT but kept as-is)", () => {
  // A non-empty, non-whitespace string must not be trimmed away — only pure
  // whitespace is considered empty. Verify a real value is preserved.
  assert.equal(
    isCorruptCaseMetadata({ caseNumber: "  ", rulingNumber: null, court: null }),
    true, // whitespace-only IS treated as empty
  );
  assert.equal(
    isCorruptCaseMetadata({ caseNumber: " ١ ", rulingNumber: null, court: null }),
    false, // contains a non-space character — kept
  );
});

// ─── Edge cases ───────────────────────────────────────────────────────────────
console.log("\nisCorruptCaseMetadata — edge cases");

test("returns false for null input (nothing to clean)", () => {
  assert.equal(isCorruptCaseMetadata(null), false);
});

test("returns false for undefined input (nothing to clean)", () => {
  assert.equal(isCorruptCaseMetadata(undefined), false);
});

// ─── Summary ──────────────────────────────────────────────────────────────────
console.log(`\n${passed + failed} tests: ${passed} passed, ${failed} failed\n`);
if (failed > 0) process.exit(1);
