import { pgTable, serial, integer, text, timestamp, pgEnum, jsonb, boolean } from "drizzle-orm/pg-core";
import { consultationsTable } from "./consultations";

export const messageRoleEnum = pgEnum("message_role", ["user", "assistant", "system"]);

export const consultationMessagesTable = pgTable("consultation_messages", {
  id: serial("id").primaryKey(),
  consultationId: integer("consultation_id")
    .notNull()
    .references(() => consultationsTable.id, { onDelete: "cascade" }),
  role: messageRoleEnum("role").notNull(),
  content: text("content").notNull(),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  usedLiveSearch: boolean("used_live_search").notNull().default(false),
  /** Verification sources persisted from the RAG layer (assistant messages only). */
  sources: jsonb("sources"),
  /** Original file name when the message was sent with an attachment (user messages only). */
  attachmentName: text("attachment_name"),
});

export type ConsultationMessage = typeof consultationMessagesTable.$inferSelect;
