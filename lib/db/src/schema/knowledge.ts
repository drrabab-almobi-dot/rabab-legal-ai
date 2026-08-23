import { pgTable, serial, integer, text, timestamp, jsonb, pgEnum, customType, index } from "drizzle-orm/pg-core";

/** PostgreSQL bytea type for storing binary file data */
const bytea = customType<{ data: Buffer; driverData: Buffer }>({
  dataType() { return "bytea"; },
  toDriver(val) { return val; },
  fromDriver(val) { return Buffer.isBuffer(val) ? val : Buffer.from(val); },
});

/**
 * PostgreSQL tsvector type for full-text search.
 * Populated and kept up-to-date by a DB trigger (see migrations/add_search_vector.sql).
 */
const tsvector = customType<{ data: string; driverData: string }>({
  dataType() { return "tsvector"; },
});
export const documentStatusEnum = pgEnum("document_status", ["pending", "indexing", "indexed", "error", "queued", "retrying"]);

/**
 * Category of a knowledge document.
 * judicial  = مدونات قضائية / سوابق
 * circular  = تعاميم وأوامر
 * regulation = أنظمة (هيئة الخبراء)
 * contract  = عقود ونماذج
 * general   = عام (افتراضي)
 */
export const documentCategoryEnum = pgEnum("document_category", [
  "judicial", "circular", "regulation", "contract", "general"
]);

/**
 * Extracted case metadata for judicial documents.
 * Each field has a confidence level; only high/medium fields are stored.
 */
export interface CaseMetadata {
  caseNumber?: string | null;       // رقم القضية
  rulingNumber?: string | null;     // رقم الحكم
  hijriDate?: string | null;        // التاريخ هجري
  gregorianDate?: string | null;    // التاريخ ميلادي
  court?: string | null;            // المحكمة / الدائرة
  litigationStage?: string | null;  // ابتدائي / استئناف / تمييز / ديوان_المظالم
  disputeSubject?: string | null;   // موضوع النزاع
  deedNumber?: string | null;       // رقم الصك / السند
  confidence?: Record<string, 'high' | 'medium' | 'low'>;
}

/**
 * Source type of a knowledge document.
 * telegram     = مستورد من قناة تلجرام (يخضع لمفتاح التشغيل)
 * official     = بوابة الأنظمة السعودية (هيئة الخبراء) — دائماً مفعّل
 * lawyer_upload= رفعه المحامي يدوياً داخل حسابه — دائماً مفعّل
 * unknown      = مصدر غير محدد (يُعامَل بحذر)
 */
export const documentSourceTypeEnum = pgEnum("document_source_type", [
  "telegram", "official", "lawyer_upload", "unknown",
]);

export const knowledgeDocumentsTable = pgTable("knowledge_documents", {
  id: serial("id").primaryKey(),
  filename: text("filename").notNull(),
  mimeType: text("mime_type").notNull().default("text/plain"),
  sourceUrl: text("source_url"),
  sourceType: text("source_type").notNull().default("unknown"),
  category: documentCategoryEnum("category").notNull().default("general"),
  status: documentStatusEnum("status").notNull().default("pending"),
  errorMessage: text("error_message"),
  totalChunks: integer("total_chunks").notNull().default(0),
  extractedText: text("extracted_text"),
  fileData: bytea("file_data"),        // original file binary (for retrieval)
  fileSize: integer("file_size"),      // original file size in bytes
  fileHash: text("file_hash"),         // SHA-256 hex — deduplication key
  /** Structured case metadata extracted by AI for judicial documents */
  caseMetadata: jsonb("case_metadata").$type<CaseMetadata>(),
  /** Cached structured analysis for circular documents (issuer, summary, practical_effect, etc.).
   *  Populated on first open of the circular card; cleared automatically on re-index. */
  structuredData: jsonb("structured_data").$type<Record<string, any>>(),
  archivedAt: timestamp("archived_at"), // إذا مضبوط = مؤرشف (لا يُحذف نهائياً)
  /** آخر مرة نُظِّفت فيها بيانات الاستشهاد الفاسدة لهذه الوثيقة */
  lastCleanedAt: timestamp("last_cleaned_at"),
  /** عدد مرات تنظيف بيانات الاستشهاد الفاسدة (> 1 يُعدّ مؤشر خطر) */
  cleanCount: integer("clean_count").notNull().default(0),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const knowledgeChunksTable = pgTable("knowledge_chunks", {
  id: serial("id").primaryKey(),
  documentId: integer("document_id")
    .notNull()
    .references(() => knowledgeDocumentsTable.id, { onDelete: "cascade" }),
  chunkIndex: integer("chunk_index").notNull(),
  content: text("content").notNull(),
  embedding: jsonb("embedding").$type<number[]>(),
  /** Page number in the original PDF where this chunk starts (1-based, null for non-PDF or legacy) */
  pageStart: integer("page_start"),
  /** Page number in the original PDF where this chunk ends */
  pageEnd: integer("page_end"),
  /**
   * Full-text search vector populated by a DB trigger.
   * Used by retrieveRelevantChunks to pre-filter in SQL before loading embeddings.
   * See migrations/add_search_vector.sql for the trigger + GIN index definition.
   */
  searchVector: tsvector("search_vector"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export type KnowledgeDocument = typeof knowledgeDocumentsTable.$inferSelect;
export type KnowledgeChunk = typeof knowledgeChunksTable.$inferSelect;
