import { pgTable, serial, integer, timestamp, pgEnum, boolean } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { usersTable } from "./users";
import { packagesTable } from "./packages";

export const subscriptionStatusEnum = pgEnum("subscription_status", ["active", "expired", "cancelled"]);

export const subscriptionsTable = pgTable("subscriptions", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull().references(() => usersTable.id),
  packageId: integer("package_id").notNull().references(() => packagesTable.id),
  status: subscriptionStatusEnum("status").notNull().default("active"),
  /** Legacy single-quota field — kept for backward compat */
  questionsUsed: integer("questions_used").notNull().default(0),
  questionsAllowed: integer("questions_allowed").notNull().default(0),
  /** Per-service usage counters (reset each billing period for paid plans) */
  consultationsUsed: integer("consultations_used").notNull().default(0),
  contractsUsed: integer("contracts_used").notNull().default(0),
  reviewsUsed: integer("reviews_used").notNull().default(0),
  /**
   * حماية المشتركين الحاليين: عندما تكون true تُعامَل حصة الاشتراك كـ 9999
   * (غير محدودة) بصرف النظر عن قيم الباقة — تُمنح تلقائياً للاشتراكات النشطة
   * قبل تخفيض حدود الباقات وتُعاد إلى false عند التجديد أو إنشاء اشتراك جديد.
   */
  grandfatheredUnlimited: boolean("grandfathered_unlimited").notNull().default(false),
  /** Start of current billing window — null for free trial (no reset) */
  billingPeriodStart: timestamp("billing_period_start", { withTimezone: true }),
  startDate: timestamp("start_date").notNull().defaultNow(),
  endDate: timestamp("end_date"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const insertSubscriptionSchema = createInsertSchema(subscriptionsTable).omit({ id: true, createdAt: true });
export type InsertSubscription = z.infer<typeof insertSubscriptionSchema>;
export type Subscription = typeof subscriptionsTable.$inferSelect;
