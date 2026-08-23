/**
 * Telegram MTProto sync — calls Python/Telethon script as subprocess.
 * This avoids gramjs BigInt incompatibility with Node.js 24.
 *
 * Features:
 *  - Full sync: re-index ALL documents from all channels
 *  - Incremental sync: only fetch messages NEWER than last known message_id per channel
 *  - Auto-scheduler: run incremental sync every N hours automatically
 */

import { execFile } from "child_process";
import * as path from "path";
import * as fs from "fs";
import * as os from "os";
import { createAndIndexDocument } from "./document-indexer";
import type { Logger } from "pino";

const SCRIPT = path.resolve(process.cwd(), "src/lib/tg_sync.py");
const LOCAL_DIR = path.resolve(process.cwd(), "../../.local");
const STATE_FILE = path.join(LOCAL_DIR, "tg_auth_state.json");
const SESSION_FILE = path.join(LOCAL_DIR, "tg_session.txt");
const SYNC_STATE_FILE = path.join(LOCAL_DIR, "tg_sync_state.json");
const AUTO_SYNC_FILE = path.join(LOCAL_DIR, "tg_auto_sync.json");

// ── Sync state (last message_id + last sync time per channel) ─────────────────
interface ChannelSyncState {
  lastMessageId: number;   // highest message_id seen in last sync
  lastSyncAt: string;      // ISO timestamp
  filesIndexed: number;    // cumulative
}

interface SyncStateFile {
  channels: Record<string, ChannelSyncState>;
}

function loadSyncState(): SyncStateFile {
  try {
    return JSON.parse(fs.readFileSync(SYNC_STATE_FILE, "utf8"));
  } catch {
    return { channels: {} };
  }
}

function saveSyncState(state: SyncStateFile): void {
  try {
    fs.mkdirSync(LOCAL_DIR, { recursive: true });
    fs.writeFileSync(SYNC_STATE_FILE, JSON.stringify(state, null, 2));
  } catch { /* best effort */ }
}

// ── Channel entry with optional forced category ───────────────────────────────
export interface ChannelEntry {
  link: string;
  /** Force this category for every document from this channel.
   *  Values: "judicial" | "circular" | "regulation" | "contract" | "general"
   *  If omitted, auto-classification is used. */
  category?: string;
  /** Human-readable label shown in admin UI */
  label?: string;
}

// ── Auto-sync config ──────────────────────────────────────────────────────────
interface AutoSyncConfig {
  enabled: boolean;
  intervalHours: number;
  channels: ChannelEntry[];
  lastAutoSyncAt?: string;
}

function loadAutoSyncConfig(): AutoSyncConfig {
  try {
    return JSON.parse(fs.readFileSync(AUTO_SYNC_FILE, "utf8"));
  } catch {
    return { enabled: false, intervalHours: 12, channels: [] };
  }
}

function saveAutoSyncConfig(cfg: AutoSyncConfig): void {
  try {
    fs.mkdirSync(LOCAL_DIR, { recursive: true });
    fs.writeFileSync(AUTO_SYNC_FILE, JSON.stringify(cfg, null, 2));
  } catch { /* best effort */ }
}

export function getAutoSyncConfig(): AutoSyncConfig {
  return loadAutoSyncConfig();
}

// ── Call Python helper ─────────────────────────────────────────────────────────
function callPython(input: object): Promise<any> {
  return new Promise((resolve, reject) => {
    const env = {
      ...process.env,
      PYTHONPATH: [
        require("child_process")
          .execSync("python3 -c \"import site; print(site.getusersitepackages())\"")
          .toString()
          .trim(),
        process.env.PYTHONPATH || "",
      ]
        .filter(Boolean)
        .join(":"),
    };

    execFile(
      "python3",
      [SCRIPT],
      { env, timeout: 120_000 },
      (err, stdout, stderr) => {
        if (err && !stdout) {
          reject(new Error(stderr || err.message));
          return;
        }
        try {
          const result = JSON.parse(stdout.trim());
          if (!result.ok) reject(new Error(result.error ?? "Python error"));
          else resolve(result);
        } catch {
          reject(new Error(`Bad Python output: ${stdout.slice(0, 200)}`));
        }
      },
    ).stdin!.end(JSON.stringify(input));
  });
}

