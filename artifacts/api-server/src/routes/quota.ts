/**
 * Quota & Trial API
 *
 * GET  /api/quota/status              — حالة الحصة للمستخدم الحالي
 * POST /api/quota/device-fingerprint  — ربط بصمة الجهاز بالحساب
 * GET  /api/admin/conversion-report   — تقرير التحويل من تجربة → اشتراك
 */
import { Router, type IRouter } from "express";
import { db, deviceFingerprintsTable, usersTable, subscriptionsTable, packagesTable, serviceSessionsTable, usageLogTable } from "@workspace/db";
import { eq, and, sql, desc, count } from "drizzle-orm";
import { requireAuth, requireAdmin } from "../middlewares/auth";
import { getQuotaStatus, FREE_TRIAL_SERVICES } from "../lib/quota";

const router: IRouter = Router();

// ── GET /api/quota/status ──────────────────────────────────────────────────────
router.get("/quota/status", requireAuth, async (req, res): Promise<void> => {
  try {
    if (req.userRole === "admin") {
      res.json({
        allowed: true, isTrial: false, trialRemaining: null,
        remaining: { consultation: 9999, contract_draft: 9999, contract_review: 9999 },
        allowed_limits: { consultation: 9999, contract_draft: 9999, contract_review: 9999 },
        needsUpgrade: false,
      });
      return;
    }
    const status = await getQuotaStatus(req.userId!);
    res.json(status);
  } catch (err: any) {
    res.status(500).json({ error: err?.message });
  }
});

// ── POST /api/quota/device-fingerprint ──────────────────────────────────────────
router.post("/quota/device-fingerprint", requireAuth, async (req, res): Promise<void> => {
  const { fingerprintHash } = req.body ?? {};
  if (!fingerprintHash || typeof fingerprintHash !== "string" || fingerprintHash.length < 8) {
    res.status(400).json({ error: "بصمة غير صالحة" });
    return;
  }

  try {
    // Check if this fingerprint belongs to a DIFFERENT user → potential abuse
    const existing = await db
      .select()
      .from(deviceFingerprintsTable)
      .where(eq(deviceFingerprintsTable.fingerprintHash, fingerprintHash))
      .limit(1);

    if (existing.length > 0 && existing[0].userId !== req.userId!) {
      // Log abuse attempt but don't block (could be shared device)
      req.log?.warn({ userId: req.userId, existingUserId: existing[0].userId }, "device fingerprint reuse detected");
    } else if (existing.length === 0) {
      await db.insert(deviceFingerprintsTable).values({
        fingerprintHash,
        userId: req.userId!,
      }).onConflictDoNothing();
    }
    res.json({ ok: true });
  } catch {
    res.json({ ok: false });
  }
});

// ── GET /api/admin/conversion-report ──────────────────────────────────────────
router.get("/admin/conversion-report", requireAdmin, async (_req, res): Promise<void> => {
  try {
    // Total registered users
    const [totalRow] = await db.select({ total: sql<number>`COUNT(*)::int` }).from(usersTable)
      .where(eq(usersTable.isActive, true));

    // Users who have exhausted their free trial (used >= 3 sessions and still on free plan)
    const exhaustedResult = await db.execute(sql`
      SELECT COUNT(DISTINCT ss.user_id)::int AS exhausted
      FROM service_sessions ss
      JOIN subscriptions sub ON sub.id = ss.subscription_id
      JOIN packages pkg ON pkg.id = sub.package_id
      WHERE ss.counted = TRUE AND pkg.type = 'free'
      GROUP BY ss.user_id
      HAVING COUNT(*)::int >= ${FREE_TRIAL_SERVICES}
    `);
    const exhaustedRow = exhaustedResult.rows[0] as { exhausted?: number } | undefined;

    // Users who converted to paid
    const paidResult = await db.execute(sql`
      SELECT COUNT(DISTINCT s.user_id)::int AS paid
      FROM subscriptions s
      JOIN packages p ON p.id = s.package_id
      WHERE p.type != 'free' AND s.status = 'active'
    `);
    const paidRow = paidResult.rows[0] as { paid?: number } | undefined;

    // Average services used before converting (users who have a paid sub and also used trial)
    const avgResult = await db.execute(sql`
      SELECT ROUND(AVG(session_count), 2) AS avg_before_upgrade
      FROM (
        SELECT ss.user_id, COUNT(*)::int AS session_count
        FROM service_sessions ss
        JOIN subscriptions sub ON sub.id = ss.subscription_id
        JOIN packages pkg ON pkg.id = sub.package_id
        WHERE ss.counted = TRUE AND pkg.type = 'free'
          AND EXISTS (
            SELECT 1 FROM subscriptions s2
            JOIN packages p2 ON p2.id = s2.package_id
            WHERE s2.user_id = ss.user_id AND p2.type != 'free'
          )
        GROUP BY ss.user_id
      ) sub_counts
    `);
    const avgRow = avgResult.rows[0] as { avg_before_upgrade?: number | string } | undefined;

    // Distribution by service type
    const byType = await db.execute(sql`
      SELECT service_type, COUNT(*)::int AS cnt
      FROM service_sessions
      WHERE counted = TRUE
      GROUP BY service_type
    `);

    // Daily registrations for last 30 days
    const dailyReg = await db.execute(sql`
      SELECT DATE(created_at) AS day, COUNT(*)::int AS registrations
      FROM users
      WHERE created_at >= NOW() - INTERVAL '30 days'
      GROUP BY DATE(created_at)
      ORDER BY day
    `);

    // Daily conversions for last 30 days
    const dailyConv = await db.execute(sql`
      SELECT DATE(s.start_date) AS day, COUNT(*)::int AS conversions
      FROM subscriptions s
      JOIN packages p ON p.id = s.package_id
      WHERE p.type != 'free' AND s.start_date >= NOW() - INTERVAL '30 days'
      GROUP BY DATE(s.start_date)
      ORDER BY day
    `);

    const totalUsers = totalRow?.total ?? 0;
    const paidUsers = Number((paidRow as any)?.rows?.[0]?.paid ?? 0);
    const exhaustedUsers = Number((exhaustedRow as any)?.rows?.[0]?.exhausted ?? 0);
    const avgBefore = Number((avgRow as any)?.rows?.[0]?.avg_before_upgrade ?? 0);

    res.json({
      summary: {
        totalUsers,
        paidUsers,
        exhaustedTrialUsers: exhaustedUsers,
        conversionRate: totalUsers > 0 ? ((paidUsers / totalUsers) * 100).toFixed(1) : "0.0",
        avgServicesBeforeUpgrade: avgBefore,
      },
      byServiceType: (byType as any).rows ?? [],
      dailyRegistrations: (dailyReg as any).rows ?? [],
      dailyConversions: (dailyConv as any).rows ?? [],
    });
  } catch (err: any) {
    res.status(500).json({ error: err?.message });
  }
});

