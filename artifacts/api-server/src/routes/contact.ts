import { Router, type IRouter } from "express";
import { db, contactMessagesTable } from "@workspace/db";
import { desc, eq } from "drizzle-orm";
import { requireAdmin } from "../middlewares/auth";
import { sendEmail } from "../lib/email";
import { logger } from "../lib/logger";

const router: IRouter = Router();

// ── In-memory rate limiter: 3 messages per IP per 10 minutes ──────────────────
const RATE_LIMIT_MAX = 3;
const RATE_LIMIT_WINDOW_MS = 10 * 60 * 1000; // 10 minutes

interface RateEntry { count: number; resetAt: number }
const ipRateMap = new Map<string, RateEntry>();

function checkRateLimit(ip: string): { allowed: boolean; retryAfterSec: number } {
  const now = Date.now();
  let entry = ipRateMap.get(ip);
  if (!entry || now >= entry.resetAt) {
    entry = { count: 0, resetAt: now + RATE_LIMIT_WINDOW_MS };
    ipRateMap.set(ip, entry);
  }
  if (entry.count >= RATE_LIMIT_MAX) {
    return { allowed: false, retryAfterSec: Math.ceil((entry.resetAt - now) / 1000) };
  }
  entry.count += 1;
  return { allowed: true, retryAfterSec: 0 };
}

// Periodically clean up expired entries to avoid unbounded memory growth
setInterval(() => {
  const now = Date.now();
  for (const [ip, entry] of ipRateMap) {
    if (now >= entry.resetAt) ipRateMap.delete(ip);
  }
}, RATE_LIMIT_WINDOW_MS);


const ADMIN_EMAIL = "rababmobilaw@gmail.com";
const WHATSAPP_PHONE = "966504647649";

// ── WhatsApp notification via CallMeBot ───────────────────────────────────────
async function sendWhatsApp(text: string): Promise<void> {
  const apiKey = process.env.CALLMEBOT_API_KEY;
  if (!apiKey) {
    logger.warn("contact: CALLMEBOT_API_KEY not set — WhatsApp notification skipped");
    return;
  }
  const url = `https://api.callmebot.com/whatsapp.php?phone=${WHATSAPP_PHONE}&text=${encodeURIComponent(text)}&apikey=${apiKey}`;
  try {
    const res = await fetch(url);
    if (!res.ok) logger.warn({ status: res.status }, "contact: WhatsApp notification failed");
    else logger.info("contact: WhatsApp notification sent");
  } catch (err) {
    logger.warn({ err }, "contact: WhatsApp notification error");
  }
}

// ── POST /api/contact — public endpoint ───────────────────────────────────────
router.post("/contact", async (req, res): Promise<void> => {
  // Rate-limit by IP before any DB work
  const ip = req.ip ?? req.socket.remoteAddress ?? "unknown";
  const { allowed, retryAfterSec } = checkRateLimit(ip);
  if (!allowed) {
    res.setHeader("Retry-After", String(retryAfterSec));
    res.status(429).json({ error: `لقد تجاوزت الحد المسموح به. يرجى الانتظار ${Math.ceil(retryAfterSec / 60)} دقيقة قبل إرسال رسالة أخرى.` });
    return;
  }

  const { name, email, message } = req.body ?? {};

  if (!name || typeof name !== "string" || name.trim().length < 2) {
    res.status(400).json({ error: "الاسم مطلوب" });
    return;
  }
  if (!email || typeof email !== "string" || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) {
    res.status(400).json({ error: "بريد إلكتروني غير صالح" });
    return;
  }
  if (!message || typeof message !== "string" || message.trim().length < 10) {
    res.status(400).json({ error: "الرسالة يجب أن تكون 10 أحرف على الأقل" });
    return;
  }

  const cleanName = name.trim();
  const cleanEmail = email.trim().toLowerCase();
  const cleanMessage = message.trim();

  // 1. Persist to DB first (never lose a message even if email fails)
  let saved;
  try {
    [saved] = await db.insert(contactMessagesTable).values({ name: cleanName, email: cleanEmail, message: cleanMessage }).returning();
  } catch (err) {
    logger.error({ err }, "contact: failed to save message to DB");
    res.status(500).json({ error: "حدث خطأ أثناء حفظ رسالتك. يرجى المحاولة مرة أخرى." });
    return;
  }

  // 2. Send notification email to admin
  const emailSent = await sendEmail({
    to: ADMIN_EMAIL,
    subject: `رسالة جديدة من نموذج التواصل — ${cleanName}`,
    html: buildAdminEmailHtml({ name: cleanName, email: cleanEmail, message: cleanMessage }),
    text: `اسم المُرسِل: ${cleanName}\nالبريد الإلكتروني: ${cleanEmail}\n\nالرسالة:\n${cleanMessage}`,
  });

  // 2b. Send WhatsApp notification (best-effort, non-blocking)
  const waText = `📩 رسالة تواصل جديدة\nالاسم: ${cleanName}\nالبريد: ${cleanEmail}\n\n${cleanMessage.slice(0, 200)}${cleanMessage.length > 200 ? '…' : ''}`;
  sendWhatsApp(waText).catch(() => {});

  // 3. Update email_sent flag in DB (best-effort)
  if (emailSent) {
    db.update(contactMessagesTable)
      .set({ emailSent: true })
      .where(eq(contactMessagesTable.id, saved.id))
      .catch((err) => logger.warn({ err }, "contact: failed to update email_sent flag"));
  } else {
    logger.warn({ id: saved.id }, "contact: message saved but email NOT sent (SMTP not configured?)");
  }

  res.status(201).json({ ok: true });
});

