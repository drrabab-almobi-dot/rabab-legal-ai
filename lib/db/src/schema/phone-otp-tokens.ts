import { pgTable, serial, integer, text, timestamp, boolean } from "drizzle-orm/pg-core";
import { usersTable } from "./users";

export const phoneOtpTokensTable = pgTable("phone_otp_tokens", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull().references(() => usersTable.id, { onDelete: "cascade" }),
  /** Random UUID returned to the client so they can reference this OTP session */
  verifyToken: text("verify_token").notNull().unique(),
  /** 6-digit numeric OTP code */
  code: text("code").notNull(),
  expiresAt: timestamp("expires_at").notNull(),
  usedAt: timestamp("used_at"),
  /** Number of failed attempts to prevent brute-force */
  attempts: integer("attempts").notNull().default(0),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export type PhoneOtpToken = typeof phoneOtpTokensTable.$inferSelect;