// ── GET /api/admin/usage-stats/top-consumers ─────────────────────────────────
// أعلى 15 حساباً استهلاكاً اليوم وهذا الشهر
router.get("/admin/usage-stats/top-consumers", requireAdmin, async (_req, res): Promise<void> => {
  try {
    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);
    const monthStart = new Date(todayStart.getFullYear(), todayStart.getMonth(), 1);

    const rows = await db.execute(sql`
      SELECT
        u.id,
        u.name,
        u.email,
        pkg.name_ar AS package_name,
        COALESCE(SUM(CASE WHEN ul.created_at >= ${todayStart} THEN ul.units_deducted ELSE 0 END), 0)::int AS today_used,
        COALESCE(SUM(CASE WHEN ul.created_at >= ${monthStart} THEN ul.units_deducted ELSE 0 END), 0)::int AS month_used,
        CASE WHEN pkg.consultations_allowed > 0 AND pkg.consultations_allowed < 9999
          THEN ROUND(
            COALESCE(SUM(CASE WHEN ul.created_at >= ${monthStart} THEN ul.units_deducted ELSE 0 END), 0)::numeric
            / pkg.consultations_allowed * 100, 1
          )
          ELSE NULL
        END AS month_pct
      FROM users u
      JOIN subscriptions sub ON sub.user_id = u.id AND sub.status = 'active'
      JOIN packages pkg ON pkg.id = sub.package_id
      LEFT JOIN usage_log ul ON ul.user_id = u.id
      GROUP BY u.id, u.name, u.email, pkg.name_ar, pkg.consultations_allowed
      ORDER BY month_used DESC
      LIMIT 15
    `);

    res.json({ consumers: (rows as any).rows ?? [] });
  } catch (err: any) {
    res.status(500).json({ error: err?.message });
  }
});

// ── GET /api/quota/usage-log ──────────────────────────────────────────────────
router.get("/quota/usage-log", requireAuth, async (req, res): Promise<void> => {
  try {
    const page  = Math.max(1, Number(req.query.page)  || 1);
    const limit = Math.min(100, Number(req.query.limit) || 20);
    const offset = (page - 1) * limit;
    const userId = req.userId!;

    const [{ total }] = await db
      .select({ total: sql<number>`COUNT(*)::int` })
      .from(usageLogTable)
      .where(eq(usageLogTable.userId, userId));

    const rows = await db
      .select()
      .from(usageLogTable)
      .where(eq(usageLogTable.userId, userId))
      .orderBy(desc(usageLogTable.createdAt))
      .limit(limit)
      .offset(offset);

    res.json({ rows, total, page, pages: Math.ceil(total / limit) });
  } catch (err: any) {
    res.status(500).json({ error: err?.message });
  }
});

// ── GET /api/quota/usage-log/export ──────────────────────────────────────────
router.get("/quota/usage-log/export", requireAuth, async (req, res): Promise<void> => {
  try {
    const userId = req.userId!;
    const rows = await db
      .select()
      .from(usageLogTable)
      .where(eq(usageLogTable.userId, userId))
      .orderBy(desc(usageLogTable.createdAt))
      .limit(5000);

    const SERVICE_LABELS: Record<string, string> = {
      consultation: "استشارة قانونية",
      contract_draft: "صياغة عقد",
      contract_review: "مراجعة عقد",
    };

    const header = "التاريخ,الخدمة,الوحدات المخصومة,الرصيد بعدها,ملاحظة";
    const lines = rows.map(r => [
      new Date(r.createdAt).toLocaleString("ar-SA"),
      SERVICE_LABELS[r.serviceType] ?? r.serviceType,
      r.unitsDeducted,
      r.balanceAfter ?? "تجربة مجانية",
      r.description ?? "",
    ].map(v => `"${String(v).replace(/"/g, '""')}"`).join(","));

    const csv = "\uFEFF" + [header, ...lines].join("\n"); // BOM for Excel
    res.setHeader("Content-Type", "text/csv; charset=utf-8");
    res.setHeader("Content-Disposition", `attachment; filename="usage-log.csv"`);
    res.send(csv);
  } catch (err: any) {
    res.status(500).json({ error: err?.message });
  }
});

export default router;
