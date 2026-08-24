/**
 * Legal Codex Routes
 *
 * Admin routes (require admin auth):
 *   POST  /admin/codex/upload              — upload a codex PDF
 *   POST  /admin/codex/:id/extract         — start case extraction job
 *   GET   /admin/codex/:id/job-status      — poll extraction progress
 *   GET   /admin/codex/list                — list all codices (admin)
 *   DELETE /admin/codex/:id                — delete codex + cases
 *
 * User routes (require auth):
 *   GET   /api/codex/search                — full-text + filter search
 *   GET   /api/codex/cases/:id             — case detail
 *   GET   /api/codex/cases                 — browse all cases
 *   GET   /api/codex/:codexId/pdf          — serve PDF binary for viewer
 *   GET   /api/codex/codices               — list ready codices (for filter)
 *   GET   /api/codex/stats                 — total counts
 */
import { Router } from "express";
import multer from "multer";
import { db } from "@workspace/db";
import { legalCodicesTable, legalCasesTable, knowledgeDocumentsTable, knowledgeChunksTable } from "@workspace/db/schema";
import { eq, ilike, or, sql, desc, and, gte, lte, isNotNull } from "drizzle-orm";
import { requireAdmin, requireAuth } from "../middlewares/auth";
import { extractCasesFromCodex, hashBuffer, getJob } from "../lib/legal-codex-processor.js";
import { scanDocumentQuality } from "../lib/arabic-text-fix.js";

const router = Router();
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 200 * 1024 * 1024 } }); // 200MB
const legalCasesSearchVector = sql.raw("legal_cases.search_vector");

// ═══════════════════════════════════════════════════════════════════════════════
// ADMIN ROUTES
// ═══════════════════════════════════════════════════════════════════════════════

/** Upload a new codex PDF */
router.post("/admin/codex/upload", requireAdmin, upload.single("file"), async (req, res): Promise<void> => {
  const file = req.file;
  if (!file) { res.status(400).json({ error: "الملف مطلوب" }); return; }
  if (file.mimetype !== "application/pdf" && !file.originalname.toLowerCase().endsWith(".pdf")) {
    res.status(400).json({ error: "يُقبل PDF فقط" }); return;
  }

  const { title, publisher, court, year } = req.body as Record<string, string>;
  if (!title?.trim()) { res.status(400).json({ error: "عنوان المدونة مطلوب" }); return; }

  const fileHash = hashBuffer(file.buffer);

  // Dedup check
  const existing = await db
    .select({ id: legalCodicesTable.id, title: legalCodicesTable.title })
    .from(legalCodicesTable)
    .where(eq(legalCodicesTable.fileHash, fileHash))
    .limit(1);

  if (existing.length > 0) {
    res.status(409).json({ error: `هذا الملف مرفوع مسبقاً: ${existing[0].title}`, codexId: existing[0].id }); return;
  }

  const [codex] = await db.insert(legalCodicesTable).values({
    title: title.trim(),
    publisher: publisher?.trim() || null,
    court: court?.trim() || null,
    year: year?.trim() || null,
    fileData: file.buffer,
    fileSize: file.size,
    fileHash,
    status: "pending",
  }).returning();

  res.json({ codexId: codex.id, message: "تم رفع المدونة بنجاح" });
});

/** Start case extraction job (background) */
router.post("/admin/codex/:id/extract", requireAdmin, async (req, res): Promise<void> => {
  const codexId = parseInt(req.params.id as string, 10);
  if (isNaN(codexId)) { res.status(400).json({ error: "معرّف غير صالح" }); return; }

  const job = getJob(codexId);
  if (job?.status === "running") {
    res.json({ message: "الاستخراج جارٍ بالفعل", job }); return;
  }

  // Start extraction in background
  extractCasesFromCodex(codexId).catch(console.error);
  res.json({ message: "بدأ الاستخراج في الخلفية", codexId });
});

/** Poll extraction job progress */
router.get("/admin/codex/:id/job-status", requireAdmin, async (req, res) => {
  const codexId = parseInt(req.params.id as string, 10);
  const job = getJob(codexId);

  const [codex] = await db
    .select({ status: legalCodicesTable.status, totalCases: legalCodicesTable.totalCases, error: legalCodicesTable.errorMessage })
    .from(legalCodicesTable)
    .where(eq(legalCodicesTable.id, codexId));

  res.json({ job: job ?? null, codex: codex ?? null });
});

