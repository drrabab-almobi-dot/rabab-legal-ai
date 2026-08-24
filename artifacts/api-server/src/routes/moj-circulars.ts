/**
 * MOJ Circulars Routes
 * Admin: fetch, status, image upload, status update, relate
 * User:  list (free), detail, image serve
 */

import { Router, type IRouter } from "express";
import { charterSystemMsg } from "../lib/legal-charter.js";
import multer from "multer";
import { db, mojCircularsTable } from "@workspace/db";
import { eq, desc, and, or, ilike, sql } from "drizzle-orm";
import { requireAdmin, requireAuth } from "../middlewares/auth";
import {
  startMojFetch,
  stopMojFetch,
  fetchJob,
  getMojFetchState,
} from "../lib/moj-circular-fetcher";

const router: IRouter = Router();
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 10 * 1024 * 1024 } });

// ── Admin: trigger fetch ──────────────────────────────────────────────────────
router.post("/admin/moj-circulars/fetch", requireAdmin, (req, res): void => {
  if (fetchJob?.running) {
    res.status(409).json({ error: "جلب جارٍ بالفعل — انتظري حتى ينتهي أو أوقفيه أولاً" });
    return;
  }
  try {
    startMojFetch(req.log);
    res.json({ success: true, message: "بدأ جلب التعاميم من منصة وزارة العدل..." });
  } catch (err: any) {
    res.status(500).json({ error: err?.message ?? "فشل بدء الجلب" });
  }
});

// ── Admin: stop fetch ────────────────────────────────────────────────────────
router.post("/admin/moj-circulars/fetch/stop", requireAdmin, (_req, res): void => {
  stopMojFetch();
  res.json({ success: true });
});

// ── Admin: fetch status ──────────────────────────────────────────────────────
router.get("/admin/moj-circulars/status", requireAdmin, async (_req, res): Promise<void> => {
  const state = getMojFetchState();
  const [countRow] = await db
    .select({ count: sql<number>`COUNT(*)::int` })
    .from(mojCircularsTable);

  res.json({
    job: fetchJob
      ? {
          running: fetchJob.running,
          fetched: fetchJob.fetched,
          inserted: fetchJob.inserted,
          updated: fetchJob.updated,
          failed: fetchJob.failed,
          log: fetchJob.log.slice(-30),
          startedAt: fetchJob.startedAt,
          finishedAt: fetchJob.finishedAt ?? null,
        }
      : null,
    totalInDb: countRow?.count ?? 0,
    lastFetchedAt: state.lastFetchedAt,
    totalFetched: state.totalFetched,
  });
});

// ── Admin: upload original image for a circular ───────────────────────────────
router.post(
  "/admin/moj-circulars/:tameemId/upload-image",
  requireAdmin,
  upload.single("image"),
  async (req, res): Promise<void> => {
    const tameemId = parseInt(req.params.tameemId as string, 10);
    if (isNaN(tameemId)) { res.status(400).json({ error: "معرّف غير صالح" }); return; }
    if (!req.file) { res.status(400).json({ error: "لم يُرفع أي ملف" }); return; }

    await db
      .update(mojCircularsTable)
      .set({
        originalImageData: req.file.buffer,
        originalImageMime: req.file.mimetype,
        updatedAt: new Date(),
      })
      .where(eq(mojCircularsTable.tameemId, tameemId));

    res.json({ success: true, size: req.file.size, mime: req.file.mimetype });
  },
);

// ── Admin: delete uploaded image ──────────────────────────────────────────────
router.delete("/admin/moj-circulars/:tameemId/image", requireAdmin, async (req, res): Promise<void> => {
  const tameemId = parseInt(req.params.tameemId as string, 10);
  if (isNaN(tameemId)) { res.status(400).json({ error: "معرّف غير صالح" }); return; }

  await db
    .update(mojCircularsTable)
    .set({ originalImageData: null as any, originalImageMime: null, updatedAt: new Date() })
    .where(eq(mojCircularsTable.tameemId, tameemId));

  res.json({ success: true });
});

