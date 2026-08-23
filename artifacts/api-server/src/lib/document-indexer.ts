/**
 * Shared document indexing logic — supports PDF, DOCX, TXT, PPTX, XLSX, XLS, DOC, RTF
 * Each file type has its own extraction strategy.
 */

import OpenAI from "openai";
import { db, knowledgeDocumentsTable, knowledgeChunksTable, type CaseMetadata } from "@workspace/db";
import { eq } from "drizzle-orm";
import { chunkText, embedTexts } from "./rag";
import { isNonLegalPage } from "./arabic-text-fix";
import AdmZip from "adm-zip";
import { createHash } from "crypto";

// ─── Page boundary tracking ───────────────────────────────────────────────────
interface PageBoundary {
  pageNum: number;    // 1-based page number
  startChar: number;  // char offset in full text (inclusive)
  endChar: number;    // char offset in full text (inclusive)
}

/**
 * Extract PDF text page-by-page using a custom pdf-parse pagerender callback.
 * Returns the full text AND per-page character boundaries so chunks can be
 * traced back to their source page.
 */
async function extractPdfWithPages(buffer: Buffer): Promise<{
  text: string;
  pageBoundaries: PageBoundary[];
  excludedPages: ExcludedPage[];
  totalPageCount: number;
}> {
  const mod = await import("pdf-parse/lib/pdf-parse.js" as any);
  const parse = mod.default ?? mod;
  const { preprocessExtractedText } = await import("./arabic-text-fix");

  const processedPages: Array<{ pageNum: number; text: string }> = [];
  let totalPageCount = 0;

  // First pass: count total pages (needed for isNonLegalPage position check)
  // We get this from the numPages after parsing
  const countOptions = { pagerender: async (_pd: any) => { totalPageCount++; return ""; } };
  try { await parse(buffer, countOptions); } catch { totalPageCount = 0; }
  // Reset and do real extraction
  totalPageCount = totalPageCount || 0;

  const options = {
    pagerender: async (pageData: any): Promise<string> => {
      const thisPage: number =
        typeof pageData.pageNumber === "number" ? pageData.pageNumber
        : typeof pageData._pageIndex === "number" ? pageData._pageIndex + 1
        : processedPages.length + 1;

      let rawText = "";
      try {
        const textContent = await pageData.getTextContent();
        let lastY: number | null = null;
        for (const item of (textContent.items as Array<{ str: string; transform?: number[] }>)) {
          const y = typeof item.transform?.[5] === "number" ? Math.round(item.transform[5]) : 0;
          if (lastY !== null && Math.abs(y - lastY) > 5) rawText += "\n";
          rawText += item.str || "";
          lastY = y;
        }
      } catch { rawText = ""; }

      // Apply Arabic direction fix per-page so boundaries stay in sync
      const { text: fixed } = preprocessExtractedText(rawText);
      processedPages.push({ pageNum: thisPage, text: fixed });
      return fixed;
    },
  };

  await parse(buffer, options);

  // Sort by page number (Promise.all may resolve out-of-order)
  processedPages.sort((a, b) => a.pageNum - b.pageNum);
  const realTotalPages = totalPageCount || processedPages.length;

  // Filter non-legal pages
  const excludedPages: ExcludedPage[] = [];
  const legalPages = processedPages.filter(({ pageNum, text }) => {
    const check = isNonLegalPage(text, pageNum, realTotalPages);
    if (check.skip) {
      excludedPages.push({ pageNum, reason: check.reason });
      return false;
    }
    return true;
  });

  // Build full text and per-page character boundaries from legal pages only
  const SEP = "\n\n";
  const pageBoundaries: PageBoundary[] = [];
  const parts: string[] = [];
  let offset = 0;

  for (let i = 0; i < legalPages.length; i++) {
    const { pageNum, text } = legalPages[i];
    pageBoundaries.push({
      pageNum,
      startChar: offset,
      endChar: offset + Math.max(0, text.length - 1),
    });
    parts.push(text);
    offset += text.length + (i < legalPages.length - 1 ? SEP.length : 0);
  }

  return { text: parts.join(SEP), pageBoundaries, excludedPages, totalPageCount: realTotalPages };
}

export interface ExcludedPage {
  pageNum: number;
  reason: string;
}