/** List all codices (admin) */
router.get("/admin/codex/list", requireAdmin, async (req, res) => {
  const list = await db
    .select({
      id:         legalCodicesTable.id,
      title:      legalCodicesTable.title,
      publisher:  legalCodicesTable.publisher,
      court:      legalCodicesTable.court,
      year:       legalCodicesTable.year,
      totalPages: legalCodicesTable.totalPages,
      totalCases: legalCodicesTable.totalCases,
      status:     legalCodicesTable.status,
      fileSize:   legalCodicesTable.fileSize,
      error:      legalCodicesTable.errorMessage,
      createdAt:  legalCodicesTable.createdAt,
    })
    .from(legalCodicesTable)
    .orderBy(desc(legalCodicesTable.createdAt));

  res.json({ codices: list });
});

/** Delete codex (cascades to cases) */
router.delete("/admin/codex/:id", requireAdmin, async (req, res): Promise<void> => {
  const codexId = parseInt(req.params.id as string, 10);
  if (isNaN(codexId)) { res.status(400).json({ error: "معرّف غير صالح" }); return; }
  await db.delete(legalCodicesTable).where(eq(legalCodicesTable.id, codexId));
  res.json({ message: "تم الحذف" });
});

/** Batch quality scan: checks all codices raw text for Arabic reversal issues */
router.get("/admin/codex/quality-scan", requireAdmin, async (req, res): Promise<void> => {
  const codices = await db
    .select({ id: legalCodicesTable.id, title: legalCodicesTable.title, status: legalCodicesTable.status })
    .from(legalCodicesTable);

  const results = await Promise.all(codices.map(async (codex) => {
    const cases = await db
      .select({ rawText: legalCasesTable.rawText })
      .from(legalCasesTable)
      .where(eq(legalCasesTable.codexId, codex.id))
      .limit(3);

    const sampleText = cases.map(c => c.rawText ?? "").join("\n").slice(0, 3000);
    if (sampleText.trim().length < 50) {
      return { codexId: codex.id, title: codex.title, status: codex.status, quality: null };
    }
    const quality = scanDocumentQuality(sampleText);
    return { codexId: codex.id, title: codex.title, status: codex.status, quality };
  }));

  res.json({ results });
});

/** Batch quality scan: checks existing knowledge documents chunks for Arabic reversal */
router.get("/admin/codex/knowledge-quality-scan", requireAdmin, async (req, res): Promise<void> => {
  const docs = await db
    .select({ id: knowledgeDocumentsTable.id, filename: knowledgeDocumentsTable.filename, sourceType: knowledgeDocumentsTable.sourceType })
    .from(knowledgeDocumentsTable)
    .limit(150);

  const results = await Promise.all(docs.map(async (doc) => {
    const chunks = await db
      .select({ content: knowledgeChunksTable.content })
      .from(knowledgeChunksTable)
      .where(eq(knowledgeChunksTable.documentId, doc.id))
      .limit(5);

    const sampleText = chunks.map(c => c.content).join("\n").slice(0, 3000);
    if (sampleText.trim().length < 50) {
      return { docId: doc.id, filename: doc.filename, sourceType: doc.sourceType, quality: null };
    }
    const quality = scanDocumentQuality(sampleText);
    return { docId: doc.id, filename: doc.filename, sourceType: doc.sourceType, quality };
  }));

  const issues = results.filter(r => r.quality?.hasIssue);
  res.json({ total: results.length, issuesFound: issues.length, results });
});

/** Re-extract a single codex from scratch */
router.post("/admin/codex/:id/reextract", requireAdmin, async (req, res): Promise<void> => {
  const codexId = parseInt(req.params.id as string, 10);
  if (isNaN(codexId)) { res.status(400).json({ error: "معرّف غير صالح" }); return; }

  const job = getJob(codexId);
  if (job?.status === "running") { res.json({ message: "الاستخراج جارٍ بالفعل", job }); return; }

  // Reset status to pending so user sees fresh state
  await db.update(legalCodicesTable)
    .set({ status: "pending", errorMessage: null, totalCases: 0, updatedAt: new Date() })
    .where(eq(legalCodicesTable.id, codexId));

  extractCasesFromCodex(codexId).catch(console.error);
  res.json({ message: "بدأ إعادة الاستخراج في الخلفية", codexId });
});

// ═══════════════════════════════════════════════════════════════════════════════
// USER ROUTES
// ═══════════════════════════════════════════════════════════════════════════════

