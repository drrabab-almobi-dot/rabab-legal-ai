import { pgTable, serial, text, integer, timestamp } from "drizzle-orm/pg-core";
import { usersTable } from "./users";

/**
 * Organizations — منشآت الأعمال
 * Represents a team account billed under a single business subscription.
 * The owner holds the subscription; all members share its quota pool.
 */
export const organizationsTable = pgTable("organizations", {
  id: serial("id").primaryKey(),
  /** صاحب المنشأة — المستخدم الذي اشترى الباقة والمسؤول عن الفوترة */
  ownerId: integer("owner_id").notNull().references(() => usersTable.id),
  name: text("name").notNull(),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

/**
 * Org Members — أعضاء المنشأة
 * status: pending (invited, not yet joined) | active (member) | removed
 */
export const orgMembersTable = pgTable("org_members", {
  id: serial("id").primaryKey(),
  orgId: integer("org_id").notNull().references(() => organizationsTable.id),
  /** المستخدم المُضاف — null حتى يقبل الدعوة */
  userId: integer("user_id").references(() => usersTable.id),
  /** البريد الإلكتروني المدعو */
  email: text("email").notNull(),
  /** pending | active | removed */
  status: text("status").notNull().default("pending"),
  /** رمز الدعوة — UUID، يُرسَل في الرابط بالبريد */
  inviteToken: text("invite_token").unique(),
  invitedAt: timestamp("invited_at").notNull().defaultNow(),
  joinedAt: timestamp("joined_at"),
});

export type Organization = typeof organizationsTable.$inferSelect;
export type OrgMember = typeof orgMembersTable.$inferSelect;
