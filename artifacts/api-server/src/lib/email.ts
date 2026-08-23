/**
 * Email sender — uses Resend HTTP API directly (bypasses SMTP which is blocked in Replit).
 *
 * Configuration priority (highest → lowest):
 *   1. DB setting stored via admin panel  (platformSettingsTable key: "email_config")
 *   2. RESEND_API_KEY env var
 *   3. SMTP_PASS env var  (legacy alias)
 *
 * From address priority:
 *   1. DB setting
 *   2. SMTP_FROM env var
 *   3. SMTP_USER env var
 *   4. "info@rabablegal.com"  (hard default)
 *
 * If no API key is present the module logs a warning and skips sending silently.
 */

import { logger } from "./logger";
import { getEmailConfig } from "./email-config";

const RESEND_API = "https://api.resend.com/emails";

export interface SendEmailOptions {
  to: string;
  subject: string;
  html: string;
  text?: string;
}

export async function sendEmail(opts: SendEmailOptions): Promise<boolean> {
  const cfg = await getEmailConfig();

  if (!cfg.apiKey) {
    logger.warn({ to: opts.to }, "📧 تم تخطي الإرسال — لا يوجد RESEND_API_KEY أو SMTP_PASS مضبوط");
    return false;
  }

  const fromLine = cfg.fromAddress.includes("<")
    ? cfg.fromAddress
    : `RABAB LEGAL AI <${cfg.fromAddress}>`;

  try {
    const res = await fetch(RESEND_API, {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${cfg.apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: fromLine,
        to: [opts.to],
        subject: opts.subject,
        html: opts.html,
        ...(opts.text ? { text: opts.text } : {}),
      }),
    });

    if (!res.ok) {
      const body = await res.text().catch(() => "");
      logger.error({ to: opts.to, status: res.status, body }, "📧 فشل إرسال البريد الإلكتروني");
      return false;
    }

    logger.info({ to: opts.to, subject: opts.subject }, "📧 تم إرسال البريد الإلكتروني بنجاح");
    return true;
  } catch (err) {
    logger.error({ err, to: opts.to }, "📧 فشل إرسال البريد الإلكتروني");
    return false;
  }
}