/** Find which PDF page a chunk starts and ends on by matching its first 80 chars */
function getChunkPages(
  chunkContent: string,
  fullText: string,
  pageBoundaries: PageBoundary[],
): { pageStart: number | null; pageEnd: number | null } {
  if (pageBoundaries.length === 0) return { pageStart: null, pageEnd: null };

  const fingerprint = chunkContent.slice(0, 80);
  const pos = fullText.indexOf(fingerprint);
  if (pos === -1) return { pageStart: null, pageEnd: null };

  const endPos = pos + chunkContent.length - 1;
  let pageStart: number | null = null;
  let pageEnd: number | null = null;

  for (const b of pageBoundaries) {
    if (pageStart === null && pos <= b.endChar) pageStart = b.pageNum;
    if (endPos <= b.endChar) { pageEnd = b.pageNum; break; }
    pageEnd = b.pageNum;
  }
  return { pageStart, pageEnd: pageEnd ?? pageStart };
}

// ─── Case metadata extraction ─────────────────────────────────────────────────

/**
 * Build a multi-section document sample that covers the beginning, middle, and
 * end of a Saudi judicial ruling.  Many rulings place the case/ruling number in
 * the court stamp at the end ("ختم الحكم"), so sending only the first N chars
 * causes false-null extractions.
 *
 * Layout:
 *   • First  2 000 chars — header / parties section
 *   • Middle 1 000 chars — centred around the document midpoint
 *   • Last   1 500 chars — court stamp / signature block
 */
export function buildMetadataSample(text: string): string {
  const t = text.trim();
  if (t.length <= 4500) return t;

  const head   = t.slice(0, 2000);
  const midPos = Math.floor(t.length / 2) - 500;
  const mid    = t.slice(Math.max(0, midPos), midPos + 1000);
  const tail   = t.slice(Math.max(0, t.length - 1500));

  const parts: string[] = [head];
  if (!head.includes(mid.slice(0, 40))) parts.push(`[...]\n${mid}`);
  if (!head.includes(tail.slice(0, 40)) && !mid.includes(tail.slice(0, 40))) {
    parts.push(`[...]\n${tail}`);
  }
  return parts.join("\n");
}

// ── Regex patterns for common Saudi legal number formats ──────────────────────
// Matches: "قضية رقم ١٢٣٤/١٤٤٥", "رقم القضية 234/1445", "م/ت/١٢٣٤"
// and ruling numbers: "حكم رقم ٥٦/١٤٤٤", "رقم الحكم 12"
const CASE_PATTERNS: RegExp[] = [
  /(?:قضية|القضية)\s*رقم\s*([\u0660-\u0669\d][\/\u0660-\u0669\d\-]*)/u,
  /رقم\s+القضية\s*([\u0660-\u0669\d][\/\u0660-\u0669\d\-]*)/u,
  /م\s*\/\s*[تقنيبج]\s*\/\s*([\u0660-\u0669\d][\/\u0660-\u0669\d\-]*)/u,
  /\bقضية\s+(?:رقمها|رقم)\s*([\u0660-\u0669\d][\/\u0660-\u0669\d\-]*)/u,
];
const RULING_PATTERNS: RegExp[] = [
  /(?:حكم|الحكم)\s*رقم\s*([\u0660-\u0669\d][\/\u0660-\u0669\d\-]*)/u,
  /رقم\s+الحكم\s*([\u0660-\u0669\d][\/\u0660-\u0669\d\-]*)/u,
];

/**
 * Run regex pre-filters on the full text to harvest any case / ruling numbers
 * that are explicitly formatted.  Returns hint strings passed to GPT to boost
 * extraction confidence without hallucination.
 */
export function preFilterLegalNumbers(text: string): {
  caseNumberHint: string | null;
  rulingNumberHint: string | null;
} {
  let caseNumberHint: string | null = null;
  for (const re of CASE_PATTERNS) {
    const m = re.exec(text);
    if (m?.[1]) { caseNumberHint = m[1].trim(); break; }
  }
  let rulingNumberHint: string | null = null;
  for (const re of RULING_PATTERNS) {
    const m = re.exec(text);
    if (m?.[1]) { rulingNumberHint = m[1].trim(); break; }
  }
  return { caseNumberHint, rulingNumberHint };
}

/**
 * Validate extracted case metadata and null-out any field that fails sanity
 * checks.  Mutates the object in-place so callers get a clean record before
 * it is persisted to the database.
 *
 * Rules applied:
 *  • caseNumber / rulingNumber — must contain ≥1 digit AND be ≤30 characters
 *  • deedNumber                — must contain ≥1 digit
 *  • hijriDate                 — year must be in the range 1300–1460
 *  • gregorianDate             — must be YYYY-MM-DD with year 1880–2100
 *  • court                     — 3–100 chars, not all-digits
 *  • litigationStage           — one of the four allowed enum values
 *  • disputeSubject            — ≥5 chars
 */
