import { Router, type IRouter } from "express";
import {
  db,
  legalArchiveSourceFilesTable,
  legalArchiveSourcesTable,
  legalDocumentsTable,
  legalDocumentFilesTable,
} from "@workspace/db";
import { and, desc, eq, ilike, isNotNull, or, sql } from "drizzle-orm";
import { requireAdmin, requireAuth } from "../middlewares/auth";

const router: IRouter = Router();

// `blog_index` remains an archival category and is deliberately excluded: a
// catalogue or blog must never be returned as an independent legal authority.
const DOCUMENT_TYPES = new Set(["judgment", "deed", "circular", "decision", "principle", "precedent"]);
const MAX_QUERY_LENGTH = 220;
const MAX_RESULTS = 30;

function compactWhitespace(value: unknown): string {
  return String(value ?? "").replace(/\s+/g, " ").trim();
}

function approvedDocumentConditions() {
  return and(
    eq(legalDocumentsTable.status, "active"),
    eq(legalDocumentsTable.reviewStatus, "approved"),
    eq(legalArchiveSourcesTable.isOfficial, true),
    eq(legalArchiveSourcesTable.reviewStatus, "verified"),
    eq(legalArchiveSourceFilesTable.processingStatus, "processed"),
    isNotNull(legalDocumentsTable.sourcePageStart),
    isNotNull(legalDocumentsTable.sourcePageEnd),
  );
}

function toSearchResponse(row: {
  id: string;
  documentType: string;
  title: string;
  documentNumber: string | null;
  caseNumber: string | null;
  judgmentNumber: string | null;
  decisionNumber: string | null;
  circularNumber: string | null;
  court: string | null;
  circuit: string | null;
  issuingAuthority: string | null;
  hijriDate: string | null;
  year: string | null;
  subject: string | null;
  summary: string | null;
  excerpt: string | null;
  sourcePageStart: number | null;
  sourcePageEnd: number | null;
  sourceName: string;
  sourceUrl: string | null;
  hasStandaloneFile: boolean;
}) {
  return {
    id: row.id,
    documentType: row.documentType,
    title: row.title,
    documentNumber: row.documentNumber,
    caseNumber: row.caseNumber,
    judgmentNumber: row.judgmentNumber,
    decisionNumber: row.decisionNumber,
    circularNumber: row.circularNumber,
    court: row.court,
    circuit: row.circuit,
    issuingAuthority: row.issuingAuthority,
    hijriDate: row.hijriDate,
    year: row.year,
    subject: row.subject,
    summary: row.summary,
    excerpt: compactWhitespace(row.excerpt).slice(0, 700) || null,
    sourcePageStart: row.sourcePageStart,
    sourcePageEnd: row.sourcePageEnd,
    source: {
      name: row.sourceName,
      officialUrl: row.sourceUrl,
    },
    citation: {
      originalPages: [row.sourcePageStart, row.sourcePageEnd],
      originalFileAvailable: row.hasStandaloneFile,
    },
    downloadAvailable: false,
  };
}

/**
 * Client-facing professional legal search.
 *
 * Admission is intentionally stricter than extraction: a record must be
 * approved by a reviewer, active, attached to a verified official source and
 * source file, and carry an evidence-backed original page range.  No private
 * storage path, file checksum, or file download URL is returned to clients.
 */
