import { pgTable, serial, integer, jsonb, timestamp, text } from "drizzle-orm/pg-core";
import { consultationsTable } from "./consultations";

export const consultationParamsHistoryTable = pgTable("consultation_params_history", {
  id: serial("id").primaryKey(),
  consultationId: integer("consultation_id").notNull().references(() => consultationsTable.id, { onDelete: "cascade" }),
  oldParams: jsonb("old_params").$type<Record<string, string> | null>(),
  newParams: jsonb("new_params").$type<Record<string, string> | null>(),
  updatedBy: integer("updated_by"),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});
