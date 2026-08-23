import {
 Router, type IRouter 
}
 from "express"
;

import {
 sanitizeOutput, PROHIBITION_RULE 
}
 from "../lib/content-filter.js"
;
import { charterSystemMsg } from "../lib/legal-charter.js";

import {
  emitResearchPhase, subscribeResearchPhase, getCurrentResearchPhase,
} from "../lib/chat-status.js";

import multer from "multer"
;

import AdmZip from "adm-zip"
;

import {
 db, knowledgeDocumentsTable, knowledgeChunksTable, draftContractsTable, notificationsTable, userNotificationsTable 
}
 from "@workspace/db"
;

import {
 eq, like, or, sql, and, desc, isNull, inArray, gte 
}
 from "drizzle-orm"
;

import {
 requireAdmin, requireAuth 
}
 from "../middlewares/auth"
;

import {
 subscriptionsTable, usersTable 
}
 from "@workspace/db"
;

import {
 chunkText, embedTexts, retrieveRelevantChunks, checkChunkQuality 
}
 from "../lib/rag"
;

import {
 extractText, indexDocument, detectMime, isIndexable, extractCaseMetadata, extractPdfWithPages, validateCaseMetadata 
}
 from "../lib/document-indexer"
;

import {
 notifyAdminSuspiciousCitations, notifyAdminCleanedCitations, notifyAdminNeedsReview, notifyAdminHighFailureRate 
}
 from "../lib/telegram-notify"
;

import {
 isCorruptCaseMetadata 
}
 from "../lib/citation-cleanup"
;

import {
 searchLegalSources, formatSearchContext 
}
 from "../lib/legal-search"
;

import {
 verifyArticles 
}
 from "../lib/verification"
;

import {

  expandWithSynonyms, getSynonymsUsed, buildRegulatorySearchTerms,
  searchRegulatorySource, isTextVerified,
  REGULATORY_DOMAINS_BOE, REGULATORY_DOMAINS_MOJ, REGULATORY_DOMAINS_ALL,
  type RegulatoryResult, type RegulatorySource,
}
 from "../lib/regulatory-research"
;


const router: IRouter = Router()
;


function getApiKey(): string {

  return (process.env.OPENAI_API_KEY ?? "").replace(/[^\x20-\x7E]/g, "").trim()
;

}


// ── In-memory rate limiter for public preview-search ─────────────────────────
const previewSearchHits = new Map<string, { count: number; resetAt: number }>();
const PREVIEW_SEARCH_LIMIT = 10;   // max requests per window
const PREVIEW_SEARCH_WINDOW = 60_000; // 1 minute in ms

function previewSearchRateLimit(req: import("express").Request, res: import("express").Response, next: import("express").NextFunction): void {
  // req.ip is resolved by Express using the configured trust-proxy setting,
  // so it reflects the real client IP and cannot be spoofed via x-forwarded-for.
  const ip = req.ip ?? req.socket.remoteAddress ?? "unknown";
  const now = Date.now();
  const entry = previewSearchHits.get(ip);

  if (!entry || now >= entry.resetAt) {
    previewSearchHits.set(ip, { count: 1, resetAt: now + PREVIEW_SEARCH_WINDOW });
    next();
    return;
  }

  entry.count++;
  if (entry.count > PREVIEW_SEARCH_LIMIT) {
    const retryAfter = Math.ceil((entry.resetAt - now) / 1000);
    res.setHeader("Retry-After", String(retryAfter));
    res.setHeader("X-RateLimit-Limit", String(PREVIEW_SEARCH_LIMIT));
    res.setHeader("X-RateLimit-Remaining", "0");
    res.setHeader("X-RateLimit-Reset", String(Math.ceil(entry.resetAt / 1000)));
    res.status(429).json({ error: "تجاوزت الحد المسموح به. حاول لاحقاً." });
    return;
  }
  next();
}

// Periodically clean up stale entries to avoid unbounded memory growth
setInterval(() => {
  const now = Date.now();
  for (const [ip, entry] of previewSearchHits) {
    if (now >= entry.resetAt) previewSearchHits.delete(ip);
  }
}, 5 * 60_000); // every 5 minutes

// ── In-memory bulk job tracker ────────────────────────────────────────────────
interface BulkJob {

  total: number
;

  done: number
;

  failed: number
;

  running: boolean
;

  log: string[]
;
        // last 30 messages
}

const bulkJobs = new Map<string, BulkJob>()
;


function logJob(job: BulkJob, msg: string) {

  job.log.push(msg)
;

  if (job.log.length > 30) job.log.shift()
;

}


const SUPPORTED_EXT = /\.(pdf|docx?|pptx?|xlsx?|txt|rtf|csv)$/i
;


/** Fan-out a circular-new notification to all active subscribers */
async function notifyNewCircular(docId: number, filename: string): Promise<void> {
  try {
    const now = new Date();

    // Users with an active subscription (endDate null = no expiry, or future)
    const activeUsers = await db
      .selectDistinct({ id: usersTable.id })
      .from(usersTable)
      .innerJoin(subscriptionsTable, eq(subscriptionsTable.userId, usersTable.id))
      .where(
        and(
          eq(subscriptionsTable.status, "active"),
          or(
            isNull(subscriptionsTable.endDate),
            gte(subscriptionsTable.endDate, now)
          )
        )
      );

    if (activeUsers.length === 0) return;

    const title = filename.replace(/\.[^.]+$/, ""); // strip extension for display
    const link  = `/circulars?doc=${docId}`;

    const [notif] = await db.insert(notificationsTable).values({
      titleAr: `تعميم جديد: ${title}`,
      titleEn: `New Circular: ${title}`,
      bodyAr:  `تمت إضافة تعميم جديد "${title}" إلى قاعدة المعرفة. اضغط هنا للاطلاع عليه. ${link}`,
      bodyEn:  `A new circular "${title}" has been added to the knowledge base. Tap to view it. ${link}`,
      type:    "legal_change" as const,
      isPublished: true,
      publishedAt: now,
    }).returning();

    await db.insert(userNotificationsTable).values(
      activeUsers.map(u => ({ userId: u.id, notificationId: notif.id }))
    );
  } catch (err) {
    // Non-fatal — log but don't break the upload response
    console.error("[notifyNewCircular] failed:", err);
  }
}


// Store files in memory (we only need the buffer for parsing)
const upload = multer( {

  storage: multer.memoryStorage(),
  limits: {
 fileSize: 50 * 1024 * 1024 
}
, // 50 MB
  fileFilter: (_req, file, cb) => {

    if (SUPPORTED_EXT.test(file.originalname)) cb(null, true)
;

    else cb(new Error("نوع الملف غير مدعوم — المدعوم: PDF، Word، PowerPoint، Excel، TXT"))
;

  
}
,
}
)
;


// Separate multer for ZIP (larger limit)
const uploadZip = multer( {

  storage: multer.memoryStorage(),
  limits: {
 fileSize: 500 * 1024 * 1024 
}
, // 500 MB
  fileFilter: (_req, file, cb) => {

    if (file.mimetype === "application/zip" ||
        file.mimetype === "application/x-zip-compressed" ||
        file.originalname.match(/\.zip$/i)) {

      cb(null, true)
;

    
}
 else {

      cb(new Error("يُسمح فقط بملفات ZIP"))
;

    
}

  
}
,
}
)
;


// extractText و indexDocument مُستوردان من document-indexer.ts

/**
 * Generate a 2-3 sentence smart summary that directly answers the query
 * using the top retrieved chunks as context.
 * Uses gpt-4o-mini for speed. Returns '' on any failure (non-fatal).
 */
async function generateSmartSummary(
  query: string,
  chunks: Array<{ content: string }>,
  apiKey: string,
): Promise<string> {
  if (chunks.length === 0 || !apiKey) return "";
  const openai = new OpenAI({ apiKey });
  const context = chunks
    .slice(0, 5)
    .map((c, i) => `[${i + 1}] ${c.content.slice(0, 600)}`)
    .join("\n\n");
  try {
    const resp = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      temperature: 0.1,
      max_tokens: 250,
      messages: [
        charterSystemMsg(),
        {
          role: "system",
          content:
            "أنت مساعد قانوني سعودي متخصص. لخّص الإجابة على السؤال في 2-3 جمل مباشرة، مستنداً فقط إلى النصوص المقدمة. كن دقيقاً وموجزاً ولا تخترع معلومات غير موجودة في النصوص.",
        },
        {
          role: "user",
          content: `السؤال: ${query}\n\nالنصوص القانونية ذات الصلة:\n${context}\n\nالملخص:`,
        },
      ],
    });
    return resp.choices[0]?.message?.content?.trim() ?? "";
  } catch {
    return "";
  }
}

/** Strip HTML tags and decode common entities to get readable plain text */
function htmlToText(html: string): string {

  return html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\s{3,}/g, "\n\n")
    .trim();

}


/** Fetch a URL and return its plain text content */
async function fetchUrlText(url: string): Promise<string> {

  const headers: Record<string, string> = {

    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
    "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
    "Accept-Language": "ar,en-US;q=0.9,en;q=0.8",
    "Accept-Encoding": "gzip, deflate",
    "Cache-Control": "no-cache",
    "Connection": "keep-alive",
  
};


  // Try main URL, then fallback to /sitemap.xml for blocked root pages
  const attempts = [url, url.replace(/\/$/, "") + "/sitemap.xml"]
;

  let lastErr = ""
;


  for (const attempt of attempts) {

    try {

      const res = await fetch(attempt, {

        headers,
        redirect: "follow",
        signal: AbortSignal.timeout(25_000),
      
}
)
;

      if (!res.ok) {
 lastErr = `${res.status} ${res.statusText}`
;
 continue
;
 
}

      const ct = res.headers.get("content-type") ?? ""
;

      const body = await res.text()
;

      if (!body || body.trim().length < 20) continue
;

      if (ct.includes("text/plain") || ct.includes("xml")) return body
;

      return htmlToText(body)
;

    
}
 catch (e: any) {

      lastErr = e?.message ?? String(e)
;

    
}

  
}

  throw new Error(`فشل جلب الرابط: ${lastErr}`)
;

}


/** Run the full indexing pipeline for a URL document */
async function indexUrlDocument(docId: number, url: string): Promise<void> {

  const apiKey = getApiKey()
;


  await db
    .update(knowledgeDocumentsTable)
    .set( {
 status: "indexing", updatedAt: new Date() 
}
)
    .where(eq(knowledgeDocumentsTable.id, docId))
;


  try {

    const rawText = await fetchUrlText(url)
;

    if (!rawText || rawText.trim().length < 20) {

      throw new Error("لم يُستخرج نص كافٍ من الرابط. تأكد أن الصفحة تحتوي على محتوى نصي.")
;

    
}


    const chunks = chunkText(rawText)
;

    if (chunks.length === 0) throw new Error("لم يُنتج أي أجزاء من المحتوى.")
;


    await db
      .update(knowledgeDocumentsTable)
      .set( {
 extractedText: rawText.slice(0, 100_000), structuredData: null 
}
)
      .where(eq(knowledgeDocumentsTable.id, docId))
;


    const embeddings = await embedTexts(chunks, apiKey)
;

    await db.delete(knowledgeChunksTable).where(eq(knowledgeChunksTable.documentId, docId))
;

    await db.insert(knowledgeChunksTable).values(
      chunks.map((content, i) => ( {
 documentId: docId, chunkIndex: i, content, embedding: embeddings[i] 
}
))
    )
;


    await db
      .update(knowledgeDocumentsTable)
      .set( {
 status: "indexed", totalChunks: chunks.length, updatedAt: new Date(), errorMessage: null 
}
)
      .where(eq(knowledgeDocumentsTable.id, docId))
;

  
}
 catch (err: any) {

    await db
      .update(knowledgeDocumentsTable)
      .set( {
 status: "error", errorMessage: err?.message ?? "خطأ غير معروف", updatedAt: new Date() 
}
)
      .where(eq(knowledgeDocumentsTable.id, docId))
;

    throw err
;

  
}

}


// ─── Routes ───────────────────────────────────────────────────────────────────

/** List all documents */
router.get("/admin/knowledge/documents", requireAdmin, async (_req, res): Promise<void> => {

  const docs = await db
    .select( {

      id: knowledgeDocumentsTable.id,
      filename: knowledgeDocumentsTable.filename,
      mimeType: knowledgeDocumentsTable.mimeType,
      sourceUrl: knowledgeDocumentsTable.sourceUrl,
      status: knowledgeDocumentsTable.status,
      errorMessage: knowledgeDocumentsTable.errorMessage,
      totalChunks: knowledgeDocumentsTable.totalChunks,
      createdAt: knowledgeDocumentsTable.createdAt,
      category: knowledgeDocumentsTable.category,
      hasMeta: knowledgeDocumentsTable.caseMetadata,
      lastCleanedAt: knowledgeDocumentsTable.lastCleanedAt,
      cleanCount: knowledgeDocumentsTable.cleanCount,
    
}
)
    .from(knowledgeDocumentsTable)
    .orderBy(knowledgeDocumentsTable.createdAt)
;

  res.json(docs)
;

}
)
;


/** Add + index a URL source */
router.post("/admin/knowledge/url", requireAdmin, async (req, res): Promise<void> => {

  const {
 url, title, category 
}
 = req.body as {
 url?: string
;
 title?: string
;
 category?: string 
};

  if (!url || !/^https?:\/\/.+/.test(url)) {

    res.status(400).json( {
 error: "رابط غير صالح. يجب أن يبدأ بـ http:// أو https://" 
}
)
;

    return
;

  
}


  const validCats = ["judicial","circular","regulation","contract","general"]
;

  const cat = validCats.includes(category ?? "") ? (category as any) : "general"
;

  const label = title?.trim() || new URL(url).hostname
;

  const [doc] = await db
    .insert(knowledgeDocumentsTable)
    .values( {
 filename: label, mimeType: "text/html", sourceUrl: url, status: "pending", category: cat 
}
)
    .returning()
;


  try {

    await indexUrlDocument(doc.id, url)
;

    if (cat === "circular") {
      void notifyNewCircular(doc.id, label);
    }

    const [updated] = await db
      .select( {
 id: knowledgeDocumentsTable.id, status: knowledgeDocumentsTable.status, totalChunks: knowledgeDocumentsTable.totalChunks 
}
)
      .from(knowledgeDocumentsTable)
      .where(eq(knowledgeDocumentsTable.id, doc.id))
;

    res.json( {
 success: true, document: updated 
}
)
;

  
}
 catch (err: any) {

    res.status(500).json( {
 error: err?.message ?? "فشل جلب الرابط" 
}
)
;

  
}

}
)
;


/** Upload + index a file */
router.post(
  "/admin/knowledge/upload",
  requireAdmin,
  upload.single("file"),
  async (req, res): Promise<void> => {

    const file = req.file
;

    if (!file) {

      res.status(400).json( {
 error: "لم يُرسل ملف" 
}
)
;

      return
;

    
}


    const validCats = ["judicial","circular","regulation","contract","general"]
;

    const cat = validCats.includes(req.body?.category ?? "") ? (req.body.category as any) : "general"
;


    // Create document record
    const [doc] = await db
      .insert(knowledgeDocumentsTable)
      .values( {

        filename: file.originalname,
        mimeType: file.mimetype,
        status: "pending",
        category: cat,
      
}
)
      .returning()
;


    // Process synchronously (admin action — user waits for confirmation)
    try {

      await indexDocument(doc.id, file.buffer, file.mimetype, file.originalname)
;

      if (cat === "circular") {
        void notifyNewCircular(doc.id, file.originalname);
      }

      const [updated] = await db
        .select( {
 id: knowledgeDocumentsTable.id, status: knowledgeDocumentsTable.status, totalChunks: knowledgeDocumentsTable.totalChunks 
}
)
        .from(knowledgeDocumentsTable)
        .where(eq(knowledgeDocumentsTable.id, doc.id))
;

      res.json( {
 success: true, document: updated 
}
)
;

    
}
 catch (err: any) {

      res.status(500).json( {
 error: err?.message ?? "فشل الفهرسة" 
}
)
;

    
}

  
}

)
;


