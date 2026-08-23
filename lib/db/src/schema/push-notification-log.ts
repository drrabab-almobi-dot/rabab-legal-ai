import { pgTable, serial, integer, text, timestamp } from "drizzle-orm/pg-core";
import { usersTable } from "./users";

/**
 * Records every push notification that has been successfully sent.
 * Used to prevent duplicate notifications when the server restarts
 * multiple times in a single day.
 */
export const pushNotificationLogTable = pgTable("push_notification_log", {
  id: serial("id").primaryKey(),
  userId: integer("user_id")
    .notNull()
    .references(() => usersTable.id),
  /** Notification category, e.g. 'subscription_expiry' */
  type: text("type").notNull(),
  sentAt: timestamp("sent_at", { withTimezone: true }).notNull().defaultNow(),
});

export type PushNotificationLog = typeof pushNotificationLogTable.$inferSelect;
