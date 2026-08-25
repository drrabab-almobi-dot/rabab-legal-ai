/**
 * email-config.ts
 * Reads outbound email configuration from the DB (platformSettingsTable,
 * key: "email_config"), with a short in-memory cache and environment fallback.
 *
 * Gmail / Google Workspace SMTP is preferred whenever SMTP_HOST, SMTP_USER,
 * and SMTP_PASS are present. Resend remains available for existing deployments.
 *
 * Stored shape: { apiKey: string; fromAddress: string }
 */

import { db, platformSettingsTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { logger } from "./logger";

export interface EmailConfig {
  apiKey: string | null;
  fromAddress: string;
  provider: "smtp" | "resend" | "unconfigured";
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

    const smtpConfigured = Boolean(
      process.env.SMTP_HOST && process.env.SMTP_USER && process.env.SMTP_PASS,
    );
    const apiKey = stored?.apiKey || process.env.RESEND_API_KEY || (!smtpConfigured ? process.env.SMTP_PASS : null) || null;

    _cache = {
      apiKey,
      fromAddress:
        stored?.fromAddress ||
        process.env.SMTP_FROM ||
        process.env.SMTP_USER ||
        "info@rabablegal.com",
      provider: smtpConfigured ? "smtp" : (apiKey ? "resend" : "unconfigured"),
    };
  } catch (err) {
    logger.warn({ err }, "[email-config] فشل قراءة الإعدادات من قاعدة البيانات، تم الرجوع إلى المتغيرات البيئية");
    const smtpConfigured = Boolean(
      process.env.SMTP_HOST && process.env.SMTP_USER && process.env.SMTP_PASS,
    );
    const apiKey = process.env.RESEND_API_KEY || (!smtpConfigured ? process.env.SMTP_PASS : null) || null;
    _cache = {
      apiKey,
      fromAddress:
        process.env.SMTP_FROM || process.env.SMTP_USER || "info@rabablegal.com",
      provider: smtpConfigured ? "smtp" : (apiKey ? "resend" : "unconfigured"),
    };
  }

  _cacheTs = now;
  return _cache!;
}