// ── GET /admin/contact-messages — admin inbox ─────────────────────────────────
router.get("/admin/contact-messages", requireAdmin, async (_req, res): Promise<void> => {
  const messages = await db
    .select()
    .from(contactMessagesTable)
    .orderBy(desc(contactMessagesTable.createdAt));
  res.json(messages);
});

// ── HTML template for admin notification email ────────────────────────────────
function buildAdminEmailHtml(d: { name: string; email: string; message: string }): string {
  const escapedMessage = d.message.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/\n/g, "<br/>");

  return `<!DOCTYPE html>
<html dir="rtl" lang="ar">
<head>
  <meta charset="UTF-8"/>
  <meta name="viewport" content="width=device-width,initial-scale=1"/>
  <title>رسالة جديدة من نموذج التواصل</title>
</head>
<body style="margin:0;padding:0;background:#f4f6f9;font-family:'Segoe UI',Tahoma,Arial,sans-serif;direction:rtl">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f4f6f9;padding:32px 0">
    <tr>
      <td align="center">
        <table width="560" cellpadding="0" cellspacing="0"
               style="background:#ffffff;border-radius:12px;overflow:hidden;box-shadow:0 2px 8px rgba(0,0,0,.08)">

          <tr>
            <td style="background:linear-gradient(135deg,#1a3a6e,#2563eb);padding:28px 36px;text-align:center">
              <h1 style="margin:0;color:#ffffff;font-size:22px;font-weight:700">RABAB LEGAL AI | رباب محاميتك الرقمية</h1>
              <p style="margin:6px 0 0;color:#bfdbfe;font-size:14px">رسالة جديدة من نموذج التواصل</p>
            </td>
          </tr>

          <tr>
            <td style="padding:28px 36px 8px">
              <table width="100%" cellpadding="0" cellspacing="0"
                     style="border:1px solid #e5e7eb;border-radius:8px;overflow:hidden">
                <tr style="background:#f8fafc">
                  <th style="padding:12px 16px;text-align:right;font-size:13px;color:#6b7280;font-weight:600;border-bottom:1px solid #e5e7eb" colspan="2">
                    بيانات المُرسِل
                  </th>
                </tr>
                <tr>
                  <td style="padding:10px 16px;border-bottom:1px solid #f0f0f0;color:#555;font-size:14px;width:120px">الاسم</td>
                  <td style="padding:10px 16px;border-bottom:1px solid #f0f0f0;font-weight:600;font-size:14px">${d.name}</td>
                </tr>
                <tr>
                  <td style="padding:10px 16px;color:#555;font-size:14px">البريد الإلكتروني</td>
                  <td style="padding:10px 16px;font-size:14px">
                    <a href="mailto:${d.email}" style="color:#2563eb;text-decoration:none" dir="ltr">${d.email}</a>
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          <tr>
            <td style="padding:16px 36px 32px">
              <p style="margin:0 0 8px;font-size:13px;color:#6b7280;font-weight:600">نص الرسالة</p>
              <div style="background:#f8fafc;border:1px solid #e5e7eb;border-radius:8px;padding:16px 20px;font-size:15px;color:#374151;line-height:1.8">
                ${escapedMessage}
              </div>
            </td>
          </tr>

          <tr>
            <td style="background:#f9fafb;border-top:1px solid #e5e7eb;padding:16px 36px;text-align:center">
              <p style="margin:0;font-size:12px;color:#9ca3af">هذه الرسالة وُلِّدت تلقائياً من منصة رباب القانونية</p>
            </td>
          </tr>

        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
}

export default router;
