import { json, pgTable, timestamp, varchar } from "drizzle-orm/pg-core";

/**
 * Backing store for express-session via connect-pg-simple.
 *
 * Keeping this table in the application schema means `drizzle-kit push` creates
 * it with every new environment, while the runtime store keeps a defensive
 * `createTableIfMissing` fallback for existing installations.
 */
export const sessionStoreTable = pgTable("session", {
  sid: varchar("sid").primaryKey(),
  sess: json("sess").notNull(),
  expire: timestamp("expire", { precision: 6 }).notNull(),
});