export function validateCaseMetadata(
  meta: Record<string, any>,
  context?: string,
): { rejectedCount: number; rejectedFields: string[] } {
  const rejected: Array<{ field: string; value: string; reason: string }> = [];

  function nullField(field: string, reason: string) {
    rejected.push({ field, value: String(meta[field]).slice(0, 60), reason });
    meta[field] = null;
  }

  // caseNumber: must contain ≥1 digit and be ≤30 chars
  if (meta.caseNumber != null) {
    const s = String(meta.caseNumber).trim();
    if (!/\d/.test(s))     nullField("caseNumber", "لا يحتوي على أرقام");
    else if (s.length > 30) nullField("caseNumber", `طويل جداً (${s.length} حرف)`);
  }
  // rulingNumber: same constraints as caseNumber
  if (meta.rulingNumber != null) {
    const s = String(meta.rulingNumber).trim();
    if (!/\d/.test(s))     nullField("rulingNumber", "لا يحتوي على أرقام");
    else if (s.length > 30) nullField("rulingNumber", `طويل جداً (${s.length} حرف)`);
  }
  // deedNumber: must contain ≥1 digit (no length cap — deed numbers vary)
  if (meta.deedNumber != null && !/\d/.test(String(meta.deedNumber))) {
    nullField("deedNumber", "لا يحتوي على أرقام");
  }
  // hijriDate: must contain a plausible hijri year (1300–1460)
  if (meta.hijriDate != null) {
    const yearMatch = String(meta.hijriDate).match(/\b(1[3-4]\d{2})\b/);
    const year = yearMatch ? parseInt(yearMatch[1], 10) : 0;
    if (year < 1300 || year > 1460) {
      nullField("hijriDate", `سنة هجرية خارج النطاق المعقول (1300–1460): ${year || "غير موجودة"}`);
    }
  }
  // gregorianDate: must be YYYY-MM-DD with year 1880–2100
  if (meta.gregorianDate != null) {
    const gm = String(meta.gregorianDate).match(/^(\d{4})-\d{2}-\d{2}$/);
    const gy = gm ? parseInt(gm[1], 10) : 0;
    if (gy < 1880 || gy > 2100) {
      nullField("gregorianDate", `تاريخ ميلادي خارج النطاق (1880–2100): ${gy || "تنسيق خاطئ"}`);
    }
  }
  // court: non-trivial string (3–100 chars, not purely numeric)
  if (meta.court != null) {
    const c = String(meta.court).trim();
    if (c.length < 3)         nullField("court", "اسم المحكمة قصير جداً");
    else if (c.length > 100)  nullField("court", `اسم المحكمة طويل جداً (${c.length} حرف)`);
    else if (/^\d+$/.test(c)) nullField("court", "اسم المحكمة أرقام فقط");
  }
  // litigationStage: must be one of the four allowed values
  const validStages = ["ابتدائي", "استئناف", "تمييز", "ديوان_المظالم"];
  if (meta.litigationStage != null && !validStages.includes(String(meta.litigationStage))) {
    nullField("litigationStage", `قيمة غير مسموح بها: "${meta.litigationStage}"`);
  }
  // disputeSubject: must be a meaningful sentence (≥5 chars)
  if (meta.disputeSubject != null && String(meta.disputeSubject).trim().length < 5) {
    nullField("disputeSubject", "موضوع النزاع قصير جداً");
  }

  // Log rejected fields so invalid data is visible in server logs
  if (rejected.length > 0) {
    const label = context ? ` [${context}]` : "";
    console.warn(
      `[validateCaseMetadata]${label} رُفض ${rejected.length} حقل من بيانات الاستشهاد:`,
      rejected.map(r => `${r.field}="${r.value}" → ${r.reason}`).join(" | "),
    );
  }

  return { rejectedCount: rejected.length, rejectedFields: rejected.map(r => r.field) };
}

/**
 * Use GPT-4o-mini to extract structured case metadata from a judicial document.
 * Only fields with medium/high confidence are kept — nothing is invented.
 *
 * Improvements over the original:
 *  1. Samples three sections (head / middle / tail) to capture Saudi court stamps.
 *  2. Regex pre-filter injects confirmed case/ruling numbers as high-confidence hints.
 */
