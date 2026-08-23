import { pgTable, serial, integer, text, boolean, timestamp } from "drizzle-orm/pg-core";
import { usersTable } from "./users";
import { subscriptionsTable } from "./subscriptions";

/**
 * Tracks individual service completions for quota deduction and grace-period dedup.
 *
 * Grace period: if a client sends the same clientSession UUID within 10 min
 * of a previous service_session for the same user + service_type, the server
 * treats it as a continuation of the same service (no new charge).
 */
export const serviceSessionsTable = pgTable("service_sessions", {
  id:             serial("id").primaryKey(),
  userId:         integer("user_id").notNull().references(() => usersTable.id, { onDelete: "cascade" }),
  subscriptionId: integer("subscription_id").references(() => subscriptionsTable.id),
  /** 'consultation' | 'contract_draft' | 'contract_review' */
  serviceType:    text("service_type").notNull(),
  /** Client-generated UUID sent with every request — used for grace-period dedup */
  clientSession:  text("client_session"),
  /** Grace window end: 10 minutes after first completion */
  graceEnd:       timestamp("grace_end", { withTimezone: true }),
  /** true once the service has been counted against the quota */
  counted:        boolean("counted").notNull().default(false),
  createdAt:      timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export type ServiceSession = typeof serviceSessionsTable.$inferSelect;