// ── ZIP bulk upload ────────────────────────────────────────────────────────────
router.post(
  "/admin/knowledge/zip-upload",
  requireAdmin,
  uploadZip.single("file"),
  async (req, res): Promise<void> => {

    const file = req.file
;

    if (!file) {
 res.status(400).json( {
 error: "لم يُرسل ملف ZIP" 
}
)
;
 return
;
 
}


    let zip: AdmZip
;

    try {
 zip = new AdmZip(file.buffer)
;
 
}

    catch {
 res.status(400).json( {
 error: "ملف ZIP تالف أو غير صالح" 
}
)
;
 return
;
 
}


    const entries = zip.getEntries().filter(e =>
      !e.isDirectory && isIndexable(e.entryName) && !e.entryName.startsWith("__MACOSX")
    )
;


    if (entries.length === 0) {

      res.status(400).json( {
 error: "لا توجد ملفات PDF أو TXT أو DOCX داخل الـ ZIP" 
}
)
;

      return
;

    
}


    // Create a job ID and register all docs as pending
    const jobId = `zip_${Date.now()}`
;

    const job: BulkJob = {
 total: entries.length, done: 0, failed: 0, running: true, log: [] 
};

    bulkJobs.set(jobId, job)
;


    // Respond immediately so the client can start polling
    res.json( {
 jobId, total: entries.length 
}
)
;


    // Process in background without blocking the response
    (async () => {

      for (const entry of entries) {

        const name = entry.entryName.split("/").pop() ?? entry.entryName
;

        try {

          const buf = entry.getData()
;

          const mime = detectMime(name, "application/octet-stream")
;


          const validCats2 = ["judicial","circular","regulation","contract","general"]
;

          const zipCat = validCats2.includes(req.body?.category ?? "") ? (req.body.category as any) : "general"
;

          const [doc] = await db
            .insert(knowledgeDocumentsTable)
            .values( {
 filename: name, mimeType: mime, status: "pending", fileData: buf, fileSize: buf.length, category: zipCat 
}
)
            .returning()
;


          await indexDocument(doc.id, buf, mime, name)
;

          if (zipCat === "circular") {
            void notifyNewCircular(doc.id, name);
          }

          job.done++
;

          logJob(job, `✅ ${name}`)
;

        
}
 catch (err: any) {

          job.failed++
;

          logJob(job, `❌ ${name}: ${err?.message?.slice(0, 60) ?? "خطأ"}`)
;

        
}

      
}

      job.running = false
;

      logJob(job, `🎉 اكتملت المعالجة: ${job.done} نجح، ${job.failed} فشل`)
;

      // Clean up after 30 min
      setTimeout(() => bulkJobs.delete(jobId), 30 * 60 * 1000)
;

    
}
)()
;

  
}

)
;


/** Poll ZIP job status */
router.get("/admin/knowledge/zip-status/:jobId", requireAdmin, (req, res): void => {

  const job = bulkJobs.get(req.params.jobId)
;

  if (!job) {
 res.status(404).json( {
 error: "المهمة غير موجودة أو انتهت" 
}
)
;
 return
;
 
}

  res.json( {

    total: job.total,
    done: job.done,
    failed: job.failed,
    running: job.running,
    log: job.log,
  
}
)
;

}
)
;


/** Download original file */
router.get("/admin/knowledge/documents/:id/download", requireAdmin, async (req, res): Promise<void> => {

  const id = parseInt(req.params.id, 10)
;

  if (isNaN(id)) {
 res.status(400).json( {
 error: "معرّف غير صالح" 
}
)
;
 return
;
 
}


  const [doc] = await db
    .select( {

      filename: knowledgeDocumentsTable.filename,
      mimeType: knowledgeDocumentsTable.mimeType,
      fileData: knowledgeDocumentsTable.fileData,
    
}
)
    .from(knowledgeDocumentsTable)
    .where(eq(knowledgeDocumentsTable.id, id))
;


  if (!doc) {
 res.status(404).json( {
 error: "المستند غير موجود" 
}
)
;
 return
;
 
}

  if (!doc.fileData) {
 res.status(404).json( {
 error: "الملف الأصلي غير متوفر" 
}
)
;
 return
;
 
}


  const safeName = encodeURIComponent(doc.filename ?? `document_${id}`)
;

  res.setHeader("Content-Type", doc.mimeType ?? "application/octet-stream")
;

  res.setHeader("Content-Disposition", `attachment; filename*=UTF-8''${safeName}`)
;

  res.send(doc.fileData)
;

}
)
;


/** Delete a document and all its chunks */
router.delete("/admin/knowledge/documents/:id", requireAdmin, async (req, res): Promise<void> => {

  const id = parseInt(req.params.id, 10)
;

  if (isNaN(id)) {
 res.status(400).json( {
 error: "معرّف غير صالح" 
}
)
;
 return
;
 
}

  // Chunks are cascade-deleted via FK
  await db.delete(knowledgeDocumentsTable).where(eq(knowledgeDocumentsTable.id, id))
;

  res.json( {
 success: true 
}
)
;

}
)
;


/** Re-index an existing document — prefers raw binary so new TOC/page filters apply */
router.post("/admin/knowledge/reindex/:id", requireAdmin, async (req, res): Promise<void> => {

  const id = parseInt(req.params.id, 10)
;

  if (isNaN(id)) {
 res.status(400).json( {
 error: "معرّف غير صالح" 
}
)
;
 return
;
 
}


  const [doc] = await db
    .select()
    .from(knowledgeDocumentsTable)
    .where(eq(knowledgeDocumentsTable.id, id))
;


  if (!doc) {
 res.status(404).json( {
 error: "المستند غير موجود" 
}
)
;
 return
;
 
}

  // If we have the original binary, run the full pipeline (applies TOC filter, page-boundary detection, etc.)
  // Only fall back to extractedText when no binary is stored (e.g. URL-sourced documents).
  const hasBinary = doc.fileData && (doc.fileData as Buffer).length > 0;

  if (!hasBinary && !doc.extractedText) {

    res.status(400).json( {
 error: "لا يوجد نص محفوظ لإعادة الفهرسة. يرجى حذف المستند وإعادة رفعه." 
}
)
;

    return
;

  
}


  if (hasBinary) {
    // Full pipeline — same as what reindex-all does
    try {
      await indexDocument(id, Buffer.from(doc.fileData as Buffer), doc.mimeType ?? "application/octet-stream", doc.filename);
      const [updated] = await db
        .select({ id: knowledgeDocumentsTable.id, status: knowledgeDocumentsTable.status, totalChunks: knowledgeDocumentsTable.totalChunks })
        .from(knowledgeDocumentsTable)
        .where(eq(knowledgeDocumentsTable.id, id));
      res.json({ success: true, totalChunks: updated?.totalChunks ?? 0 });
    } catch (err: any) {
      res.status(500).json({ error: err?.message ?? "فشل إعادة الفهرسة" });
    }
    return;
  }

  // Fallback: re-chunk from stored extractedText (URL docs)
  const apiKey = getApiKey()
;

  await db
    .update(knowledgeDocumentsTable)
    .set( {
 status: "indexing", updatedAt: new Date() 
}
)
    .where(eq(knowledgeDocumentsTable.id, id))
;


  try {

    const chunks = chunkText(doc.extractedText!)
;

    const embeddings = await embedTexts(chunks, apiKey)
;

    await db.delete(knowledgeChunksTable).where(eq(knowledgeChunksTable.documentId, id))
;

    await db.insert(knowledgeChunksTable).values(
      chunks.map((content, i) => ( {
 documentId: id, chunkIndex: i, content, embedding: embeddings[i] 
}
))
    )
;

    await db
      .update(knowledgeDocumentsTable)
      .set( {
 status: "indexed", totalChunks: chunks.length, errorMessage: null, updatedAt: new Date() 
}
)
      .where(eq(knowledgeDocumentsTable.id, id))
;

    // ── Re-extract citation metadata for judicial documents ──────────────────
    if (doc.category === "judicial" && doc.extractedText) {
      try {
        const meta = await extractCaseMetadata(doc.extractedText, doc.filename);
        // validateCaseMetadata nulls out fields that fail validation
        validateCaseMetadata(meta as unknown as Record<string, any>, doc.filename);
        await db
          .update(knowledgeDocumentsTable)
          .set({ caseMetadata: meta as any, updatedAt: new Date() })
          .where(eq(knowledgeDocumentsTable.id, id));
      } catch (metaErr: any) {
        // Non-fatal: log but don't fail the reindex response
        console.error(`[reindex] citation metadata extraction failed for doc ${id}:`, metaErr?.message);
      }
    }

    res.json( {
 success: true, totalChunks: chunks.length 
}
)
;

  
}
 catch (err: any) {

    await db
      .update(knowledgeDocumentsTable)
      .set( {
 status: "error", errorMessage: err?.message, updatedAt: new Date() 
}
)
      .where(eq(knowledgeDocumentsTable.id, id))
;

    res.status(500).json( {
 error: err?.message 
}
)
;

  
}

}
)
;


// ── Bulk re-classify all 'general' documents ──────────────────────────────────
router.post("/admin/knowledge/reclassify-all", requireAdmin, async (_req, res): Promise<void> => {

  const docs = await db
    .select( {
 id: knowledgeDocumentsTable.id, filename: knowledgeDocumentsTable.filename, extractedText: knowledgeDocumentsTable.extractedText 
}
)
    .from(knowledgeDocumentsTable)
    .where(and(
      eq(knowledgeDocumentsTable.status, "indexed"),
      eq(knowledgeDocumentsTable.category as any, "general")
    ))
;


  if (docs.length === 0) {
 res.json( {
 updated: 0, message: "لا توجد وثائق تحتاج إعادة تصنيف" 
}
)
;
 return
;
 
}


  let updated = 0
;

  for (const doc of docs) {

    if (!doc.extractedText) continue
;

    try {

      const {
 autoClassifyDocument 
}
 = await import("../lib/document-indexer")
;

      const cat = await autoClassifyDocument(doc.extractedText, doc.filename)
;

      if (cat !== "general") {

        await db.update(knowledgeDocumentsTable)
          .set( {
 category: cat as any 
}
)
          .where(eq(knowledgeDocumentsTable.id, doc.id))
;

        updated++
;

      
}

    
}
 catch {
 /* skip failed */ 
}

  
}

  res.json( {
 total: docs.length, updated, message: `تم إعادة تصنيف ${updated} من ${docs.length} وثيقة` 
}
)
;

}
)
;


// ── MOJ Circular Crawler (Tavily-powered) ─────────────────────────────────────
const MOJ_CRAWL_STATE_FILE = (() => {

  const path = require("path") as typeof import("path")
;

  return path.resolve(process.cwd(), "../../.local/moj_crawl_state.json")
;

}
)()
;


interface MojCrawlState {

  lastCrawlAt?: string
;

  intervalHours: number
;

  enabled: boolean
;

  totalIndexed: number
;

}


function loadMojCrawlState(): MojCrawlState {

  try {

    const fs = require("fs") as typeof import("fs")
;

    return JSON.parse(fs.readFileSync(MOJ_CRAWL_STATE_FILE, "utf8"))
;

  
}
 catch {
 return {
 intervalHours: 24, enabled: false, totalIndexed: 0 
};
 
}

}


function saveMojCrawlState(s: MojCrawlState): void {

  try {

    const fs = require("fs") as typeof import("fs")
;

    const path = require("path") as typeof import("path")
;

    fs.mkdirSync(path.dirname(MOJ_CRAWL_STATE_FILE), {
 recursive: true 
}
)
;

    fs.writeFileSync(MOJ_CRAWL_STATE_FILE, JSON.stringify(s, null, 2))
;

  
}
 catch {
}

}


export function getMojCrawlState(): MojCrawlState {
 return loadMojCrawlState()
;
 
}


let mojCrawlTimer: ReturnType<typeof setInterval> | null = null
;


/** Fetch MOJ circulars via Tavily and index any new PDFs found. */
async function runMojCrawl(log: (m: string) => void): Promise< {
 indexed: number
;
 skipped: number 
}
> {

  const tavilyKey = process.env.TAVILY_API_KEY
;

  if (!tavilyKey) {
 log("⚠️ TAVILY_API_KEY غير متاح")
;
 return {
 indexed: 0, skipped: 0 
};
 
}


  const queries = [
    "تعاميم وزارة العدل السعودية الجديدة site:moj.gov.sa",
    "circular ministry of justice saudi arabia site:moj.gov.sa",
    "تعميم وزارة العدل نظام العمل filetype:pdf",
  ]
;


  const seen = new Set<string>()
;

  const results: Array< {
 url: string
;
 title: string 
}
> = []
;


  for (const q of queries) {

    try {

      const r = await fetch("https://api.tavily.com/search", {

        method: "POST",
        headers: {
 "Content-Type": "application/json" 
}
,
        body: JSON.stringify( {

          api_key: tavilyKey,
          query: q,
          search_depth: "advanced",
          include_domains: ["moj.gov.sa", "laws.moj.gov.sa", "adlm.moj.gov.sa"],
          max_results: 8,
          include_raw_content: false,
        
}
),
        signal: AbortSignal.timeout(12000),
      
}
)
;

      if (!r.ok) continue
;

      const data = await r.json() as {
 results?: Array< {
 url?: string
;
 title?: string
;
 score?: number 
}
> 
};

      for (const item of data.results ?? []) {

        if (!item.url || seen.has(item.url)) continue
;

        seen.add(item.url)
;

        results.push( {
 url: item.url, title: item.title ?? item.url 
}
)
;

      
}

    
}
 catch {
 /* continue */ 
}

  
}


  log(`🔍 عثرنا على ${results.length} رابط من وزارة العدل`)
;


  let indexed = 0, skipped = 0
;


  for (const {
 url, title 
}
 of results) {

    // Check if already in knowledge base
    const existing = await db
      .select( {
 id: knowledgeDocumentsTable.id 
}
)
      .from(knowledgeDocumentsTable)
      .where(eq(knowledgeDocumentsTable.sourceUrl, url))
      .limit(1)
;

    if (existing.length > 0) {
 skipped++
;
 continue
;
 
}


    try {

      const isPdf = url.toLowerCase().endsWith(".pdf") || url.toLowerCase().includes(".pdf?")
;

      if (isPdf) {

        // Download and index PDF
        const resp = await fetch(url, {
 signal: AbortSignal.timeout(30000) 
}
)
;

        if (!resp.ok) {
 log(`❌ فشل جلب: ${url}`)
;
 skipped++
;
 continue
;
 
}

        const buf = Buffer.from(await resp.arrayBuffer())
;

        const {
 createAndIndexDocument: _createAndIndex 
}
 = await import("../lib/document-indexer")
;

        const { docId: pdfDocId } = await _createAndIndex(buf, "application/pdf", title || url.split("/").pop() || "تعميم.pdf", {

          category: "circular",
          sourceUrl: url,
        
}
)
;

        void notifyNewCircular(pdfDocId, title || url.split("/").pop() || "تعميم.pdf");

      
}
 else {

        // Index as HTML page
        const [docRec] = await db.insert(knowledgeDocumentsTable).values( {

          filename: title.slice(0, 200) || "تعميم من وزارة العدل",
          mimeType: "text/html",
          sourceUrl: url,
          status: "pending",
          category: "circular" as any,
        
}
).returning()
;

        const {
 indexDocument: _idx, extractText: _ext 
}
 = await import("../lib/document-indexer")
;

        const resp = await fetch(url, {
 signal: AbortSignal.timeout(15000) 
}
)
;

        if (resp.ok) {

          const html = await resp.text()
;

          const buf = Buffer.from(html, "utf8")
;

          await _idx(docRec.id, buf, "text/html", docRec.filename)
;

          void notifyNewCircular(docRec.id, docRec.filename);

        
}

      
}

      indexed++
;

      log(`✅ ${title.slice(0, 60)}`)
;

    
}
 catch (e: any) {

      log(`❌ ${url.slice(0, 60)}: ${e?.message?.slice(0, 50) ?? "خطأ"}`)
;

      skipped++
;

    
}

    await new Promise(r => setTimeout(r, 500))
;
 // rate limit
  
}


  log(`✅ انتهى الزحف: ${indexed} مُفهرَس، ${skipped} موجود مسبقاً`)
;

  return {
 indexed, skipped 
};

}