// ── Admin: update status ──────────────────────────────────────────────────────
router.put("/admin/moj-circulars/:tameemId/status", requireAdmin, async (req, res): Promise<void> => {
  const tameemId = parseInt(req.params.tameemId as string, 10);
  if (isNaN(tameemId)) { res.status(400).json({ error: "معرّف غير صالح" }); return; }

  const { status } = req.body as { status?: string };
  const valid = ["نافذ", "معدل", "ملغى", "غير محدد"];
  if (!status || !valid.includes(status)) {
    res.status(400).json({ error: `الحالة يجب أن تكون إحدى: ${valid.join(" / ")}` });
    return;
  }

  await db
    .update(mojCircularsTable)
    .set({ status, updatedAt: new Date() })
    .where(eq(mojCircularsTable.tameemId, tameemId));

  res.json({ success: true });
});

// ── Admin: set related circulars ──────────────────────────────────────────────
router.put("/admin/moj-circulars/:tameemId/relate", requireAdmin, async (req, res): Promise<void> => {
  const tameemId = parseInt(req.params.tameemId as string, 10);
  if (isNaN(tameemId)) { res.status(400).json({ error: "معرّف غير صالح" }); return; }

  const { relatedTameemIds } = req.body as { relatedTameemIds?: number[] };
  if (!Array.isArray(relatedTameemIds)) {
    res.status(400).json({ error: "relatedTameemIds يجب أن يكون مصفوفة" });
    return;
  }

  await db
    .update(mojCircularsTable)
    .set({ relatedTameemIds, updatedAt: new Date() })
    .where(eq(mojCircularsTable.tameemId, tameemId));

  res.json({ success: true });
});

// ── User: list circulars (free — no subscription needed) ──────────────────────
router.get("/knowledge/moj-circulars", requireAuth, async (req, res): Promise<void> => {
  const { q, year, status: statusFilter, page: pageStr, limit: limitStr } = req.query as Record<string, string>;

  const page = Math.max(1, parseInt(pageStr || "1", 10));
  const limit = Math.min(100, Math.max(1, parseInt(limitStr || "50", 10)));
  const offset = (page - 1) * limit;

  // Build where conditions
  const conditions: any[] = [];
  if (q && q.trim()) {
    const pattern = `%${q.trim()}%`;
    conditions.push(
      or(
        ilike(mojCircularsTable.subject, pattern),
        ilike(mojCircularsTable.bodyText, pattern),
        ilike(mojCircularsTable.tameemNo, pattern),
      ),
    );
  }
  if (year && year.trim()) {
    conditions.push(eq(mojCircularsTable.hdateYear, year.trim()));
  }
  if (statusFilter && statusFilter !== "الكل") {
    conditions.push(eq(mojCircularsTable.status, statusFilter));
  }

  const where = conditions.length > 0 ? and(...conditions) : undefined;

  // Count total
  const [countRow] = await db
    .select({ count: sql<number>`COUNT(*)::int` })
    .from(mojCircularsTable)
    .where(where);

  const total = countRow?.count ?? 0;

  // Fetch page
  const rows = await db
    .select({
      id: mojCircularsTable.id,
      tameemId: mojCircularsTable.tameemId,
      tameemNo: mojCircularsTable.tameemNo,
      hdate: mojCircularsTable.hdate,
      hdateYear: mojCircularsTable.hdateYear,
      subject: mojCircularsTable.subject,
      bodyText: mojCircularsTable.bodyText,
      status: mojCircularsTable.status,
      sourceUrl: mojCircularsTable.sourceUrl,
      hasImage: sql<boolean>`(original_image_data IS NOT NULL)`,
      createdAt: mojCircularsTable.createdAt,
    })
    .from(mojCircularsTable)
    .where(where)
    .orderBy(desc(mojCircularsTable.tameemId))
    .limit(limit)
    .offset(offset);

  // Truncate bodyText preview
  const circulars = rows.map(r => ({
    ...r,
    bodyText: r.bodyText.slice(0, 300) + (r.bodyText.length > 300 ? "..." : ""),
  }));

  res.json({
    circulars,
    total,
    page,
    pages: Math.ceil(total / limit),
  });
});

