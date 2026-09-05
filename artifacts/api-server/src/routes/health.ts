import { Router, type IRouter } from "express";
import { db, usersTable, packagesTable, subscriptionsTable } from "@workspace/db";
import { eq, count } from "drizzle-orm";
import { getTavilyStats } from "../lib/legal-search";

const router: IRouter = Router();

// ── Basic liveness probe (used by artifact health check) ─────────────────
// Keep the API root healthy as well as /healthz. Older deployment probes used
// /api, while the current artifact configuration uses /api/healthz.
router.get("/", (_req, res) => {
  res.json({ status: "ok" });
});

router.get("/healthz", (_req, res) => {
  res.json({ status: "ok" });
});

// ── Comprehensive diagnostic endpoint ────────────────────────────────────
// Returns safe system-health data. Does NOT expose env-var values.
router.get("/diagnostics", async (req, res): Promise<void> => {
  const checks: Record<string, unknown> = {};

  // 1. OpenAI key presence & format (never expose the actual value)
  const rawKey = process.env.OPENAI_API_KEY ?? "";
  const cleanKey = rawKey.replace(/[^\x20-\x7E]/g, "").trim();
  checks.openai = {
    keyPresent: cleanKey.length > 0,
    keyValidFormat: cleanKey.startsWith("sk-"),
    keyLength: cleanKey.length,
    keyPrefix: cleanKey.length > 7 ? `${cleanKey.slice(0, 7)}…` : "(short)",
  };

  // 2. OpenAI connectivity
  try {
    const start = Date.now();
    const resp = await fetch("https://api.openai.com/v1/models", {
      headers: { Authorization: `Bearer ${cleanKey}` },
      signal: AbortSignal.timeout(8000),
    });
    checks.openaiConnectivity = {
      status: resp.status,
      ok: resp.ok,
      latencyMs: Date.now() - start,
      error:
        !resp.ok
          ? resp.status === 401
            ? "مفتاح غير صالح أو منتهي الصلاحية"
            : resp.status === 403
              ? "مفتاح لا يملك صلاحية"
              : resp.status === 429
                ? "تجاوز حد الطلبات"
                : `HTTP ${resp.status}`
          : null,
    };
  } catch (err: any) {
    checks.openaiConnectivity = {
      ok: false,
      error: err?.message ?? "خطأ في الاتصال",
    };
  }

  // 3. Session config
  checks.session = {
    secretSet: !!process.env.SESSION_SECRET,
    isReplitEnv: !!process.env.REPL_ID,
    nodeEnv: process.env.NODE_ENV ?? "unset",
    cookieSameSite:
      process.env.REPL_ID || process.env.NODE_ENV === "production" ? "none" : "lax",
    cookieSecure:
      !!(process.env.REPL_ID || process.env.NODE_ENV === "production"),
  };

  // 4. Database connectivity
  try {
    const [row] = await db.select({ n: count() }).from(usersTable);
    const [pkgRow] = await db.select({ n: count() }).from(packagesTable);
    const [subRow] = await db.select({ n: count() }).from(subscriptionsTable);
    checks.database = {
      ok: true,
      users: row?.n ?? 0,
      packages: pkgRow?.n ?? 0,
      subscriptions: subRow?.n ?? 0,
    };
  } catch (err: any) {
    checks.database = { ok: false, error: err?.message };
  }

  // 5. Packages sanity
  try {
    const pkgs = await db.select().from(packagesTable);
    const freePkg = pkgs.find((p) => p.type === "free");
    checks.packages = {
      total: pkgs.length,
      freePackageExists: !!freePkg,
      freePackageId: freePkg?.id ?? null,
      list: pkgs.map((p) => ({
        id: p.id,
        type: p.type,
        nameAr: p.nameAr,
        price: p.price,
        questionsAllowed: p.questionsAllowed,
        isActive: p.isActive,
      })),
    };
  } catch (err: any) {
    checks.packages = { ok: false, error: err?.message };
  }

  // 6. Tavily health — failure counters (never expose the API key)
  const tavilyStatsSnap = getTavilyStats();
  checks.tavily = {
    keyPresent: !!process.env.TAVILY_API_KEY,
    httpErrorCount: tavilyStatsSnap.httpErrorCount,
    networkErrorCount: tavilyStatsSnap.networkErrorCount,
    lastErrorAt: tavilyStatsSnap.lastErrorAt,
    lastHttpStatus: tavilyStatsSnap.lastHttpStatus,
    lastErrorMessage: tavilyStatsSnap.lastErrorMessage,
  };

  // 7. Auth session (if caller is logged in)
  checks.currentSession = {
    userId: (req.session as any)?.userId ?? null,
    userRole: (req.session as any)?.userRole ?? null,
    sessionId: req.sessionID ? `${req.sessionID.slice(0, 6)}…` : null,
  };

  const allOk =
    (checks.openai as any).keyPresent &&
    (checks.openai as any).keyValidFormat &&
    (checks.openaiConnectivity as any).ok &&
    (checks.database as any).ok &&
    (checks.packages as any).freePackageExists;

  res.status(allOk ? 200 : 500).json({ allOk, checks });
});

export default router;