// In-memory crawl job
interface CrawlJob {
 running: boolean
;
 log: string[]
;
 indexed: number
;
 skipped: number
;
 
}

let activeCrawlJob: CrawlJob | null = null
;


router.post("/admin/knowledge/crawl-moj", requireAdmin, async (_req, res): Promise<void> => {

  if (activeCrawlJob?.running) {

    res.status(409).json( {
 error: "يوجد زحف جارٍ بالفعل" 
}
)
;

    return
;

  
}

  activeCrawlJob = {
 running: true, log: [], indexed: 0, skipped: 0 
};

  res.json( {
 started: true 
}
)
;


  const logLine = (m: string) => {

    activeCrawlJob!.log.push(m)
;

    if (activeCrawlJob!.log.length > 40) activeCrawlJob!.log.shift()
;

  
};


  try {

    const {
 indexed, skipped 
}
 = await runMojCrawl(logLine)
;

    activeCrawlJob.indexed = indexed
;

    activeCrawlJob.skipped = skipped
;

    const state = loadMojCrawlState()
;

    state.lastCrawlAt = new Date().toISOString()
;

    state.totalIndexed = (state.totalIndexed ?? 0) + indexed
;

    saveMojCrawlState(state)
;

  
}
 catch (e: any) {

    logLine(`❌ خطأ: ${e?.message}`)
;

  
}
 finally {

    activeCrawlJob.running = false
;

  
}

}
)
;


router.get("/admin/knowledge/crawl-moj/status", requireAdmin, (_req, res): void => {

  const state = loadMojCrawlState()
;

  res.json( {

    job: activeCrawlJob ?? {
 running: false, log: [], indexed: 0, skipped: 0 
}
,
    state,
  
}
)
;

}
)
;


router.post("/admin/knowledge/crawl-moj/schedule", requireAdmin, (req, res): void => {

  const {
 enabled, intervalHours 
}
 = req.body as {
 enabled?: boolean
;
 intervalHours?: number 
};

  const state = loadMojCrawlState()
;

  if (typeof enabled === "boolean") state.enabled = enabled
;

  if (typeof intervalHours === "number" && intervalHours >= 1) state.intervalHours = intervalHours
;

  saveMojCrawlState(state)
;


  if (mojCrawlTimer) {
 clearInterval(mojCrawlTimer)
;
 mojCrawlTimer = null
;
 
}

  if (state.enabled) {

    mojCrawlTimer = setInterval(() => {

      if (activeCrawlJob?.running) return
;

      activeCrawlJob = {
 running: true, log: [], indexed: 0, skipped: 0 
};

      runMojCrawl(m => {
 activeCrawlJob!.log.push(m)
;
 
}
)
        .then(( {
 indexed, skipped 
}
) => {

          activeCrawlJob!.indexed = indexed
;
 activeCrawlJob!.skipped = skipped
;

          const s2 = loadMojCrawlState()
;

          s2.lastCrawlAt = new Date().toISOString()
;

          s2.totalIndexed = (s2.totalIndexed ?? 0) + indexed
;

          saveMojCrawlState(s2)
;

        
}
)
        .finally(() => {
 if (activeCrawlJob) activeCrawlJob.running = false
;
 
}
)
;

    
}
, state.intervalHours * 60 * 60 * 1000)
;

  
}


  res.json( {
 enabled: state.enabled, intervalHours: state.intervalHours 
}
)
;

}
)
;


// ── Pages coverage statistics ─────────────────────────────────────────────────
router.get("/admin/knowledge/pages-coverage", requireAdmin, async (_req, res): Promise<void> => {

  const [row] = await db
    .select( {

      totalChunks:  sql<number>`cast(count(*) as int)`,
      withPages:    sql<number>`cast(count(*) filter (where ${knowledgeChunksTable.pageStart} is not null) as int)`,
      withoutPages: sql<number>`cast(count(*) filter (where ${knowledgeChunksTable.pageStart} is null) as int)`,
    
}
)
    .from(knowledgeChunksTable)
;


  const total = row?.totalChunks ?? 0
;

  const withPages = row?.withPages ?? 0
;

  const withoutPages = row?.withoutPages ?? 0
;

  const coveragePercent = total > 0 ? Math.round((withPages / total) * 100) : 0
;


  res.json( {
 totalChunks: total, withPages, withoutPages, coveragePercent 
}
)
;

}
)
;


/** Restore MOJ crawl schedule at server startup. */
export function restoreMojCrawlSchedule(): void {

  const state = loadMojCrawlState()
;

  if (!state.enabled) return
;

  if (mojCrawlTimer) {
 clearInterval(mojCrawlTimer)
;
 mojCrawlTimer = null
;
 
}

  mojCrawlTimer = setInterval(() => {

    if (activeCrawlJob?.running) return
;

    activeCrawlJob = {
 running: true, log: [], indexed: 0, skipped: 0 
};

    runMojCrawl(m => {
 activeCrawlJob!.log.push(m)
;
 
}
)
      .then(( {
 indexed, skipped 
}
) => {

        activeCrawlJob!.indexed = indexed
;
 activeCrawlJob!.skipped = skipped
;

        const s2 = loadMojCrawlState()
;

        s2.lastCrawlAt = new Date().toISOString()
;

        s2.totalIndexed = (s2.totalIndexed ?? 0) + indexed
;

        saveMojCrawlState(s2)
;

      
}
)
      .finally(() => {
 if (activeCrawlJob) activeCrawlJob.running = false
;
 
}
)
;

  
}
, state.intervalHours * 60 * 60 * 1000)
;

}


// ── Lawyer query expansion: detect article refs, case numbers, court names ─────
function expandLawyerQuery(query: string): string {

  let expanded = query
;

  // If query looks like just a case number (digits/slash), add legal context
  if (/^\d+\s*[\/\\]\s*\d+$/.test(query.trim())) {

    expanded = `قضية رقم ${query} حكم قضائي`
;

  
}

  // If just "المادة X" with no surrounding text, add legal context
  if (/^المادة\s+\d+$/.test(query.trim())) {

    expanded = `${query} نظام تطبيق حكم`
;

  
}

  return expanded
;

}


// ── Semantic search (paid subscribers only) ───────────────────────────────────
router.get("/knowledge/search", requireAuth, async (req, res): Promise<void> => {

  const q = (req.query.q as string ?? "").trim()
;

  if (!q || q.length < 2) {
 res.status(400).json( {
 error: "أدخل نصاً للبحث (حرفان على الأقل)" 
}
)
;
 return
;
 
}


  // Admins always have full access
  if (req.userRole !== "admin") {

    // Require active paid subscription (monthly or business: questionsAllowed >= 999)
    const activeSubs = await db.select().from(subscriptionsTable)
      .where(and(eq(subscriptionsTable.userId, req.userId!), eq(subscriptionsTable.status, "active")))
      .limit(1)
;

    const sub = activeSubs[0]
;

    if (!sub || sub.questionsAllowed <= 3) {

      res.status(403).json( {
 error: "الباحث القانوني متاح للمشتركين فقط. يرجى الاشتراك في إحدى الباقات المدفوعة", code: "UPGRADE_REQUIRED" 
}
)
;

      return
;

    
}

  
}


  // Optional filters (applied post-retrieval on caseMetadata)
  const courtFilter    = ((req.query.court    as string) ?? "").trim()
;

  const stageFilter    = ((req.query.stage    as string) ?? "").trim()
;

  const yearFilter     = ((req.query.year     as string) ?? "").trim()
;

  const subjectFilter  = ((req.query.subject  as string) ?? "").trim()
;


  try {

    const apiKey = getApiKey()
;

    const cat = (req.query.category as string | undefined) as any
;

    const expandedQ = expandLawyerQuery(q)
;


    let chunks = await retrieveRelevantChunks(expandedQ, apiKey, 12, 0.42, cat || undefined, {
 multiQuery: true 
}
)
;

    let fallback = false
;

    if (chunks.length === 0 && cat) {

      chunks = await retrieveRelevantChunks(expandedQ, apiKey, 12, 0.42, undefined, {
 multiQuery: true 
}
)
;

      if (chunks.length > 0) fallback = true
;

    
}


    // Post-filter by caseMetadata fields when filters are provided
    if (courtFilter || stageFilter || yearFilter || subjectFilter) {

      chunks = chunks.filter(c => {

        const m = c.caseMetadata
;

        if (!m) return false
;
 // strict: no metadata = no citation possible
        if (courtFilter   && !m.court?.includes(courtFilter))                        return false
;

        if (stageFilter   && m.litigationStage !== stageFilter)                      return false
;

        if (yearFilter    && !(m.hijriDate?.includes(yearFilter) || m.gregorianDate?.startsWith(yearFilter))) return false
;

        if (subjectFilter && !m.disputeSubject?.includes(subjectFilter))             return false
;

        return true
;

      
}
)
;

    
}


    // ── Minimum relevance gate ────────────────────────────────────────────────
    // Phase-1 rule: literal matches (circular number / article number / exact phrase)
    // ALWAYS pass — a chunk that literally contains the queried reference must not
    // be suppressed by a low hybrid score.
    const MIN_DISPLAY_SIMILARITY = 0.70
;

    const hadResultsBeforeFilter = chunks.length > 0
;

    chunks = chunks.filter(c => c.literalMatch || c.similarity >= MIN_DISPLAY_SIMILARITY)
;

    const noSufficientSources = hadResultsBeforeFilter && chunks.length === 0
;


    // Count citable results (have at least pageStart OR caseMetadata) before trimming
    const totalBeforeTrim = chunks.length
;

    const citableCount = chunks.filter(c => c.pageStart != null || c.caseMetadata != null).length
;


    // Trim to top 8 after filtering
    chunks = chunks.slice(0, 8)
;


    // Generate smart summary (2-3 sentences answering the query directly)
    let smartSummary = ""
;

    if (chunks.length > 0) {

      smartSummary = await generateSmartSummary(q, chunks, apiKey)
;

    
}


    res.json( {
 results: chunks, query: q, fallback, citableCount, totalCount: totalBeforeTrim, noSufficientSources, smartSummary 
}
)
;

  
}
 catch (err: any) {

    res.status(500).json( {
 error: err?.message ?? "فشل البحث" 
}
)
;

  
}

}
)
;


// ── View original document (PDF inline with page anchor support) ──────────────
router.get("/documents/:id/view", requireAuth, async (req, res): Promise<void> => {

  const docId = parseInt(req.params.id as string, 10)
;

  if (isNaN(docId)) {
 res.status(400).json( {
 error: "معرّف غير صالح" 
}
)
;
 return
;
 
}


  const [doc] = await db
    .select( {

      filename: knowledgeDocumentsTable.filename,
      fileData: knowledgeDocumentsTable.fileData,
      mimeType: knowledgeDocumentsTable.mimeType,
    
}
)
    .from(knowledgeDocumentsTable)
    .where(and(
      eq(knowledgeDocumentsTable.id, docId),
      isNull(knowledgeDocumentsTable.archivedAt)
    ))
;


  if (!doc?.fileData) {

    res.status(404).json( {
 error: "الملف غير موجود أو غير مرفوع" 
}
)
;

    return
;

  
}


  const safeFilename = encodeURIComponent(doc.filename.replace(/[^\w.\-]/g, "_"))
;

  res.setHeader("Content-Type", doc.mimeType || "application/pdf")
;

  res.setHeader("Content-Disposition", `inline; filename="${safeFilename}"`)
;

  res.setHeader("Cache-Control", "private, max-age=3600")
;

  res.send(doc.fileData)
;

}
)
;


// ── Citation metadata stats for admin ────────────────────────────────────────

/** Heuristic: returns true when stored metadata looks incomplete or suspicious */
function citationNeedsReview(meta: Record<string, any>): boolean {

  const hasId = !!(meta.caseNumber?.trim() || meta.rulingNumber?.trim() || meta.deedNumber?.trim())
;

  const hasCourt = !!meta.court?.trim()
;

  const hasDate = !!(meta.hijriDate?.trim() || meta.gregorianDate?.trim())
;

  // Missing both identifier AND court → almost certainly a bad extraction
  if (!hasId && !hasCourt) return true
;

  // Has an identifier but nothing else (no court, no date) → suspicious
  if (hasId && !hasCourt && !hasDate) return true
;

  // caseNumber suspiciously short (likely hallucinated)
  if (meta.caseNumber && meta.caseNumber.trim().length < 3) return true
;

  return false
;

}


router.get("/admin/knowledge/citation-stats", requireAdmin, async (_req, res): Promise<void> => {

  const docs = await db
    .select( {

      id: knowledgeDocumentsTable.id,
      filename: knowledgeDocumentsTable.filename,
      category: knowledgeDocumentsTable.category,
      caseMetadata: knowledgeDocumentsTable.caseMetadata,
    
}
)
    .from(knowledgeDocumentsTable)
    .where(isNull(knowledgeDocumentsTable.archivedAt))
    .orderBy(desc(knowledgeDocumentsTable.createdAt))
;


  const judicial = docs.filter(d => d.category === "judicial")
;

  const withMeta = judicial.filter(d => d.caseMetadata != null)
;

  const needsReviewCount = withMeta.filter(d => citationNeedsReview(d.caseMetadata as any ?? {
}
)).length
;


  res.json( {

    total: docs.length,
    judicial: judicial.length,
    withMetadata: withMeta.length,
    withoutMetadata: judicial.length - withMeta.length,
    needsReview: needsReviewCount,
    docs: judicial.map(d => {

      const m = d.caseMetadata as any ?? null
;

      const nr = m != null ? citationNeedsReview(m) : false
;

      return {

        id: d.id,
        filename: d.filename,
        category: d.category,
        hasCaseMetadata: m != null,
        needsReview: nr,
        caseNumber:       m?.caseNumber       ?? null,
        rulingNumber:     m?.rulingNumber     ?? null,
        court:            m?.court            ?? null,
        hijriDate:        m?.hijriDate        ?? null,
        gregorianDate:    m?.gregorianDate    ?? null,
        litigationStage:  m?.litigationStage  ?? null,
        disputeSubject:   m?.disputeSubject   ?? null,
        deedNumber:       m?.deedNumber       ?? null,
      
};

    
}
),
  
}
)
;

}
)
;


