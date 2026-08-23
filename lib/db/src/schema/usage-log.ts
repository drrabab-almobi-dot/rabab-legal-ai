import { pgTable, serial, integer, text, timestamp } from "drizzle-orm/pg-core";
import { usersTable } from "./users";
import { subscriptionsTable } from "./subscriptions";

/**
 * سجل الاستهلاك التفصيلي لكل مستخدم.
 * يُكتب عند كل commitService ناجحة.
 */
export const usageLogTable = pgTable("usage_log", {
  id:             serial("id").primaryKey(),
  userId:         integer("user_id").notNull().references(() => usersTable.id, { onDelete: "cascade" }),
  subscriptionId: integer("subscription_id").references(() => subscriptionsTable.id),
  serviceType:    text("service_type").notNull(), // 'consultation' | 'contract_draft' | 'contract_review'
  unitsDeducted:  integer("units_deducted").notNull().default(1),
  balanceAfter:   integer("balance_after"),       // null = تجربة مجانية
  description:    text("description"),            // ملاحظة اختيارية
  createdAt:      timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export type UsageLog = typeof usageLogTable.$inferSelect;
