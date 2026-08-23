/**
 * Legal Codex Processor
 * Extracts individual cases from large legal codex PDF files.
 *
 * Architecture:
 * - Text extracted via pdftotext (Poppler) → proper Arabic RTL/bidi handling
 * - Fallback to pdf-parse + arabic-text-fix if pdftotext unavailable
 * - Quality gate rejects reversed/corrupted text before DB insertion
 * - PDF binary stored in DB → served to client for page image display
 */
import { execFile } from "child_process";
import { promisify } from "util";
import { writeFile, readFile, unlink } from "fs/promises";
import { tmpdir } from "os";
import { join } from "path";
import { createHash, randomBytes } from "crypto";
import { OpenAI } from "openai";
import { db } from "@workspace/db";
import { legalCodicesTable, legalCasesTable } from "@workspace/db/schema";
import { eq, sql } from "drizzle-orm";

const execFileAsync = promisify(execFile);

// Use the internal lib directly — avoids pdf-parse reading a test file at module load
// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function getPdfParse(): Promise<(buffer: Buffer, options?: any) => Promise<{ text: string; numpages: number }>> {
  const mod = await import("pdf-parse/lib/pdf-parse.js" as any);
  return (mod.default ?? mod) as any;
}

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

// ── Types ─────────────────────────────────────────────────────────────────────

export interface PageText {
  pageNum: number;   // 1-based file page order
  text: string;
}

export interface CaseBoundary {
  startPage: number; // file page index (1-based)
  endPage: number;
  rawText: string;
}

export interface ExtractionJob {
  codexId: number;
  status: "running" | "done" | "error";
  processed: number;
  total: number;
  errors: string[];
}

// In-memory job tracker
const jobs = new Map<number, ExtractionJob>();

export function getJob(codexId: number): ExtractionJob | undefined {
  return jobs.get(codexId);
}

// ── PDF text extraction (page by page) ───────────────────────────────────────
// Primary: pdftotext (Poppler) — handles Arabic RTL/bidi natively via Unicode Bidi Algorithm
// Fallback: pdf-parse + preprocessExtractedText (character/word-order reversal fix)

async function extractPagesTextFallback(pdfBuffer: Buffer): Promise<PageText[]> {
  const pdfParse = await getPdfParse();
  const { preprocessExtractedText, stripKashida } = await import("./arabic-text-fix.js");
  const pages: PageText[] = [];
  let pageIdx = 0;

  await pdfParse(pdfBuffer, {
    pagerender(pageData: any) {
      pageIdx++;
      const currentPage = pageIdx;
      return pageData.getTextContent().then((tc: any) => {
        const rawText = tc.items.map((item: any) => item.str || "").join(" ");
        const cleaned = stripKashida(rawText.replace(/\s+/g, " ").trim());
        const { text } = preprocessExtractedText(cleaned);
        pages.push({ pageNum: currentPage, text });
        return text;
      });
    },
  });

  return pages;
}

export async function extractPagesText(pdfBuffer: Buffer): Promise<PageText[]> {
  // ── Primary: pdftotext (Poppler 25.07) ────────────────────────────────────
  // Poppler uses the Unicode Bidirectional Algorithm internally, producing
  // correct logical character order for Arabic — no post-processing needed.
  const id = randomBytes(6).toString("hex");
  const pdfPath = join(tmpdir(), `codex_${id}.pdf`);
  const txtPath = join(tmpdir(), `codex_${id}.txt`);
  try {
    await writeFile(pdfPath, pdfBuffer);
    await execFileAsync("pdftotext", [
      "-enc", "UTF-8",
      "-eol", "unix",
      pdfPath,
      txtPath,
    ]);
    const raw = await readFile(txtPath, "utf-8");

    // pdftotext separates pages with form feed (U+000C \f)
    const { stripKashida } = await import("./arabic-text-fix.js");
    const pages: PageText[] = raw
      .split("\f")
      .map((pageText, i) => ({
        pageNum: i + 1,
        text: stripKashida(pageText.replace(/\r/g, "").trim()),
      }))
      .filter(p => p.text.length > 0);

    return pages;
  } catch {
    // ── Fallback: pdf-parse + Arabic direction fix ─────────────────────────
    return extractPagesTextFallback(pdfBuffer);
  } finally {
    await Promise.allSettled([unlink(pdfPath).catch(() => {}), unlink(txtPath).catch(() => {})]);
  }
}