// ── Export citation metadata as CSV ──────────────────────────────────────────
router.get("/admin/knowledge/citation-export.csv", requireAdmin, async (_req, res): Promise<void> => {

  const docs = await db
    .select({
      id: knowledgeDocumentsTable.id,
      filename: knowledgeDocumentsTable.filename,
      caseMetadata: knowledgeDocumentsTable.caseMetadata,
    })
    .from(knowledgeDocumentsTable)
    .where(
      and(
        isNull(knowledgeDocumentsTable.archivedAt),
        eq(knowledgeDocumentsTable.category, "judicial")
      )
    )
    .orderBy(desc(knowledgeDocumentsTable.createdAt));

  /** Escape a CSV field value */
  function csvField(v: string | number | boolean | null | undefined): string {
    if (v == null) return "";
    const s = String(v);
    // Quote fields that contain comma, double-quote, or newline
    if (s.includes(",") || s.includes('"') || s.includes("\n") || s.includes("\r")) {
      return `"${s.replace(/"/g, '""')}"`;
    }
    return s;
  }

  const headers = [
    "id", "filename", "caseNumber", "rulingNumber", "court",
    "hijriDate", "gregorianDate", "litigationStage", "disputeSubject", "deedNumber", "needsReview",
  ];
  const rows = docs.map(d => {
    const m = d.caseMetadata as Record<string, any> | null;
    const nr = m != null ? citationNeedsReview(m) : false;
    return [
      d.id,
      d.filename,
      m?.caseNumber      ?? "",
      m?.rulingNumber    ?? "",
      m?.court           ?? "",
      m?.hijriDate       ?? "",
      m?.gregorianDate   ?? "",
      m?.litigationStage ?? "",
      m?.disputeSubject  ?? "",
      m?.deedNumber      ?? "",
      nr,
    ].map(csvField).join(",");
  });

  const csv = [headers.join(","), ...rows].join("\r\n");

  res.setHeader("Content-Type", "text/csv; charset=utf-8");
  res.setHeader("Content-Disposition", 'attachment; filename="citation-export.csv"');
  // BOM for Excel Arabic compatibility
  res.send("\uFEFF" + csv);
});


// ── Delete citation metadata for a document ───────────────────────────────────
router.delete("/admin/knowledge/citation-metadata/:docId", requireAdmin, async (req, res): Promise<void> => {

  const docId = parseInt(req.params.docId as string, 10)
;

  if (isNaN(docId)) {
 res.status(400).json( {
 error: "معرّف غير صالح" 
}
)
;
 return
;
 
}

  const [doc] = await db.select( {
 id: knowledgeDocumentsTable.id 
}
)
    .from(knowledgeDocumentsTable).where(eq(knowledgeDocumentsTable.id, docId))
;

  if (!doc) {
 res.status(404).json( {
 error: "الوثيقة غير موجودة" 
}
)
;
 return
;
 
}

  await db.update(knowledgeDocumentsTable)
    .set( {
 caseMetadata: null as any, updatedAt: new Date() 
}
)
    .where(eq(knowledgeDocumentsTable.id, docId))
;

  res.json( {
 success: true 
}
)
;

}
)
;


// ── Manually edit citation metadata for a document ───────────────────────────
router.patch("/admin/knowledge/citation-metadata/:docId", requireAdmin, async (req, res): Promise<void> => {

  const docId = parseInt(req.params.docId as string, 10)
;

  if (isNaN(docId)) {
 res.status(400).json( {
 error: "معرّف غير صالح" 
}
)
;
 return
;
 
}


  const [doc] = await db
    .select( {
 caseMetadata: knowledgeDocumentsTable.caseMetadata 
}
)
    .from(knowledgeDocumentsTable)
    .where(eq(knowledgeDocumentsTable.id, docId))
;

  if (!doc) {
 res.status(404).json( {
 error: "الوثيقة غير موجودة" 
}
)
;
 return
;
 
}


  const existing = (doc.caseMetadata as Record<string, any>) ?? {
};

  const fields = ["caseNumber","rulingNumber","court","hijriDate","gregorianDate","litigationStage","disputeSubject","deedNumber"] as const
;

  const patch: Record<string, string | null> = {
};

  for (const f of fields) {

    if (req.body[f] !== undefined) patch[f] = req.body[f] ? String(req.body[f]).trim() || null : null
;

  
}

  const updated = {
 ...existing, ...patch 
};

  await db.update(knowledgeDocumentsTable)
    .set( {
 caseMetadata: updated as any, updatedAt: new Date() 
}
)
    .where(eq(knowledgeDocumentsTable.id, docId))
;

  res.json( {
 success: true, metadata: updated 
}
)
;

}
)
;


// ── Extract case metadata for a document (admin) ──────────────────────────────
router.post("/admin/knowledge/extract-metadata/:docId", requireAdmin, async (req, res): Promise<void> => {

  const docId = parseInt(req.params.docId as string, 10)
;

  if (isNaN(docId)) {
 res.status(400).json( {
 error: "معرّف غير صالح" 
}
)
;
 return
;
 
}


  const [doc] = await db.select( {

    extractedText: knowledgeDocumentsTable.extractedText,
    filename: knowledgeDocumentsTable.filename,
  
}
).from(knowledgeDocumentsTable).where(eq(knowledgeDocumentsTable.id, docId))
;


  if (!doc) {
 res.status(404).json( {
 error: "الوثيقة غير موجودة" 
}
)
;
 return
;
 
}

  if (!doc.extractedText) {
 res.status(400).json( {
 error: "لا نص مستخرج لهذه الوثيقة بعد" 
}
)
;
 return
;
 
}


  const meta = await extractCaseMetadata(doc.extractedText, doc.filename)
;

  let rejectedFields = 0
;

  if (meta) {

    // Explicit validation guard before persisting — defensive layer on top of
    // the internal call inside extractCaseMetadata.
    const validation = validateCaseMetadata(meta as unknown as Record<string, any>, doc.filename)
;

    rejectedFields = validation.rejectedCount
;

    await db.update(knowledgeDocumentsTable)
      .set( {
 caseMetadata: meta as any, updatedAt: new Date() 
}
)
      .where(eq(knowledgeDocumentsTable.id, docId))
;

  
}

  res.json( {
 success: true, extracted: !!meta, metadata: meta, rejectedFields 
}
)
;

}
)
;


// ── Semantic search in knowledge base (admin) ─────────────────────────────────
router.get("/admin/knowledge/search", requireAdmin, async (req, res): Promise<void> => {

  const q = (req.query.q as string ?? "").trim()
;

  if (!q || q.length < 2) {
 res.status(400).json( {
 error: "أدخل نصاً للبحث" 
}
)
;
 return
;
 
}


  try {

    const apiKey = getApiKey()
;

    const cat = (req.query.category as string | undefined) as any
;

    let chunks = await retrieveRelevantChunks(q, apiKey, 10, 0.40, cat || undefined, {
 multiQuery: true 
}
)
;

    if (chunks.length === 0 && cat) {

      chunks = await retrieveRelevantChunks(q, apiKey, 10, 0.40, undefined, {
 multiQuery: true 
}
)
;

    
}

    res.json( {
 results: chunks, query: q 
}
)
;

  
}
 catch (err: any) {

    res.status(500).json( {
 error: err?.message ?? "فشل البحث" 
}
)
;

  
}

}
)
;


// ── Full-text search in documents (title/filename) ────────────────────────────
router.get("/admin/knowledge/documents/search", requireAdmin, async (req, res): Promise<void> => {

  const q = (req.query.q as string ?? "").trim()
;

  const docs = await db
    .select()
    .from(knowledgeDocumentsTable)
    .where(q ? or(like(knowledgeDocumentsTable.filename, `%${q}%`)) : undefined)
;

  res.json(docs.map(d => ( {

    id: d.id, filename: d.filename, mimeType: d.mimeType, sourceUrl: d.sourceUrl,
    status: d.status, totalChunks: d.totalChunks, createdAt: d.createdAt,
  
}
)))
;

}
)
;


// ── Contract drafting (AI-powered) ────────────────────────────────────────────
router.post("/knowledge/draft-contract", requireAuth, async (req, res): Promise<void> => {

  const {
 description 
}
 = req.body as {
 description?: string 
};

  if (!description || description.trim().length < 10) {

    res.status(400).json( {
 error: "يرجى وصف العقد المطلوب (10 أحرف على الأقل)" 
}
)
;

    return
;

  
}


  // Subscription check (admins exempt)
  if (req.userRole !== "admin") {

    const activeSubs = await db.select().from(subscriptionsTable)
      .where(and(eq(subscriptionsTable.userId, req.userId!), eq(subscriptionsTable.status, "active")))
      .limit(1)
;

    const sub = activeSubs[0]
;

    if (!sub || sub.questionsAllowed <= 3) {

      res.status(403).json( {
 error: "صياغة العقود متاحة للمشتركين فقط", code: "UPGRADE_REQUIRED" 
}
)
;

      return
;

    
}

  
}


  try {

    const apiKey = getApiKey()
;

    const OpenAI = (await import("openai")).default
;

    const openai = new OpenAI( {
 apiKey 
}
)
;


    // Retrieve relevant contract templates from KB for context
    const chunks = await retrieveRelevantChunks(description, apiKey, 4, 0.40, "contract")
;

    const context = chunks.map(c => c.content).join("\n\n---\n\n")
;


    const resp = await openai.chat.completions.create( {

      model: "gpt-4o",
      temperature: 0.2,
      messages: [
        charterSystemMsg(),
        
{

          role: "system",
          content: `أنت محامٍ خبير في صياغة العقود القانونية السعودية وفق نظام الشركات ونظام العمل والأنظمة ذات الصلة.
عند صياغة العقد:
- اذكر البنود الأساسية كاملةً (طرفا العقد، موضوعه، المدة، المقابل المالي، الالتزامات، الإنهاء، التحكيم)
- استخدم الصياغة القانونية الرسمية
- اترك [    ] للبيانات المتغيرة (الأسماء والتواريخ والمبالغ)
- أضف في النهاية ملاحظة: "هذه الإجابة لا تعتبر ملزمة ويُنصح بمراجعة محامٍ مرخّص قبل الاستخدام الرسمي"

${context ? `نماذج مرجعية من قاعدة المعرفة:\n$ {
context
}
` : ""}`,
        
}
,
        
{

          role: "user",
          content: `اصِغ عقداً بناءً على الوصف التالي:\n${description.trim()}`,
        
}
,
      ],
    
}
)
;


    const draft = sanitizeOutput(resp.choices[0]?.message?.content ?? "")
;

    res.json( {
 draft 
}
)
;

  
}
 catch (err: any) {

    res.status(500).json( {
 error: err?.message ?? "فشل توليد العقد" 
}
)
;

  
}

}
)
;


// ── Contract draft sync (cross-device persistence) ────────────────────────────

/** GET /knowledge/contract-draft — fetch saved draft for the current user */
router.get("/knowledge/contract-draft", requireAuth, async (req, res): Promise<void> => {
  const rows = await db
    .select()
    .from(draftContractsTable)
    .where(eq(draftContractsTable.userId, req.userId!))
    .limit(1);

  if (!rows.length) {
    res.json({ draft: null });
    return;
  }
  res.json({ draft: rows[0] });
});

/** PUT /knowledge/contract-draft — upsert draft for the current user */
router.put("/knowledge/contract-draft", requireAuth, async (req, res): Promise<void> => {
  const { description = "", draft = "", editedDraft = "" } = req.body as {
    description?: string;
    draft?: string;
    editedDraft?: string;
  };

  if (!draft && !editedDraft) {
    res.status(400).json({ error: "draft or editedDraft is required" });
    return;
  }

  const [row] = await db
    .insert(draftContractsTable)
    .values({
      userId: req.userId!,
      description,
      draft,
      editedDraft,
      updatedAt: new Date(),
    })
    .onConflictDoUpdate({
      target: draftContractsTable.userId,
      set: {
        description,
        draft,
        editedDraft,
        updatedAt: new Date(),
      },
    })
    .returning();

  res.json({ draft: row });
});

/** DELETE /knowledge/contract-draft — clear saved draft for the current user */
router.delete("/knowledge/contract-draft", requireAuth, async (req, res): Promise<void> => {
  await db
    .delete(draftContractsTable)
    .where(eq(draftContractsTable.userId, req.userId!));
  res.json({ ok: true });
});

// ── List indexed circular documents (browsable index — free for all auth'd users) ──
router.get("/knowledge/circulars", requireAuth, async (req, res): Promise<void> => {
  // Browse list is free — no subscription required. AI detail/search remain gated.

  const docs = await db
    .select({
      id: knowledgeDocumentsTable.id,
      filename: knowledgeDocumentsTable.filename,
      createdAt: knowledgeDocumentsTable.createdAt,
      totalChunks: knowledgeDocumentsTable.totalChunks,
      sourceUrl: knowledgeDocumentsTable.sourceUrl,
    })
    .from(knowledgeDocumentsTable)
    .where(and(
      eq(knowledgeDocumentsTable.status, "indexed"),
      eq(knowledgeDocumentsTable.category as any, "circular"),
      isNull(knowledgeDocumentsTable.archivedAt),
    ))
    .orderBy(desc(knowledgeDocumentsTable.createdAt));

  res.json({ circulars: docs });
});