// ── Unified template prompt for structured circular summary ──────────────────
const CIRCULAR_TEMPLATE_SYSTEM_PROMPT = `أنت باحث قانوني متخصص في الوثائق الرسمية السعودية.
مهمتك استخراج وهيكلة بيانات هذه الوثيقة وفق القالب المحدد.

قواعد صارمة غير قابلة للاستثناء:
١. لا تستخرج إلا ما هو وارد صراحةً في النص — لا تخمّن ولا تكمل ولا تستنتج.
٢. كل رقم أو تاريخ يُكتب حرفياً كما ورد. غير الموثق يُترك null.
٣. التواريخ الهجرية تُذكر كما وردت؛ الميلادية تُضاف بين قوسين إن وُجدت في النص.
٤. opening_para تُصاغ: "صدر [نوع] رقم [رقم] وتاريخ [تاريخ]هـ، بناءً على [السند]، لتقرير [الغرض]." — إذا عُدم السند أو الغرض في النص فاحذفه من الجملة فحسب.
٥. highlights: فقط ما ورد في النص: الحكم أو الإجراء المقرر | نطاق التطبيق | الفئات المشمولة | تاريخ السريان | الاستثناءات — لكل عنوان قصير بارز ثم شرحه. إذا لم تجد عنصراً فلا تُضمّنه.
٦. objectives: تُستخرج فقط إذا ذُكرت صراحةً. إلا فـ null.

أعد النتيجة حصراً بصيغة JSON:
{
  "title": "عنوان قصير وصفي يصف موضوع الوثيقة",
  "type": "تعميم قضائي | قرار وزاري | أمر سامٍ | مبدأ قضائي | لائحة | غير محدد",
  "number": "الرقم حرفياً من النص أو null",
  "date_hijri": "التاريخ الهجري كما ورد أو null",
  "date_gregorian": "التاريخ الميلادي بين قوسين أو null",
  "issuer": "الجهة المصدرة",
  "basis": "السند الذي صدر بناءً عليه أو null",
  "purpose": "الغرض الصريح أو null",
  "opening_para": "الفقرة الافتتاحية الجاهزة (جملة واحدة) أو null",
  "highlights": [{"title": "عنوان النقطة", "detail": "شرحها من النص"}],
  "objectives": ["..."] ,
  "status": "نافذ | معدل | ملغى | غير محدد",
  "addressees": "الجهات المخاطبة أو null",
  "relation_note": "علاقته بتعاميم أخرى إن ذُكر أو null"
}`;

