/**
 * MOJ Circular Fetcher
 * Fetches all التعاميم from portaleservices.moj.gov.sa/TameemPortal/TameemList.aspx
 * The portal returns ~339 circulars embedded in one HTML page (DataTables client-side).
 * Text is clean digital Arabic — no OCR/reversal issues.
 */

import * as fs from "node:fs";
import * as path from "node:path";
import { db, mojCircularsTable, knowledgeDocumentsTable, knowledgeChunksTable } from "@workspace/db";
import { eq, inArray, sql, not, isNull } from "drizzle-orm";
import { embedTexts, chunkText } from "./rag";
import type { Logger } from "pino";

const LOCAL_DIR = path.resolve(process.cwd(), "../../.local");
const STATE_FILE = path.join(LOCAL_DIR, "moj_circulars_state.json");
const MOJ_PORTAL_URL = "https://portaleservices.moj.gov.sa/TameemPortal/TameemList.aspx";

// ── Types ─────────────────────────────────────────────────────────────────────

export interface MojCircularRow {
  tameemId: number;
  tameemNo: string;
  hdate: string;
  hdateYear: string;
  subject: string;
  bodyText: string;
  sourceUrl: string;
}

interface FetchState {
  lastFetchedAt: string | null;
  totalFetched: number;
}

export interface SyncResult {
  fetched: number;
  inserted: number;
  updated: number;
  failed: number;
  errors: string[];
}

export interface FetchJob {
  running: boolean;
  fetched: number;
  inserted: number;
  updated: number;
  failed: number;
  log: string[];
  startedAt: string;
  finishedAt?: string;
}

export let fetchJob: FetchJob | null = null;

// ── State file ────────────────────────────────────────────────────────────────

function loadState(): FetchState {
  try {
    return JSON.parse(fs.readFileSync(STATE_FILE, "utf8"));
  } catch {
    return { lastFetchedAt: null, totalFetched: 0 };
  }
}

function saveState(state: FetchState): void {
  try {
    fs.mkdirSync(LOCAL_DIR, { recursive: true });
    fs.writeFileSync(STATE_FILE, JSON.stringify(state, null, 2));
  } catch { /* best effort */ }
}

export function getMojFetchState(): FetchState {
  return loadState();
}

// ── HTML parsing ──────────────────────────────────────────────────────────────

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function extractSpan(html: string, id: string): string {
  const re = new RegExp(`id=["']${escapeRegex(id)}["'][^>]*>([\\s\\S]*?)<\\/span>`, "i");
  const m = html.match(re);
  if (!m) return "";
  // Strip inner HTML tags and decode common entities
  return m[1]
    .replace(/<[^>]+>/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&nbsp;/g, " ")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\s{2,}/g, " ")
    .trim();
}

function extractHdateYear(hdate: string): string {
  const m = hdate.match(/^(\d{4})/);
  return m ? m[1] : "";
}

export function parseAllCirculars(html: string): MojCircularRow[] {
  const rows: MojCircularRow[] = [];

  // Find all (N, tameemId) pairs from TameemID spans
  const idPattern = /id=["']datatable_responsive_Label_TameemID_(\d+)["'][^>]*>(\d+)<\/span>/g;
  let match: RegExpExecArray | null;

  while ((match = idPattern.exec(html)) !== null) {
    const n = match[1];
    const tameemId = parseInt(match[2], 10);
    if (isNaN(tameemId) || tameemId <= 0) continue;

    const tameemNo = extractSpan(html, `datatable_responsive_Label_TameemNo_${n}`);
    const hdate    = extractSpan(html, `datatable_responsive_Label_Hdate_${n}`);
    const subject  = extractSpan(html, `datatable_responsive_Label_SubjectText_${n}`);
    const bodyText = extractSpan(html, `datatable_responsive_Label_Text_${n}`);

    rows.push({
      tameemId,
      tameemNo,
      hdate,
      hdateYear: extractHdateYear(hdate),
      subject,
      bodyText,
      sourceUrl: `${MOJ_PORTAL_URL}?id=${tameemId}`,
    });
  }

  return rows;
}

// ── Network fetch ─────────────────────────────────────────────────────────────

export async function fetchMojHtml(): Promise<string> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 30_000);

  try {
    const res = await fetch(MOJ_PORTAL_URL, {
      signal: controller.signal,
      headers: {
        "Accept": "text/html,application/xhtml+xml",
        "Accept-Language": "ar,ar-SA;q=0.9",
        "User-Agent": "Mozilla/5.0 (compatible; RABAB-Legal-Bot/1.0)",
      },
    });
    if (!res.ok) throw new Error(`HTTP ${res.status} from MOJ portal`);
    return await res.text();
  } finally {
    clearTimeout(timeout);
  }
}