// ── Get AI-structured detail for a single circular document ──────────────────
router.get("/knowledge/circulars/:id", requireAuth, async (req, res): Promise<void> => {
  if (req.userRole !== "admin") {
    const activeSubs = await db.select().from(subscriptionsTable)
      .where(and(eq(subscriptionsTable.userId, req.userId!), eq(subscriptionsTable.status, "active")))
      .limit(1);
    const sub = activeSubs[0];
    if (!sub || sub.questionsAllowed <= 3) {
      res.status(403).json({ error: "الباحث القانوني متاح للمشتركين فقط", code: "UPGRADE_REQUIRED" });
      return;
    }
  }

  const id = parseInt(req.params.id, 10);
  if (isNaN(id)) { res.status(400).json({ error: "معرّف غير صالح" }); return; }

  const [doc] = await db
    .select({
      id: knowledgeDocumentsTable.id,
      filename: knowledgeDocumentsTable.filename,
      extractedText: knowledgeDocumentsTable.extractedText,
      structuredData: knowledgeDocumentsTable.structuredData,
      createdAt: knowledgeDocumentsTable.createdAt,
    })
    .from(knowledgeDocumentsTable)
    .where(and(
      eq(knowledgeDocumentsTable.id, id),
      eq(knowledgeDocumentsTable.status, "indexed"),
      eq(knowledgeDocumentsTable.category as any, "circular"),
      isNull(knowledgeDocumentsTable.archivedAt),
    ));

  if (!doc) { res.status(404).json({ error: "المستند غير موجود" }); return; }
  if (!doc.extractedText) {
    res.status(400).json({ error: "لا يوجد نص محفوظ لهذا التعميم" });
    return;
  }

  // ── Return cached structured data if available ────────────────────────────
  if (doc.structuredData && Object.keys(doc.structuredData).length > 0) {
    res.json({ circular: doc.structuredData, id: doc.id, filename: doc.filename, createdAt: doc.createdAt, cached: true });
    return;
  }

  try {
    const apiKey = getApiKey();
    const OpenAI = (await import("openai")).default;
    const openai = new OpenAI({ apiKey });

    const textSample = doc.extractedText.slice(0, 8000);

    const systemPrompt = `أنت باحث قانوني متخصص في الوثائق الرسمية السعودية.
مهمتك استخراج وهيكلة بيانات هذه الوثيقة وفق القالب الإلزامي.

قواعد صارمة غير قابلة للاستثناء:
١. لا تستخرج إلا ما هو وارد صراحةً في النص — لا تخمّن ولا تكمل ولا تستنتج.
٢. كل رقم أو تاريخ يُكتب حرفياً كما ورد. غير الموثق يُترك null أو "غير محدد".
٣. التواريخ الهجرية تُذكر كما وردت؛ الميلادية تُضاف بين قوسين إن وُجدت في النص.
٤. opening_para تُصاغ: "صدر [نوع] رقم [رقم] وتاريخ [تاريخ]هـ، بناءً على [السند]، لتقرير [الغرض]." — إذا عُدم السند أو الغرض في النص فاحذفه من الجملة.
٥. highlights: فقط ما ورد في النص من: الحكم أو الإجراء المقرر | نطاق التطبيق | الفئات المشمولة | تاريخ السريان | الاستثناءات — عنوان قصير بارز ثم شرحه. ما لم يُذكر يُحذف.
٦. objectives: تُستخرج فقط إذا ذُكرت صراحةً في النص.

أعد النتيجة حصراً بتنسيق JSON:
{
  "title": "عنوان قصير وصفي يصف موضوع الوثيقة",
  "type": "تعميم قضائي | قرار وزاري | أمر سامٍ | مبدأ قضائي | لائحة | غير محدد",
  "issuer": "اسم الجهة المصدرة",
  "number": "رقم التعميم أو null",
  "date": "التاريخ",
  "date_hijri": "التاريخ الهجري أو null",
  "date_gregorian": "التاريخ الميلادي بين قوسين أو null",
  "basis": "السند الذي صدر بناءً عليه أو null",
  "purpose": "الغرض الصريح أو null",
  "opening_para": "الفقرة الافتتاحية الجاهزة (جملة واحدة) أو null",
  "highlights": [{"title": "عنوان النقطة", "detail": "شرحها من النص"}],
  "objectives": ["هدف 1"] ,
  "status": "نافذ | معدل | ملغى | غير واضح",
  "addressees": "الجهات أو الفئات المخاطبة",
  "text": "النص الحرفي الكامل أو الجوهري للتعميم",
  "summary": "ملخص مختصر ودقيق",
  "practical_effect": "ما يترتب على هذا التعميم عملياً للمستفيد",
  "url": "الرابط الرسمي إن وُجد وإلا اتركه فارغاً",
  "relation_note": "ملاحظة حول علاقته بتعاميم أخرى إن وجدت"
}`;

    const resp = await openai.chat.completions.create({
      model: "gpt-4o",
      temperature: 0.1,
      response_format: { type: "json_object" },
      messages: [
        charterSystemMsg(),
        { role: "system", content: systemPrompt },
        { role: "user", content: `نص التعميم:\n${textSample}` },
      ],
    });

    const raw = resp.choices[0]?.message?.content ?? "{}";
    let parsed: any;
    try { parsed = JSON.parse(raw); } catch { parsed = {}; }

    // Fallback: use filename if issuer is empty
    if (!parsed.issuer || parsed.issuer === "غير محدد") {
      parsed.issuer = doc.filename;
    }

    // ── Persist the analysis so subsequent opens are instant ─────────────────
    await db
      .update(knowledgeDocumentsTable)
      .set({ structuredData: parsed, updatedAt: new Date() })
      .where(eq(knowledgeDocumentsTable.id, doc.id));

    res.json({ circular: parsed, id: doc.id, filename: doc.filename, createdAt: doc.createdAt, cached: false });
  } catch (err: any) {
    res.status(500).json({ error: err?.message ?? "فشل معالجة التعميم" });
  }
});


// ── Circular search agent (AI-structured results) ────────────────────────────
router.post("/knowledge/search-circular", requireAuth, async (req, res): Promise<void> => {
  const { topic } = req.body as { topic?: string };
  if (!topic || topic.trim().length < 2) {
    res.status(400).json({ error: "أدخل موضوع البحث (حرفان على الأقل)" });
    return;
  }

  // Subscription check (admins exempt)
  if (req.userRole !== "admin") {
    const activeSubs = await db.select().from(subscriptionsTable)
      .where(and(eq(subscriptionsTable.userId, req.userId!), eq(subscriptionsTable.status, "active")))
      .limit(1);
    const sub = activeSubs[0];
    if (!sub || sub.questionsAllowed <= 3) {
      res.status(403).json({ error: "الباحث القانوني متاح للمشتركين فقط", code: "UPGRADE_REQUIRED" });
      return;
    }
  }

  try {
    const apiKey = getApiKey();
    const OpenAI = (await import("openai")).default;
    const openai = new OpenAI({ apiKey });

    // Retrieve relevant chunks — Phase-1 engine: multi-query + RRF + literal match priority
    // Prefer circular category, fallback to all docs.
    let chunks = await retrieveRelevantChunks(topic, apiKey, 12, 0.30, "circular", { multiQuery: true, autoLink: true });
    let usedFallback = false;
    if (chunks.length === 0) {
      chunks = await retrieveRelevantChunks(topic, apiKey, 12, 0.30, undefined, { multiQuery: true, autoLink: true });
      usedFallback = chunks.length > 0;
    }

    if (chunks.length === 0) {
      res.json({
        circulars: [],
        fallback: false,
        message: "تعذر العثور على تعميم رسمي موثق ومتاح في قاعدة المعرفة يتعلق بالموضوع المطلوب.",
      });
      return;
    }

    const context = chunks.map((c, i) => `[مقطع ${i + 1}]\n${c.content}`).join("\n\n---\n\n");

    const systemPrompt = `أنت باحث قانوني ذكي متخصص في البحث عن التعاميم الرسمية في المملكة العربية السعودية.

مهمتك: استخراج وتنظيم التعاميم من النصوص المُقدَّمة إليك من قاعدة المعرفة.

قواعد صارمة:
- لا تخترع أي رقم تعميم أو تاريخ أو جهة أو رابط — استخرجها فقط مما هو موجود في النصوص.
- إذا لم تجد معلومة معينة في النصوص فاترك الحقل فارغاً أو ضع "غير محدد".
- لا تخلط بين النص الحرفي وبين تحليلك.
- رتّب التعاميم من الأحدث إلى الأقدم.
- إذا كان تعميم يعدّل أو يلغي تعميماً آخر، بيّن ذلك في حقل status.

أعد الإجابة حصراً بتنسيق JSON صالح بالبنية التالية (بدون أي نص خارج الـ JSON): {
  "circulars": [ {
      "issuer": "اسم الجهة المصدرة",
      "number": "رقم التعميم",
      "date": "التاريخ",
      "status": "نافذ | معدل | ملغى | غير واضح",
      "addressees": "الجهات أو الفئات المخاطبة",
      "text": "النص الحرفي ذو الصلة المنقول من المصدر",
      "summary": "ملخص مختصر ودقيق لمضمون التعميم",
      "practical_effect": "ما يترتب على هذا التعميم عملياً للمستفيد",
      "url": "الرابط الرسمي إن وُجد في النص وإلا اتركه فارغاً",
      "relation_note": "ملاحظة حول علاقته بتعاميم أخرى إن وجدت"
    }
  ]
}

إذا لم يُعثر على أي تعميم موثق في النصوص، أعد: {"circulars": [], "not_found": true}`;

    const resp = await openai.chat.completions.create({
      model: "gpt-4o",
      temperature: 0.1,
      response_format: { type: "json_object" },
      messages: [
        charterSystemMsg(),
        { role: "system", content: systemPrompt }, {
          role: "user",
          content: `الموضوع المطلوب: ${topic.trim()}\n\nالنصوص من قاعدة المعرفة:\n\n${context}`,
        },
      ],
    });

    const raw = resp.choices[0]?.message?.content ?? "{}";
    let parsed: any;
    try { parsed = JSON.parse(raw); } catch { parsed = { circulars: [] }; }

    if (parsed.not_found || !parsed.circulars?.length) {
      res.json({
        circulars: [],
        fallback: usedFallback,
        message: "تعذر العثور على تعميم رسمي موثق ومتاح في قاعدة المعرفة يتعلق بالموضوع المطلوب.",
      });
      return;
    }

    res.json({ circulars: parsed.circulars, fallback: usedFallback });
  } catch (err: any) {
    res.status(500).json({ error: err?.message ?? "فشل البحث" });
  }
});

// ── Practical legal research report ──────────────────────────────────────────
router.post("/knowledge/legal-research", requireAuth, async (req, res): Promise<void> => {
  const { question, requestId } = req.body as { question?: string; requestId?: string };
  if (!question || question.trim().length < 10) {
    res.status(400).json({ error: "يرجى وصف وضعك القانوني (10 أحرف على الأقل)" });
    return;
  }

  if (req.userRole !== "admin") {
    const activeSubs = await db.select().from(subscriptionsTable)
      .where(and(eq(subscriptionsTable.userId, req.userId!), eq(subscriptionsTable.status, "active")))
      .limit(1);
    const sub = activeSubs[0];
    if (!sub || sub.questionsAllowed <= 3) {
      res.status(403).json({ error: "البحث القانوني الشامل متاح للمشتركين فقط", code: "UPGRADE_REQUIRED" });
      return;
    }
  }

  try {
    const apiKey = getApiKey();
    const OpenAI = (await import("openai")).default;
    const openai = new OpenAI({ apiKey });

    // Notify client that live web search is starting
    if (requestId) emitResearchPhase(requestId, "searching");

    // Retrieve relevant chunks — Phase-1 engine: multi-query + RRF + literal match + auto-link
    const [chunks, tavilyResults] = await Promise.all([
      retrieveRelevantChunks(question, apiKey, 12, 0.40, undefined, { multiQuery: true, autoLink: true }),
      searchLegalSources(question, 5).catch(() => []),
    ]);

    const kbContext = chunks.length > 0
      ? chunks.map((c, i) => {
          const matchNote = c.literalMatch ? " [مطابقة حرفية]" : "";
          return `[مرجع قاعدة المعرفة ${i + 1}${matchNote}]\n${c.content}`;
        }).join("\n\n---\n\n")
      : "";

    const webContext = tavilyResults.length > 0
      ? formatSearchContext(tavilyResults)
      : "";

    const today = new Date().toLocaleDateString("ar-SA-u-ca-islamic", {
      year: "numeric", month: "long", day: "numeric",
    });

    const systemPrompt = `أنت باحث قانوني أول متخصص في المنظومة التشريعية السعودية والخليجية.
مهمتك الوحيدة: إعداد تقرير قانوني عملي احترافي يُغني صاحبه عن الكلام العام.
التاريخ اليوم: ${today}

══════════════════════════════════════════
مبادئ الجودة (لا تحيد عنها)
══════════════════════════════════════════
١. المواد النظامية — استشهد بنص المادة حرفياً إن كان في المصادر المُقدَّمة.
   • صيغة الاستشهاد: «المادة (X) من نظام [الاسم] الصادر بالمرسوم الملكي رقم [م/X] وتاريخ [سنة]هـ تنص: "..."»
   • إن لم تجد النص الحرفي → اذكر المادة والنظام وأُشر إلى أن الاطلاع يكون من المصدر الرسمي laws.boe.gov.sa
   • لا تختلق مادة أو نصاً غير موجود في المصادر.

٢. الملاحظة بالمصدر — كل معلومة يجب أن ترتبط بمصدرها (قاعدة المعرفة، أو الويب، أو المعرفة القانونية العامة الموثقة).

٣. العملية — التقرير يُفيد المستخدم بخطوات يستطيع تطبيقها فوراً، لا مجرد توصيف.

٤. الأمانة — إذا كانت المعلومات غير كافية أو القضية تستوجب محامياً، صرّح بذلك في الموضع المناسب.

══════════════════════════════════════════
هيكل الإخراج — JSON صالح فقط بلا نص خارجه
══════════════════════════════════════════ {
  "summary": "ملخص تنفيذي للوضع القانوني: طبيعة المسألة، الإطار النظامي الحاكم، الجهة المختصة (4-6 أسطر بلغة قانونية واضحة)",

  "articles": [ {
      "law": "اسم النظام",
      "article": "رقم المادة",
      "text": "النص الحرفي للمادة أو ملاحظة '→ للاطلاع على النص الكامل: laws.boe.gov.sa'",
      "relevance": "وجه صلتها بالقضية"
    }
  ],

  "strengths": ["نقطة قوة قانونية مُسبَّبة ومرتبطة بمادة أو حكم محدد"],
  "weaknesses": ["نقطة ضعف أو مخاطرة مُسبَّبة مع ذكر الأثر القانوني المترتب"],

  "options": [ {
      "title": "عنوان الخيار",
      "description": "وصف الخيار، الجهة المختصة، إجراءات التقديم، التكلفة التقريبية إن عُلمت",
      "pros": "مزايا هذا الخيار",
      "cons": "مساوئه أو قيوده",
      "recommendation": "الأنسب | مناسب | محدود | غير مناسب"
    }
  ],

  "procedure_steps": [
    { "step": 1, "action": "الإجراء المطلوب", "authority": "الجهة المختصة", "note": "ملاحظة أو شرط" }
  ],

  "key_deadlines": [
    { "event": "اسم المهلة أو الإجراء", "duration": "المدة (مثال: 30 يوماً من تاريخ...)", "source": "المادة أو المرجع" }
  ],

  "memo": "المذكرة القانونية الرسمية الكاملة بصياغة مرتبة تشمل:\\n• بيانات المذكرة (الموضوع، التاريخ)\\n• الوقائع كما وردت\\n• التكييف القانوني مع الاستشهاد بالمواد\\n• الطلبات أو التوصيات\\n• الخاتمة",

  "references": [
    { "title": "اسم المرجع / النظام / الحكم", "excerpt": "النص المقتبس أو وجه الصلة", "source_type": "قاعدة_المعرفة | ويب | معرفة_قانونية" }
  ],

  "disclaimer": "هذا التقرير لأغراض البحث والتوعية القانونية فحسب ولا يُعدّ استشارة قانونية ملزمة. يُنصح بمراجعة محامٍ مرخّص قبل اتخاذ أي إجراء رسمي."
}`;

    const userContent = `الوضع القانوني المطلوب بحثه:\n${question.trim()}`
      + (kbContext ? `\n\n══ مصادر قاعدة المعرفة الداخلية ══\n${kbContext}` : "")
      + (webContext ? `\n\n══ مصادر ويب رسمية (Tavily) ══\n${webContext}` : "");

    // Notify client that Tavily is done and AI synthesis is starting
    if (requestId) emitResearchPhase(requestId, "generating");

    const resp = await openai.chat.completions.create({
      model: "gpt-4o",
      temperature: 0.10,
      response_format: { type: "json_object" },
      messages: [
        charterSystemMsg(),
        { role: "system", content: systemPrompt },
        { role: "user", content: userContent },
      ],
    });

    const raw = resp.choices[0]?.message?.content ?? "{}";
    let parsed: any;
    try { parsed = JSON.parse(raw); } catch { parsed = {}; }

    // ── Verify articles against retrieved sources ─────────────────────────
    const rawArticles: Array<{ law: string; article: string; text: string; relevance: string }> =
      Array.isArray(parsed.articles) ? parsed.articles : [];
    const verifiedArticles = verifyArticles(rawArticles, chunks, tavilyResults);

    // Compute report confidence: high if ≥70% articles verified, medium ≥40%, else low
    const verifiedCount = verifiedArticles.filter(a => a.verified).length;
    const totalArticles = verifiedArticles.length;
    const articleVerifyRate = totalArticles > 0 ? verifiedCount / totalArticles : 1;
    const reportConfidence =
      articleVerifyRate >= 0.70 && chunks.length >= 3 ? "high" :
      articleVerifyRate >= 0.40 || chunks.length >= 1 ? "medium" : "low";

    const highQualityKB = chunks.filter(c => c.similarity >= 0.42);
    const sufficientSources = highQualityKB.length >= 3 ||
      (highQualityKB.length >= 1 && tavilyResults.length >= 2) ||
      tavilyResults.length >= 3;

    // ── Append citations section to memo ────────────────────────────────────
    const citableChunks = chunks.filter(c => c.caseMetadata != null || c.pageStart != null);
    const memoBase = (parsed.memo ?? "").trim();

    let memoWithCitations: string;
    if (citableChunks.length > 0) {
      const refLines: string[] = [
        "",
        "══════════════════════════════════════════",
        "المراجع المُستشهد بها",
        "══════════════════════════════════════════",
      ];
      citableChunks.forEach((c, idx) => {
        const m = c.caseMetadata as Record<string, string | null | undefined> | null;
        const parts: string[] = [];
        if (m?.court)           parts.push(m.court as string);
        if (m?.litigationStage) parts.push(m.litigationStage as string);
        if (m?.caseNumber)      parts.push(`قضية رقم: ${m.caseNumber}`);
        if (m?.rulingNumber)    parts.push(`حكم رقم: ${m.rulingNumber}`);
        if (m?.hijriDate || m?.gregorianDate) {
          const dates = [
            m?.hijriDate   ? `${m.hijriDate}هـ`   : null,
            m?.gregorianDate ? `${m.gregorianDate}م` : null,
          ].filter(Boolean);
          parts.push(`بتاريخ: ${dates.join(" / ")}`);
        }
        parts.push(`المصدر: ${c.documentName}`);
        if (c.pageStart != null) parts.push(`ص${c.pageStart}`);
        refLines.push(`${idx + 1}. ${parts.join("، ")}`);
      });
      refLines.push(
        "══════════════════════════════════════════",
        "⚠️ هذه المذكرة للاستئناس فقط ولا تُعدّ استشارة قانونية ملزمة — يُنصح بمراجعة محامٍ مرخّص قبل الاستخدام الرسمي.",
      );
      memoWithCitations = memoBase + "\n" + refLines.join("\n");
    } else {
      // No citable sources — server-side enforcement: return ONLY the warning
      // (no memo body) so the uncited draft is not accessible even via direct API calls.
      memoWithCitations = [
        "══════════════════════════════════════════",
        "تنبيه: لم تُوثَّق مصادر الاستشهاد لهذه المذكرة",
        "══════════════════════════════════════════",
        "لا يمكن تصدير هذه المذكرة لأنها لم تستند إلى مصادر موثّقة من قاعدة المعرفة.",
        "يُنصح بإعادة البحث بمعلومات أكثر تفصيلاً أو مراجعة محامٍ مرخّص.",
        "══════════════════════════════════════════",
      ].join("\n");
    }

    if (requestId) emitResearchPhase(requestId, "done");
    res.json({
      summary:          parsed.summary          ?? "",
      articles:         verifiedArticles,
      strengths:        parsed.strengths         ?? [],
      weaknesses:       parsed.weaknesses        ?? [],
      options:          parsed.options           ?? [],
      procedure_steps:  parsed.procedure_steps   ?? [],
      key_deadlines:    parsed.key_deadlines     ?? [],
      memo:             memoWithCitations,
      hasCitations:     citableChunks.length > 0,
      citableCount:     citableChunks.length,
      references:       parsed.references        ?? [],
      disclaimer:       parsed.disclaimer        ?? "",
      sources_used:     { kb: chunks.length, web: tavilyResults.length },
      verification: {
        confidence: reportConfidence,
        verifiedArticles: verifiedCount,
        totalArticles,
        sufficientSources,
        blockedCount: verifiedArticles.filter(a => !a.verified).length,
        sources: highQualityKB.slice(0, 6).map(c => ({
          name: c.documentName,
          similarity: Math.round(c.similarity * 100),
          verified: true,
          snippet: c.content.slice(0, 180).trim(),
          sourceType: "kb" as const,
        })).concat(
          tavilyResults.slice(0, 3).map(r => ({
            name: r.title,
            similarity: Math.round((r.score ?? 0.5) * 100),
            verified: true,
            snippet: r.content.slice(0, 180).trim(),
            sourceType: "web" as const,
            url: r.url,
          }))
        ),
        auditTs: new Date().toISOString(),
      },
    });
  } catch (err: any) {
    if (requestId) emitResearchPhase(requestId, "done");
    res.status(500).json({ error: err?.message ?? "فشل إعداد البحث" });
  }
});

