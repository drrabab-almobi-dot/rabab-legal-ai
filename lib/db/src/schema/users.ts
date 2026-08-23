import { pgTable, serial, text, integer, boolean, timestamp, pgEnum } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const userRoleEnum = pgEnum("user_role", ["user", "admin"]);

export const usersTable = pgTable("users", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  email: text("email").notNull().unique(),
  passwordHash: text("password_hash").notNull(),
  phone: text("phone"),
  role: userRoleEnum("role").notNull().default("user"),
  isActive: boolean("is_active").notNull().default(true),
  emailVerified: boolean("email_verified").notNull().default(true),
  freeConsultationsUsed: integer("free_consultations_used").notNull().default(0),
  phoneVerified: boolean("phone_verified").notNull().default(false),
  /** نوع الحساب: فرد أو منشأة */
  accountType: text("account_type").notNull().default("individual"),
  /** بيانات المنشأة (فقط عند accountType = 'entity') */
  entityName: text("entity_name"),
  entityCrNumber: text("entity_cr_number"),
  entityTaxNumber: text("entity_tax_number"),
  /** تاريخ انتهاء صلاحية التجربة المجانية (7 أيام من التسجيل) */
  trialExpiresAt: timestamp("trial_expires_at"),
  /** Expo push notification token — registered from the mobile app */
  pushToken: text("push_token"),
  /**
   * Incremented every time an admin re-enables the account (isActive false → true).
   * The value is embedded in every issued JWT; the auth middleware rejects any token
   * whose tokenVersion is lower than the current DB value, forcing a fresh login after
   * a re-enable even if the token has not been explicitly revoked.
   */
  tokenVersion: integer("token_version").notNull().default(1),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const insertUserSchema = createInsertSchema(usersTable).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertUser = z.infer<typeof insertUserSchema>;
export type User = typeof usersTable.$inferSelect;
