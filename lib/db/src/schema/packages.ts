import { pgTable, serial, text, integer, boolean, timestamp, numeric, pgEnum } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const packageTypeEnum = pgEnum("package_type", ["free", "questions", "monthly", "business"]);

export const packagesTable = pgTable("packages", {
  id: serial("id").primaryKey(),
  nameAr: text("name_ar").notNull(),
  nameEn: text("name_en").notNull(),
  descriptionAr: text("description_ar"),
  price: numeric("price", { precision: 10, scale: 2 }).notNull().default("0"),
  questionsAllowed: integer("questions_allowed").notNull().default(0),
  /** Per-service monthly quotas — replaces the single questionsAllowed field */
  consultationsAllowed: integer("consultations_allowed").notNull().default(0),
  contractsAllowed: integer("contracts_allowed").notNull().default(0),
  reviewsAllowed: integer("reviews_allowed").notNull().default(0),
  /** Number of user seats (for office/team packages) */
  seats: integer("seats").notNull().default(1),
  /** 'monthly' | 'annual' */
  billingPeriod: text("billing_period").notNull().default("monthly"),
  /** VAT % — default 15 for KSA */
  vatRate: numeric("vat_rate", { precision: 5, scale: 2 }).notNull().default("15.00"),
  type: packageTypeEnum("type").notNull().default("questions"),
  isActive: boolean("is_active").notNull().default(true),
  isPopular: boolean("is_popular").notNull().default(false),
  features: text("features").array().notNull().default([]),
  sortOrder: integer("sort_order").notNull().default(0),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const insertPackageSchema = createInsertSchema(packagesTable).omit({ id: true, createdAt: true });
export type InsertPackage = z.infer<typeof insertPackageSchema>;
export type Package = typeof packagesTable.$inferSelect;