// ── Auth state ─────────────────────────────────────────────────────────────────
export type AuthStatus =
  | "idle"
  | "connected"
  | "waiting_code"
  | "waiting_2fa"
  | "authenticated"
  | "error";

interface AuthState {
  status: AuthStatus;
  error?: string;
}

function loadPyState(): AuthState {
  try {
    const raw = fs.readFileSync(STATE_FILE, "utf8");
    const s = JSON.parse(raw);
    return { status: s.step === "authenticated" ? "authenticated" : s.step === "waiting_code" ? "waiting_code" : "idle" };
  } catch {
    return { status: fs.existsSync(SESSION_FILE) ? "authenticated" : "idle" };
  }
}

export let authState: AuthState = loadPyState();

// ── Sync job ───────────────────────────────────────────────────────────────────
export interface SyncJob {
  running: boolean;
  total: number;
  indexed: number;
  skipped: number;
  failed: number;
  log: string[];
  startedAt: string;
  finishedAt?: string;
  mode: "full" | "incremental";
}

export let syncJob: SyncJob | null = null;

function logSync(msg: string) {
  if (!syncJob) return;
  syncJob.log.push(msg);
  if (syncJob.log.length > 100) syncJob.log.shift();
}

// ── Auth Step 1 ────────────────────────────────────────────────────────────────
export async function authStartPhone(phone: string): Promise<void> {
  authState = { status: "connected" };
  await callPython({ cmd: "send_code", phone });
  authState = { status: "waiting_code" };
}

// ── Auth Step 2 ────────────────────────────────────────────────────────────────
export async function authVerifyCode(code: string, password?: string): Promise<string> {
  const result = await callPython({ cmd: "verify_code", code, password: password ?? "" });
  if (result.status === "waiting_2fa") {
    authState = { status: "waiting_2fa" };
    throw new Error("2FA_REQUIRED");
  }
  authState = { status: "authenticated" };
  return "ok";
}

// ── Channel sync ───────────────────────────────────────────────────────────────
/**
 * mode=full      → re-index everything (offset_id=0 for all channels)
 * mode=incremental → only messages AFTER last known message_id per channel
 */