// ── Case boundary detection ───────────────────────────────────────────────────
// Supports two formats:
//   A) مجموعة الأحكام القضائية (MOJ codex books) — starts with "رقم الصك"
//   B) General legal codices — starts with case/ruling number headers

const CASE_START_PATTERNS = [
  // ── Format A: مجموعة الأحكام القضائية (MOJ) ──────────────────────────────
  // Primary structural marker in MOJ codex books (e.g. مجموعة الأحكام لعام 1434هـ)
  /رقم\s*الصك[\s:：]+\d+/u,
  /الصك\s*رقم[\s:：]+\d+/u,

  // ── Format B: General legal codices ──────────────────────────────────────
  /القضية\s+رقم[\s:]+[\d/]+/u,
  /رقم القضية[\s:]+[\d/]+/u,
  /قضية رقم[\s:]+[\d/]+/u,
  /الحكم\s+رقم[\s:]+[\d/]+/u,
  /رقم الحكم[\s:]+[\d/]+/u,
  /حكم رقم[\s:]+[\d/]+/u,
  /دعوى رقم[\s:]+[\d/]+/u,
  /رقم الدعوى[\s:]+[\d/]+/u,

  // ── Section break indicators ─────────────────────────────────────────────
  /\*\s*\*\s*\*/,
  /─{5,}/,
  /={5,}/,
];

export function detectCaseBoundaries(pages: PageText[]): CaseBoundary[] {
  if (pages.length === 0) return [];

  const boundaries: number[] = []; // page indices where new cases start

  for (let i = 0; i < pages.length; i++) {
    const text = pages[i].text;
    const isNewCase = CASE_START_PATTERNS.some(p => p.test(text));
    if (isNewCase) {
      boundaries.push(i);
    }
  }

  // If no boundaries detected, treat whole document as one case
  if (boundaries.length === 0) {
    return [{ startPage: 1, endPage: pages.length, rawText: pages.map(p => p.text).join("\n") }];
  }

  // Build case ranges
  const cases: CaseBoundary[] = [];
  for (let b = 0; b < boundaries.length; b++) {
    const startIdx = boundaries[b];
    const endIdx = b + 1 < boundaries.length ? boundaries[b + 1] - 1 : pages.length - 1;
    const rawText = pages.slice(startIdx, endIdx + 1).map(p => p.text).join("\n");
    cases.push({
      startPage: pages[startIdx].pageNum,
      endPage: pages[endIdx].pageNum,
      rawText,
    });
  }

  return cases;
}

// ── GPT metadata extraction per case ────────────────────────────────────────

const EXTRACTION_SYSTEM_PROMPT = `أنت نظام استخراج بيانات من أحكام المحاكم السعودية وفق قالب إلزامي.
مهمتك استخراج البيانات من نص الحكم بدقة. لا تؤلّف ولا تستنتج ولا تُكمل — من النص فقط.
إذا لم تجد المعلومة بوضوح في النص، اترك الحقل null.
قواعد الثقة: موثوق = 0.8+، شك = 0.4-0.7، غير موجود = 0.0-0.2.

تنبيهات خاصة بمجموعات الأحكام القضائية (وزارة العدل):
- رقم الصك: هو المعرّف الرئيسي للحكم — رقم عددي من 8-10 أرقام يظهر في أول الحكم (يُخزَّن في حقل caseNo).
- رقم الدعوى: يأتي بعد رقم الصك مباشرة — رقم مختلف (يُخزَّن في rulingNo).
- رقم قرار التصديق: رقم قرار محكمة الاستئناف أو محكمة التمييز — يُخزَّن في rulingNo إن لم يُوجد رقم دعوى.
- التواريخ تظهر بصيغة هجرية (م/د/1434هـ) — اجعلها rulingDateHijri.
- المبادئ المستخلصة: تظهر مرقّمة (المبدأ الأول / المبدأ الثاني ...) — اجمعها في legalPrinciple.

قالب المحتوى الإلزامي (بهذا الترتيب):
١. summary: وصف موضوعي للوقائع والمطالبات — 3-5 جمل من النص حرفياً.
٢. reasoning: ما استندت إليه المحكمة من حجج ومبررات قانونية — حرفياً من النص.
٣. ruling: منطوق الحكم النهائي — حرفياً (يبدأ بـ "حكمت المحكمة" أو "قضت المحكمة" أو ما شابه).
٤. legalPrinciple: القاعدة القانونية المستخلصة إن وُجدت صراحةً — وإلا null.`;


