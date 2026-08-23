/**
 * WhatsApp notification service via Twilio WhatsApp API.
 *
 * Environment variables (all optional — falls back to no-op if absent):
 *   TWILIO_ACCOUNT_SID   – Twilio Account SID
 *   TWILIO_AUTH_TOKEN    – Twilio Auth Token
 *   TWILIO_WHATSAPP_FROM – Sender number, e.g. "whatsapp:+14155238886"
 *
 * Phone numbers passed in must start with "+" and country code (E.164).
 * Saudi numbers stored as "05xxxxxxxx" are auto-prefixed with "+966".
 */

import { logger } from "./logger";

function normalizePhone(phone: string): string | null {
  if (!phone) return null;
  const digits = phone.replace(/\D/g, "");
  // Already E.164-ish (starts with country code after +)
  if (phone.startsWith("+")) return "+" + digits;
  // Saudi local format 05xxxxxxxx → +9665xxxxxxxx
  if (digits.startsWith("05") && digits.length === 10) return "+966" + digits.slice(1);
  // Saudi without leading zero 5xxxxxxxx
  if (digits.startsWith("5") && digits.length === 9) return "+966" + digits;
  // Already has 966 prefix
  if (digits.startsWith("966")) return "+" + digits;
  return null;
}

function isConfigured(): boolean {
  return !!(
    process.env.TWILIO_ACCOUNT_SID &&
    process.env.TWILIO_AUTH_TOKEN &&
    process.env.TWILIO_WHATSAPP_FROM
  );
}

export async function sendWhatsApp(to: string, body: string): Promise<boolean> {
  if (!isConfigured()) {
    logger.warn({ to }, "📱 واتساب: إعدادات Twilio مفقودة — تخطي الإرسال");
    return false;
  }

  const e164 = normalizePhone(to);
  if (!e164) {
    logger.warn({ to }, "📱 واتساب: رقم هاتف غير صالح — تخطي");
    return false;
  }

  const sid = process.env.TWILIO_ACCOUNT_SID!;
  const token = process.env.TWILIO_AUTH_TOKEN!;
  const from = process.env.TWILIO_WHATSAPP_FROM!;
  const whatsappTo = `whatsapp:${e164}`;

  const url = `https://api.twilio.com/2010-04-01/Accounts/${sid}/Messages.json`;
  const params = new URLSearchParams({
    From: from,
    To: whatsappTo,
    Body: body,
  });

  try {
    const res = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        Authorization: "Basic " + Buffer.from(`${sid}:${token}`).toString("base64"),
      },
      body: params.toString(),
    });

    if (!res.ok) {
      const errText = await res.text();
      logger.error({ to: whatsappTo, status: res.status, body: errText }, "📱 واتساب: فشل الإرسال");
      return false;
    }

    logger.info({ to: whatsappTo }, "📱 واتساب: تم الإرسال بنجاح");
    return true;
  } catch (err) {
    logger.error({ err, to: whatsappTo }, "📱 واتساب: استثناء أثناء الإرسال");
    return false;
  }
}