router.get("/legal-archive/search", requireAuth, async (req, res): Promise<void> => {
  const query = compactWhitespace(req.query.q);
  const requestedType = compactWhitespace(req.query.type);

  if (query.length < 2 || query.length > MAX_QUERY_LENGTH) {
    res.status(400).json({ error: "أدخل عبارة بحث بين حرفين و220 حرفًا." });
    return;
  }
  if (requestedType && !DOCUMENT_TYPES.has(requestedType)) {
    res.status(400).json({ error: "نوع الوثيقة غير مدعوم." });
    return;
  }

  const pattern = `%${query.replace(/[%_\\]/g, "\\$&")}%`;
  const textMatch = or(
    ilike(legalDocumentsTable.title, pattern),
    ilike(legalDocumentsTable.subject, pattern),
    ilike(legalDocumentsTable.documentNumber, pattern),
    ilike(legalDocumentsTable.caseNumber, pattern),
    ilike(legalDocumentsTable.judgmentNumber, pattern),
    ilike(legalDocumentsTable.decisionNumber, pattern),
    ilike(legalDocumentsTable.circularNumber, pattern),
    ilike(legalDocumentsTable.court, pattern),
    ilike(legalDocumentsTable.fullText, pattern),
  );

  try {
    const rows = await db
      .select({
        id: legalDocumentsTable.id,
        documentType: legalDocumentsTable.documentType,
        title: legalDocumentsTable.title,
        documentNumber: legalDocumentsTable.documentNumber,
        caseNumber: legalDocumentsTable.caseNumber,
        judgmentNumber: legalDocumentsTable.judgmentNumber,
        decisionNumber: legalDocumentsTable.decisionNumber,
        circularNumber: legalDocumentsTable.circularNumber,
        court: legalDocumentsTable.court,
        circuit: legalDocumentsTable.circuit,
        issuingAuthority: legalDocumentsTable.issuingAuthority,
        hijriDate: legalDocumentsTable.hijriDate,
        year: legalDocumentsTable.year,
        subject: legalDocumentsTable.subject,
        summary: legalDocumentsTable.summary,
        excerpt: sql<string | null>`substring(${legalDocumentsTable.fullText} from 1 for 1200)`,
        sourcePageStart: legalDocumentsTable.sourcePageStart,
        sourcePageEnd: legalDocumentsTable.sourcePageEnd,
        sourceName: legalArchiveSourcesTable.name,
        sourceUrl: legalArchiveSourcesTable.url,
        hasStandaloneFile: sql<boolean>`count(${legalDocumentFilesTable.id}) > 0`,
      })
      .from(legalDocumentsTable)
      .innerJoin(legalArchiveSourcesTable, eq(legalDocumentsTable.sourceId, legalArchiveSourcesTable.id))
      .innerJoin(legalArchiveSourceFilesTable, eq(legalDocumentsTable.sourceFileId, legalArchiveSourceFilesTable.id))
      .leftJoin(legalDocumentFilesTable, eq(legalDocumentFilesTable.documentId, legalDocumentsTable.id))
      .where(and(approvedDocumentConditions(), requestedType ? eq(legalDocumentsTable.documentType, requestedType) : undefined, textMatch))
      .groupBy(
        legalDocumentsTable.id,
        legalArchiveSourcesTable.id,
      )
      .orderBy(desc(legalDocumentsTable.publishedAt), desc(legalDocumentsTable.createdAt))
      .limit(MAX_RESULTS);

    res.json({
      query,
      results: rows.map(toSearchResponse),
      total: rows.length,
      admissionPolicy: "approved_official_page_bounded_only",
    });
  } catch (error) {
    req.log?.error({ error }, "Professional legal archive search failed");
    res.status(500).json({ error: "تعذر تنفيذ البحث القانوني الآن." });
  }
});

