import { sql } from "drizzle-orm";
import {
  bigint,
  bigserial,
  boolean,
  check,
  date,
  index,
  integer,
  jsonb,
  numeric,
  pgTable,
  primaryKey,
  text,
  timestamp,
  unique,
  uuid,
} from "drizzle-orm/pg-core";

export const legalArchiveSourcesTable = pgTable(
  "sources",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    name: text("name").notNull(),
    sourceType: text("source_type").notNull(),
    organization: text("organization"),
    url: text("url"),
    channelUrl: text("channel_url"),
    description: text("description"),
    isOfficial: boolean("is_official"),
    reviewStatus: text("review_status").notNull().default("pending"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    check(
      "sources_review_status_check",
      sql`${table.reviewStatus} in ('pending','verified','review','rejected','archived')`,
    ),
  ],
);

export const legalArchiveSourceFilesTable = pgTable(
  "source_files",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    sourceId: uuid("source_id")
      .notNull()
      .references(() => legalArchiveSourcesTable.id, { onDelete: "restrict" }),
    originalFilename: text("original_filename").notNull(),
    storagePath: text("storage_path").notNull(),
    originalUrl: text("original_url"),
    mimeType: text("mime_type").notNull(),
    fileSize: bigint("file_size", { mode: "number" }).notNull(),
    sha256: text("sha256").notNull().unique(),
    pageCount: integer("page_count"),
    acquisitionSource: text("acquisition_source").notNull(),
    acquiredAt: timestamp("acquired_at", { withTimezone: true }),
    processingStatus: text("processing_status").notNull().default("pending"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index("source_files_source_id_idx").on(table.sourceId),
    index("source_files_processing_status_idx").on(table.processingStatus),
    check("source_files_size_check", sql`${table.fileSize} >= 0`),
    check("source_files_sha256_format", sql`${table.sha256} ~ '^[0-9a-f]{64}$'`),
  ],
);

export const legalDocumentsTable = pgTable(
  "legal_documents",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    documentType: text("document_type").notNull(),
    category: text("category").notNull(),
    subcategory: text("subcategory"),
    title: text("title").notNull(),
    documentNumber: text("document_number"),
    caseNumber: text("case_number"),
    judgmentNumber: text("judgment_number"),
    decisionNumber: text("decision_number"),
    circularNumber: text("circular_number"),
    court: text("court"),
    circuit: text("circuit"),
    issuingAuthority: text("issuing_authority"),
    documentDate: date("document_date"),
    hijriDate: text("hijri_date"),
    year: text("year"),
    subject: text("subject"),
    summary: text("summary"),
    facts: text("facts"),
    claims: text("claims"),
    reasoning: text("reasoning"),
    ruling: text("ruling"),
    principleText: text("principle_text"),
    fullText: text("full_text"),
    legalArticles: jsonb("legal_articles").$type<string[]>().notNull().default(sql`'[]'::jsonb`),
    sourceId: uuid("source_id")
      .notNull()
      .references(() => legalArchiveSourcesTable.id, { onDelete: "restrict" }),
    sourceFileId: uuid("source_file_id")
      .notNull()
      .references(() => legalArchiveSourceFilesTable.id, { onDelete: "restrict" }),
    sourcePageStart: integer("source_page_start"),
    sourcePageEnd: integer("source_page_end"),
    originalSource: text("original_source"),
    acquisitionSource: text("acquisition_source").notNull(),
    sourceUrl: text("source_url"),
    contentHash: text("content_hash").notNull(),
    normalizedTextHash: text("normalized_text_hash"),
    status: text("status").notNull().default("draft"),
    reviewStatus: text("review_status").notNull().default("pending"),
    publishedAt: timestamp("published_at", { withTimezone: true }),
    archivedAt: timestamp("archived_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index("legal_documents_document_type_idx").on(table.documentType),
    index("legal_documents_category_subcategory_idx").on(table.category, table.subcategory),
    index("legal_documents_case_number_idx").on(table.caseNumber),
    index("legal_documents_judgment_number_idx").on(table.judgmentNumber),
    index("legal_documents_decision_number_idx").on(table.decisionNumber),
    index("legal_documents_circular_number_idx").on(table.circularNumber),
    index("legal_documents_court_idx").on(table.court),
    index("legal_documents_issuing_authority_idx").on(table.issuingAuthority),
    index("legal_documents_document_date_idx").on(table.documentDate),
    index("legal_documents_source_id_idx").on(table.sourceId),
    index("legal_documents_source_file_id_idx").on(table.sourceFileId),
    index("legal_documents_content_hash_idx").on(table.contentHash),
    index("legal_documents_normalized_text_hash_idx").on(table.normalizedTextHash),
    index("legal_documents_status_idx").on(table.status),
    check(
      "legal_documents_type_check",
      sql`${table.documentType} in ('judgment','circular','decision','principle','precedent')`,
    ),
    check(
      "legal_documents_status_check",
      sql`${table.status} in ('active','draft','review','duplicate','archived','rejected')`,
    ),
    check("legal_documents_content_hash_format", sql`${table.contentHash} ~ '^[0-9a-f]{64}$'`),
    check(
      "legal_documents_page_range_check",
      sql`(${table.sourcePageStart} is null and ${table.sourcePageEnd} is null) or (${table.sourcePageStart} >= 1 and ${table.sourcePageEnd} >= ${table.sourcePageStart})`,
    ),
  ],
);