export async function startChannelSync(
  channelLink: string | string[] | ChannelEntry[],
  logger?: Logger,
  mode: "full" | "incremental" = "full",
): Promise<void> {
  if (syncJob?.running) throw new Error("مزامنة جارية بالفعل");
  // Normalise to ChannelEntry[]
  const channels: ChannelEntry[] = Array.isArray(channelLink)
    ? (channelLink as any[]).map((c) =>
        typeof c === "string" ? { link: c } : c
      )
    : [typeof channelLink === "string" ? { link: channelLink } : channelLink];

  syncJob = {
    running: true,
    total: 0,
    indexed: 0,
    skipped: 0,
    failed: 0,
    log: [],
    startedAt: new Date().toISOString(),
    mode,
  };

  (async () => {
    const syncState = loadSyncState();
    // Track the highest message_id seen per channel in THIS run
    const newMaxIds: Record<string, number> = {};

    try {
      // ── Phase 1: collect all files from all channels ──────────────────────
      let allFiles: any[] = [];
      const BATCH = 200;

      for (let ci = 0; ci < channels.length; ci++) {
        const entry = channels[ci];
        const ch = entry.link;
        if (!syncJob.running) break;
        const label = entry.label ? `${entry.label} (${ch})` : ch;
        logSync(`📡 القناة ${ci + 1}/${channels.length}: ${label}`);
        if (entry.category) logSync(`🏷️ تصنيف مفروض: ${entry.category}`);

        // In incremental mode, start from after the last known message_id
        const lastKnown = syncState.channels[ch]?.lastMessageId ?? 0;
        if (mode === "incremental" && lastKnown > 0) {
          logSync(`🔄 وضع تدريجي — نجلب ما بعد الرسالة #${lastKnown}`);
        } else {
          logSync("🔍 وضع كامل — جاري جلب كل الملفات...");
        }

        // For incremental: we need messages NEWER than lastKnown.
        // Telethon iter_messages with offset_id=X returns messages with id < X (older).
        // To get NEWER messages, we DON'T use offset_id — instead we fetch from the top
        // and stop when we hit message_id <= lastKnown.
        let offsetId = 0;
        let batchNum = 0;
        let reachedKnown = false;

        try {
          while (syncJob.running && !reachedKnown) {
            batchNum++;
            logSync(`📦 جلب الدُفعة ${batchNum}...`);
            const result = await callPython({
              cmd: "sync",
              channel: ch,
              limit: BATCH,
              offset_id: offsetId,
            });

            syncJob.total += result.total_scanned;
            const files: any[] = (result.files ?? []).map((f: any) => ({ ...f, _channel: ch }));

            if (mode === "incremental" && lastKnown > 0) {
              // Filter: only keep files with message_id > lastKnown
              const newFiles = files.filter((f: any) => f.message_id > lastKnown);
              allFiles = allFiles.concat(newFiles);
              logSync(`📄 ${newFiles.length} ملف جديد (تم تصفية ${files.length - newFiles.length} قديم)`);

              // If all files in this batch are already known, stop
              if (files.length > 0 && newFiles.length < files.length) {
                reachedKnown = true;
                break;
              }
            } else {
              allFiles = allFiles.concat(files);
              logSync(`📄 وجدنا ${files.length} ملف في هذه الدُفعة`);
            }

            // Track max message_id for this channel
            const ids: number[] = files.map((f: any) => f.message_id);
            if (ids.length > 0) {
              const maxInBatch = Math.max(...ids);
              newMaxIds[ch] = Math.max(newMaxIds[ch] ?? 0, maxInBatch);
            }

            if (result.total_scanned < BATCH) break;

            if (ids.length > 0) {
              offsetId = Math.min(...ids) - 1;
            } else {
              break;
            }
          }
          logSync(`✅ ${allFiles.length} ملف مؤهل حتى الآن`);
        } catch (chErr: any) {
          // Per-channel error: log and continue with next channel instead of aborting
          const msg = chErr?.message ?? String(chErr);
          const isFlood = msg.includes("FloodWait") || msg.includes("wait of");
          if (isFlood) {
            const secs = msg.match(/wait of (\d+)/)?.[1] ?? "?";
            logSync(`⏳ تجاوز حد تيليجرام للقناة ${ch} — انتظر ${secs}ث ثم أعيدي المزامنة`);
          } else {
            logSync(`⚠️ خطأ في القناة ${ch}: ${msg.slice(0, 120)}`);
          }
          syncJob.failed++;
          logger?.warn({ channel: ch, err: msg }, "channel sync skipped due to error");
        }
      }

      logSync(`📚 إجمالي الملفات للفهرسة: ${allFiles.length}`);

      // ── Phase 2: download + index ─────────────────────────────────────────
      const tmpDir = path.join(os.tmpdir(), "tg_sync_" + Date.now());
      fs.mkdirSync(tmpDir, { recursive: true });

      for (const fileInfo of allFiles) {
        if (!syncJob.running) break;
        const { message_id, file_name, file_size } = fileInfo;
        const sizeMb = (file_size / 1024 / 1024).toFixed(1);
        logSync(`⏳ ${file_name} (${sizeMb} MB)`);

        try {
          const outPath = path.join(tmpDir, `${message_id}_${file_name}`);
          await callPython({
            cmd: "download",
            channel: fileInfo._channel,
            message_id,
            out_path: outPath,
          });

          const buffer = fs.readFileSync(outPath);
          const ext = path.extname(file_name).toLowerCase();
          const mimeMap: Record<string, string> = {
            ".pdf": "application/pdf",
            ".docx": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
            ".pptx": "application/vnd.openxmlformats-officedocument.presentationml.presentation",
            ".xlsx": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
            ".xls": "application/vnd.ms-excel",
            ".txt": "text/plain",
            ".csv": "text/csv",
            ".rtf": "application/rtf",
          };
          const mime = mimeMap[ext] ?? "application/octet-stream";

          // Look up per-channel forced category, then fall back to auto-detection
          const matchEntry = channels.find((e) => e.link === fileInfo._channel);
          let forcedCat: string | undefined = matchEntry?.category;

          if (!forcedCat) {
            // Auto-classify as circular when the channel or filename contains circular indicators
            const chLower = (fileInfo._channel ?? "").toLowerCase();
            const nameLower = file_name.toLowerCase();
            const isCircularChannel =
              chLower.includes("تعميم") || chLower.includes("تعاميم") ||
              chLower.includes("circular") || chLower.includes("moj") ||
              chLower.includes("p8chjlncd1snkmon");
            const isCircularFile =
              nameLower.includes("تعميم") || nameLower.includes("تعاميم") ||
              nameLower.includes("circular");
            if (isCircularChannel || isCircularFile) forcedCat = "circular";
          }

          await createAndIndexDocument(buffer, mime, file_name, { category: forcedCat, sourceType: "telegram" });
          syncJob.indexed++;
          logSync(`✅ ${file_name}`);
          try { fs.unlinkSync(outPath); } catch {}
        } catch (e: any) {
          syncJob.failed++;
          logSync(`❌ ${file_name}: ${e?.message?.slice(0, 80) ?? "خطأ"}`);
        }

        await new Promise((r) => setTimeout(r, 200));
      }

      // ── Save incremental state ────────────────────────────────────────────
      const now = new Date().toISOString();
      for (const entry of channels) {
        const ch = entry.link;
        const maxId = newMaxIds[ch] ?? 0;
        const prev = syncState.channels[ch];
        // In full mode always update; in incremental only update if we saw new messages
        if (mode === "full" || maxId > (prev?.lastMessageId ?? 0)) {
          syncState.channels[ch] = {
            lastMessageId: Math.max(maxId, prev?.lastMessageId ?? 0),
            lastSyncAt: now,
            filesIndexed: (prev?.filesIndexed ?? 0) + syncJob!.indexed,
          };
        } else if (mode === "incremental") {
          // Still update timestamp even if no new files
          syncState.channels[ch] = {
            lastMessageId: prev?.lastMessageId ?? 0,
            lastSyncAt: now,
            filesIndexed: prev?.filesIndexed ?? 0,
          };
        }
      }
      saveSyncState(syncState);

    } catch (err: any) {
      logSync(`💥 خطأ: ${err?.message ?? String(err)}`);
      logger?.error({ err: err?.message }, "mtproto sync error");
    } finally {
      syncJob!.running = false;
      syncJob!.finishedAt = new Date().toISOString();
      logSync(
        `📊 النتيجة: ${syncJob!.indexed} مفهرَس · ${syncJob!.failed} فشل · ${syncJob!.skipped} تخطّى`,
      );
    }
  })();
}

