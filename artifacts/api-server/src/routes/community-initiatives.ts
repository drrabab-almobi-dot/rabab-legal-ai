/**
 * Community Initiatives — public GET + admin CRUD
 * Table: community_initiatives (id, title, description, icon, url, utm_source, utm_medium, utm_campaign, display_order, is_active)
 */
import { Router } from "express";
import { db } from "@workspace/db";
import { sql, asc, eq } from "drizzle-orm";
import { requireAdmin, requireAuth } from "../middlewares/auth";

const router = Router();

// ── Drizzle table shim (raw SQL since no schema file yet) ──────────────────────
const TBL = sql.raw("community_initiatives");

function mapRow(row: any) {
  return {
    id: row.id,
    title: row.title,
    description: row.description,
    icon: row.icon,
    url: row.url + buildUtm(row),
    rawUrl: row.url,
    utmSource: row.utm_source,
    utmMedium: row.utm_medium,
    utmCampaign: row.utm_campaign,
    displayOrder: row.display_order,
    isActive: row.is_active,
    createdAt: row.created_at,
  };
}

function buildUtm(row: any) {
  const url = row.url as string;
  if (!url || url === "#") return "";
  try {
    const u = new URL(url);
    if (row.utm_source) u.searchParams.set("utm_source", row.utm_source);
    if (row.utm_medium) u.searchParams.set("utm_medium", row.utm_medium);
    if (row.utm_campaign) u.searchParams.set("utm_campaign", row.utm_campaign);
    return u.toString().replace(url, "").replace(/^\?/, "?"); // return just params
  } catch {
    return "";
  }
}

// ── Public: list active initiatives ──────────────────────────────────────────
router.get("/initiatives", async (_req, res) => {
  const rows = await db.execute(
    sql`SELECT * FROM community_initiatives WHERE is_active = true ORDER BY display_order ASC, id ASC`
  );
  res.json({ initiatives: rows.rows.map(mapRow) });
});

// ── Admin: list all (including inactive) ─────────────────────────────────────
router.get("/admin/initiatives", requireAdmin, async (_req, res) => {
  const rows = await db.execute(
    sql`SELECT * FROM community_initiatives ORDER BY display_order ASC, id ASC`
  );
  res.json({ initiatives: rows.rows.map(mapRow) });
});

// ── Admin: create ─────────────────────────────────────────────────────────────
router.post("/admin/initiatives", requireAdmin, async (req, res): Promise<void> => {
  const { title, description = "", icon = "🌐", url, utmCampaign = "", displayOrder = 0, isActive = true } = req.body;
  if (!title || !url) { res.status(400).json({ error: "العنوان والرابط مطلوبان" }); return; }

  const result = await db.execute(sql`
    INSERT INTO community_initiatives (title, description, icon, url, utm_source, utm_medium, utm_campaign, display_order, is_active)
    VALUES (${title}, ${description}, ${icon}, ${url}, 'rabablegal', 'website', ${utmCampaign}, ${displayOrder}, ${isActive})
    RETURNING *
  `);
  res.json({ initiative: mapRow(result.rows[0]) });
});

// ── Admin: update ─────────────────────────────────────────────────────────────
router.patch("/admin/initiatives/:id", requireAdmin, async (req, res): Promise<void> => {
  const id = parseInt(req.params.id as string, 10);
  if (isNaN(id)) { res.status(400).json({ error: "معرّف غير صالح" }); return; }

  const { title, description, icon, url, utmCampaign, displayOrder, isActive } = req.body;
  const result = await db.execute(sql`
    UPDATE community_initiatives SET
      title = COALESCE(${title}, title),
      description = COALESCE(${description}, description),
      icon = COALESCE(${icon}, icon),
      url = COALESCE(${url}, url),
      utm_campaign = COALESCE(${utmCampaign}, utm_campaign),
      display_order = COALESCE(${displayOrder}, display_order),
      is_active = COALESCE(${isActive}, is_active),
      updated_at = NOW()
    WHERE id = ${id}
    RETURNING *
  `);
  if (!result.rows.length) { res.status(404).json({ error: "مبادرة غير موجودة" }); return; }
  res.json({ initiative: mapRow(result.rows[0]) });
});

// ── Admin: delete ─────────────────────────────────────────────────────────────
router.delete("/admin/initiatives/:id", requireAdmin, async (req, res): Promise<void> => {
  const id = parseInt(req.params.id as string, 10);
  if (isNaN(id)) { res.status(400).json({ error: "معرّف غير صالح" }); return; }
  await db.execute(sql`DELETE FROM community_initiatives WHERE id = ${id}`);
  res.json({ ok: true });
});

// ── Admin: reorder ────────────────────────────────────────────────────────────
router.post("/admin/initiatives/reorder", requireAdmin, async (req, res): Promise<void> => {
  const { order } = req.body as { order: number[] };
  if (!Array.isArray(order)) { res.status(400).json({ error: "order must be array of IDs" }); return; }
  await Promise.all(order.map((id, idx) =>
    db.execute(sql`UPDATE community_initiatives SET display_order = ${idx + 1} WHERE id = ${id}`)
  ));
  res.json({ ok: true });
});

export default router;
