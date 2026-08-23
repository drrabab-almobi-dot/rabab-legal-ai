import { pgTable, serial, integer, text, timestamp } from "drizzle-orm/pg-core";
import { usersTable } from "./users";

/**
 * service_permissions — صلاحيات الخدمات الفردية
 *
 * يربط كل مستخدم بالخدمات التي سدّد قيمتها (أو منحت له مجاناً / بالاشتراك).
 * يُستعلم عنه قبل فتح أي شاشة خدمة للتحقق من وجود صلاحية سارية.
 */
export const servicePermissionsTable = pgTable("service_permissions", {
  id:              serial("id").primaryKey(),
  userId:          integer("user_id").notNull().references(() => usersTable.id, { onDelete: "cascade" }),
  /** نوع الخدمة: consultation | judicial | pleadings | contracts | research */
  serviceType:     text("service_type").notNull(),
  /** الحالة: active | expired | suspended */
  status:          text("status").notNull().default("active"),
  /** الرصيد المتبقي (null = غير محدود) */
  remainingBalance: integer("remaining_balance"),
  /** تاريخ الانتهاء (null = دائم) */
  expiresAt:       timestamp("expires_at"),
  /** المصدر: subscription | purchase | grant */
  source:          text("source").default("subscription"),
  createdAt:       timestamp("created_at").notNull().defaultNow(),
  updatedAt:       timestamp("updated_at").notNull().defaultNow(),
});

export type ServicePermission = typeof servicePermissionsTable.$inferSelect;
