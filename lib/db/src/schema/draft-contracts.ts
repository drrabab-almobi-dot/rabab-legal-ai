import { pgTable, serial, integer, text, timestamp } from "drizzle-orm/pg-core";
import { usersTable } from "./users";

export const draftContractsTable = pgTable("draft_contracts", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull().references(() => usersTable.id).unique(),
  description: text("description").notNull().default(""),
  draft: text("draft").notNull().default(""),
  editedDraft: text("edited_draft").notNull().default(""),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export type DraftContract = typeof draftContractsTable.$inferSelect;
export type InsertDraftContract = typeof draftContractsTable.$inferInsert;
