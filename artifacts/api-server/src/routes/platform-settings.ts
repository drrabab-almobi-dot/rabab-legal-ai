/**
 * Platform Settings API
 * (This router is mounted under /api by ../routes/index.ts — paths below
 * must NOT repeat the /api prefix, or Express will register them at
 * /api/api/... instead of /api/...)
 * GET  /api/platform-settings          — public read (frontend)
 * GET  /api/admin/platform-settings    — admin read with quality stats
 * PUT  /api/admin/platform-settings    — admin write
 * GET  /api/admin/section-quality      — per-category quality metrics
 */
import { Router, type IRouter } from "express";
import { db, platformSettingsTable } from "@workspace/db";
import { eq, sql } from "drizzle-orm";
import { requireAdmin } from "../middlewares/auth";
import type { SectionVisibilitySettings } from "@workspace/db";
import { DEFAULT_SECTION_VISIBILITY } from "@workspace/db";

const router: IRouter = Router();

// ── In-memory cache (5 min TTL) ───────────────────────────────────────────────
let _cache: SectionVisibilitySettings | null = null;
let _cacheTs = 0;
const CACHE_TTL_MS = 5 * 60 * 1000;

export async function getSectionVisibility(): Promise<SectionVisibilitySettings> {
  const now = Date.now();
  if (_cache && now - _cacheTs < CACHE_TTL_MS) return _cache;

  const rows = await db
    .select()
    .from(platformSettingsTable)
    .where(eq(platformSettingsTable.key, "section_visibility"));

  const val = rows[0]?.value as SectionVisibilitySettings | undefined;
  _cache = val ?? DEFAULT_SECTION_VISIBILITY;
  _cacheTs = now;
  return _cache;
}

function invalidateCache() {
  _cache = null;
  _cacheTs = 0;
}

// ── Public: frontend reads visibility flags ────────────────────────────────────
router.get("/platform-settings", async (_req, res): Promise<void> => {
  try {
    const settings = await getSectionVisibility();
    res.json({ sectionVisibility: settings });
  } catch {
    res.json({ sectionVisibility: DEFAULT_SECTION_VISIBILITY });
  }
});

// ── Admin: read ───────────────────────────────────────────────────────────────
router.get("/admin/platform-settings", requireAdmin, async (_req, res): Promise<void> => {
  const settings = await getSectionVisibility();
  res.json({ sectionVisibility: settings });
});

// ── Admin: write ──────────────────────────────────────────────────────────────
router.put("/admin/platform-settings", requireAdmin, async (req, res): Promise<void> => {
  const body = req.body?.sectionVisibility;
  if (!body || typeof body !== "object") {
    res.status(400).json({ error: "البيانات غير صالحة" });
    return;
  }

  // Merge with defaults to avoid partial overwrites
  const current = await getSectionVisibility();
  const merged: SectionVisibilitySettings = {
    ...current,
    ...body,
    qualityThresholds: { ...current.qualityThresholds, ...(body.qualityThresholds ?? {}) },
  };

  await db
    .insert(platformSettingsTable)
    .values({ key: "section_visibility", value: merged as any, updatedAt: new Date() })
    .onConflictDoUpdate({
      target: platformSettingsTable.key,
      set: { value: merged as any, updatedAt: new Date() },
    });

  invalidateCache();
  res.json({ success: true, sectionVisibility: merged });
});