/** Serve the PDF binary for the document viewer */
router.get("/codex/:codexId/pdf", requireAuth, async (req, res): Promise<void> => {
  const codexId = parseInt(req.params.codexId as string, 10);
  if (isNaN(codexId)) { res.status(400).json({ error: "معرّف غير صالح" }); return; }

  const [codex] = await db
    .select({ fileData: legalCodicesTable.fileData, title: legalCodicesTable.title })
    .from(legalCodicesTable)
    .where(eq(legalCodicesTable.id, codexId));

  if (!codex || !codex.fileData) { res.status(404).json({ error: "لم يُوجد الملف" }); return; }

  const buf: Buffer = codex.fileData as unknown as Buffer;
  res.setHeader("Content-Type", "application/pdf");
  res.setHeader("Content-Disposition", `inline; filename="${encodeURIComponent(codex.title)}.pdf"`);
  res.setHeader("Content-Length", buf.length);
  res.setHeader("Cache-Control", "private, max-age=3600");
  res.send(buf);
});

/** Smart semantic search — expands query via GPT then searches */
router.post("/codex/smart-search", requireAuth, async (req, res): Promise<void> => {
  const { q = "", codexId: codexIdStr = "", court = "", stage = "", year = "", city = "", disputeType = "" } = req.body as Record<string, string>;
  if (!q.trim()) { res.json({ cases: [], total: 0, page: 1, pages: 1, expanded: [] }); return; }

  try {
    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) throw new Error("OPENAI_API_KEY missing");
    const { OpenAI } = await import("openai");
    const openai = new OpenAI({ apiKey });

    // Expand query into 4 Arabic search variants
    const expansion = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      temperature: 0.2,
      messages: [
        { role: "system", content: "أنت مساعد بحث قانوني. أعطِ 4 استعلامات بحثية عربية مختلفة تعبر عن المعنى ذاته للموضوع المطروح، بما يشمل المصطلحات القانونية المرادفة والمفاهيم المرتبطة. أجب بمصفوفة JSON فقط مثل: [\"استعلام1\",\"استعلام2\",\"استعلام3\",\"استعلام4\"]" },
        { role: "user", content: q.trim() },
      ],
    });
    let expanded: string[] = [q.trim()];
    try {
      const raw = expansion.choices[0]?.message?.content?.trim() ?? "";
      const parsed = JSON.parse(raw.replace(/^```json\s*/i, "").replace(/```\s*$/, ""));
      if (Array.isArray(parsed)) expanded = [q.trim(), ...parsed.slice(0, 3)];
    } catch { /* keep original */ }

    // Build base conditions
    const buildConditions = (term: string) => {
      const conditions: any[] = [];
      const tsQuery = term.split(/\s+/).filter(Boolean).join(" & ");
      if (tsQuery) {
        conditions.push(or(
          sql`${legalCasesSearchVector} @@ to_tsquery('arabic', ${tsQuery})`,
          ilike(legalCasesTable.disputeSubject, `%${term}%`),
          ilike(legalCasesTable.legalPrinciple, `%${term}%`),
          ilike(legalCasesTable.rawText, `%${term}%`),
          ilike(legalCasesTable.caseNo, `%${term}%`),
        ));
      }
      if (codexIdStr) { const cid = parseInt(codexIdStr); if (!isNaN(cid)) conditions.push(eq(legalCasesTable.codexId, cid)); }
      if (court) conditions.push(ilike(legalCasesTable.court, `%${court}%`));
      if (stage) conditions.push(eq(legalCasesTable.litigationStage, stage));
      if (year) conditions.push(ilike(legalCasesTable.rulingDateHijri, `%${year}%`));
      if (city) conditions.push(ilike(legalCasesTable.court, `%${city}%`));
      if (disputeType) conditions.push(ilike(legalCasesTable.disputeSubject, `%${disputeType}%`));
      return conditions.length > 0 ? and(...conditions) : undefined;
    };

    // Run parallel searches
    const allRows = await Promise.all(expanded.map(term =>
      db.select({
        id: legalCasesTable.id, codexId: legalCasesTable.codexId,
        caseNo: legalCasesTable.caseNo, rulingNo: legalCasesTable.rulingNo,
        rulingDateHijri: legalCasesTable.rulingDateHijri, court: legalCasesTable.court,
        circuit: legalCasesTable.circuit, litigationStage: legalCasesTable.litigationStage,
        disputeSubject: legalCasesTable.disputeSubject, legalPrinciple: legalCasesTable.legalPrinciple,
        pageStartFile: legalCasesTable.pageStartFile, pageStartPrinted: legalCasesTable.pageStartPrinted,
        summaryConfidence: legalCasesTable.summaryConfidence, rulingConfidence: legalCasesTable.rulingConfidence,
        snippet: sql<string>`LEFT(${legalCasesTable.rawText}, 400)`,
      })
      .from(legalCasesTable)
      .where(buildConditions(term))
      .orderBy(sql`ts_rank(${legalCasesSearchVector}, to_tsquery('arabic', ${term.split(/\s+/).filter(Boolean).join(" & ")})) DESC`)
      .limit(20)
    ));

    // Deduplicate by ID, keep first occurrence (highest rank)
    const seen = new Set<number>();
    const merged: any[] = [];
    for (const rows of allRows) {
      for (const row of rows) {
        if (!seen.has(row.id)) { seen.add(row.id); merged.push(row); }
      }
    }

    res.json({ cases: merged.slice(0, 30), total: merged.length, page: 1, pages: 1, expanded });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