// ── Public preview search (no auth — max 2 results, no source names) ──────────
router.get("/knowledge/preview-search", previewSearchRateLimit, async (req, res): Promise<void> => {
  const q = (req.query.q as string ?? "").trim();
  if (!q || q.length < 2) { res.status(400).json({ error: "أدخل نصاً للبحث" }); return; }
  if (q.length > 150)      { res.status(400).json({ error: "الاستعلام طويل جداً" }); return; }

  try {
    const apiKey = getApiKey();
    const chunks = await retrieveRelevantChunks(q, apiKey, 2, 0.50, undefined);

    // Strip source names and truncate content for preview
    const preview = chunks.map(c => ({
      excerpt: c.content.slice(0, 220).trim() + (c.content.length > 220 ? "..." : ""),
      similarity: Math.round(c.similarity * 100),
    }));

    res.json({ results: preview, hasMore: true });
  } catch (err: any) {
    res.status(500).json({ error: "فشل البحث" });
  }
});

// ── Public KB stats (no auth — counts for marketing display) ─────────────────
router.get("/knowledge/stats", async (_req, res): Promise<void> => {
  try {
    const rows = await db
      .select({
        category: knowledgeDocumentsTable.category,
        count: sql<number>`cast(count(*) as int)`,
        chunks: sql<number>`cast(coalesce(sum(${knowledgeDocumentsTable.totalChunks}),0) as int)`,
      })
      .from(knowledgeDocumentsTable)
      .where(
        and(
          isNull(knowledgeDocumentsTable.archivedAt),
          eq(knowledgeDocumentsTable.status, "indexed"),
        ),
      )
      .groupBy(knowledgeDocumentsTable.category);

    const byCategory: Record<string, number> = {};
    let totalDocs = 0;
    let totalChunks = 0;
    for (const row of rows) {
      const cat = row.category ?? "general";
      byCategory[cat] = (byCategory[cat] ?? 0) + row.count;
      totalDocs += row.count;
      totalChunks += row.chunks;
    }

    res.json({
      judicial:   byCategory["judicial"]   ?? 0,
      circular:   byCategory["circular"]   ?? 0,
      regulation: byCategory["regulation"] ?? 0,
      general:    byCategory["general"]    ?? 0,
      contract:   byCategory["contract"]   ?? 0,
      totalDocs,
      totalChunks,
    });
  } catch {
    res.status(500).json({ error: "فشل جلب الإحصائيات" });
  }
});

// ── Full re-index all documents from original file binary ─────────────────────
// Uses fileData (raw binary) so the new text-direction fix + page-exclusion
// logic are applied from scratch — does NOT reuse stored extractedText.
router.post("/admin/knowledge/reindex-all", requireAdmin, async (req, res): Promise<void> => {
  const docs = await db
    .select({
      id: knowledgeDocumentsTable.id,
      filename: knowledgeDocumentsTable.filename,
      mimeType: knowledgeDocumentsTable.mimeType,
      fileData: knowledgeDocumentsTable.fileData,
    })
    .from(knowledgeDocumentsTable)
    .where(isNull(knowledgeDocumentsTable.archivedAt));

  const indexable = docs.filter(d => d.fileData && (d.fileData as Buffer).length > 0);
  if (indexable.length === 0) {
    res.json({ queued: 0, message: "لا توجد ملفات مُخزَّنة قابلة للفهرسة — الوثائق المضافة برابط URL لا تدعم إعادة الفهرسة" });
    return;
  }

  const jobId = `reindex-all-${Date.now()}`;
  const job: BulkJob = { total: indexable.length, done: 0, failed: 0, running: true, log: [] };
  bulkJobs.set(jobId, job);

  // Run in background — do NOT await
  (async () => {
    for (const doc of indexable) {
      try {
        logJob(job, `فهرسة: ${doc.filename}`);
        await indexDocument(doc.id, Buffer.from(doc.fileData as Buffer), doc.mimeType ?? "application/octet-stream", doc.filename);
        job.done++;
        logJob(job, `✓ ${doc.filename} (${job.done}/${job.total})`);
      } catch (err: any) {
        job.failed++;
        logJob(job, `✗ ${doc.filename}: ${err?.message ?? 'خطأ غير معروف'}`);
      }
    }
    job.running = false;
    logJob(job, `اكتمل: نجح ${job.done}، فشل ${job.failed}`);
  })().catch(() => { job.running = false; });

  res.json({
    jobId,
    total: indexable.length,
    message: `بدأت إعادة الفهرسة الكاملة في الخلفية — ${indexable.length} وثيقة`,
  });
});

// ── Reindex job status ────────────────────────────────────────────────────────
router.get("/admin/knowledge/reindex-status/:jobId", requireAdmin, async (req, res): Promise<void> => {
  const job = bulkJobs.get(req.params.jobId as string);
  if (!job) { res.status(404).json({ error: "مهمة غير موجودة أو انتهت" }); return; }
  res.json(job);
});

// ── Re-fill pageStart/pageEnd for existing chunks (PDF docs only) ─────────────
// Does NOT re-embed — only updates page numbers on already-indexed chunks.
router.post("/admin/knowledge/reindex-all-pages", requireAdmin, async (req, res): Promise<void> => {
  const docs = await db
    .select({
      id: knowledgeDocumentsTable.id,
      filename: knowledgeDocumentsTable.filename,
      mimeType: knowledgeDocumentsTable.mimeType,
      fileData: knowledgeDocumentsTable.fileData,
    })
    .from(knowledgeDocumentsTable)
    .where(and(
      isNull(knowledgeDocumentsTable.archivedAt),
      eq(knowledgeDocumentsTable.status, "indexed"),
    ));

  // Only PDF docs that have stored binary data
  const pdfDocs = docs.filter(d => {
    if (!d.fileData || (d.fileData as Buffer).length === 0) return false;
    const f = d.filename.toLowerCase();
    const m = d.mimeType ?? "";
    return f.endsWith(".pdf") || m.includes("pdf");
  });

  if (pdfDocs.length === 0) {
    res.json({ queued: 0, message: "لا توجد ملفات PDF مخزّنة قابلة لاستخراج أرقام الصفحات" });
    return;
  }

  // Extended job with extra counters
  interface PageJob extends BulkJob { chunksUpdated: number; }
  const jobId = `reindex-pages-${Date.now()}`;
  const job: PageJob = { total: pdfDocs.length, done: 0, failed: 0, running: true, log: [], chunksUpdated: 0 };
  bulkJobs.set(jobId, job);

  (async () => {
    for (const doc of pdfDocs) {
      try {
        logJob(job, `معالجة: ${doc.filename}`);
        const buf = Buffer.from(doc.fileData as Buffer);
        const { text: fullText, pageBoundaries } = await extractPdfWithPages(buf);

        if (pageBoundaries.length === 0) {
          job.done++;
          logJob(job, `⚠ ${doc.filename}: لم تُستخرج حدود صفحات`);
          continue;
        }

        // Load all chunks for this document
        const chunks = await db
          .select({ id: knowledgeChunksTable.id, content: knowledgeChunksTable.content })
          .from(knowledgeChunksTable)
          .where(eq(knowledgeChunksTable.documentId, doc.id));

        let updated = 0;
        for (const chunk of chunks) {
          // Fingerprint-based page lookup (same logic as getChunkPages in document-indexer.ts)
          const fingerprint = chunk.content.slice(0, 80);
          const pos = fullText.indexOf(fingerprint);
          if (pos === -1) continue;
          const endPos = pos + chunk.content.length - 1;
          let pageStart: number | null = null;
          let pageEnd: number | null = null;
          for (const b of pageBoundaries) {
            if (pageStart === null && pos <= b.endChar) pageStart = b.pageNum;
            if (endPos <= b.endChar) { pageEnd = b.pageNum; break; }
            pageEnd = b.pageNum;
          }
          if (pageStart !== null) {
            await db
              .update(knowledgeChunksTable)
              .set({ pageStart, pageEnd: pageEnd ?? pageStart })
              .where(eq(knowledgeChunksTable.id, chunk.id));
            updated++;
          }
        }

        job.done++;
        (job as PageJob).chunksUpdated += updated;
        logJob(job, `✓ ${doc.filename}: ${updated}/${chunks.length} مقطع حصل على رقم صفحة`);
      } catch (err: any) {
        job.failed++;
        logJob(job, `✗ ${doc.filename}: ${err?.message?.slice(0, 60) ?? "خطأ"}`);
      }
    }
    job.running = false;
    logJob(job, `اكتمل: نجح ${job.done}، فشل ${job.failed}، مقاطع محدّثة: ${(job as PageJob).chunksUpdated}`);
    setTimeout(() => bulkJobs.delete(jobId), 30 * 60 * 1000);
  })().catch(() => { job.running = false; });

  res.json({ jobId, total: pdfDocs.length, message: `بدأ استخراج أرقام الصفحات في الخلفية — ${pdfDocs.length} وثيقة PDF` });
});