export function stopChannelSync() {
  if (syncJob) syncJob.running = false;
}

// ── Auto-scheduler ─────────────────────────────────────────────────────────────
let autoSyncTimer: ReturnType<typeof setInterval> | null = null;
let autoSyncLogger: Logger | undefined;

export function setAutoSync(
  channels: ChannelEntry[],
  intervalHours: number,
  logger?: Logger,
): void {
  // Clear existing timer
  clearAutoSyncTimer();

  const cfg: AutoSyncConfig = { enabled: true, intervalHours, channels };
  saveAutoSyncConfig(cfg);
  autoSyncLogger = logger;

  const ms = intervalHours * 60 * 60 * 1000;
  autoSyncTimer = setInterval(async () => {
    logger?.info({ count: channels.length, intervalHours }, "⏰ بدء المزامنة التلقائية");
    try {
      if (!syncJob?.running) {
        const cfg = loadAutoSyncConfig();
        cfg.lastAutoSyncAt = new Date().toISOString();
        saveAutoSyncConfig(cfg);
        await startChannelSync(channels, logger, "incremental");
      }
    } catch (e: any) {
      logger?.error({ err: e?.message }, "auto-sync failed");
    }
  }, ms);

  logger?.info({ intervalHours, channels: channels.length }, "⏰ جدولة المزامنة التلقائية مفعّلة");
}

export function clearAutoSyncTimer(): void {
  if (autoSyncTimer) {
    clearInterval(autoSyncTimer);
    autoSyncTimer = null;
  }
}

