/**
 * Tests for extractCaseMetadata helpers:
 *   - buildMetadataSample
 *   - preFilterLegalNumbers
 *
 * Run with:  node --loader ts-node/esm src/lib/document-indexer.test.ts
 * Or (after build):  node dist/document-indexer.test.mjs
 *
 * Uses Node's built-in `assert` — no external test framework required.
 */

import assert from "node:assert/strict";
import { buildMetadataSample, preFilterLegalNumbers } from "./document-indexer.js";

// ─── helpers ──────────────────────────────────────────────────────────────────
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

function repeat(char: string, n: number): string {
  return char.repeat(n);
}

// ─── buildMetadataSample ──────────────────────────────────────────────────────
console.log("\nbuildMetadataSample");

test("short document returned as-is (≤ 4500 chars)", () => {
  const text = "أ".repeat(3000);
  const result = buildMetadataSample(text);
  assert.equal(result, text.trim());
});

test("long document includes the first 2000 chars", () => {
  const head   = "بسم الله الرحمن الرحيم".padEnd(2000, "أ");
  const filler = repeat("ب", 5000);
  const tail   = repeat("ت", 1500);
  const text   = head + filler + tail;

  const sample = buildMetadataSample(text);
  // First 2000 chars of the text should appear at the start of the sample
  assert.ok(sample.startsWith(head.slice(0, 100)), "sample should start with the document head");
});

test("long document includes the last 1500 chars", () => {
  const head   = repeat("أ", 2000);
  const filler = repeat("ب", 5000);
  const tailText = "ختم المحكمة".padEnd(1500, "ت");
  const text   = head + filler + tailText;

  const sample = buildMetadataSample(text);
  // The distinctive tail text should appear somewhere in the sample
  assert.ok(
    sample.includes(tailText.slice(0, 30)),
    "sample should include content from the document tail",
  );
});

test("long document includes a middle section marker", () => {
  const text = repeat("م", 10000);
  const sample = buildMetadataSample(text);
  assert.ok(sample.includes("[...]"), "sample should contain [...] separator for omitted sections");
});

test("total sample length is well below the full document", () => {
  const text   = repeat("ص", 20000);
  const sample = buildMetadataSample(text);
  // Max expected: 2000 + ~20 (sep) + 1000 + ~20 (sep) + 1500 = ~4560
  assert.ok(sample.length < 5000, `sample too long: ${sample.length}`);
});

// ─── preFilterLegalNumbers ────────────────────────────────────────────────────
console.log("\npreFilterLegalNumbers");

test("extracts 'قضية رقم X/Y' pattern (Arabic numerals)", () => {
  const text = "في قضية رقم ١٢٣٤/١٤٤٥ المنظورة أمام المحكمة التجارية";
  const { caseNumberHint } = preFilterLegalNumbers(text);
  assert.equal(caseNumberHint, "١٢٣٤/١٤٤٥");
});

test("extracts 'رقم القضية X/Y' pattern (Western numerals)", () => {
  const text = "رقم القضية 567/1446 - دائرة الأحوال الشخصية";
  const { caseNumberHint } = preFilterLegalNumbers(text);
  assert.equal(caseNumberHint, "567/1446");
});

test("extracts 'م/ت/X' abbreviated court pattern", () => {
  const text = "القضية م/ت/٩٨٧ لعام ١٤٤٥";
  const { caseNumberHint } = preFilterLegalNumbers(text);
  assert.ok(caseNumberHint?.includes("٩٨٧"), `expected ٩٨٧ in: ${caseNumberHint}`);
});

test("extracts 'حكم رقم X' pattern", () => {
  const text = "صدر حكم رقم ٤٥/١٤٤٤ بتاريخ اليوم";
  const { rulingNumberHint } = preFilterLegalNumbers(text);
  assert.equal(rulingNumberHint, "٤٥/١٤٤٤");
});

test("extracts 'رقم الحكم X' pattern", () => {
  const text = "وفي ختم الجلسة رقم الحكم 88 صدر القرار";
  const { rulingNumberHint } = preFilterLegalNumbers(text);
  assert.equal(rulingNumberHint, "88");
});

test("returns null hints when no patterns match", () => {
  const text = "هذا نص قانوني عام لا يحتوي على أرقام قضايا محددة";
  const { caseNumberHint, rulingNumberHint } = preFilterLegalNumbers(text);
  assert.equal(caseNumberHint,   null);
  assert.equal(rulingNumberHint, null);
});

test("both hints extracted from same document", () => {
  const text = [
    "بناءً على القضية رقم ٢٢٢/١٤٤٥ المرفوعة أمام الدائرة",
    "وبعد المداولة صدر حكم رقم ١١/١٤٤٥",
  ].join("\n");
  const { caseNumberHint, rulingNumberHint } = preFilterLegalNumbers(text);
  assert.equal(caseNumberHint,   "٢٢٢/١٤٤٥");
  assert.equal(rulingNumberHint, "١١/١٤٤٥");
});

test("stamp at end of document is detected (tail scenario)", () => {
  // Simulate a long ruling where number only appears in the last few lines
  const body = repeat("ن", 8000);
  const stamp = "\nالقضية رقم ٧٧٧/١٤٤٤\nحكم رقم ٥٥/١٤٤٤\nالمحكمة الجزائية بالرياض";
  const { caseNumberHint, rulingNumberHint } = preFilterLegalNumbers(body + stamp);
  assert.equal(caseNumberHint,   "٧٧٧/١٤٤٤");
  assert.equal(rulingNumberHint, "٥٥/١٤٤٤");
});

// ─── Summary ──────────────────────────────────────────────────────────────────
console.log(`\n${passed + failed} tests: ${passed} passed, ${failed} failed\n`);
if (failed > 0) process.exit(1);
