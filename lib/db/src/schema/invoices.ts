import { pgTable, serial, integer, text, numeric, timestamp, pgEnum } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { usersTable } from "./users";
import { paymentsTable } from "./payments";

export const invoiceStatusEnum = pgEnum("invoice_status", ["issued", "cancelled"]);

export const invoicesTable = pgTable("invoices", {
  id: serial("id").primaryKey(),
  invoiceNumber: text("invoice_number").notNull().unique(),
  userId: integer("user_id").notNull().references(() => usersTable.id),
  paymentId: integer("payment_id").notNull().references(() => paymentsTable.id),
  amount: numeric("amount", { precision: 10, scale: 2 }).notNull(),
  vatAmount: numeric("vat_amount", { precision: 10, scale: 2 }).notNull().default("0"),
  totalAmount: numeric("total_amount", { precision: 10, scale: 2 }).notNull(),
  discountAmount: numeric("discount_amount", { precision: 10, scale: 2 }).notNull().default("0"),
  billingName: text("billing_name").notNull(),
  billingEmail: text("billing_email").notNull(),
  status: invoiceStatusEnum("status").notNull().default("issued"),
  packageNameAr: text("package_name_ar").notNull(),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const insertInvoiceSchema = createInsertSchema(invoicesTable).omit({ id: true, createdAt: true });
export type InsertInvoice = z.infer<typeof insertInvoiceSchema>;
export type Invoice = typeof invoicesTable.$inferSelect;
