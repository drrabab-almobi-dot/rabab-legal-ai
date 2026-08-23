import { pgTable, serial, integer, text, timestamp, pgEnum, jsonb, unique } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { usersTable } from "./users";
import { subscriptionsTable } from "./subscriptions";
import { serviceSessionsTable } from "./service-sessions";

export const consultationStatusEnum = pgEnum("consultation_status", ["pending", "answered", "closed"]);

export const consultationsTable = pgTable("consultations", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull().references(() => usersTable.id),
  subscriptionId: integer("subscription_id").references(() => subscriptionsTable.id),
  /** The exact quota reservation created for this consultation's first reply. */
  serviceSessionId: integer("service_session_id").references(() => serviceSessionsTable.id, { onDelete: "set null" }),
  title: text("title").notNull(),
  areaAr: text("area_ar"),
  taskType: text("task_type"),
  taskParams: jsonb("task_params").$type<Record<string, string>>(),
  status: consultationStatusEnum("status").notNull().default("pending"),
  chatgptUrl: text("chatgpt_url").notNull().default("https://chatgpt.com/g/g-69ffbc442f9081919567bddf4735670a-rabab-legal-ai"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
  reminderSentAt: timestamp("reminder_sent_at"),
}, (table) => ({
  serviceSessionUnique: unique("consultations_service_session_unique").on(table.serviceSessionId),
}));

export const insertConsultationSchema = createInsertSchema(consultationsTable).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertConsultation = z.infer<typeof insertConsultationSchema>;
export type Consultation = typeof consultationsTable.$inferSelect;