interface ExtractedCase {
  caseNo: string | null;
  rulingNo: string | null;
  rulingDateHijri: string | null;
  rulingDateGregorian: string | null;
  court: string | null;
  circuit: string | null;
  litigationStage: "ابتدائي" | "استئناف" | "تمييز" | "عالي" | "غير محدد" | null;
  disputeSubject: string | null;
  legalPrinciple: string | null;
  legalArticles: string[];
  pageStartPrinted: string | null;
  pageEndPrinted: string | null;
  summary: string | null;
  summaryConfidence: number;
  reasoning: string | null;
  reasoningConfidence: number;
  ruling: string | null;
  rulingConfidence: number;
}

export async function extractCaseMetadata(
  rawText: string,
  codexTitle: string
): Promise<ExtractedCase> {
  // Truncate to ~6000 chars to avoid huge token usage
  const truncated = rawText.slice(0, 6000);

  const response = await openai.chat.completions.create({
    model: "gpt-4o-mini",
    response_format: { type: "json_object" },
    temperature: 0.1,
    messages: [
      { role: "system", content: EXTRACTION_SYSTEM_PROMPT },
      {
        role: "user",
        content: `من مدونة: ${codexTitle}

نص الحكم:
---
${truncated}
---

استخرج البيانات التالية بصيغة JSON بالمفاتيح المطلوبة:
{
  "caseNo": "رقم القضية أو null",
  "rulingNo": "رقم الحكم أو null",
  "rulingDateHijri": "التاريخ الهجري أو null",
  "rulingDateGregorian": "التاريخ الميلادي أو null",
  "court": "اسم المحكمة أو null",
  "circuit": "الدائرة أو null",
  "litigationStage": "ابتدائي|استئناف|تمييز|عالي|غير محدد أو null",
  "disputeSubject": "موضوع النزاع في جملة أو null",
  "legalPrinciple": "المبدأ القضائي إن وُجد أو null",
  "legalArticles": ["م5 نظام العمل", ...] أو [],
  "pageStartPrinted": "رقم الصفحة الأولى المطبوع أو null",
  "pageEndPrinted": "رقم الصفحة الأخيرة المطبوع أو null",
  "summary": "ملخص القضية من النص نفسه (3-5 جمل) أو null",
  "summaryConfidence": 0.0-1.0,
  "reasoning": "التسبيب المستخرج من النص حرفياً أو null",
  "reasoningConfidence": 0.0-1.0,
  "ruling": "منطوق الحكم المستخرج من النص حرفياً أو null",
  "rulingConfidence": 0.0-1.0
}`,
      },
    ],
  });

  const raw = response.choices[0]?.message?.content ?? "{}";
  const parsed = JSON.parse(raw);

  return {
    caseNo: parsed.caseNo ?? null,
    rulingNo: parsed.rulingNo ?? null,
    rulingDateHijri: parsed.rulingDateHijri ?? null,
    rulingDateGregorian: parsed.rulingDateGregorian ?? null,
    court: parsed.court ?? null,
    circuit: parsed.circuit ?? null,
    litigationStage: parsed.litigationStage ?? "غير محدد",
    disputeSubject: parsed.disputeSubject ?? null,
    legalPrinciple: parsed.legalPrinciple ?? null,
    legalArticles: Array.isArray(parsed.legalArticles) ? parsed.legalArticles : [],
    pageStartPrinted: parsed.pageStartPrinted ?? null,
    pageEndPrinted: parsed.pageEndPrinted ?? null,
    summary: parsed.summary ?? null,
    summaryConfidence: Number(parsed.summaryConfidence) || 0,
    reasoning: parsed.reasoning ?? null,
    reasoningConfidence: Number(parsed.reasoningConfidence) || 0,
    ruling: parsed.ruling ?? null,
    rulingConfidence: Number(parsed.rulingConfidence) || 0,
  };
}

// ── Main extraction orchestrator ──────────────────────────────────────────────