router.get("/legal-archive/documents/:id", requireAuth, async (req, res): Promise<void> => {
  const id = compactWhitespace(req.params.id);
  if (!/^[0-9a-f-]{36}$/i.test(id)) {
    res.status(400).json({ error: "معرف الوثيقة غير صالح." });
    return;
  }

  try {
    const rows = await db
      .select({
        id: legalDocumentsTable.id,
        documentType: legalDocumentsTable.documentType,
        title: legalDocumentsTable.title,
        documentNumber: legalDocumentsTable.documentNumber,
        caseNumber: legalDocumentsTable.caseNumber,
        judgmentNumber: legalDocumentsTable.judgmentNumber,
        decisionNumber: legalDocumentsTable.decisionNumber,
        circularNumber: legalDocumentsTable.circularNumber,
        court: legalDocumentsTable.court,
        circuit: legalDocumentsTable.circuit,
        issuingAuthority: legalDocumentsTable.issuingAuthority,
        hijriDate: legalDocumentsTable.hijriDate,
        year: legalDocumentsTable.year,
        subject: legalDocumentsTable.subject,
        summary: legalDocumentsTable.summary,
        excerpt: legalDocumentsTable.fullText,
        sourcePageStart: legalDocumentsTable.sourcePageStart,
        sourcePageEnd: legalDocumentsTable.sourcePageEnd,
        sourceName: legalArchiveSourcesTable.name,
        sourceUrl: legalArchiveSourcesTable.url,
        hasStandaloneFile: sql<boolean>`count(${legalDocumentFilesTable.id}) > 0`,
      })
      .from(legalDocumentsTable)
      .innerJoin(legalArchiveSourcesTable, eq(legalDocumentsTable.sourceId, legalArchiveSourcesTable.id))
      .innerJoin(legalArchiveSourceFilesTable, eq(legalDocumentsTable.sourceFileId, legalArchiveSourceFilesTable.id))
      .leftJoin(legalDocumentFilesTable, eq(legalDocumentFilesTable.documentId, legalDocumentsTable.id))
      .where(and(approvedDocumentConditions(), eq(legalDocumentsTable.id, id)))
      .groupBy(legalDocumentsTable.id, legalArchiveSourcesTable.id)
      .limit(1);

    const row = rows[0];
    if (!row) {
      res.status(404).json({ error: "الوثيقة غير متاحة في البحث المهني." });
      return;
    }
    res.json({ document: toSearchResponse(row) });
  } catch (error) {
    req.log?.error({ error }, "Professional legal archive document lookup failed");
    res.status(500).json({ error: "تعذر فتح الوثيقة الآن." });
  }
});

/**
 * Review-only admission endpoint.  An admin may approve a document only when
 * source verification, original page bounds and a standalone file are all
 * present.  It does not enable a file download.
 */
router.post("/admin/legal-archive/documents/:id/approve", requireAdmin, async (req, res): Promise<void> => {
  const id = compactWhitespace(req.params.id);
  if (!/^[0-9a-f-]{36}$/i.test(id)) {
    res.status(400).json({ error: "معرف الوثيقة غير صالح." });
    return;
  }

  try {
    const eligible = await db
      .select({ id: legalDocumentsTable.id })
      .from(legalDocumentsTable)
      .innerJoin(legalArchiveSourcesTable, eq(legalDocumentsTable.sourceId, legalArchiveSourcesTable.id))
      .innerJoin(legalArchiveSourceFilesTable, eq(legalDocumentsTable.sourceFileId, legalArchiveSourceFilesTable.id))
      .innerJoin(legalDocumentFilesTable, eq(legalDocumentFilesTable.documentId, legalDocumentsTable.id))
      .where(and(
        eq(legalDocumentsTable.id, id),
        eq(legalArchiveSourcesTable.isOfficial, true),
        eq(legalArchiveSourcesTable.reviewStatus, "verified"),
        eq(legalArchiveSourceFilesTable.processingStatus, "processed"),
        isNotNull(legalDocumentsTable.sourcePageStart),
        isNotNull(legalDocumentsTable.sourcePageEnd),
      ))
      .limit(1);

    if (!eligible[0]) {
      res.status(409).json({ error: "لا يمكن اعتماد الوثيقة قبل اكتمال المصدر الرسمي والصفحات والملف المستقل." });
      return;
    }

    await db.update(legalDocumentsTable).set({
      status: "active",
      reviewStatus: "approved",
      publishedAt: new Date(),
    }).where(eq(legalDocumentsTable.id, id));

    // Files stay private/non-downloadable by design.  Approval affects search
    // metadata only, never an original-file URL or storage path.
    res.json({ id, status: "active", reviewStatus: "approved", downloadAvailable: false });
  } catch (error) {
    req.log?.error({ error }, "Professional legal archive approval failed");
    res.status(500).json({ error: "تعذر اعتماد الوثيقة الآن." });
  }
});

export default router;
