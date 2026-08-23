import { pgTable, serial, integer, text, boolean, timestamp } from "drizzle-orm/pg-core";
import { usersTable } from "./users";

/**
 * سجل رسائل الواتساب — يُحفظ دائماً بغض النظر عن حالة الإرسال.
 * adminDisabled=true يعني القناة مُعطَّلة من لوحة الإدارة.
 */
export const whatsappLogTable = pgTable("whatsapp_log", {
  id:            serial("id").primaryKey(),
  userId:        integer("user_id").references(() => usersTable.id, { onDelete: "set null" }),
  toNumber:      text("to_number"),
  messagePreview:text("message_preview").notNull(),
  sent:          boolean("sent").notNull().default(false),
  adminDisabled: boolean("admin_disabled").notNull().default(false),
  failReason:    text("fail_reason"),
  createdAt:     timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export type WhatsappLog = typeof whatsappLogTable.$inferSelect;
