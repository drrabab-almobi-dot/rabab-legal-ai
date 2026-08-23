/**
 * SMS Sending Library
 * ───────────────────
 * Sends SMS messages via Twilio when credentials are configured.
 * Falls back to console logging in development / when no credentials are set.
 *
 * Required environment variables for Twilio:
 *   TWILIO_ACCOUNT_SID   – Twilio account SID
 *   TWILIO_AUTH_TOKEN    – Twilio auth token
 *   TWILIO_PHONE_NUMBER  – sender number in E.164 format, e.g. +1XXXXXXXXXX
 */

interface SmsSendOptions {
  to: string;   // E.164 format, e.g. +966512345678
  body: string;
}

/**
 * Normalise a Saudi/Gulf phone number to E.164.
 * Accepts formats: 05XXXXXXXX, 5XXXXXXXX, +9665XXXXXXXX, 9665XXXXXXXX
 */
export function normalizePhoneE164(phone: string): string {
  const digits = phone.replace(/\D/g, "");

  // Already has country code
  if (digits.startsWith("966") && digits.length === 12) return "+" + digits;
  if (digits.startsWith("00966"))                        return "+" + digits.slice(2);

  // Local Saudi: 05XXXXXXXX or 5XXXXXXXX
  if (digits.startsWith("05") && digits.length === 10)  return "+966" + digits.slice(1);
  if (digits.startsWith("5")  && digits.length === 9)   return "+966" + digits;

  // Unknown format — return as-is with a + prefix if missing
  return phone.startsWith("+") ? phone : "+" + digits;
}

/**
 * Send an SMS.
 * Returns true on success, throws on failure.
 */
export async function sendSms({ to, body }: SmsSendOptions): Promise<void> {
  const accountSid = process.env.TWILIO_ACCOUNT_SID;
  const authToken  = process.env.TWILIO_AUTH_TOKEN;
  const fromNumber = process.env.TWILIO_PHONE_NUMBER;

  const toE164 = normalizePhoneE164(to);

  // ── Dev / no-credentials fallback ──────────────────────────────────────────
  if (!accountSid || !authToken || !fromNumber) {
    if (process.env.NODE_ENV === "production") {
      // Hard-fail in production: missing credentials means OTPs cannot be sent,
      // which would silently block all new registrations.
      throw new Error(
        "SMS credentials not configured (TWILIO_ACCOUNT_SID / TWILIO_AUTH_TOKEN / TWILIO_PHONE_NUMBER). " +
        "Set these environment variables before deploying."
      );
    }
    // Development-only console fallback — NEVER logs in production
    console.log(`[SMS DEV] To: ${toE164} | Message: ${body}`);
    return;
  }

  // ── Twilio REST API ─────────────────────────────────────────────────────────
  const url = `https://api.twilio.com/2010-04-01/Accounts/${accountSid}/Messages.json`;
  const params = new URLSearchParams({ To: toE164, From: fromNumber, Body: body });

  const response = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      Authorization: "Basic " + Buffer.from(`${accountSid}:${authToken}`).toString("base64"),
    },
    body: params.toString(),
  });

  if (!response.ok) {
    const errText = await response.text().catch(() => "unknown");
    throw new Error(`Twilio error ${response.status}: ${errText}`);
  }
}

/** Generate a random 6-digit OTP code */
export function generateOtpCode(): string {
  return String(Math.floor(100000 + Math.random() * 900000));
}

/** Mask a phone number for display: 05*****89 */
export function maskPhone(phone: string): string {
  if (phone.length <= 4) return phone;
  const visible = 2;
  return phone.slice(0, visible) + "*".repeat(Math.max(0, phone.length - visible - 2)) + phone.slice(-2);
}