export async function extractCaseMetadata(
  text: string,
  filename: string,
): Promise<CaseMetadata | null> {
  try {
    const apiKey = getApiKey();
    if (!apiKey) return null;

    const openai = new OpenAI({ apiKey });

    // ── 1. Build multi-section sample ─────────────────────────────────────────
    const sample = buildMetadataSample(text);

    // ── 2. Regex pre-filter hints ─────────────────────────────────────────────
    const { caseNumberHint, rulingNumberHint } = preFilterLegalNumbers(text);
    const hintLines: string[] = [];
    if (caseNumberHint)   hintLines.push(`رقم القضية المكتشف بالنص (ثقة عالية): ${caseNumberHint}`);
    if (rulingNumberHint) hintLines.push(`رقم الحكم المكتشف بالنص (ثقة عالية): ${rulingNumberHint}`);
    const hintsBlock = hintLines.length
      ? `\nتلميحات من الفلتر الآلي (استخدمها ما لم يتعارض النص معها):\n${hintLines.join("\n")}\n`
      : "";

    const resp = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      temperature: 0,
      max_tokens: 450,
      response_format: { type: "json_object" },
      messages: [
        {
          role: "system",
          content: `استخرج بيانات الاستشهاد لهذا المستند القضائي السعودي. أجب بـ JSON بهذا الهيكل فقط:
{
  "caseNumber": "رقم القضية أو null",
  "rulingNumber": "رقم الحكم أو null",
  "hijriDate": "التاريخ هجري أو null",
  "gregorianDate": "التاريخ ميلادي (YYYY-MM-DD) أو null",
  "court": "اسم المحكمة/الدائرة أو null",
  "litigationStage": "ابتدائي|استئناف|تمييز|ديوان_المظالم|null",
  "disputeSubject": "موضوع النزاع في جملة واحدة أو null",
  "deedNumber": "رقم الصك/السند أو null",
  "confidence": {
    "caseNumber": "high|medium|low",
    "rulingNumber": "high|medium|low",
    "hijriDate": "high|medium|low",
    "gregorianDate": "high|medium|low",
    "court": "high|medium|low",
    "litigationStage": "high|medium|low",
    "disputeSubject": "high|medium|low",
    "deedNumber": "high|medium|low"
  }
}
قواعد صارمة:
- لا تخترع أي بيانات غير موجودة في النص
- الثقة "low" تعني أن الحقل يجب أن يُرجع null
- إذا كان المستند ليس حكماً قضائياً أعد كل الحقول null`,
        },
        {
          role: "user",
          content: `اسم الملف: ${filename}${hintsBlock}\n\nمقاطع المستند:\n${sample}`,
        },
      ],
    });

    const raw = resp.choices[0]?.message?.content ?? "{}";
    const parsed = JSON.parse(raw);
    const conf: Record<string, string> = parsed.confidence ?? {};

    // ── 3. Null out any field with low confidence ─────────────────────────────
    const fields: (keyof CaseMetadata)[] = [
      "caseNumber", "rulingNumber", "hijriDate", "gregorianDate",
      "court", "litigationStage", "disputeSubject", "deedNumber",
    ];
    for (const field of fields) {
      if (conf[String(field)] === "low") (parsed as any)[field] = null;
    }

    // ── 4. Merge regex hints for fields still null after GPT ──────────────────
    if (!parsed.caseNumber   && caseNumberHint)   parsed.caseNumber   = caseNumberHint;
    if (!parsed.rulingNumber && rulingNumberHint) parsed.rulingNumber = rulingNumberHint;

    // ── 5. Value validation — null out fields that fail sanity checks ─────────
    validateCaseMetadata(parsed, filename);

    // Return null if no useful data survived validation
    const hasData = fields.some(f => (parsed as any)[f] != null);
    return hasData ? (parsed as CaseMetadata) : null;
  } catch {
    return null;
  }
}

function getApiKey(): string {
  const raw = process.env.OPENAI_API_KEY ?? "";
  return raw.replace(/[^\x20-\x7E]/g, "").trim();
}

// ─── AI auto-categorization ───────────────────────────────────────────────────
type DocCategory = "judicial" | "circular" | "regulation" | "contract" | "general";

export async function autoClassifyDocument(text: string, filename: string): Promise<DocCategory> {
  try {
    const apiKey = getApiKey();
    if (!apiKey) return "general";
    const openai = new OpenAI({ apiKey });
    const sample = text.slice(0, 1200).trim();
    const resp = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      temperature: 0,
      max_tokens: 10,
      messages: [{
        role: "system",
        content: `صنّف المستند القانوني التالي في إحدى الفئات التالية فقط (أجب بكلمة واحدة):
- judicial : مدونات قضائية، أحكام، قرارات محاكم، سوابق قضائية
- circular  : تعاميم، منشورات، أوامر وزارية، قرارات إدارية
- regulation: أنظمة، لوائح، مراسيم ملكية، قوانين هيئة الخبراء
- contract  : عقود، اتفاقيات، نماذج قانونية، صيغ توثيق
- general   : غير ذلك`,
      }, {
        role: "user",
        content: `اسم الملف: ${filename}\n\nمحتوى:\n${sample}`,
      }],
    });
    const cat = resp.choices[0]?.message?.content?.trim().toLowerCase() ?? "general";
    const valid: DocCategory[] = ["judicial", "circular", "regulation", "contract", "general"];
    return valid.includes(cat as DocCategory) ? (cat as DocCategory) : "general";
  } catch {
    return "general";
  }
}