// ── Extract caseMetadata for all judicial docs that lack it ───────────────────
// Covers two cases:
//  1. caseMetadata IS NULL  — never processed
//  2. caseMetadata is non-null but missing both caseNumber AND rulingNumber —
//     extracted by the old 3 000-char window which missed the court stamp at the tail
router.post("/admin/knowledge/extract-all-metadata", requireAdmin, async (req, res): Promise<void> => {
  // force=true → process ALL judicial docs regardless of existing caseMetadata
  const force = req.body?.force === true || req.query.force === "true";

  const baseConditions = and(
    isNull(knowledgeDocumentsTable.archivedAt),
    eq(knowledgeDocumentsTable.status, "indexed"),
    eq(knowledgeDocumentsTable.category as any, "judicial"),
  );

  const whereClause = force
    ? baseConditions
    : and(
        baseConditions,
        or(
          isNull(knowledgeDocumentsTable.caseMetadata),
          // Old-algorithm docs: have metadata but no case/ruling number
          sql`(${knowledgeDocumentsTable.caseMetadata}->>'caseNumber' IS NULL AND ${knowledgeDocumentsTable.caseMetadata}->>'rulingNumber' IS NULL)`,
        ),
      );

  const docs = await db
    .select({
      id: knowledgeDocumentsTable.id,
      filename: knowledgeDocumentsTable.filename,
      extractedText: knowledgeDocumentsTable.extractedText,
    })
    .from(knowledgeDocumentsTable)
    .where(whereClause);

  const eligible = docs.filter(d => d.extractedText && d.extractedText.length > 20);

  if (eligible.length === 0) {
    res.json({ queued: 0, message: force ? "لا توجد وثائق قضائية للمعالجة" : "لا توجد وثائق قضائية تحتاج استخراج بيانات الاستشهاد" });
    return;
  }

  // Extended job with metadata + validation-rejection counters
  interface MetaJob extends BulkJob { extracted: number; rejectedFields: number; affectedDocs: number; sanitized: number; forceMode: boolean; }
  const jobId = `extract-meta-${Date.now()}`;
  const job: MetaJob = { total: eligible.length, done: 0, failed: 0, running: true, log: [], extracted: 0, rejectedFields: 0, affectedDocs: 0, sanitized: 0, forceMode: force };
  bulkJobs.set(jobId, job);

  (async () => {
    for (const doc of eligible) {
      try {
        logJob(job, `استخراج: ${doc.filename}`);
        const meta = await extractCaseMetadata(doc.extractedText!, doc.filename);
        if (meta) {
          // Explicit validation guard before persisting — ensures corrupt fields
          // are nulled out even if the internal call inside extractCaseMetadata
          // is bypassed or skipped in a future refactor.
          const { rejectedCount } = validateCaseMetadata(meta as unknown as Record<string, any>, doc.filename);
          (job as MetaJob).rejectedFields += rejectedCount;
          if (rejectedCount > 0) {
            (job as MetaJob).affectedDocs++;
            logJob(job, `⚠️ ${doc.filename}: رُفض ${rejectedCount} حقل بالتحقق`);
          }
          await db
            .update(knowledgeDocumentsTable)
            .set({ caseMetadata: meta as any, updatedAt: new Date() })
            .where(eq(knowledgeDocumentsTable.id, doc.id));
          (job as MetaJob).extracted++;
          logJob(job, `✓ ${doc.filename}: استُخرجت البيانات`);
        } else {
          logJob(job, `— ${doc.filename}: لم تُستخرج بيانات (ليس حكماً قضائياً)`);
        }
        job.done++;
      } catch (err: any) {
        job.failed++;
        logJob(job, `✗ ${doc.filename}: ${err?.message?.slice(0, 60) ?? "خطأ"}`);
      }
    }
    // ── تنظيف تلقائي: حذف caseMetadata للوثائق التي فشلت جميع حقولها الجوهرية ──
    let cleanedCount = 0;
    let cleanedDocNames: string[] = [];
    try {
      // نجلب الوثائق القضائية التي لديها caseMetadata لكن الحقول الثلاثة الجوهرية كلها null
      const corruptDocs = await db
        .select({ id: knowledgeDocumentsTable.id, filename: knowledgeDocumentsTable.filename })
        .from(knowledgeDocumentsTable)
        .where(and(
          isNull(knowledgeDocumentsTable.archivedAt),
          eq(knowledgeDocumentsTable.status, "indexed"),
          eq(knowledgeDocumentsTable.category as any, "judicial"),
          sql`${knowledgeDocumentsTable.caseMetadata} IS NOT NULL`,
          sql`(${knowledgeDocumentsTable.caseMetadata}->>'caseNumber' IS NULL OR ${knowledgeDocumentsTable.caseMetadata}->>'caseNumber' = '')`,
          sql`(${knowledgeDocumentsTable.caseMetadata}->>'rulingNumber' IS NULL OR ${knowledgeDocumentsTable.caseMetadata}->>'rulingNumber' = '')`,
          sql`(${knowledgeDocumentsTable.caseMetadata}->>'court' IS NULL OR ${knowledgeDocumentsTable.caseMetadata}->>'court' = '')`,
        ));

      if (corruptDocs.length > 0) {
        const corruptIds = corruptDocs.map(d => d.id);
        const now = new Date();
        await db
          .update(knowledgeDocumentsTable)
          .set({
            caseMetadata: null as any,
            lastCleanedAt: now,
            cleanCount: sql`clean_count + 1`,
            updatedAt: now,
          })
          .where(inArray(knowledgeDocumentsTable.id, corruptIds));
        cleanedCount = corruptDocs.length;
        (job as MetaJob).sanitized = cleanedCount;
        cleanedDocNames = corruptDocs.map(d => d.filename ?? `#${d.id}`);
        logJob(job, `🧹 نُظِّفت بيانات الاستشهاد لـ ${cleanedCount} وثيقة فشلت جميع حقولها الجوهرية`);
        for (const d of corruptDocs) {
          logJob(job, `  ✗ ${d.filename}`);
        }
      }
    } catch (cleanErr: any) {
      logJob(job, `⚠️ خطأ في التنظيف التلقائي: ${cleanErr?.message?.slice(0, 60) ?? "خطأ غير معروف"}`);
    }

    job.running = false;
    const mj = job as MetaJob;
    logJob(job, `اكتمل: فحص ${job.done}، استُخرجت بيانات ${mj.extracted}، حقول مرفوضة ${mj.rejectedFields}، نُظِّفت ${cleanedCount}، فشل ${job.failed}`);

    // أرسل تنبيه Telegram للمدير إذا تجاوز معدل الفشل الكلي 20%
    if (job.failed > 0) {
      notifyAdminHighFailureRate(job.failed, job.total).catch(() => {});
    }
    // أرسل تنبيه Telegram للمدير إذا وُجدت حقول مشبوهة
    if (mj.rejectedFields > 0) {
      notifyAdminSuspiciousCitations(mj.rejectedFields, mj.affectedDocs, job.done).catch(() => {});
    }
    // أرسل تنبيه Telegram منفصل إذا جرى تنظيف تلقائي لوثائق فاسدة
    if (cleanedCount > 0) {
      notifyAdminCleanedCitations(cleanedCount, cleanedDocNames, job.done).catch(() => {});
    }
    // احسب عدد الوثائق ذات needsReview:true من قاعدة البيانات وأرسل تنبيهاً إذا وُجدت
    try {
      const judicialWithMeta = await db
        .select({ caseMetadata: knowledgeDocumentsTable.caseMetadata })
        .from(knowledgeDocumentsTable)
        .where(and(
          isNull(knowledgeDocumentsTable.archivedAt),
          eq(knowledgeDocumentsTable.status, "indexed"),
          eq(knowledgeDocumentsTable.category as any, "judicial"),
          sql`${knowledgeDocumentsTable.caseMetadata} IS NOT NULL`,
        ));
      const needsReviewCount = judicialWithMeta.filter(
        d => citationNeedsReview(d.caseMetadata as any ?? {})
      ).length;
      if (needsReviewCount > 0) {
        notifyAdminNeedsReview(needsReviewCount, judicialWithMeta.length).catch(() => {});
      }
    } catch {
      // non-fatal — لا يوقف تدفق العملية
    }

    setTimeout(() => bulkJobs.delete(jobId), 30 * 60 * 1000);
  })().catch(() => { job.running = false; });

  const modeLabel = force ? "إعادة استخراج كاملة (جميع الوثائق)" : "استخراج تدريجي (الوثائق غير المعالجة فقط)";
  res.json({ jobId, total: eligible.length, force, message: `بدأ ${modeLabel} في الخلفية — ${eligible.length} وثيقة قضائية` });
});

// ── Quality scan: check all existing chunks and report corrupted ones ──────────
router.get("/admin/knowledge/quality-scan", requireAdmin, async (_req, res): Promise<void> => {
  // Load all chunks with their document info
  const rows = await db
    .select({
      id: knowledgeChunksTable.id,
      content: knowledgeChunksTable.content,
      chunkIndex: knowledgeChunksTable.chunkIndex,
      documentId: knowledgeChunksTable.documentId,
      filename: knowledgeDocumentsTable.filename,
      category: knowledgeDocumentsTable.category,
    })
    .from(knowledgeChunksTable)
    .innerJoin(knowledgeDocumentsTable, eq(knowledgeChunksTable.documentId, knowledgeDocumentsTable.id))
    .where(and(
      eq(knowledgeDocumentsTable.status, "indexed"),
      isNull(knowledgeDocumentsTable.archivedAt)
    ));

  let clean = 0, blocked = 0;
  const blockedList: Array<{
    id: number; documentId: number; filename: string; chunkIndex: number;
    score: number; reasons: string[]; category: string; snippet: string;
  }> = [];
  const docStats = new Map<number, { filename: string; total: number; blocked: number }>();

  for (const row of rows) {
    const ds = docStats.get(row.documentId) ?? { filename: row.filename, total: 0, blocked: 0 };
    ds.total++;
    const quality = checkChunkQuality(row.content);
    if (!quality.passed) {
      blocked++;
      ds.blocked++;
      blockedList.push({
        id: row.id,
        documentId: row.documentId,
        filename: row.filename,
        chunkIndex: row.chunkIndex,
        score: quality.score,
        reasons: quality.reasons,
        category: quality.category,
        snippet: row.content.slice(0, 120),
      });
    } else {
      clean++;
    }
    docStats.set(row.documentId, ds);
  }

  // Category breakdown of blocked chunks
  const byCategory: Record<string, number> = {};
  for (const b of blockedList) {
    byCategory[b.category] = (byCategory[b.category] ?? 0) + 1;
  }

  // Per-document stats
  const documentBreakdown = [...docStats.entries()].map(([id, ds]) => ({
    documentId: id, filename: ds.filename, total: ds.total,
    blocked: ds.blocked, clean: ds.total - ds.blocked,
    healthPercent: Math.round(((ds.total - ds.blocked) / Math.max(ds.total, 1)) * 100),
  })).sort((a, b) => b.blocked - a.blocked);

  res.json({
    summary: {
      total: rows.length,
      clean,
      blocked,
      healthPercent: Math.round((clean / Math.max(rows.length, 1)) * 100),
      byCategory,
    },
    documentBreakdown,
    blockedChunks: blockedList.slice(0, 200), // cap for response size
  });
});

// ── Delete all blocked chunks for a document (admin — triggers re-index) ───────
router.delete("/admin/knowledge/blocked-chunks/:documentId", requireAdmin, async (req, res): Promise<void> => {
  const docId = parseInt(req.params.documentId as string, 10);
  if (isNaN(docId)) { res.status(400).json({ error: "معرّف غير صالح" }); return; }

  const rows = await db
    .select({ id: knowledgeChunksTable.id, content: knowledgeChunksTable.content })
    .from(knowledgeChunksTable)
    .where(eq(knowledgeChunksTable.documentId, docId));

  const toDelete: number[] = [];
  for (const row of rows) {
    const q = checkChunkQuality(row.content);
    if (!q.passed) toDelete.push(row.id);
  }

  if (toDelete.length > 0) {
    await db.delete(knowledgeChunksTable).where(inArray(knowledgeChunksTable.id, toDelete));
    // Update totalChunks
    const remaining = rows.length - toDelete.length;
    await db.update(knowledgeDocumentsTable)
      .set({ totalChunks: remaining, updatedAt: new Date() })
      .where(eq(knowledgeDocumentsTable.id, docId));
  }

  res.json({ deleted: toDelete.length, message: `تم حذف ${toDelete.length} مقطع تالف` });
});

// ── Indexing health report ─────────────────────────────────────────────────────
router.get("/admin/knowledge/health", requireAdmin, async (_req, res): Promise<void> => {
  const docs = await db
    .select({
      id: knowledgeDocumentsTable.id,
      filename: knowledgeDocumentsTable.filename,
      category: knowledgeDocumentsTable.category,
      status: knowledgeDocumentsTable.status,
      totalChunks: knowledgeDocumentsTable.totalChunks,
      errorMessage: knowledgeDocumentsTable.errorMessage,
      updatedAt: knowledgeDocumentsTable.updatedAt,
    })
    .from(knowledgeDocumentsTable)
    .where(isNull(knowledgeDocumentsTable.archivedAt))
    .orderBy(desc(knowledgeDocumentsTable.updatedAt));

  const summary = {
    total: docs.length,
    indexed: docs.filter(d => d.status === "indexed").length,
    error: docs.filter(d => d.status === "error").length,
    pending: docs.filter(d => d.status === "pending").length,
    indexing: docs.filter(d => d.status === "indexing").length,
    totalChunks: docs.reduce((s, d) => s + (d.totalChunks ?? 0), 0),
    zeroChunkDocs: docs.filter(d => d.status === "indexed" && (d.totalChunks ?? 0) === 0).length,
  };

  res.json({ summary, documents: docs });
});

// ── Regulatory Research Engine — Phase 1 ────────────────────────────────────
// ── SSE: live research phase for regulatory-research and legal-research tabs ──
// The client opens this before POSTing the search request.  Phase events are
// emitted by the POST handler and forwarded here as SSE frames so the UI can
// show "🌐 جارٍ البحث في الإنترنت…" while Tavily is running.
router.get("/knowledge/research-status/:requestId", requireAuth, (req, res): void => {
  const { requestId } = req.params;

  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");
  res.flushHeaders();

  // If the POST already started before the SSE connection was established,
  // send the current phase immediately so the client catches up.
  const current = getCurrentResearchPhase(requestId);
  if (current) {
    res.write(`data: ${JSON.stringify({ phase: current })}\n\n`);
  }

  const unsub = subscribeResearchPhase(requestId, (phase) => {
    res.write(`data: ${JSON.stringify({ phase })}\n\n`);
    if (phase === "done") {
      res.end();
      unsub();
    }
  });

  // Clean up when the client disconnects before "done" arrives.
  req.on("close", () => { unsub(); });
});