/** Case search — full-text + filters */
router.get("/codex/search", requireAuth, async (req, res) => {
  const {
    q = "",
    codexId: codexIdStr = "",
    court = "",
    stage = "",
    year = "",
    city = "",
    disputeType = "",
    article = "",
    page: pageStr = "1",
    limit: limitStr = "20",
  } = req.query as Record<string, string>;

  const pageNum = Math.max(1, parseInt(pageStr) || 1);
  const limitNum = Math.min(50, Math.max(1, parseInt(limitStr) || 20));
  const offset = (pageNum - 1) * limitNum;

  // Build where conditions
  const conditions: any[] = [];

  if (q.trim()) {
    const tsQuery = q.trim().split(/\s+/).join(" & ");
    conditions.push(
      or(
        sql`${legalCasesSearchVector} @@ to_tsquery('arabic', ${tsQuery})`,
        ilike(legalCasesTable.disputeSubject, `%${q}%`),
        ilike(legalCasesTable.legalPrinciple, `%${q}%`),
        ilike(legalCasesTable.caseNo, `%${q}%`),
        ilike(legalCasesTable.rulingNo, `%${q}%`),
        ilike(legalCasesTable.rawText, `%${q}%`),
        sql`${q} = ANY(${legalCasesTable.legalArticles})`
      )
    );
  }

  if (codexIdStr) {
    const cid = parseInt(codexIdStr);
    if (!isNaN(cid)) conditions.push(eq(legalCasesTable.codexId, cid));
  }
  if (court) conditions.push(ilike(legalCasesTable.court, `%${court}%`));
  if (stage) conditions.push(eq(legalCasesTable.litigationStage, stage));
  if (year) conditions.push(ilike(legalCasesTable.rulingDateHijri, `%${year}%`));
  if (city) conditions.push(ilike(legalCasesTable.court, `%${city}%`));
  if (disputeType) conditions.push(ilike(legalCasesTable.disputeSubject, `%${disputeType}%`));
  if (article) conditions.push(sql`${article} = ANY(${legalCasesTable.legalArticles})`);

  const whereClause = conditions.length > 0 ? and(...conditions) : undefined;

  const [{ count }] = await db
    .select({ count: sql<number>`COUNT(*)::int` })
    .from(legalCasesTable)
    .where(whereClause);

  const rows = await db
    .select({
      id:               legalCasesTable.id,
      codexId:          legalCasesTable.codexId,
      caseNo:           legalCasesTable.caseNo,
      rulingNo:         legalCasesTable.rulingNo,
      rulingDateHijri:  legalCasesTable.rulingDateHijri,
      court:            legalCasesTable.court,
      circuit:          legalCasesTable.circuit,
      litigationStage:  legalCasesTable.litigationStage,
      disputeSubject:   legalCasesTable.disputeSubject,
      legalPrinciple:   legalCasesTable.legalPrinciple,
      pageStartFile:    legalCasesTable.pageStartFile,
      pageStartPrinted: legalCasesTable.pageStartPrinted,
      summaryConfidence:  legalCasesTable.summaryConfidence,
      rulingConfidence:   legalCasesTable.rulingConfidence,
      // Snippet from rawText (first 400 chars if search matched there)
      snippet: q.trim()
        ? sql<string>`LEFT(${legalCasesTable.rawText}, 400)`
        : sql<string>`NULL::text`,
    })
    .from(legalCasesTable)
    .where(whereClause)
    .orderBy(
      q.trim()
        ? sql`ts_rank(${legalCasesSearchVector}, to_tsquery('arabic', ${q.trim().split(/\s+/).join(" & ")})) DESC`
        : desc(legalCasesTable.createdAt)
    )
    .limit(limitNum)
    .offset(offset);

  res.json({
    cases: rows,
    total: count,
    page: pageNum,
    pages: Math.ceil(count / limitNum),
  });
});

