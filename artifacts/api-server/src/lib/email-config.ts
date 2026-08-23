/**
 * email-config.ts
 * Reads email/API-key configuration from the DB (platformSettingsTable, key: "email_config"),
 * with a short in-memory cache and fallback to environment variables.
 *
 * Stored shape: { apiKey: string; fromAddress: string }
 */

import { db, platformSettingsTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { logger } from "./logger";

export interface EmailConfig {
  apiKey: string | null;
  fromAddress: string;
}

let _cache: EmailConfig | null = null;
let _cacheTs = 0;
const CACHE_TTL_MS = 2 * 60 * 1000; // 2 minutes

export function invalidateEmailConfigCache(): void {
  _cache = null;
  _cacheTs = 0;
}

export async function getEmailConfig(): Promise<EmailConfig> {
  const now = Date.now();
  if (_cache && now - _cacheTs < CACHE_TTL_MS) return _cache;

  try {
    const rows = await db
      .select()
      .from(platformSettingsTable)
      .where(eq(platformSettingsTable.key, "email_config"));

    const stored = rows[0]?.value as { apiKey?: string; fromAddress?: string } | undefined;

    _cache = {
      apiKey: stored?.apiKey || process.env.RESEND_API_KEY || process.env.SMTP_PASS || null,
      fromAddress:
        stored?.fromAddress ||
        process.env.SMTP_FROM ||
        process.env.SMTP_USER ||
        "info@rabablegal.com",
    };
  } catch (err) {
    logger.warn({ err }, "[email-config] فشل قراءة الإعدادات من قاعدة البيانات، تم الرجوع إلى المتغيرات البيئية");
    _cache = {
      apiKey: process.env.RESEND_API_KEY || process.env.SMTP_PASS || null,
      fromAddress:
        process.env.SMTP_FROM || process.env.SMTP_USER || "info@rabablegal.com",
    };
  }

  _cacheTs = now;
  return _cache!;
}
