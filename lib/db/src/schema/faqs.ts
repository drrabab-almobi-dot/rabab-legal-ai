import { pgTable, serial, text, integer, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const faqsTable = pgTable("faqs", {
  id: serial("id").primaryKey(),
  questionAr: text("question_ar").notNull(),
  answerAr: text("answer_ar").notNull(),
  sortOrder: integer("sort_order").notNull().default(0),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const insertFaqSchema = createInsertSchema(faqsTable).omit({ id: true, createdAt: true });
export type InsertFaq = z.infer<typeof insertFaqSchema>;
export type Faq = typeof faqsTable.$inferSelect;
