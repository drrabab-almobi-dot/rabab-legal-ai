/**
 * Email sender — supports Gmail / Google Workspace SMTP and Resend.
 *
 * Configuration priority (highest → lowest):
 *   1. Gmail / Google Workspace SMTP when SMTP_HOST, SMTP_USER, and SMTP_PASS exist
 *   2. DB setting stored via admin panel  (platformSettingsTable key: "email_config")
 *   3. RESEND_API_KEY env var
 *
 * From address priority:
 *   1. DB setting
 *   2. SMTP_FROM env var
 *   3. SMTP_USER env var
 *   4. "info@rabablegal.com"  (hard default)
 *
 * If no API key is present the module logs a warning and skips sending silently.
 */

import nodemailer, { type Transporter } from "nodemailer";
import { logger } from "./logger";
import { getEmailConfig } from "./email-config";

const RESEND_API = "https://api.resend.com/emails";
let transporter: Transporter | null = null;
let transporterFingerprint = "";

export interface SendEmailOptions {
  to: string;
  subject: string;
  html: string;
  text?: string;
}

function getSmtpTransporter(): Transporter {
  const host = process.env.SMTP_HOST!;
  const port = Number(process.env.SMTP_PORT ?? "465");
  const secure = process.env.SMTP_SECURE
    ? process.env.SMTP_SECURE === "true"
    : port === 465;
  const fingerprint = `${host}:${port}:${secure}:${process.env.SMTP_USER}`;

  if (!transporter || transporterFingerprint !== fingerprint) {
    transporter = nodemailer.createTransport({
      host,
      port,
      secure,
      auth: {
        user: process.env.SMTP_USER!,
        pass: process.env.SMTP_PASS!,
      },
    });
    transporterFingerprint = fingerprint;
  }

  return transporter;
}

export async function sendEmail(opts: SendEmailOptions): Promise<boolean> {
  const cfg = await getEmailConfig();

  if (cfg.provider === "unconfigured") {
    logger.warn({ to: opts.to }, "📧 تم تخطي الإرسال — لا توجد إعدادات Gmail SMTP أو Resend");
    return false;
  }

  const fromLine = cfg.fromAddress.includes("<")
    ? cfg.fromAddress
    : `RABAB LEGAL AI <${cfg.fromAddress}>`;

  if (cfg.provider === "smtp") {
    try {
      await getSmtpTransporter().sendMail({
        from: fromLine,
        to: opts.to,
        subject: opts.subject,
        html: opts.html,
        ...(opts.text ? { text: opts.text } : {}),
      });
      logger.info({ to: opts.to, subject: opts.subject, provider: "gmail-smtp" }, "📧 تم إرسال البريد الإلكتروني بنجاح");
      return true;
    } catch (err) {
      logger.error({ err, to: opts.to, provider: "gmail-smtp" }, "📧 فشل إرسال البريد الإلكتروني عبر Gmail SMTP");
      return false;
    }
  }

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