export function disableAutoSync(): void {
  clearAutoSyncTimer();
  const cfg = loadAutoSyncConfig();
  cfg.enabled = false;
  saveAutoSyncConfig(cfg);
}

/** Called at server startup to restore a previously saved schedule.
 *  IMPORTANT: also checks the DB platform_settings telegram_import toggle.
 *  If the toggle is disabled, auto-sync is NOT started even if the local file says enabled.
 */
export async function restoreAutoSync(logger?: Logger): Promise<void> {
  // Inline DB check (avoid circular import from platform-settings route)
  let dbEnabled = false;
  try {
    const { db, platformSettingsTable } = await import("@workspace/db");
    const { eq } = await import("drizzle-orm");
    const rows = await db
      .select()
      .from(platformSettingsTable)
      .where(eq(platformSettingsTable.key, "telegram_import"));
    dbEnabled = (rows[0]?.value as any)?.enabled === true;
  } catch {
    dbEnabled = false;
  }

  if (!dbEnabled) {
    logger?.info("⏸ مزامنة تيليجرام معطّلة من لوحة الإدارة — لن تُستعاد الجدولة");
    // Make sure local file reflects disabled state too
    const cfg = loadAutoSyncConfig();
    if (cfg.enabled) {
      cfg.enabled = false;
      saveAutoSyncConfig(cfg);
    }
    return;
  }

  const cfg = loadAutoSyncConfig();
  if (cfg.enabled && cfg.channels.length > 0 && cfg.intervalHours > 0) {
    setAutoSync(cfg.channels, cfg.intervalHours, logger);
    logger?.info({ intervalHours: cfg.intervalHours }, "⏰ استعادة الجدولة التلقائية من الملف");
  }
}

export function credentialsConfigured(): boolean {
  const hash = (process.env.TELEGRAM_API_HASH ?? "").trim();
  return Boolean(hash && hash.length >= 10);
}

/** Return per-channel sync state for the status endpoint */
export function getChannelSyncState(): Record<string, ChannelSyncState> {
  return loadSyncState().channels;
}

// ── Test pull (limited scan + index + cost estimate) ──────────────────────────
export interface TestSyncResult {
  messagesScanned: number;
  docsFound: number;
  docsIndexed: number;
  docsFailed: number;
  fileSizesMb: number[];
  avgFileSizeMb: number;
  costEstimate: {
    /** Approximate embedding cost for the test batch (USD) */
    testBatchUSD: number;
    /** Approximate embedding cost per document (USD) */
    perDocUSD: number;
    /** Rate: docs per 100 messages — useful to extrapolate full-channel cost */
    docsPerHundredMessages: number;
    note: string;
  };
  log: string[];
}