// ─── File type detection ──────────────────────────────────────────────────────
export function detectMime(filename: string, declared: string): string {
  const f = filename.toLowerCase();
  if (f.endsWith(".pdf"))  return "application/pdf";
  if (f.endsWith(".docx")) return "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
  if (f.endsWith(".doc"))  return "application/msword";
  if (f.endsWith(".pptx")) return "application/vnd.openxmlformats-officedocument.presentationml.presentation";
  if (f.endsWith(".ppt"))  return "application/vnd.ms-powerpoint";
  if (f.endsWith(".xlsx")) return "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
  if (f.endsWith(".xls"))  return "application/vnd.ms-excel";
  if (f.endsWith(".txt") || f.endsWith(".rtf")) return "text/plain";
  if (f.endsWith(".csv"))  return "text/csv";
  return declared || "application/octet-stream";
}

/** True if we can attempt text extraction from this filename */
export function isIndexable(filename: string): boolean {
  return /\.(pdf|docx?|pptx?|xlsx?|txt|rtf|csv)$/i.test(filename);
}

// ─── Extractors ───────────────────────────────────────────────────────────────

/** Kept for backward-compat; new code uses extractPdfWithPages directly */
async function extractPdf(buffer: Buffer): Promise<string> {
  const { text } = await extractPdfWithPages(buffer);
  return text;
}

/** Export for reindex-all endpoint */
export { extractPdfWithPages };

async function extractDocx(buffer: Buffer): Promise<string> {
  const mammoth = await import("mammoth" as any);
  const lib = mammoth.default ?? mammoth;
  const result = await lib.extractRawText({ buffer });
  return result.value ?? "";
}

/** Extract text from PPTX (Office Open XML — slides/*.xml) */
function extractPptx(buffer: Buffer): string {
  try {
    const zip = new AdmZip(buffer);
    const entries = zip.getEntries().filter(e =>
      e.entryName.match(/^ppt\/slides\/slide\d+\.xml$/i)
    );
    // Sort slide1, slide2 …
    entries.sort((a, b) => {
      const na = parseInt(a.entryName.replace(/\D/g, "") || "0");
      const nb = parseInt(b.entryName.replace(/\D/g, "") || "0");
      return na - nb;
    });
    const texts: string[] = [];
    for (const e of entries) {
      const xml = e.getData().toString("utf-8");
      // Extract all <a:t>…</a:t> text runs
      const matches = xml.match(/<a:t[^>]*>([^<]*)<\/a:t>/g) ?? [];
      const slide = matches.map(m => m.replace(/<[^>]+>/g, "")).join(" ").trim();
      if (slide) texts.push(slide);
    }
    return texts.join("\n\n");
  } catch {
    return "";
  }
}

/** Extract text from XLSX / XLS using the xlsx package */
async function extractXlsx(buffer: Buffer): Promise<string> {
  const XLSX = await import("xlsx" as any);
  const lib = XLSX.default ?? XLSX;
  const wb = lib.read(buffer, { type: "buffer" });
  const lines: string[] = [];
  for (const sheetName of wb.SheetNames) {
    const ws = wb.Sheets[sheetName];
    const csv: string = lib.utils.sheet_to_csv(ws, { blankrows: false });
    if (csv.trim()) lines.push(`[${sheetName}]\n${csv}`);
  }
  return lines.join("\n\n");
}

/** Best-effort DOC extraction: if it starts with RTF markers extract; otherwise skip */
function extractDoc(buffer: Buffer): string {
  const head = buffer.slice(0, 8).toString("ascii");
  // Rich Text Format
  if (head.startsWith("{\\rtf")) {
    return buffer
      .toString("latin1")
      .replace(/\{[^{}]*\}/g, " ")
      .replace(/\\[a-z]+\d* ?/g, " ")
      .replace(/[^\u0020-\u007E\u0600-\u06FF\s]/g, " ")
      .replace(/\s{3,}/g, "\n")
      .trim();
  }
  // Old binary DOC — cannot extract without native libraries; save without text
  return "";
}

function extractCsv(buffer: Buffer): string {
  return buffer.toString("utf-8");
}