/** Case detail (full data) */
router.get("/codex/cases/:id", requireAuth, async (req, res): Promise<void> => {
  const caseId = parseInt(req.params.id as string, 10);
  if (isNaN(caseId)) { res.status(400).json({ error: "معرّف غير صالح" }); return; }

  const [row] = await db
    .select({
      case: legalCasesTable,
      codexTitle: legalCodicesTable.title,
      codexPublisher: legalCodicesTable.publisher,
      codexTotalPages: legalCodicesTable.totalPages,
    })
    .from(legalCasesTable)
    .leftJoin(legalCodicesTable, eq(legalCasesTable.codexId, legalCodicesTable.id))
    .where(eq(legalCasesTable.id, caseId));

  if (!row) { res.status(404).json({ error: "لم تُوجد القضية" }); return; }

  // Don't send the heavy rawText to the client
  const { rawText: _, ...caseData } = row.case;

  res.json({
    case: caseData,
    codex: {
      title: row.codexTitle,
      publisher: row.codexPublisher,
      totalPages: row.codexTotalPages,
    },
  });
});

/** Browse all cases (paginated) */
router.get("/codex/cases", requireAuth, async (req, res) => {
  const { page: p = "1", limit: l = "20", codexId: cid = "" } = req.query as Record<string, string>;
  const pageNum = Math.max(1, parseInt(p) || 1);
  const limitNum = Math.min(50, parseInt(l) || 20);
  const offset = (pageNum - 1) * limitNum;

  const where = cid ? eq(legalCasesTable.codexId, parseInt(cid)) : undefined;

  const [{ count }] = await db
    .select({ count: sql<number>`COUNT(*)::int` })
    .from(legalCasesTable)
    .where(where);

  const rows = await db
    .select({
      id:              legalCasesTable.id,
      codexId:         legalCasesTable.codexId,
      caseNo:          legalCasesTable.caseNo,
      rulingNo:        legalCasesTable.rulingNo,
      rulingDateHijri: legalCasesTable.rulingDateHijri,
      court:           legalCasesTable.court,
      circuit:         legalCasesTable.circuit,
      litigationStage: legalCasesTable.litigationStage,
      disputeSubject:  legalCasesTable.disputeSubject,
      legalPrinciple:  legalCasesTable.legalPrinciple,
      pageStartFile:   legalCasesTable.pageStartFile,
      pageStartPrinted:legalCasesTable.pageStartPrinted,
      summaryConfidence: legalCasesTable.summaryConfidence,
    })
    .from(legalCasesTable)
    .where(where)
    .orderBy(desc(legalCasesTable.createdAt))
    .limit(limitNum)
    .offset(offset);

  res.json({ cases: rows, total: count, page: pageNum, pages: Math.ceil(count / limitNum) });
});

/** List ready codices (for filter dropdown) */
router.get("/codex/codices", requireAuth, async (req, res) => {
  const list = await db
    .select({
      id:        legalCodicesTable.id,
      title:     legalCodicesTable.title,
      court:     legalCodicesTable.court,
      publisher: legalCodicesTable.publisher,
      totalCases: legalCodicesTable.totalCases,
    })
    .from(legalCodicesTable)
    .where(eq(legalCodicesTable.status, "ready"))
    .orderBy(legalCodicesTable.title);

  res.json({ codices: list });
});

/** Stats */
router.get("/codex/stats", async (_req, res) => {
  const [{ codices, cases }] = await db
    .select({
      codices: sql<number>`(SELECT COUNT(*) FROM legal_codices WHERE status='ready')::int`,
      cases:   sql<number>`(SELECT COUNT(*) FROM legal_cases)::int`,
    })
    .from(legalCodicesTable)
    .limit(1)
    .catch(() => [{ codices: 0, cases: 0 }]);

  res.json({ codices: codices ?? 0, cases: cases ?? 0 });
});

export default router;