// ── KB indexing ───────────────────────────────────────────────────────────────

async function getApiKey(): Promise<string> {
  const key = process.env.OPENAI_API_KEY;
  if (!key) throw new Error("OPENAI_API_KEY not set");
  return key;
}

async function indexCircularInKb(
  row: MojCircularRow,
  logger?: Logger,
): Promise<number | null> {
  try {
    const title = row.tameemNo
      ? `تعميم وزارة العدل رقم ${row.tameemNo} - ${row.subject}`
      : `تعميم وزارة العدل - ${row.subject}`;

    const fullText = [
      `رقم التعميم: ${row.tameemNo || "غير محدد"}`,
      `التاريخ الهجري: ${row.hdate || "غير محدد"}`,
      `الجهة المصدرة: وزارة العدل`,
      `الموضوع: ${row.subject}`,
      ``,
      row.bodyText,
    ].join("\n");

    // Insert document record
    const [doc] = await db
      .insert(knowledgeDocumentsTable)
      .values({
        filename: title,
        mimeType: "text/plain",
        sourceUrl: row.sourceUrl,
        sourceType: "official",
        category: "circular" as any,
        status: "indexed" as any,
        extractedText: fullText,
        fileSize: Buffer.byteLength(fullText, "utf8"),
        totalChunks: 0,
      })
      .returning({ id: knowledgeDocumentsTable.id });

    if (!doc) return null;

    // Chunk + embed
    const apiKey = await getApiKey();
    const chunks = chunkText(fullText);
    if (chunks.length === 0) return doc.id;

    const embeddings = await embedTexts(chunks, apiKey);
    const chunkRows = chunks.map((content, i) => ({
      documentId: doc.id,
      chunkIndex: i,
      content,
      embedding: embeddings[i] ?? null,
    }));

    await db.insert(knowledgeChunksTable).values(chunkRows);

    await db
      .update(knowledgeDocumentsTable)
      .set({ totalChunks: chunks.length, updatedAt: new Date() })
      .where(eq(knowledgeDocumentsTable.id, doc.id));

    return doc.id;
  } catch (err: any) {
    logger?.warn({ tameemId: row.tameemId, err: err?.message }, "Failed to index circular in KB");
    return null;
  }
}

// ── Main sync ─────────────────────────────────────────────────────────────────