// ─── Main extractor ───────────────────────────────────────────────────────────
export async function extractText(
  buffer: Buffer,
  mimetype: string,
  filename: string,
): Promise<string> {
  const mime = detectMime(filename, mimetype);
  const f    = filename.toLowerCase();

  if (mime === "application/pdf" || f.endsWith(".pdf")) return extractPdf(buffer);

  if (mime === "application/vnd.openxmlformats-officedocument.wordprocessingml.document" || f.endsWith(".docx"))
    return extractDocx(buffer);

  if (mime === "application/vnd.openxmlformats-officedocument.presentationml.presentation" || f.endsWith(".pptx"))
    return extractPptx(buffer);

  if (
    mime === "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" ||
    mime === "application/vnd.ms-excel" ||
    f.endsWith(".xlsx") || f.endsWith(".xls")
  ) return extractXlsx(buffer);

  if (mime === "application/msword" || f.endsWith(".doc"))
    return extractDoc(buffer);

  if (mime === "text/plain" || mime === "text/csv" || f.endsWith(".txt") || f.endsWith(".rtf") || f.endsWith(".csv"))
    return buffer.toString("utf-8");

  return ""; // unsupported — save binary without text indexing
}

// ─── Labels for admin UI ──────────────────────────────────────────────────────
export function fileTypeLabel(filename: string): string {
  const f = filename.toLowerCase();
  if (f.endsWith(".pdf"))  return "PDF";
  if (f.endsWith(".docx")) return "Word";
  if (f.endsWith(".doc"))  return "Word (قديم)";
  if (f.endsWith(".pptx")) return "PowerPoint";
  if (f.endsWith(".ppt"))  return "PowerPoint (قديم)";
  if (f.endsWith(".xlsx")) return "Excel";
  if (f.endsWith(".xls"))  return "Excel (قديم)";
  if (f.endsWith(".txt"))  return "نص";
  if (f.endsWith(".csv"))  return "CSV";
  if (f.endsWith(".rtf"))  return "RTF";
  return "ملف";
}

// ─── File-hash deduplication ─────────────────────────────────────────────────
/** SHA-256 hex of the raw buffer — prevents indexing the same bytes twice. */
function fileHash(buf: Buffer): string {
  return createHash("sha256").update(buf).digest("hex");
}

// ─── Concurrency = 1 queue ────────────────────────────────────────────────────
interface QueueItem {
  docId:    number;
  buffer:   Buffer;
  mimetype: string;
  filename: string;
  resolve:  (v: { chunks: number }) => void;
  reject:   (e: unknown) => void;
}

const indexQueue: QueueItem[] = [];
let queueRunning = false;

function drainQueue(): void {
  if (queueRunning || indexQueue.length === 0) return;
  queueRunning = true;
  (async () => {
    while (indexQueue.length > 0) {
      const item = indexQueue.shift()!;
      try {
        item.resolve(await _runIndexPipeline(item.docId, item.buffer, item.mimetype, item.filename));
      } catch (e) {
        item.reject(e);
      }
    }
  })().finally(() => { queueRunning = false; });
}