// ── Admin: per-category quality metrics ──────────────────────────────────────
router.get("/admin/section-quality", requireAdmin, async (_req, res): Promise<void> => {
  try {
    // For each category count total chunks and "blocked" chunks (very short or empty content)
    const rows = await db.execute(sql`
      SELECT
        kd.category,
        COUNT(kc.id)::int AS total_chunks,
        COUNT(kd.id)::int AS total_docs,
        SUM(CASE
          WHEN LENGTH(TRIM(kc.content)) < 80
            OR kc.content ~ '[^\u0600-\u06FF\u0020-\u007E].*[^\u0600-\u06FF\u0020-\u007E]'
            AND LENGTH(TRIM(kc.content)) < 150
          THEN 1 ELSE 0 END
        )::int AS blocked_chunks
      FROM knowledge_documents kd
      LEFT JOIN knowledge_chunks kc ON kc.document_id = kd.id
      WHERE kd.status = 'indexed' AND kd.archived_at IS NULL
      GROUP BY kd.category
    `);

    const result: Record<string, { totalDocs: number; totalChunks: number; blockedChunks: number; healthPct: number }> = {};
    for (const r of rows.rows as any[]) {
      const total = Number(r.total_chunks) || 0;
      const blocked = Number(r.blocked_chunks) || 0;
      const clean = Math.max(0, total - blocked);
      result[r.category] = {
        totalDocs: Number(r.total_docs),
        totalChunks: total,
        blockedChunks: blocked,
        healthPct: total > 0 ? Math.round((clean / total) * 100) : 0,
      };
    }

    res.json({ categories: result });
  } catch (err: any) {
    res.status(500).json({ error: err?.message ?? "خطأ في جلب البيانات" });
  }
});

// ── Source status overview ─────────────────────────────────────────────────────
router.get("/admin/source-status", requireAdmin, async (_req, res): Promise<void> => {
  try {
    // Stats per source_type
    const sourceStats = await db.execute(sql`
      SELECT
        kd.source_type,
        COUNT(DISTINCT kd.id)::int AS total_docs,
        COUNT(kc.id)::int AS total_chunks,
        SUM(CASE WHEN LENGTH(TRIM(COALESCE(kc.content,''))) < 80 THEN 1 ELSE 0 END)::int AS low_quality_chunks,
        MAX(kd.updated_at) AS last_updated
      FROM knowledge_documents kd
      LEFT JOIN knowledge_chunks kc ON kc.document_id = kd.id
      WHERE kd.archived_at IS NULL
      GROUP BY kd.source_type
    `);

    const sources: Record<string, any> = {
      legacy_import: {
        label: 'أرشيفات مستوردة سابقاً', icon: '🗃️',
        description: 'وثائق تاريخية محفوظة من تكاملات أُوقفت؛ لا توجد مزامنة نشطة',
        enabled: true, canToggle: false,
        qualityThreshold: 70,
        docs: 0, chunks: 0, lowQualityChunks: 0, qualityPct: 0, lastSyncAt: null,
      },
      official: {
        label: 'بوابة الأنظمة السعودية', icon: '🏛️',
        description: 'هيئة الخبراء بمجلس الوزراء — المصدر الرسمي المعتمد',
        enabled: true, canToggle: false,
        qualityThreshold: 0,
        docs: 0, chunks: 0, lowQualityChunks: 0, qualityPct: 100, lastSyncAt: null,
      },
      lawyer_upload: {
        label: 'رفع المحامي', icon: '📤',
        description: 'مستندات رفعها المحامي يدوياً داخل حسابه',
        enabled: true, canToggle: false,
        qualityThreshold: 0,
        docs: 0, chunks: 0, lowQualityChunks: 0, qualityPct: 100, lastSyncAt: null,
      },
      unknown: {
        label: 'مصدر غير محدد', icon: '❓',
        description: 'مستندات قديمة لم يُحدَّد مصدرها بعد',
        enabled: true, canToggle: false,
        qualityThreshold: 0,
        docs: 0, chunks: 0, lowQualityChunks: 0, qualityPct: 0, lastSyncAt: null,
      },
    };

    for (const row of (sourceStats.rows as any[])) {
      const key = row.source_type === 'telegram' ? 'legacy_import' : (row.source_type ?? 'unknown');
      if (sources[key]) {
        const total = Number(row.total_chunks) || 0;
        const low = Number(row.low_quality_chunks) || 0;
        sources[key].docs = Number(row.total_docs) || 0;
        sources[key].chunks = total;
        sources[key].lowQualityChunks = low;
        sources[key].qualityPct = total > 0 ? Math.round(((total - low) / total) * 100) : 100;
        sources[key].lastSyncAt = row.last_updated ?? null;
      }
    }

    res.json({ sources });
  } catch (err: any) {
    res.status(500).json({ error: err?.message ?? "خطأ في جلب البيانات" });
  }
});

export default router;
