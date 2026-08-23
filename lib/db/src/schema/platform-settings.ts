import { pgTable, text, jsonb, timestamp } from "drizzle-orm/pg-core";

/**
 * مفاتيح الإعدادات المنصّة — key/value store for feature flags and platform config.
 * Rows are persistent and updated via the admin panel without code changes.
 */
export const platformSettingsTable = pgTable("platform_settings", {
  key: text("key").primaryKey(),
  value: jsonb("value").notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

// ── Typed payload for "section_visibility" key ────────────────────────────────
export interface SectionVisibilitySettings {
  showJudicial: boolean;
  showCirculars: boolean;
  showLegalBlog: boolean;
  showRegulations: boolean;
  qualityThresholds: {
    judicial: number;   // min % required to re-enable judicial section
    circular: number;   // min % required to re-enable circulars section
    legal_blog: number; // min % required to re-enable legal blog section
  };
}

export const DEFAULT_SECTION_VISIBILITY: SectionVisibilitySettings = {
  showJudicial: false,
  showCirculars: false,
  showLegalBlog: false,
  showRegulations: true,
  qualityThresholds: { judicial: 80, circular: 75, legal_blog: 80 },
};