// ─── Core indexing pipeline (always runs single-threaded via queue) ───────────
async function _runIndexPipeline(
  docId: number,
  buffer: Buffer,
  mimetype: string,
  filename: string,
): Promise<{ chunks: number }> {
  const apiKey = getApiKey();

  await db
    .update(knowledgeDocumentsTable)
    .set({ status: "indexing", updatedAt: new Date() })
    .where(eq(knowledgeDocumentsTable.id, docId));

  try {
    // ── 1. Text extraction ──────────────────────────────────────────────────
    let rawText: string;
    try {
      rawText = await extractText(buffer, mimetype, filename);
    } catch (extractErr: any) {
      // Real extraction failure (corrupt file, scanned image without OCR, etc.)
      const msg = "الملف غير قابل للقراءة — تأكد أنه يحتوي على نص وليس صورة ممسوحة ضوئياً";
      await db.update(knowledgeDocumentsTable)
        .set({ status: "error", errorMessage: msg, updatedAt: new Date() })
        .where(eq(knowledgeDocumentsTable.id, docId));
      throw new Error(msg);
    }

    if (!rawText || rawText.trim().length < 20) {
      // For PDFs: empty text means the file is scanned (image-only). Report it clearly
      // instead of silently marking as indexed with 0 chunks.
      const isPdfFile = mimetype.includes("pdf") || filename.toLowerCase().endsWith(".pdf");
      if (isPdfFile) {
        const msg = "هذا الملف مسحوح ضوئياً ولا يحتوي نصاً قابلاً للبحث — لا يمكن فهرسته بدون OCR";
        await db.update(knowledgeDocumentsTable)
          .set({ status: "error", errorMessage: msg, updatedAt: new Date() })
          .where(eq(knowledgeDocumentsTable.id, docId));
        return { chunks: 0 };
      }
      // Non-PDF with no text: mark indexed with 0 chunks (expected for some file types)
      await db.update(knowledgeDocumentsTable)
        .set({ status: "indexed", totalChunks: 0, updatedAt: new Date(), errorMessage: null })
        .where(eq(knowledgeDocumentsTable.id, docId));
      return { chunks: 0 };
    }

    // ── 2. Auto-classify ────────────────────────────────────────────────────
    const [docRow] = await db
      .select({ category: knowledgeDocumentsTable.category })
      .from(knowledgeDocumentsTable)
      .where(eq(knowledgeDocumentsTable.id, docId));
    if (docRow?.category === "general") {
      const autoCategory = await autoClassifyDocument(rawText, filename);
      await db.update(knowledgeDocumentsTable)
        .set({ category: autoCategory as any })
        .where(eq(knowledgeDocumentsTable.id, docId));
    }

    // ── 3. Chunk ────────────────────────────────────────────────────────────
    const chunks = chunkText(rawText);
    if (chunks.length === 0) {
      const msg = "الملف غير قابل للقراءة — لم يُنتج أي مقاطع نصية";
      await db.update(knowledgeDocumentsTable)
        .set({ status: "error", errorMessage: msg, updatedAt: new Date() })
        .where(eq(knowledgeDocumentsTable.id, docId));
      throw new Error(msg);
    }

    await db
      .update(knowledgeDocumentsTable)
      .set({ extractedText: rawText.slice(0, 100_000), structuredData: null })
      .where(eq(knowledgeDocumentsTable.id, docId));

    // ── 4. Embed (batched, with 429 retry + backoff) ────────────────────────
    let embeddings: number[][];
    try {
      embeddings = await embedTexts(chunks, apiKey, {
        fileId: docId,
        logger: (entry) => {
          // Lightweight structured log visible in server console
          const { status, retryCount, errorCode, batchNumber, tokenEstimate } = entry as any;
          if (status === "retrying") {
            console.warn(`[embed] docId=${docId} batch=${batchNumber} retry=${retryCount} err=${errorCode} wait=${(entry as any).waitMs}ms`);
          } else if (status === "failed") {
            console.error(`[embed] docId=${docId} batch=${batchNumber} FAILED err=${errorCode}`);
          }
        },
        onRetry: async (fid, batchIdx, attempt) => {
          // Update DB status to "retrying" so admin can see it
          await db.update(knowledgeDocumentsTable)
            .set({
              status:       "retrying" as any,
              errorMessage: `ضغط مؤقت على خدمة التضمين — المحاولة ${attempt} (دفعة ${batchIdx + 1})`,
              updatedAt:    new Date(),
            })
            .where(eq(knowledgeDocumentsTable.id, fid));
        },
      });
    } catch (embedErr: any) {
      const is429 = embedErr?.status === 429 || embedErr?.response?.status === 429;
      const msg = is429
        ? "يوجد ضغط مؤقت على خدمة المعالجة، وتم وضع الملف في قائمة الانتظار. ستُعاد معالجته تلقائياً."
        : (embedErr?.message ?? "فشل في توليد التضمينات");
      await db.update(knowledgeDocumentsTable)
        .set({ status: "error", errorMessage: msg, updatedAt: new Date() })
        .where(eq(knowledgeDocumentsTable.id, docId));
      throw new Error(msg);
    }

    // ── 5. Page boundaries (PDF) ────────────────────────────────────────────
    const isPdf = mimetype.includes("pdf") || filename.toLowerCase().endsWith(".pdf");
    let pageBoundaries: PageBoundary[] = [];
    let excludedPagesSummary: string[] = [];
    if (isPdf) {
      try {
        const { pageBoundaries: pb, excludedPages } = await extractPdfWithPages(buffer);
        pageBoundaries = pb;
        excludedPagesSummary = excludedPages.map(e => `ص${e.pageNum}: ${e.reason}`);
      } catch { /* page tracking optional */ }
    }

    // ── 6. Case metadata (judicial, async, non-blocking) ───────────────────
    const [docRowFresh] = await db
      .select({ category: knowledgeDocumentsTable.category })
      .from(knowledgeDocumentsTable)
      .where(eq(knowledgeDocumentsTable.id, docId));
    if (docRowFresh?.category === "judicial") {
      extractCaseMetadata(rawText, filename)
        .then(meta => {
          if (meta) {
            // Explicit validation guard before persisting — defensive layer on top
            // of the internal call inside extractCaseMetadata, ensuring that any
            // future refactor of extractCaseMetadata cannot accidentally bypass it.
            validateCaseMetadata(meta as unknown as Record<string, any>, filename);
            db.update(knowledgeDocumentsTable)
              .set({ caseMetadata: meta as any, updatedAt: new Date() })
              .where(eq(knowledgeDocumentsTable.id, docId))
              .catch(() => {});
          }
        })
        .catch(() => {});
    }

    // ── 7. Persist chunks ───────────────────────────────────────────────────
    await db.delete(knowledgeChunksTable).where(eq(knowledgeChunksTable.documentId, docId));
    await db.insert(knowledgeChunksTable).values(
      chunks.map((content, i) => {
        const { pageStart, pageEnd } = pageBoundaries.length > 0
          ? getChunkPages(content, rawText, pageBoundaries)
          : { pageStart: null, pageEnd: null };
        return { documentId: docId, chunkIndex: i, content, embedding: embeddings[i], pageStart, pageEnd };
      }),
    );

    const excludedNote = excludedPagesSummary.length > 0
      ? `صفحات مستبعدة (${excludedPagesSummary.length}): ${excludedPagesSummary.slice(0, 5).join(' | ')}`
      : null;

    await db
      .update(knowledgeDocumentsTable)
      .set({ status: "indexed", totalChunks: chunks.length, updatedAt: new Date(), errorMessage: excludedNote })
      .where(eq(knowledgeDocumentsTable.id, docId));

    return { chunks: chunks.length };

  } catch (err: any) {
    // Only write error status if not already set by a sub-step above
    const [cur] = await db
      .select({ status: knowledgeDocumentsTable.status })
      .from(knowledgeDocumentsTable)
      .where(eq(knowledgeDocumentsTable.id, docId));
    if (cur?.status !== "indexed") {
      await db
        .update(knowledgeDocumentsTable)
        .set({ status: "error", errorMessage: err?.message ?? "خطأ غير معروف", updatedAt: new Date() })
        .where(eq(knowledgeDocumentsTable.id, docId));
    }
    throw err;
  }
}

