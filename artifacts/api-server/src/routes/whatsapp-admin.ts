/**
 * WhatsApp Admin Routes
 *
 * GET  /api/admin/whatsapp/settings  — عرض الإعدادات الحالية
 * PATCH /api/admin/whatsapp/settings — تفعيل/تعطيل الإرسال
 * GET  /api/admin/whatsapp/log       — عرض سجل الرسائل (مع pagination)
 */
import { Router, type IRouter } from "express";
import { db, platformSettingsTable, whatsappLogTable } from "@workspace/db";
import { eq, desc } from "drizzle-orm";
import { requireAdmin } from "../middlewares/auth";
import { sql } from "drizzle-orm";

const router: IRouter = Router();

// ── GET /api/admin/whatsapp/settings ─────────────────────────────────────────
router.get("/admin/whatsapp/settings", requireAdmin, async (_req, res): Promise<void> => {
  try {
    const [row] = await db
      .select({ value: platformSettingsTable.value })
      .from(platformSettingsTable)
      .where(eq(platformSettingsTable.key, "whatsapp_config"));
    res.json(row?.value ?? { enabled: false });
  } catch (err: any) {
    res.status(500).json({ error: err?.message });
  }
});

// ── PATCH /api/admin/whatsapp/settings ────────────────────────────────────────
router.patch("/admin/whatsapp/settings", requireAdmin, async (req, res): Promise<void> => {
  try {
    const { enabled } = req.body ?? {};
    if (typeof enabled !== "boolean") {
      res.status(400).json({ error: "enabled يجب أن يكون boolean" });
      return;
    }

    const [existing] = await db
      .select({ value: platformSettingsTable.value })
      .from(platformSettingsTable)
      .where(eq(platformSettingsTable.key, "whatsapp_config"));

    const current = (existing?.value as any) ?? {};
    const updated = { ...current, enabled };

    await db
      .insert(platformSettingsTable)
      .values({ key: "whatsapp_config", value: updated })
      .onConflictDoUpdate({
        target: platformSettingsTable.key,
        set: { value: updated, updatedAt: new Date() },
      });

    res.json({ ok: true, config: updated });
  } catch (err: any) {
    res.status(500).json({ error: err?.message });
  }
});

// ── GET /api/admin/whatsapp/log ───────────────────────────────────────────────
router.get("/admin/whatsapp/log", requireAdmin, async (req, res): Promise<void> => {
  try {
    const page  = Math.max(1, Number(req.query.page) || 1);
    const limit = Math.min(100, Number(req.query.limit) || 50);
    const offset = (page - 1) * limit;

    const [{ total }] = await db
      .select({ total: sql<number>`COUNT(*)::int` })
      .from(whatsappLogTable);

    const rows = await db
      .select()
      .from(whatsappLogTable)
      .orderBy(desc(whatsappLogTable.createdAt))
      .limit(limit)
      .offset(offset);

    res.json({ rows, total, page, pages: Math.ceil(total / limit) });
  } catch (err: any) {
    res.status(500).json({ error: err?.message });
  }
});

export default router;
