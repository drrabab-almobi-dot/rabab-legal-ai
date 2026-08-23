import { pgTable, serial, integer, smallint, timestamp } from "drizzle-orm/pg-core";

export const responseRatingsTable = pgTable("response_ratings", {
  id:             serial("id").primaryKey(),
  consultationId: integer("consultation_id").notNull(),
  messageId:      integer("message_id").notNull(),
  userId:         integer("user_id").notNull(),
  rating:         smallint("rating").notNull().default(1),
  createdAt:      timestamp("created_at").notNull().defaultNow(),
});

export type ResponseRating = typeof responseRatingsTable.$inferSelect;
