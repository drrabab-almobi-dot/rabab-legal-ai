import { Router, type IRouter } from "express";
import { requireAdmin } from "../middlewares/auth";
import {
  authState,
  authStartPhone,
  authVerifyCode,
  startChannelSync,
  stopChannelSync,
  syncJob,
  credentialsConfigured,
  setAutoSync,
  disableAutoSync,
  getAutoSyncConfig,
  getChannelSyncState,
  testChannelSync,
  type ChannelEntry,
} from "../lib/telegram-mtproto";

const router: IRouter = Router();

// ── Status ────────────────────────────────────────────────────────────────────
router.get("/admin/telegram-sync/status", requireAdmin, (_req, res): void => {
  res.json({
    credentialsConfigured: credentialsConfigured(),
    authStatus: authState.status,
    authError: authState.error ?? null,
    syncJob: syncJob
      ? {
          running: syncJob.running,
          total: syncJob.total,
          indexed: syncJob.indexed,
          skipped: syncJob.skipped,
          failed: syncJob.failed,
          log: syncJob.log.slice(-20),
          startedAt: syncJob.startedAt,
          finishedAt: syncJob.finishedAt ?? null,
          mode: syncJob.mode,
        }
      : null,
    channelState: getChannelSyncState(),
    autoSync: getAutoSyncConfig(),
  });
});

// ── Auth Step 1: send code ────────────────────────────────────────────────────
router.post("/admin/telegram-sync/auth/start", requireAdmin, async (req, res): Promise<void> => {
  const { phone } = req.body as { phone?: string };
  if (!phone) { res.status(400).json({ error: "أدخلي رقم الهاتف" }); return; }
  if (!credentialsConfigured()) {
    res.status(400).json({ error: "أضيفي TELEGRAM_API_ID و TELEGRAM_API_HASH في إعدادات الأسرار أولاً" });
    return;
  }
  try {
    await authStartPhone(phone.trim());
    res.json({ success: true, status: "waiting_code" });
  } catch (err: any) {
    res.status(500).json({ error: err?.message ?? "فشل إرسال الرمز" });
  }
});

// ── Auth Step 2: verify code ──────────────────────────────────────────────────
router.post("/admin/telegram-sync/auth/verify", requireAdmin, async (req, res): Promise<void> => {
  const { code, password } = req.body as { code?: string; password?: string };
  if (!code) { res.status(400).json({ error: "أدخلي رمز التحقق" }); return; }
  try {
    await authVerifyCode(code.trim(), password?.trim());
    res.json({ success: true, status: "authenticated" });
  } catch (err: any) {
    if (err.message === "2FA_REQUIRED") {
      res.json({ success: false, status: "waiting_2fa" });
    } else {
      res.status(400).json({ error: err?.message ?? "رمز غير صحيح" });
    }
  }
});

// ── Start sync ────────────────────────────────────────────────────────────────
router.post("/admin/telegram-sync/start", requireAdmin, async (req, res): Promise<void> => {
  const { channelLink, channels: channelsBody, mode } = req.body as {
    channelLink?: string | string[];
    channels?: Array<ChannelEntry | string>;
    mode?: "full" | "incremental";
  };

  // Accept both legacy `channelLink` and new `channels` array of ChannelEntry
  let entries: ChannelEntry[] = [];
  if (channelsBody && Array.isArray(channelsBody)) {
    entries = channelsBody.map((c) =>
      typeof c === "string" ? { link: c.trim() } : { ...c, link: c.link.trim() }
    ).filter((e) => e.link);
  } else if (channelLink) {
    const links = Array.isArray(channelLink) ? channelLink : [channelLink];
    entries = links.map((l) => ({ link: l.trim() })).filter((e) => e.link);
  }

  if (!entries.length) { res.status(400).json({ error: "أدخلي رابط القناة" }); return; }
  const syncMode: "full" | "incremental" = mode === "incremental" ? "incremental" : "full";
  try {
    await startChannelSync(entries, req.log, syncMode);
    res.json({ success: true, mode: syncMode });
  } catch (err: any) {
    res.status(500).json({ error: err?.message ?? "فشل بدء المزامنة" });
  }
});

// ── Stop sync ─────────────────────────────────────────────────────────────────
router.post("/admin/telegram-sync/stop", requireAdmin, (_req, res): void => {
  stopChannelSync();
  res.json({ success: true });
});

// ── Test pull (limited scan + index + cost estimate) ─────────────────────────
router.post("/admin/telegram-sync/test-pull", requireAdmin, async (req, res): Promise<void> => {
  const { channelLink, limit } = req.body as { channelLink?: string; limit?: number };
  if (!channelLink) { res.status(400).json({ error: "أدخلي رابط القناة" }); return; }
  if (syncJob?.running) { res.status(409).json({ error: "مزامنة أخرى جارية — أوقفيها أولاً" }); return; }

  const pullLimit = Math.min(Math.max(Number(limit) || 100, 1), 500);
  try {
    const result = await testChannelSync(channelLink.trim(), pullLimit, req.log);
    res.json({ success: true, ...result });
  } catch (err: any) {
    res.status(500).json({ error: err?.message ?? "فشل السحب التجريبي" });
  }
});

// ── Get auto-sync schedule ────────────────────────────────────────────────────
router.get("/admin/telegram-sync/schedule", requireAdmin, (_req, res): void => {
  res.json(getAutoSyncConfig());
});

// ── Set auto-sync schedule ────────────────────────────────────────────────────
router.post("/admin/telegram-sync/schedule", requireAdmin, (req, res): void => {
  const { enabled, intervalHours, channels } = req.body as {
    enabled?: boolean;
    intervalHours?: number;
    channels?: Array<ChannelEntry | string>;
  };

  if (enabled === false) {
    disableAutoSync();
    res.json({ success: true, enabled: false });
    return;
  }

  if (!Array.isArray(channels) || channels.length === 0) {
    res.status(400).json({ error: "أدخلي قائمة القنوات" });
    return;
  }
  const hours = Number(intervalHours);
  if (!hours || hours < 1 || hours > 168) {
    res.status(400).json({ error: "الفترة يجب أن تكون بين 1 و 168 ساعة" });
    return;
  }

  // Normalise to ChannelEntry[]
  const entries: ChannelEntry[] = channels.map((c) =>
    typeof c === "string" ? { link: c.trim() } : { ...c, link: c.link.trim() }
  ).filter((e) => e.link);

  setAutoSync(entries, hours, req.log);
  res.json({ success: true, enabled: true, intervalHours: hours, channels: entries });
});

export default router;
