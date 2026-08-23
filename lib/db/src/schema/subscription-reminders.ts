import { pgTable, serial, integer, text, timestamp } from "drizzle-orm/pg-core";
import { subscriptionsTable } from "./subscriptions";

/**
 * Tracks renewal reminder emails that have already been sent.
 * Prevents sending the same reminder more than once per subscription period.
 */
export const subscriptionRemindersTable = pgTable("subscription_reminders", {
  id: serial("id").primaryKey(),
  subscriptionId: integer("subscription_id")
    .notNull()
    .references(() => subscriptionsTable.id),
  /** e.g. '7_days_before_expiry' */
  reminderType: text("reminder_type").notNull(),
  sentAt: timestamp("sent_at", { withTimezone: true }).notNull().defaultNow(),
});

export type SubscriptionReminder = typeof subscriptionRemindersTable.$inferSelect;
