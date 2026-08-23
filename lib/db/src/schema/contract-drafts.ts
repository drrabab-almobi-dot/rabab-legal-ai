import { pgTable, serial, integer, text, timestamp, unique, boolean } from "drizzle-orm/pg-core";
import { usersTable } from "./users";
import { serviceSessionsTable } from "./service-sessions";

/**
 * Persists the latest edited draft text for a contract session.
 * One row per (user_id, service_session_id) — upserted on every save.
 */
export const contractDraftsTable = pgTable("contract_drafts", {
  id:               serial("id").primaryKey(),
  userId:           integer("user_id").notNull().references(() => usersTable.id, { onDelete: "cascade" }),
  serviceSessionId: integer("service_session_id").references(() => serviceSessionsTable.id, { onDelete: "cascade" }),
  draftText:        text("draft_text").notNull(),
  /** Whether Tavily live-web search was used when this draft was generated. */
  usedLiveSearch:   boolean("used_live_search").notNull().default(false),
  createdAt:        timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt:        timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => ({
  uniqUserSession: unique("contract_drafts_user_session_uniq").on(t.userId, t.serviceSessionId),
}));

export type ContractDraft = typeof contractDraftsTable.$inferSelect;
