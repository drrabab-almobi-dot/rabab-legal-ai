import { pgTable, serial, text, integer, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const serviceAreasTable = pgTable("service_areas", {
  id: serial("id").primaryKey(),
  nameAr: text("name_ar").notNull(),
  icon: text("icon").notNull().default("Scale"),
  description: text("description").notNull().default(""),
  sortOrder: integer("sort_order").notNull().default(0),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const insertServiceAreaSchema = createInsertSchema(serviceAreasTable).omit({ id: true, createdAt: true });
export type InsertServiceArea = z.infer<typeof insertServiceAreaSchema>;
export type ServiceArea = typeof serviceAreasTable.$inferSelect;
