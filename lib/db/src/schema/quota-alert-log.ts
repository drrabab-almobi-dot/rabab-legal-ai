import { pgTable, serial, integer, text, timestamp } from "drizzle-orm/pg-core";
import { usersTable } from "./users";

/**
 * يسجّل تنبيهات عتبات الاستهلاك لمنع التكرار.
 * alertType: '80pct' | '2remaining' | 'depleted' | '3day_expiry'
 */
export const quotaAlertLogTable = pgTable("quota_alert_log", {
  id:        serial("id").primaryKey(),
  userId:    integer("user_id").notNull().references(() => usersTable.id, { onDelete: "cascade" }),
  alertType: text("alert_type").notNull(),
  /** مفتاح المرجع لمنع التكرار ضمن نفس دورة الاشتراك */
  refKey:    text("ref_key").notNull(), // e.g. "sub-42-80pct"
  sentAt:    timestamp("sent_at", { withTimezone: true }).notNull().defaultNow(),
});

export type QuotaAlertLog = typeof quotaAlertLogTable.$inferSelect;
