import { pgTable, serial, text, integer, real, timestamp, pgEnum, jsonb, customType } from "drizzle-orm/pg-core";

const bytea = customType<{ data: Buffer; driverData: Buffer }>({
  dataType() { return "bytea"; },
  toDriver(val) { return val; },
  fromDriver(val) { return val; },
});

// ── Codex status ──────────────────────────────────────────────────────────────
export const codexStatusEnum = pgEnum("codex_status", [
  "pending",       // رُفع ولم يُعالَج
  "extracting",    // جارٍ استخراج القضايا
  "ready",         // جاهز للاستخدام
  "error",         // فشل الاستخراج
]);

// ── Litigation stages ─────────────────────────────────────────────────────────
export const litigationStageEnum = pgEnum("litigation_stage", [
  "ابتدائي",
  "استئناف",
  "تمييز",
  "عالي",
  "غير محدد",
]);

// ── Legal Codices — الملفات الأصلية للمدونات ────────────────────────────────
export const legalCodicesTable = pgTable("legal_codices", {
  id: serial("id").primaryKey(),
  title:         text("title").notNull(),          // اسم المدونة
  publisher:     text("publisher"),                // الجهة الناشرة
  court:         text("court"),                    // المحكمة / الجهة
  year:          text("year"),                     // سنة الإصدار
  totalPages:    integer("total_pages"),           // إجمالي صفحات الملف
  totalCases:    integer("total_cases").default(0),// عدد القضايا المستخرجة
  status:        codexStatusEnum("status").notNull().default("pending"),
  errorMessage:  text("error_message"),
  fileData:      bytea("file_data").notNull(),     // PDF binary
  fileSize:      integer("file_size"),
  fileHash:      text("file_hash"),                // SHA-256 dedup
  extractionJobId: text("extraction_job_id"),      // progress tracking
  createdAt:     timestamp("created_at").notNull().defaultNow(),
  updatedAt:     timestamp("updated_at").notNull().defaultNow(),
});

// ── Legal Cases — القضايا المستخرجة من المدونات ──────────────────────────────
export const legalCasesTable = pgTable("legal_cases", {
  id:             serial("id").primaryKey(),
  codexId:        integer("codex_id").notNull().references(() => legalCodicesTable.id, { onDelete: "cascade" }),
  
  // ── Reference metadata (بيانات الاستشهاد) ─────────────────────────────
  caseNo:         text("case_no"),                 // رقم القضية
  rulingNo:       text("ruling_no"),               // رقم الحكم
  rulingDateHijri: text("ruling_date_hijri"),      // التاريخ الهجري
  rulingDateGregorian: text("ruling_date_gregorian"), // التاريخ الميلادي
  court:          text("court"),                   // المحكمة / الجهة
  circuit:        text("circuit"),                 // الدائرة
  litigationStage: text("litigation_stage"),       // درجة التقاضي
  disputeSubject: text("dispute_subject"),         // موضوع النزاع
  legalPrinciple: text("legal_principle"),         // المبدأ القضائي
  legalArticles:  text("legal_articles").array(),  // مواد نظامية مطبّقة

  // ── Page ranges (أرقام الصفحات) ───────────────────────────────────────
  pageStartFile:    integer("page_start_file"),    // ترتيب الصفحة في الملف (للعارض)
  pageEndFile:      integer("page_end_file"),
  pageStartPrinted: text("page_start_printed"),   // الرقم المطبوع (للاستشهاد)
  pageEndPrinted:   text("page_end_printed"),

  // ── Extracted content (للبحث والفهرسة فقط — لا يُعرض مباشرة) ──────────
  summary:       text("summary"),                  // ملخص القضية
  reasoning:     text("reasoning"),                // التسبيب
  ruling:        text("ruling"),                   // المنطوق / الحكم
  rawText:       text("raw_text"),                 // النص الكامل للفهرسة

  // ── Confidence scores (درجة الثقة — أي حقل < 0.5 يُعرض "غير متوفر") ──
  summaryConfidence:   real("summary_confidence").default(0),
  reasoningConfidence: real("reasoning_confidence").default(0),
  rulingConfidence:    real("ruling_confidence").default(0),

  // ── Extraction status ────────────────────────────────────────────────
  extractionError: text("extraction_error"),
  
  createdAt:     timestamp("created_at").notNull().defaultNow(),
  updatedAt:     timestamp("updated_at").notNull().defaultNow(),
});

export type LegalCodex    = typeof legalCodicesTable.$inferSelect;
export type LegalCodexNew = typeof legalCodicesTable.$inferInsert;
export type LegalCase     = typeof legalCasesTable.$inferSelect;
export type LegalCaseNew  = typeof legalCasesTable.$inferInsert;