export async function testChannelSync(
  channelLink: string,
  limit = 100,
  logger?: Logger,
): Promise<TestSyncResult> {
  const log: string[] = [];
  const addLog = (msg: string) => {
    log.push(`[${new Date().toISOString().slice(11, 19)}] ${msg}`);
    logger?.info(msg);
  };

  addLog(`🧪 بدء سحب تجريبي — حد ${limit} رسالة من: ${channelLink}`);

  // Phase 1: scan
  let scanResult: any;
  try {
    scanResult = await callPython({ cmd: "sync", channel: channelLink, limit, offset_id: 0 });
  } catch (err: any) {
    const msg = err?.message ?? String(err);
    addLog(`❌ فشل الاتصال بتيليجرام: ${msg}`);
    throw new Error(msg);
  }

  const messagesScanned: number = scanResult.total_scanned ?? 0;
  const files: any[] = scanResult.files ?? [];
  addLog(`📡 فحص ${messagesScanned} رسالة — وُجد ${files.length} وثيقة مؤهلة`);

  if (files.length === 0) {
    addLog("ℹ️ لا وثائق في أول " + messagesScanned + " رسالة — يمكن تجربة حد أكبر");
    return {
      messagesScanned, docsFound: 0, docsIndexed: 0, docsFailed: 0,
      fileSizesMb: [], avgFileSizeMb: 0,
      costEstimate: {
        testBatchUSD: 0, perDocUSD: 0, docsPerHundredMessages: 0,
        note: "لا وثائق في هذه الدُفعة",
      },
      log,
    };
  }

  // Phase 2: download + index
  const tmpDir = path.join(os.tmpdir(), "tg_test_" + Date.now());
  fs.mkdirSync(tmpDir, { recursive: true });

  const fileSizesMb: number[] = [];
  let docsIndexed = 0;
  let docsFailed = 0;

  const mimeMap: Record<string, string> = {
    ".pdf":  "application/pdf",
    ".docx": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    ".pptx": "application/vnd.openxmlformats-officedocument.presentationml.presentation",
    ".xlsx": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    ".xls":  "application/vnd.ms-excel",
    ".txt":  "text/plain",
    ".csv":  "text/csv",
    ".rtf":  "application/rtf",
  };

  for (const fileInfo of files) {
    const { message_id, file_name, file_size } = fileInfo;
    const sizeMb = (file_size / 1024 / 1024);
    fileSizesMb.push(sizeMb);
    addLog(`⏳ ${file_name} (${sizeMb.toFixed(1)} MB)`);

    try {
      const outPath = path.join(tmpDir, `${message_id}_${file_name}`);
      await callPython({ cmd: "download", channel: channelLink, message_id, out_path: outPath });

      const buffer = fs.readFileSync(outPath);
      const ext = path.extname(file_name).toLowerCase();
      const mime = mimeMap[ext] ?? "application/octet-stream";

      // Auto-classify circulars
      const chLower = channelLink.toLowerCase();
      const nameLower = file_name.toLowerCase();
      const isCircular =
        chLower.includes("تعميم") || chLower.includes("تعاميم") ||
        chLower.includes("circular") || chLower.includes("moj") ||
        chLower.includes("p8chjlncd1snkmon") ||
        nameLower.includes("تعميم") || nameLower.includes("تعاميم") ||
        nameLower.includes("circular");

      await createAndIndexDocument(buffer, mime, file_name, {
        category: isCircular ? "circular" : undefined,
        sourceType: "telegram",
      });
      docsIndexed++;
      addLog(`✅ ${file_name}`);
      try { fs.unlinkSync(outPath); } catch {}
    } catch (e: any) {
      docsFailed++;
      addLog(`❌ ${file_name}: ${e?.message?.slice(0, 80) ?? "خطأ"}`);
    }

    await new Promise((r) => setTimeout(r, 200));
  }

  // Phase 3: cost estimate
  // OpenAI text-embedding-3-small: $0.02 / 1M tokens
  // Assume avg 8 pages/doc × 500 tokens/page = 4 000 tokens/doc → $0.00008/doc
  const AVG_TOKENS_PER_DOC = 4_000;
  const COST_PER_TOKEN = 0.02 / 1_000_000;
  const perDocUSD = AVG_TOKENS_PER_DOC * COST_PER_TOKEN;
  const testBatchUSD = docsIndexed * perDocUSD;
  const docsPerHundredMessages = messagesScanned > 0
    ? (files.length / messagesScanned) * 100
    : 0;
  const avgFileSizeMb = fileSizesMb.length > 0
    ? fileSizesMb.reduce((a, b) => a + b, 0) / fileSizesMb.length
    : 0;

  addLog(`📊 النتيجة: ${docsIndexed} مفهرَس · ${docsFailed} فشل · تكلفة التجربة ~$${testBatchUSD.toFixed(5)}`);
  addLog(`💡 معدل الوثائق: ${docsPerHundredMessages.toFixed(1)} وثيقة لكل 100 رسالة`);

  return {
    messagesScanned,
    docsFound: files.length,
    docsIndexed,
    docsFailed,
    fileSizesMb,
    avgFileSizeMb,
    costEstimate: {
      testBatchUSD,
      perDocUSD,
      docsPerHundredMessages,
      note: `التقدير مبني على ${AVG_TOKENS_PER_DOC.toLocaleString()} رمز/وثيقة بسعر $0.02/مليون رمز (text-embedding-3-small). لحساب التكلفة الكاملة: اضربي "${docsPerHundredMessages.toFixed(1)} وثيقة × (إجمالي رسائل القناة ÷ 100) × $${perDocUSD.toFixed(5)}"`,
    },
    log,
  };
}