export const legalDocumentFilesTable = pgTable(
  "document_files",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    documentId: uuid("document_id")
      .notNull()
      .references(() => legalDocumentsTable.id, { onDelete: "cascade" }),
    fileType: text("file_type").notNull(),
    storagePath: text("storage_path").notNull(),
    downloadFilename: text("download_filename").notNull(),
    mimeType: text("mime_type").notNull(),
    fileSize: bigint("file_size", { mode: "number" }).notNull(),
    sha256: text("sha256").notNull(),
    pageCount: integer("page_count"),
    isDownloadable: boolean("is_downloadable").notNull().default(false),
    downloadBlockReason: text("download_block_reason"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index("document_files_document_id_idx").on(table.documentId),
    index("document_files_sha256_idx").on(table.sha256),
    unique("document_files_document_sha_unique").on(table.documentId, table.sha256),
    check("document_files_size_check", sql`${table.fileSize} >= 0`),
    check("document_files_sha256_format", sql`${table.sha256} ~ '^[0-9a-f]{64}$'`),
  ],
);

export const legalDocumentRelationsTable = pgTable(
  "document_relations",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    fromDocumentId: uuid("from_document_id")
      .notNull()
      .references(() => legalDocumentsTable.id, { onDelete: "cascade" }),
    toDocumentId: uuid("to_document_id")
      .notNull()
      .references(() => legalDocumentsTable.id, { onDelete: "cascade" }),
    relationType: text("relation_type").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index("document_relations_to_document_id_idx").on(table.toDocumentId),
    unique("document_relations_unique").on(table.fromDocumentId, table.toDocumentId, table.relationType),
  ],
);

export const legalKeywordsTable = pgTable("keywords", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: text("name").notNull(),
  normalizedName: text("normalized_name").notNull().unique(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const legalDocumentKeywordsTable = pgTable(
  "document_keywords",
  {
    documentId: uuid("document_id")
      .notNull()
      .references(() => legalDocumentsTable.id, { onDelete: "cascade" }),
    keywordId: uuid("keyword_id")
      .notNull()
      .references(() => legalKeywordsTable.id, { onDelete: "cascade" }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    primaryKey({ columns: [table.documentId, table.keywordId] }),
    index("document_keywords_keyword_id_idx").on(table.keywordId),
  ],
);

export const legalArchiveBatchesTable = pgTable(
  "archive_batches",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    sourceId: uuid("source_id").references(() => legalArchiveSourcesTable.id, { onDelete: "restrict" }),
    batchName: text("batch_name").notNull(),
    startedAt: timestamp("started_at", { withTimezone: true }).notNull().defaultNow(),
    completedAt: timestamp("completed_at", { withTimezone: true }),
    filesCount: integer("files_count").notNull().default(0),
    documentsDetected: integer("documents_detected").notNull().default(0),
    documentsImported: integer("documents_imported").notNull().default(0),
    duplicatesCount: integer("duplicates_count").notNull().default(0),
    reviewCount: integer("review_count").notNull().default(0),
    rejectedCount: integer("rejected_count").notNull().default(0),
    failedCount: integer("failed_count").notNull().default(0),
    status: text("status").notNull().default("pending"),
    commitSha: text("commit_sha"),
    notes: text("notes"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index("archive_batches_source_idx").on(table.sourceId)],
);

export const legalDuplicateCandidatesTable = pgTable(
  "duplicate_candidates",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    documentId: uuid("document_id")
      .notNull()
      .references(() => legalDocumentsTable.id, { onDelete: "cascade" }),
    matchedDocumentId: uuid("matched_document_id").references(() => legalDocumentsTable.id, {
      onDelete: "cascade",
    }),
    matchedExternalId: text("matched_external_id"),
    matchType: text("match_type").notNull(),
    similarityScore: numeric("similarity_score", { precision: 6, scale: 5 }),
    decision: text("decision").notNull().default("review"),
    reason: text("reason"),
    reviewedAt: timestamp("reviewed_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index("duplicate_candidates_document_idx").on(table.documentId),
    index("duplicate_candidates_matched_document_idx").on(table.matchedDocumentId),
  ],
);

export const legalDocumentChunksTable = pgTable(
  "document_chunks",
  {
    id: bigserial("id", { mode: "number" }).primaryKey(),
    documentId: uuid("document_id")
      .notNull()
      .references(() => legalDocumentsTable.id, { onDelete: "cascade" }),
    chunkIndex: integer("chunk_index").notNull(),
    chunkText: text("chunk_text").notNull(),
    pageStart: integer("page_start"),
    pageEnd: integer("page_end"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index("document_chunks_document_idx").on(table.documentId),
    unique("document_chunks_unique").on(table.documentId, table.chunkIndex),
  ],
);

export type LegalArchiveSource = typeof legalArchiveSourcesTable.$inferSelect;
export type NewLegalArchiveSource = typeof legalArchiveSourcesTable.$inferInsert;
export type LegalArchiveSourceFile = typeof legalArchiveSourceFilesTable.$inferSelect;
export type NewLegalArchiveSourceFile = typeof legalArchiveSourceFilesTable.$inferInsert;
export type LegalDocument = typeof legalDocumentsTable.$inferSelect;
export type NewLegalDocument = typeof legalDocumentsTable.$inferInsert;
export type LegalDocumentFile = typeof legalDocumentFilesTable.$inferSelect;
export type NewLegalDocumentFile = typeof legalDocumentFilesTable.$inferInsert;