router.post("/knowledge/regulatory-research", requireAuth, async (req, res): Promise<void> => {
  const { query, searchType = "comprehensive", relationDate, incidentDate, claimDate, requestId } = req.body as {
    query?: string;
    searchType?: string;
    relationDate?: string;
    incidentDate?: string;
    claimDate?: string;
    requestId?: string;
  };

  if (!query || query.trim().length < 5) {
    res.status(400).json({ error: "يرجى إدخال اسم نظام أو سؤال نظامي (5 أحرف على الأقل)" });
    return;
  }

  if (req.userRole !== "admin") {
    const activeSubs = await db.select().from(subscriptionsTable)
      .where(and(eq(subscriptionsTable.userId, req.userId!), eq(subscriptionsTable.status, "active")))
      .limit(1);
    const sub = activeSubs[0];
    if (!sub || sub.questionsAllowed <= 3) {
      res.status(403).json({ error: "الباحث النظامي متاح للمشتركين فقط", code: "UPGRADE_REQUIRED" });
      return;
    }
  }

  try {
    const apiKey = getApiKey();
    const OpenAI = (await import("openai")).default;
    const openai = new OpenAI({ apiKey });

    const q = query.trim();
    const fetchedAt = new Date().toISOString();

    // ── 1. Synonym expansion ──────────────────────────────────────────────────
    const synonymsUsed = getSynonymsUsed(q);
    const expandedQuery = expandWithSynonyms(q);

    // ── 2. Multi-source parallel search ──────────────────────────────────────
    // Notify client that live web search is starting
    if (requestId) emitResearchPhase(requestId, "searching");

    // 4 Tavily passes (categorised) + KB search — all concurrent
    const [kbChunks, boeMain, execReg, amendments, circulars] = await Promise.all([
      retrieveRelevantChunks(expandedQuery, apiKey, 8, 0.35, "regulation").catch(() => []),
      // Pass 1: main law text from BOE (primary official source)
      searchRegulatorySource(q, [...REGULATORY_DOMAINS_BOE, ...REGULATORY_DOMAINS_MOJ], 5, "main").catch(() => []),
      // Pass 2: executive regulations
      searchRegulatorySource(`${q} لائحة تنفيذية`, REGULATORY_DOMAINS_ALL, 3, "exec-reg").catch(() => []),
      // Pass 3: amendments & amending decrees
      searchRegulatorySource(`${q} تعديل مرسوم ملكي أمر`, REGULATORY_DOMAINS_BOE, 3, "amendment").catch(() => []),
      // Pass 4: ministerial circulars & decisions
      searchRegulatorySource(`${q} تعميم قرار وزاري`, [...REGULATORY_DOMAINS_MOJ, ...REGULATORY_DOMAINS_BOE], 3, "circular").catch(() => []),
    ]);

    // ── 3. Deduplicate and tag sources ────────────────────────────────────────
    const seenUrls = new Set<string>();
    const allSources: RegulatorySource[] = [];
    for (const batch of [boeMain, execReg, amendments, circulars]) {
      for (const s of batch) {
        if (!seenUrls.has(s.url)) { seenUrls.add(s.url); allSources.push(s); }
      }
    }

    const kbCorpus = kbChunks.map(c => c.content).join(" ");

    // ── 4. Build sectioned web context for GPT-4o ─────────────────────────────
    const section = (label: string, srcs: RegulatorySource[]) =>
      srcs.length === 0 ? "" :
      `\n\n═══ ${label} ═══\n` +
      srcs.map(r => `[${r.title}]\nالرابط: ${r.url}\n${r.content}`).join("\n\n---\n\n");

    const webContext =
      section("نصوص الأنظمة — بوابة هيئة الخبراء وأم القرى", boeMain) +
      section("اللوائح التنفيذية", execReg) +
      section("التعديلات والمراسيم", amendments) +
      section("التعاميم والقرارات الوزارية", circulars);

    const kbSection = kbChunks.length > 0
      ? "\n\n═══ قاعدة المعرفة الداخلية ═══\n" +
        kbChunks.map((c, i) => `[مرجع ${i + 1}: ${c.documentName}]\n${c.content}`).join("\n\n---\n\n")
      : "";

    const today = new Date().toLocaleDateString("ar-SA-u-ca-islamic", { year: "numeric", month: "long", day: "numeric" });

    const temporalBlock = (relationDate || incidentDate || claimDate)
      ? `\nتاريخ نشوء العلاقة: ${relationDate || "غير محدد"}\nتاريخ الواقعة: ${incidentDate || "غير محدد"}\nتاريخ المطالبة: ${claimDate || "غير محدد"}\n`
      : "";

    // ── 5. GPT-4o structured extraction ──────────────────────────────────────
    // Notify client that web search is done and AI synthesis is starting
    if (requestId) emitResearchPhase(requestId, "generating");

    const systemPrompt = `أنت محرّك بحث نظامي احترافي متخصص في المنظومة التشريعية السعودية.
مهمتك الوحيدة: استخراج معلومات تشريعية منظّمة من المصادر المُقدَّمة وإرجاعها JSON.
${PROHIBITION_RULE}
══════════════════════════════════════════
القواعد الإلزامية — لا استثناء
══════════════════════════════════════════
١. لا تضع أي نص بين علامتي اقتباس إلا إذا كان موجوداً حرفياً في المصادر أدناه.
   إذا لم تجد النص الحرفي: اكتب محتوى المادة بأسلوبك دون علامتَي اقتباس، وضع verified: false.
٢. إذا لم تجد معلومة في المصادر: اكتب "غير محدد" — لا تخترع بيانات.
٣. هرمية الوثائق (لا تخلطها):
   نظام (مرسوم ملكي) ← لائحة تنفيذية (قرار وزاري) ← تعميم (إدارية)
   التعميم لا يُعدّل النظام. القرار الوزاري لا يُلغي اللائحة بمفرده.
٤. لا يُعتبر صدور نظام جديد إلغاءً للقديم إلا بنص إلغاء صريح أو تعارض جذري.
٥. النظام يصدر بمرسوم ملكي، واللائحة بقرار وزاري، والتعميم من جهة تنفيذية.
٦. تاريخ النشر في أم القرى وتاريخ النفاذ متغيران مستقلان — لا تخلطهما.
اليوم: ${today}`;

    const userPrompt = `السؤال النظامي: ${q}
${temporalBlock}
المصادر المُقدَّمة (اعمل منها فقط):
${webContext || "(لا توجد نتائج من الويب)"}
${kbSection}

═══════════════════════════════════════
أرجع JSON صالح فقط (بلا نص خارجه) بالهيكل:
═══════════════════════════════════════ {
  "legalClassification": "التكييف القانوني الدقيق للمسألة (جملة أو جملتان)",
  "legalQuestion": "السؤال النظامي المستخلص",
  "keywords": ["كلمة مفتاحية", "مرادف قانوني", ...],

  "mainLaw": {
    "name": "الاسم الكامل للنظام",
    "issuingDecree": "رقم المرسوم الملكي / الأمر الملكي",
    "publishDate": "تاريخ النشر في أم القرى هجرياً",
    "effectiveDate": "تاريخ النفاذ",
    "status": "نافذ | ملغى | معدّل | غير محدد",
    "issuingAuthority": "الجهة المُصدِرة",
    "sourceUrl": "رابط بوابة هيئة الخبراء إن وُجد",
    "verified": true
  },

  "legislativeMap": [ {
      "type": "نظام | لائحة تنفيذية | قرار وزاري | تعميم | ضوابط | دليل إرشادي | أمر ملكي | نموذج معتمد",
      "name": "اسم الوثيقة",
      "issuingDecree": "رقم الأداة",
      "date": "تاريخ الإصدار",
      "status": "نافذ | ملغى | معدّل | غير محدد",
      "relation": "وجه ارتباطها بالنظام الرئيسي",
      "verified": true,
      "sourceUrl": "الرابط إن وُجد"
    }
  ],

  "amendments": [ {
      "date": "تاريخ التعديل هجرياً",
      "decree": "رقم المرسوم أو القرار",
      "description": "وصف التعديل (ماذا تغيّر)",
      "publishDate": "تاريخ نشره في أم القرى",
      "effectiveDate": "تاريخ نفاذه",
      "articles": "المواد المعدّلة",
      "verified": true
    }
  ],

  "applicableArticles": [ {
      "articleNumber": "رقم المادة",
      "articleText": "نص المادة — ضع اقتباساً فقط إذا كان حرفياً من المصادر",
      "law": "اسم النظام",
      "relevance": "وجه انطباقها على المسألة",
      "verified": true,
      "sourceUrl": "الرابط"
    }
  ],

  ${temporalBlock ? `"temporalApplicability": {
    "applicableVersion": "النسخة الواجبة التطبيق بالتواريخ المُدخلة",
    "reason": "سبب اختيار هذه النسخة (عدم رجعية / أحكام انتقالية / فورية إجرائية)",
    "transitionalNote": "أي أحكام انتقالية ذات صلة"
  },` : ""}

  "conditions": ["شرط تطبيق 1", ...],
  "exceptions": ["استثناء نظامي 1", ...],
  "applicationAnalysis": "فقرة تحليلية: كيف تنطبق النصوص على الواقعة",
  "conflicts": ["تعارض أو غموض محتمل 1", ...],
  "conclusion": "الخلاصة النظامية (فقرة)",
  "pendingIssues": ["مسألة تحتاج بحثاً إضافياً 1", ...]
}`;

    const completion = await openai.chat.completions.create({
      model: "gpt-4o",
      messages: [
        charterSystemMsg(),
        { role: "system", content: systemPrompt },
        { role: "user",   content: userPrompt },
      ],
      response_format: { type: "json_object" },
      temperature: 0.1,
      max_tokens: 4000,
    });

    let extracted: Record<string, any> = {};
    try {
      extracted = JSON.parse(completion.choices[0].message.content ?? "{}");
    } catch { extracted = {}; }

    // ── 6. Programmatic article verification ─────────────────────────────────
    // Enforce: no text in quotes unless found in fetched sources
    const articles: RegulatoryResult["applicableArticles"] = (extracted.applicableArticles ?? []).map((a: any) => ({
      articleNumber: a.articleNumber ?? "",
      articleText:   a.articleText   ?? "",
      law:           a.law           ?? "",
      relevance:     a.relevance     ?? "",
      sourceUrl:     a.sourceUrl,
      verified: isTextVerified(a.articleText, allSources, kbCorpus),
    }));

    // Also verify legislative map entries
    const legislativeMap: RegulatoryResult["legislativeMap"] = (extracted.legislativeMap ?? []).map((d: any) => ({
      type:          d.type          ?? "نظام",
      name:          d.name          ?? "",
      issuingDecree: d.issuingDecree,
      date:          d.date,
      status:        d.status        ?? "غير محدد",
      relation:      d.relation      ?? "",
      verified:      allSources.some(s => s.content.includes(d.name?.slice(0, 15) ?? "__NONE__")),
      sourceUrl:     d.sourceUrl,
    }));

    const mapAmendments: RegulatoryResult["amendments"] = (extracted.amendments ?? []).map((a: any) => ({
      date:          a.date          ?? "",
      decree:        a.decree        ?? "",
      description:   a.description   ?? "",
      publishDate:   a.publishDate,
      effectiveDate: a.effectiveDate,
      articles:      a.articles,
      verified:      allSources.some(s =>
        a.decree && s.content.includes(a.decree.slice(0, 8))
      ),
    }));

    // ── 7. Determine audit status ─────────────────────────────────────────────
    const verifiedArticlesCount  = articles.filter(a => a.verified).length;
    const totalArticlesCount     = articles.length;
    const hasMainLaw = !!(extracted.mainLaw?.name && extracted.mainLaw.name !== "غير محدد");
    const hasSources = allSources.length > 0 || kbChunks.length > 0;

    const auditNotes: string[] = [];
    let auditStatus: RegulatoryResult["auditStatus"];

    if (!hasSources) {
      auditStatus = "غير صالحة للاعتماد";
      auditNotes.push("لم يُعثر على مصادر رسمية أو قاعدة معرفة ذات صلة — لا يمكن التحقق من أي نص");
    } else if (
      hasMainLaw &&
      (totalArticlesCount === 0 || verifiedArticlesCount / totalArticlesCount >= 0.75)
    ) {
      auditStatus = "موثقة وصالحة للاستخدام";
    } else if (verifiedArticlesCount > 0 || hasMainLaw) {
      auditStatus = "صحيحة مع نقص محدود";
      if (totalArticlesCount > 0 && verifiedArticlesCount < totalArticlesCount) {
        auditNotes.push(
          `${totalArticlesCount - verifiedArticlesCount} من ${totalArticlesCount} مادة لم يُعثر على نصها الحرفي في المصادر المُجلبة — راجع المصدر الرسمي`
        );
      }
    } else {
      auditStatus = "تحتاج إعادة تحقق";
      auditNotes.push("لم يُتحقق من نص أي مادة في المصادر المتاحة — يُنصح بمراجعة laws.boe.gov.sa مباشرةً");
    }

    const boeSourceCount = allSources.filter(s => s.url.includes("laws.boe.gov.sa")).length;
    if (boeSourceCount > 0) {
      auditNotes.push(`جُلب ${boeSourceCount} مصدر من بوابة هيئة الخبراء بتاريخ ${new Date(fetchedAt).toLocaleDateString("ar-SA")}`);
    }
    const uqnCount = allSources.filter(s => s.url.includes("uqn.gov.sa")).length;
    if (uqnCount > 0) auditNotes.push(`جُلب ${uqnCount} مصدر من جريدة أم القرى`);

    const result: RegulatoryResult = {
      fetchedAt,
      query: q,
      synonymsUsed,
      searchTermsUsed: buildRegulatorySearchTerms(q),
      legalClassification: extracted.legalClassification ?? "",
      legalQuestion:       extracted.legalQuestion       ?? "",
      keywords:            extracted.keywords            ?? [],
      mainLaw:             extracted.mainLaw             ?? null,
      legislativeMap,
      amendments:          mapAmendments,
      applicableArticles:  articles,
      temporalApplicability: extracted.temporalApplicability,
      conditions:          extracted.conditions          ?? [],
      exceptions:          extracted.exceptions          ?? [],
      applicationAnalysis: extracted.applicationAnalysis ?? "",
      conflicts:           extracted.conflicts           ?? [],
      conclusion:          extracted.conclusion          ?? "",
      pendingIssues:       extracted.pendingIssues       ?? [],
      // Return sources with truncated snippets (full content was used for verification only)
      sources: allSources.slice(0, 12).map(s => ({ ...s, content: s.content.slice(0, 400) })),
      auditStatus,
      auditNotes,
    };

    if (requestId) emitResearchPhase(requestId, "done");
    res.json(result);
  } catch (err: any) {
    if (requestId) emitResearchPhase(requestId, "done");
    res.status(500).json({ error: err?.message ?? "فشل البحث النظامي" });
  }
});

// ── Sanitize corrupted caseMetadata already saved in the DB ──────────────────
// Applies validateCaseMetadata to every document that has caseMetadata stored,
// nulls out fields that fail validation, persists the corrected record, and
// returns a detailed report of what was fixed.
router.post("/admin/knowledge/sanitize-citation-metadata", requireAdmin, async (_req, res): Promise<void> => {
  // Load only the columns we need (avoid fetching file binary)
  const docs = await db
    .select({
      id: knowledgeDocumentsTable.id,
      filename: knowledgeDocumentsTable.filename,
      caseMetadata: knowledgeDocumentsTable.caseMetadata,
    })
    .from(knowledgeDocumentsTable)
    .where(and(
      isNull(knowledgeDocumentsTable.archivedAt),
      sql`${knowledgeDocumentsTable.caseMetadata} IS NOT NULL`,
    ));

  let scanned = 0;
  let corrected = 0;
  const corrections: Array<{ id: number; filename: string; nulledFields: string[] }> = [];

  for (const doc of docs) {
    if (!doc.caseMetadata) continue;
    scanned++;

    // Deep-clone so we can detect which fields changed
    const before = JSON.parse(JSON.stringify(doc.caseMetadata)) as Record<string, any>;
    const meta = JSON.parse(JSON.stringify(doc.caseMetadata)) as Record<string, any>;

    validateCaseMetadata(meta, doc.filename);

    // Detect which fields were nulled out
    const metaFields = [
      "caseNumber", "rulingNumber", "hijriDate", "gregorianDate",
      "court", "litigationStage", "disputeSubject", "deedNumber",
    ] as const;

    const nulledFields: string[] = metaFields.filter(
      f => before[f] != null && meta[f] == null,
    );

    if (nulledFields.length === 0) continue; // nothing changed — skip DB write

    // Persist the cleaned metadata
    await db
      .update(knowledgeDocumentsTable)
      .set({ caseMetadata: meta as any, updatedAt: new Date() })
      .where(eq(knowledgeDocumentsTable.id, doc.id));

    corrected++;
    corrections.push({ id: doc.id, filename: doc.filename, nulledFields });
  }

  res.json({
    scanned,
    corrected,
    message: corrected === 0
      ? `فُحص ${scanned} سجل — لم يُعثر على بيانات استشهاد فاسدة`
      : `فُحص ${scanned} سجل — صُحِّح ${corrected} سجل بإزالة الحقول الخاطئة`,
    corrections,
  });
});

export default router;
