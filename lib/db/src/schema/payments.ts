import { pgTable, serial, integer, text, numeric, timestamp, pgEnum } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { usersTable } from "./users";
import { packagesTable } from "./packages";

export const paymentStatusEnum = pgEnum("payment_status", ["pending", "paid", "failed", "refunded"]);
export const paymentGatewayEnum = pgEnum("payment_gateway", ["moyasar", "hyperpay", "tap"]);

export const paymentsTable = pgTable("payments", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull().references(() => usersTable.id),
  packageId: integer("package_id").notNull().references(() => packagesTable.id),
  amount: numeric("amount", { precision: 10, scale: 2 }).notNull(),
  vatAmount: numeric("vat_amount", { precision: 10, scale: 2 }).notNull().default("0"),
  totalAmount: numeric("total_amount", { precision: 10, scale: 2 }).notNull(),
  discountAmount: numeric("discount_amount", { precision: 10, scale: 2 }).notNull().default("0"),
  couponCode: text("coupon_code"),
  status: paymentStatusEnum("status").notNull().default("pending"),
  gateway: paymentGatewayEnum("gateway"),
  gatewayRef: text("gateway_ref"),
  billingName: text("billing_name"),
  billingEmail: text("billing_email"),
  billingPhone: text("billing_phone"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const insertPaymentSchema = createInsertSchema(paymentsTable).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertPayment = z.infer<typeof insertPaymentSchema>;
export type Payment = typeof paymentsTable.$inferSelect;
