/**
 * Self-contained tests for buildMetadataSample and preFilterLegalNumbers.
 * Runs with plain Node.js — no build step required.
 *
 *   node src/lib/document-indexer.test.mjs
 */

import assert from "node:assert/strict";

// ─── Inline the pure helpers (copied from document-indexer.ts) ────────────────

function buildMetadataSample(text) {
  const t = text.trim();
  if (t.length <= 4500) return t;

  const head   = t.slice(0, 2000);
  const midPos = Math.floor(t.length / 2) - 500;
  const mid    = t.slice(Math.max(0, midPos), midPos + 1000);
  const tail   = t.slice(Math.max(0, t.length - 1500));

  const parts = [head];
  if (!head.includes(mid.slice(0, 40))) parts.push(`[...]\n${mid}`);
  if (!head.includes(tail.slice(0, 40)) && !mid.includes(tail.slice(0, 40))) {
    parts.push(`[...]\n${tail}`);
  }
  return parts.join("\n");
}

const CASE_PATTERNS = [
  /(?:قضية|القضية)\s*رقم\s*([\u0660-\u0669\d][\/\u0660-\u0669\d\-]*)/u,
  /رقم\s+القضية\s*([\u0660-\u0669\d][\/\u0660-\u0669\d\-]*)/u,
  /م\s*\/\s*[تقنيبج]\s*\/\s*([\u0660-\u0669\d][\/\u0660-\u0669\d\-]*)/u,
  /\bقضية\s+(?:رقمها|رقم)\s*([\u0660-\u0669\d][\/\u0660-\u0669\d\-]*)/u,
];
const RULING_PATTERNS = [
  /(?:حكم|الحكم)\s*رقم\s*([\u0660-\u0669\d][\/\u0660-\u0669\d\-]*)/u,
  /رقم\s+الحكم\s*([\u0660-\u0669\d][\/\u0660-\u0669\d\-]*)/u,
];

function preFilterLegalNumbers(text) {
  let caseNumberHint = null;
  for (const re of CASE_PATTERNS) {
    const m = re.exec(text);
    if (m?.[1]) { caseNumberHint = m[1].trim(); break; }
  }
  let rulingNumberHint = null;
  for (const re of RULING_PATTERNS) {
    const m = re.exec(text);
    if (m?.[1]) { rulingNumberHint = m[1].trim(); break; }
  }
  return { caseNumberHint, rulingNumberHint };
}

// ─── Test runner ──────────────────────────────────────────────────────────────
let passed = 0, failed = 0;
function test(name, fn) {
  try {
    fn();
    console.log(`  ✓ ${name}`);
    passed++;
  } catch (err) {
    console.error(`  ✗ ${name}`);
    console.error(`    ${err.message}`);
    failed++;
  }
}

// ─── buildMetadataSample ──────────────────────────────────────────────────────
console.log("\nbuildMetadataSample");

test("short document returned as-is (≤ 4500 chars)", () => {
  const text = "أ".repeat(3000);
  assert.equal(buildMetadataSample(text), text.trim());
});

test("long document starts with the first 2000 chars", () => {
  const head   = "بسم الله الرحمن الرحيم".padEnd(2000, "أ");
  const text   = head + "ب".repeat(5000) + "ت".repeat(1500);
  const sample = buildMetadataSample(text);
  assert.ok(sample.startsWith(head.slice(0, 100)), "sample must start with the document head");
});

test("long document includes the last 1500 chars (court stamp)", () => {
  const tailText = "ختم المحكمة".padEnd(1500, "ت");
  const text     = "أ".repeat(2000) + "ب".repeat(5000) + tailText;
  const sample   = buildMetadataSample(text);
  assert.ok(sample.includes(tailText.slice(0, 30)), "sample must include content from the document tail");
});

test("long document with distinct sections contains [...] separator", () => {
  // Each section has a unique prefix so deduplication doesn't collapse them
  const head = "القسم-الأول-".repeat(200);   // 2400 chars
  const body = "القسم-الوسط-".repeat(500);   // 6000 chars
  const tail = "القسم-الأخير-".repeat(200);  // 2600 chars
  const sample = buildMetadataSample(head + body + tail);
  assert.ok(sample.includes("[...]"), "sample must contain [...] separator for omitted sections");
});

test("total sample length stays below 5000 chars for a 20 000-char document", () => {
  const sample = buildMetadataSample("ص".repeat(20000));
  assert.ok(sample.length < 5000, `sample too long: ${sample.length}`);
});

// ─── preFilterLegalNumbers ────────────────────────────────────────────────────
console.log("\npreFilterLegalNumbers");

test("extracts 'قضية رقم X/Y' with Arabic-Indic numerals", () => {
  const { caseNumberHint } = preFilterLegalNumbers("في قضية رقم ١٢٣٤/١٤٤٥ المنظورة أمام المحكمة");
  assert.equal(caseNumberHint, "١٢٣٤/١٤٤٥");
});

test("extracts 'رقم القضية X/Y' with Western numerals", () => {
  const { caseNumberHint } = preFilterLegalNumbers("رقم القضية 567/1446 - دائرة الأحوال الشخصية");
  assert.equal(caseNumberHint, "567/1446");
});

test("extracts 'm/t/X' abbreviated court pattern", () => {
  const { caseNumberHint } = preFilterLegalNumbers("القضية م/ت/٩٨٧ لعام ١٤٤٥");
  assert.ok(caseNumberHint?.includes("٩٨٧"), `expected ٩٨٧ in: ${caseNumberHint}`);
});

test("extracts 'حكم رقم X' ruling-number pattern", () => {
  const { rulingNumberHint } = preFilterLegalNumbers("صدر حكم رقم ٤٥/١٤٤٤ بتاريخ اليوم");
  assert.equal(rulingNumberHint, "٤٥/١٤٤٤");
});

test("extracts 'رقم الحكم X' ruling-number pattern", () => {
  const { rulingNumberHint } = preFilterLegalNumbers("وفي ختم الجلسة رقم الحكم 88 صدر القرار");
  assert.equal(rulingNumberHint, "88");
});

test("returns null hints when no patterns match", () => {
  const { caseNumberHint, rulingNumberHint } = preFilterLegalNumbers("نص قانوني عام بدون أرقام");
  assert.equal(caseNumberHint,   null);
  assert.equal(rulingNumberHint, null);
});

test("extracts both case and ruling numbers from same document", () => {
  const text = "بناءً على القضية رقم ٢٢٢/١٤٤٥\nصدر حكم رقم ١١/١٤٤٥";
  const { caseNumberHint, rulingNumberHint } = preFilterLegalNumbers(text);
  assert.equal(caseNumberHint,   "٢٢٢/١٤٤٥");
  assert.equal(rulingNumberHint, "١١/١٤٤٥");
});

test("stamp at document end (tail scenario) is still detected", () => {
  const body  = "ن".repeat(8000);
  const stamp = "\nالقضية رقم ٧٧٧/١٤٤٤\nحكم رقم ٥٥/١٤٤٤\nالمحكمة الجزائية بالرياض";
  const { caseNumberHint, rulingNumberHint } = preFilterLegalNumbers(body + stamp);
  assert.equal(caseNumberHint,   "٧٧٧/١٤٤٤");
  assert.equal(rulingNumberHint, "٥٥/١٤٤٤");
});

// ─── Summary ──────────────────────────────────────────────────────────────────
console.log(`\n${passed + failed} tests: ${passed} passed, ${failed} failed\n`);
if (failed > 0) process.exit(1);
