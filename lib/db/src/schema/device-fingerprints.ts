import { pgTable, serial, integer, text, timestamp } from "drizzle-orm/pg-core";
import { usersTable } from "./users";

/**
 * Links a browser fingerprint hash to a user account.
 * Used to detect multi-account abuse (creating new accounts to get more free trials).
 * Fingerprint is a SHA-256 hash of browser canvas + screen + UA (computed client-side).
 */
export const deviceFingerprintsTable = pgTable("device_fingerprints", {
  id:            serial("id").primaryKey(),
  fingerprintHash: text("fingerprint_hash").notNull().unique(),
  userId:        integer("user_id").notNull().references(() => usersTable.id, { onDelete: "cascade" }),
  linkedAt:      timestamp("linked_at", { withTimezone: true }).notNull().defaultNow(),
});

export type DeviceFingerprint = typeof deviceFingerprintsTable.$inferSelect;
