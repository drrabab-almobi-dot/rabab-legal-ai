import { pgTable, serial, integer, text, timestamp, jsonb, customType } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";

const bytea = customType<{ data: Buffer; driverData: Buffer }>({
  dataType() { return "bytea"; },
  toDriver(val) { return val; },
  fromDriver(val) { return Buffer.isBuffer(val) ? val : Buffer.from(val); },
});

/**
 * MOJ Official Circulars — fetched from portaleservices.moj.gov.sa/TameemPortal/
 * Each row is one تعميم with clean digital Arabic text (no OCR/reversal issues).
 * The tameemId (MOJ's internal numeric ID) is the deduplication key.
 */
export const mojCircularsTable = pgTable("moj_circulars", {
  id: serial("id").primaryKey(),

  /** MOJ's internal numeric ID — the dedup key */
  tameemId: integer("tameem_id").unique().notNull(),

  /** Reference number shown in documents, e.g. "13/ت/9244" */
  tameemNo: text("tameem_no").notNull().default(""),

  /** Full Hijri date string, e.g. "1445/10/13" */
  hdate: text("hdate").notNull().default(""),

  /** Just the Hijri year for fast filtering, e.g. "1445" */
  hdateYear: text("hdate_year").notNull().default(""),

  /** Topic / subject of the circular */
  subject: text("subject").notNull().default(""),

  /** Body text — may be partial if portal truncated it */
  bodyText: text("body_text").notNull().default(""),

  /** Official portal URL with id query param */
  sourceUrl: text("source_url").notNull(),

  /** Current validity status: نافذ | معدل | ملغى | غير محدد */
  status: text("status").notNull().default("غير محدد"),

  /** List of related tameem_id values (circulars this one amends/cancels/references) */
  relatedTameemIds: jsonb("related_tameem_ids")
    .$type<number[]>()
    .default(sql`'[]'::jsonb`),

  /** Manually uploaded original image or PDF of the signed circular */
  originalImageData: bytea("original_image_data"),
  originalImageMime: text("original_image_mime"),

  /** ID of the linked knowledge_documents row (for vector/RAG search) */
  docId: integer("doc_id"),

  /** GPT-generated structured summary following the mandatory template */
  structuredSummary: jsonb("structured_summary").$type<Record<string, any>>(),

  fetchedAt: timestamp("fetched_at").notNull().defaultNow(),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export type MojCircular = typeof mojCircularsTable.$inferSelect;
export type NewMojCircular = typeof mojCircularsTable.$inferInsert;