export async function syncMojCirculars(logger?: Logger): Promise<SyncResult> {
  const result: SyncResult = { fetched: 0, inserted: 0, updated: 0, failed: 0, errors: [] };
  const logSync = (msg: string) => {
    logger?.info(msg);
    if (fetchJob) {
      fetchJob.log.push(`[${new Date().toISOString().slice(11, 19)}] ${msg}`);
      if (fetchJob.log.length > 200) fetchJob.log.shift();
    }
  };

  try {
    logSync("📡 جاري تحميل صفحة منصة التعاميم من وزارة العدل...");
    const html = await fetchMojHtml();
    logSync(`✅ تم تحميل الصفحة (${Math.round(html.length / 1024)} KB)`);

    const rows = parseAllCirculars(html);
    result.fetched = rows.length;
    logSync(`📋 تم تحليل ${rows.length} تعميم من الصفحة`);

    if (rows.length === 0) {
      logSync("⚠️ لم يُعثر على أي تعميم — تحقق من هيكل HTML");
      return result;
    }

    // Get existing tameemIds
    const existingRows = await db
      .select({ tameemId: mojCircularsTable.tameemId, subject: mojCircularsTable.subject, bodyText: mojCircularsTable.bodyText, docId: mojCircularsTable.docId })
      .from(mojCircularsTable);
    const existingMap = new Map(existingRows.map(r => [r.tameemId, r]));

    logSync(`🗄️ قاعدة البيانات: ${existingMap.size} تعميم موجود مسبقاً`);

    for (const row of rows) {
      if (fetchJob && !fetchJob.running) {
        logSync("⏹ تم إيقاف الجلب بأمر المستخدم");
        break;
      }

      try {
        const existing = existingMap.get(row.tameemId);

        if (!existing) {
          // New circular — insert + index in KB
          logSync(`➕ تعميم جديد: رقم ${row.tameemNo || row.tameemId} — ${row.subject.slice(0, 60)}`);

          const docId = await indexCircularInKb(row, logger);

          await db.insert(mojCircularsTable).values({
            tameemId: row.tameemId,
            tameemNo: row.tameemNo,
            hdate: row.hdate,
            hdateYear: row.hdateYear,
            subject: row.subject,
            bodyText: row.bodyText,
            sourceUrl: row.sourceUrl,
            docId: docId ?? undefined,
          });

          result.inserted++;
          if (fetchJob) fetchJob.inserted++;

          // Rate limit: avoid OpenAI rate limits
          await new Promise(r => setTimeout(r, 300));
        } else {
          // Existing — check if content changed
          const changed = existing.subject !== row.subject || existing.bodyText !== row.bodyText;
          if (changed) {
            await db
              .update(mojCircularsTable)
              .set({
                tameemNo: row.tameemNo,
                hdate: row.hdate,
                hdateYear: row.hdateYear,
                subject: row.subject,
                bodyText: row.bodyText,
                fetchedAt: new Date(),
                updatedAt: new Date(),
              })
              .where(eq(mojCircularsTable.tameemId, row.tameemId));
            result.updated++;
            if (fetchJob) fetchJob.updated++;
          }
        }
      } catch (err: any) {
        result.failed++;
        if (fetchJob) fetchJob.failed++;
        const errMsg = err?.message?.slice(0, 120) ?? "خطأ";
        result.errors.push(`tameemId=${row.tameemId}: ${errMsg}`);
        logSync(`❌ فشل: tameemId=${row.tameemId}: ${errMsg}`);
      }
    }

    // Save state
    const state = loadState();
    state.lastFetchedAt = new Date().toISOString();
    state.totalFetched = result.fetched;
    saveState(state);

    logSync(`📊 اكتمل الجلب: ${result.inserted} جديد · ${result.updated} محدَّث · ${result.failed} فشل`);
  } catch (err: any) {
    const errMsg = err?.message ?? String(err);
    result.errors.push(errMsg);
    logSync(`💥 خطأ عام: ${errMsg}`);
    logger?.error({ err: errMsg }, "syncMojCirculars error");
  }

  return result;
}

// ── Public job API ─────────────────────────────────────────────────────────────

export function startMojFetch(logger?: Logger): void {
  if (fetchJob?.running) throw new Error("جلب جارٍ بالفعل");

  fetchJob = {
    running: true,
    fetched: 0,
    inserted: 0,
    updated: 0,
    failed: 0,
    log: [],
    startedAt: new Date().toISOString(),
  };

  (async () => {
    try {
      await syncMojCirculars(logger);
    } catch (err: any) {
      fetchJob!.log.push(`💥 ${err?.message ?? err}`);
    } finally {
      fetchJob!.running = false;
      fetchJob!.finishedAt = new Date().toISOString();
    }
  })();
}

export function stopMojFetch(): void {
  if (fetchJob) fetchJob.running = false;
}