/**
 * Public: queue a document for indexing (concurrency = 1).
 * Documents are processed FIFO; status reflects queue position.
 */
export async function indexDocument(
  docId: number,
  buffer: Buffer,
  mimetype: string,
  filename: string,
): Promise<{ chunks: number }> {
  return new Promise((resolve, reject) => {
    // Mark as queued immediately so the caller / admin can see its state
    db.update(knowledgeDocumentsTable)
      .set({ status: "queued" as any, updatedAt: new Date() })
      .where(eq(knowledgeDocumentsTable.id, docId))
      .catch(() => {});

    indexQueue.push({ docId, buffer, mimetype, filename, resolve, reject });
    drainQueue();
  });
}

/** Create a document record and enqueue it for indexing. Deduplicates by file hash. */
export async function createAndIndexDocument(
  buffer: Buffer,
  mimetype: string,
  filename: string,
  opts?: { category?: string; sourceUrl?: string; sourceType?: string },
): Promise<{ docId: number; chunks: number }> {
  const resolvedMime = detectMime(filename, mimetype);
  const hash = fileHash(buffer);

  // ── Deduplication: skip if same bytes already exist ──────────────────────
  const existing = await db
    .select({ id: knowledgeDocumentsTable.id, status: knowledgeDocumentsTable.status })
    .from(knowledgeDocumentsTable)
    .where(eq(knowledgeDocumentsTable.fileHash as any, hash))
    .limit(1);
  if (existing.length > 0) {
    const doc = existing[0];
    // If it failed before, reset to queued and re-process it
    if (doc.status === "error") {
      await db.update(knowledgeDocumentsTable)
        .set({ status: "queued" as any, errorMessage: null, updatedAt: new Date() })
        .where(eq(knowledgeDocumentsTable.id, doc.id));
      const chunks = await new Promise<number>((res, rej) => {
        indexQueue.push({ docId: doc.id, buffer, mimetype: resolvedMime, filename, resolve: (v) => res(v.chunks), reject: rej });
        drainQueue();
      });
      return { docId: doc.id, chunks };
    }
    return { docId: doc.id, chunks: 0 };
  }

  const validCats = ["judicial", "circular", "regulation", "contract", "general"];
  const forcedCat = opts?.category && validCats.includes(opts.category)
    ? (opts.category as any)
    : undefined;

  const [doc] = await db
    .insert(knowledgeDocumentsTable)
    .values({
      filename,
      mimeType:  resolvedMime,
      status:    "queued" as any,
      fileData:  buffer,
      fileSize:  buffer.length,
      fileHash:  hash,
      ...(forcedCat           ? { category:   forcedCat          } : {}),
      ...(opts?.sourceUrl     ? { sourceUrl:  opts.sourceUrl     } : {}),
      ...(opts?.sourceType    ? { sourceType: opts.sourceType    } : {}),
    })
    .returning();

  const { chunks } = await indexDocument(doc.id, buffer, resolvedMime, filename);
  return { docId: doc.id, chunks };
}