export async function extractCasesFromCodex(codexId: number): Promise<void> {
  const job: ExtractionJob = { codexId, status: "running", processed: 0, total: 0, errors: [] };
  jobs.set(codexId, job);

  try {
    // 1. Load codex from DB
    const [codex] = await db
      .select()
      .from(legalCodicesTable)
      .where(eq(legalCodicesTable.id, codexId));

    if (!codex) throw new Error(`Codex ${codexId} not found`);

    await db
      .update(legalCodicesTable)
      .set({ status: "extracting", updatedAt: new Date() })
      .where(eq(legalCodicesTable.id, codexId));

    // 2. Extract text page by page (pdftotext primary, pdf-parse fallback)
    const pages = await extractPagesText(codex.fileData);

    // ── Quality gate: refuse to index reversed/corrupted text ──────────────
    // Sampling first 8 pages covers cover + index + first real content.
    const { assessChunkQuality } = await import("./arabic-text-fix.js");
    const sampleText = pages
      .slice(0, Math.min(8, pages.length))
      .map(p => p.text)
      .filter(t => (t.match(/[\u0600-\u06FF]/g) ?? []).length >= 30)
      .join("\n")
      .slice(0, 5000);

    if (sampleText.length > 100) {
      const qr = assessChunkQuality(sampleText);
      if (!qr.passed && (qr.category === 'reversed' || qr.category === 'word_order_reversed')) {
        const errMsg =
          `❌ فشل فحص جودة النص — النص العربي المستخرج معكوس ولا يمكن فهرسته.\n` +
          `السبب: ${qr.reasons.join(' | ')}\n` +
          `الدرجة: ${qr.score}/100\n` +
          `الإجراء: لم تُضَف الوثيقة للقاعدة المعتمدة — يجب مراجعة الملف.`;
        await db.update(legalCodicesTable)
          .set({ status: "error", errorMessage: errMsg, updatedAt: new Date() })
          .where(eq(legalCodicesTable.id, codexId));
        job.status = "error";
        job.errors.push(errMsg);
        return;
      }
      // Non-fatal quality warnings
      if (!qr.passed) {
        job.errors.push(`⚠️ تحذير جودة النص (${qr.category}، درجة ${qr.score}/100): ${qr.reasons.join(' | ')}`);
      }
    }

    // Update total pages
    await db
      .update(legalCodicesTable)
      .set({ totalPages: pages.length, updatedAt: new Date() })
      .where(eq(legalCodicesTable.id, codexId));

    // 3. Detect case boundaries
    const boundaries = detectCaseBoundaries(pages);
    job.total = boundaries.length;

    // 4. Delete existing cases for this codex (re-extraction)
    await db.delete(legalCasesTable).where(eq(legalCasesTable.codexId, codexId));

    // 5. Process each case
    let insertedCount = 0;
    for (const boundary of boundaries) {
      try {
        // Extract metadata via GPT
        const meta = await extractCaseMetadata(boundary.rawText, codex.title);

        await db.insert(legalCasesTable).values({
          codexId,
          caseNo:              meta.caseNo,
          rulingNo:            meta.rulingNo,
          rulingDateHijri:     meta.rulingDateHijri,
          rulingDateGregorian: meta.rulingDateGregorian,
          court:               meta.court ?? codex.court,
          circuit:             meta.circuit,
          litigationStage:     meta.litigationStage,
          disputeSubject:      meta.disputeSubject,
          legalPrinciple:      meta.legalPrinciple,
          legalArticles:       meta.legalArticles,
          pageStartFile:       boundary.startPage,
          pageEndFile:         boundary.endPage,
          pageStartPrinted:    meta.pageStartPrinted,
          pageEndPrinted:      meta.pageEndPrinted,
          summary:             meta.summary,
          summaryConfidence:   meta.summaryConfidence,
          reasoning:           meta.reasoning,
          reasoningConfidence: meta.reasoningConfidence,
          ruling:              meta.ruling,
          rulingConfidence:    meta.rulingConfidence,
          rawText:             boundary.rawText.slice(0, 50000), // cap at 50KB
        });

        insertedCount++;
        job.processed++;
      } catch (e: any) {
        job.errors.push(`صفحة ${boundary.startPage}: ${e.message}`);
        job.processed++;
      }

      // Throttle to avoid OpenAI rate limits
      await new Promise(r => setTimeout(r, 300));
    }

    // 6. Mark ready
    await db
      .update(legalCodicesTable)
      .set({ status: "ready", totalCases: insertedCount, updatedAt: new Date() })
      .where(eq(legalCodicesTable.id, codexId));

    job.status = "done";
  } catch (e: any) {
    job.status = "error";
    job.errors.push(e.message);
    await db
      .update(legalCodicesTable)
      .set({ status: "error", errorMessage: e.message, updatedAt: new Date() })
      .where(eq(legalCodicesTable.id, codexId));
  }
}

// ── File hash ─────────────────────────────────────────────────────────────────
export function hashBuffer(buf: Buffer): string {
  return createHash("sha256").update(buf).digest("hex");
}