// ── User: circular detail ────────────────────────────────────────────────────
router.get("/knowledge/moj-circulars/:tameemId", requireAuth, async (req, res): Promise<void> => {
  const tameemId = parseInt(req.params.tameemId as string, 10);
  if (isNaN(tameemId)) { res.status(400).json({ error: "معرّف غير صالح" }); return; }

  const [row] = await db
    .select({
      id: mojCircularsTable.id,
      tameemId: mojCircularsTable.tameemId,
      tameemNo: mojCircularsTable.tameemNo,
      hdate: mojCircularsTable.hdate,
      hdateYear: mojCircularsTable.hdateYear,
      subject: mojCircularsTable.subject,
      bodyText: mojCircularsTable.bodyText,
      status: mojCircularsTable.status,
      sourceUrl: mojCircularsTable.sourceUrl,
      relatedTameemIds: mojCircularsTable.relatedTameemIds,
      hasImage: sql<boolean>`(original_image_data IS NOT NULL)`,
      originalImageMime: mojCircularsTable.originalImageMime,
      structuredSummary: mojCircularsTable.structuredSummary,
      createdAt: mojCircularsTable.createdAt,
      updatedAt: mojCircularsTable.updatedAt,
      fetchedAt: mojCircularsTable.fetchedAt,
    })
    .from(mojCircularsTable)
    .where(eq(mojCircularsTable.tameemId, tameemId));

  if (!row) { res.status(404).json({ error: "التعميم غير موجود" }); return; }

  // ── Return cached structured summary if available ─────────────────────────
  if (row.structuredSummary && Object.keys(row.structuredSummary).length > 0) {
    res.json({ circular: row });
    return;
  }

  // ── Generate structured summary with GPT if body text exists ─────────────
  if (row.bodyText && row.bodyText.trim().length > 50) {
    try {
      const apiKey = process.env.OPENAI_API_KEY?.trim();
      if (!apiKey) throw new Error("OPENAI_API_KEY is not configured");
      const OpenAI = (await import("openai")).default;
      const openai = new OpenAI({ apiKey });

      const textSample = row.bodyText.slice(0, 6000);
      const resp = await openai.chat.completions.create({
        model: "gpt-4o-mini",
        temperature: 0.1,
        response_format: { type: "json_object" },
        messages: [
          charterSystemMsg(),
          { role: "system", content: CIRCULAR_TEMPLATE_SYSTEM_PROMPT },
          { role: "user", content: `نص التعميم:\n${textSample}` },
        ],
      });

      const raw = resp.choices[0]?.message?.content ?? "{}";
      let generated: Record<string, any>;
      try { generated = JSON.parse(raw); } catch { generated = {}; }

      // Fill in from known fields if GPT left them null
      if (!generated.number) generated.number = row.tameemNo || null;
      if (!generated.date_hijri) generated.date_hijri = row.hdate || null;
      if (!generated.issuer) generated.issuer = "وزارة العدل";
      if (!generated.status) generated.status = row.status;

      // Persist so subsequent opens are instant
      await db
        .update(mojCircularsTable)
        .set({ structuredSummary: generated, updatedAt: new Date() })
        .where(eq(mojCircularsTable.tameemId, tameemId));

      res.json({ circular: { ...row, structuredSummary: generated } });
      return;
    } catch {
      // Fall through — return row without structured summary
    }
  }

  res.json({ circular: row });
});

// ── User/Admin: serve original image ─────────────────────────────────────────
router.get("/knowledge/moj-circulars/:tameemId/image", requireAuth, async (req, res): Promise<void> => {
  const tameemId = parseInt(req.params.tameemId as string, 10);
  if (isNaN(tameemId)) { res.status(400).json({ error: "معرّف غير صالح" }); return; }

  const [row] = await db
    .select({
      originalImageData: mojCircularsTable.originalImageData,
      originalImageMime: mojCircularsTable.originalImageMime,
    })
    .from(mojCircularsTable)
    .where(eq(mojCircularsTable.tameemId, tameemId));

  if (!row?.originalImageData) { res.status(404).json({ error: "لا توجد صورة أصلية لهذا التعميم" }); return; }

  res.set("Content-Type", row.originalImageMime ?? "image/jpeg");
  res.set("Cache-Control", "public, max-age=86400");
  res.send(row.originalImageData);
});

// ── User: available years (for filter dropdown) ──────────────────────────────
router.get("/knowledge/moj-circulars-years", requireAuth, async (_req, res): Promise<void> => {
  const rows = await db
    .selectDistinct({ hdateYear: mojCircularsTable.hdateYear })
    .from(mojCircularsTable)
    .orderBy(desc(mojCircularsTable.hdateYear));

  res.json({ years: rows.map(r => r.hdateYear).filter(Boolean) });
});

export default router;
