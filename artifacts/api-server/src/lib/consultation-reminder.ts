/**
 * Pending consultation reminder scheduler.
 *
 * Runs once per day.  Finds consultations that are still "pending" after
 * 24 hours and sends a single reminder per consultation (email + WhatsApp).
 *
 * Deduplication: the `reminder_sent_at` column on the consultations table
 * is used to track whether a reminder has been sent.  This survives server
 * restarts, so a user will never receive more than one reminder per
 * consultation regardless of how many times the server is restarted.
 */

import { db, consultationsTable, usersTable } from "@workspace/db";
import { eq, and, lt, isNull } from "drizzle-orm";
import { logger } from "./logger";
import { sendEmail } from "./email";
import { sendWhatsAppGated } from "./whatsapp-gated";

const INTERVAL_MS = 24 * 60 * 60 * 1000; // 24 hours
const PENDING_HOURS = 24;

function appUrl(): string {
  return process.env.APP_URL ?? "https://www.rabablegal.com";
}

function buildPendingEmailHtml(userName: string, consultationTitle: string): string {
  const link = `${appUrl()}/dashboard`;
  return `<!DOCTYPE html>
<html dir="rtl" lang="ar">
<head>
  <meta charset="UTF-8" />
  <title>استشارتك بانتظارك</title>
  <style>
    body{font-family:'Segoe UI',Tahoma,Arial,sans-serif;background:#f5f7fa;margin:0;padding:0;direction:rtl}
    .container{max-width:560px;margin:40px auto;background:#fff;border-radius:12px;overflow:hidden;box-shadow:0 2px 12px rgba(0,0,0,.08)}
    .header{background:linear-gradient(135deg,#1a3c6e 0%,#2563eb 100%);padding:32px 40px;text-align:center}
    .header h1{color:#fff;margin:0;font-size:22px;font-weight:700}
    .header p{color:#bfdbfe;margin:8px 0 0;font-size:14px}
    .body{padding:36px 40px;color:#374151}
    .body p{line-height:1.8;font-size:15px;margin:0 0 16px}
    .highlight{background:#eff6ff;border-right:4px solid #2563eb;padding:14px 18px;border-radius:6px;margin:20px 0;font-size:15px}
    .cta{text-align:center;margin:28px 0 0}
    .cta a{display:inline-block;background:#2563eb;color:#fff;text-decoration:none;padding:14px 36px;border-radius:8px;font-size:16px;font-weight:600}
    .footer{background:#f9fafb;border-top:1px solid #e5e7eb;padding:20px 40px;text-align:center;color:#9ca3af;font-size:12px}
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <h1>RABAB LEGAL AI | رباب محاميتك الرقمية</h1>
      <p>استشارتك بانتظارك</p>
    </div>
    <div class="body">
      <p>عزيزي / عزيزتي <strong>${userName}</strong>،</p>
      <p>لاحظنا أن لديك استشارة قانونية لم تكتمل بعد:</p>
      <div class="highlight">📋 <strong>${consultationTitle}</strong></div>
      <p>يمكنك العودة في أي وقت واستكمال استشارتك من حيث توقفت.</p>
      <div class="cta"><a href="${link}">استكمل استشارتك الآن</a></div>
    </div>
    <div class="footer">
      <p>هذه رسالة تلقائية من منصة رباب.</p>
    </div>
  </div>
</body>
</html>`.trim();
}

function buildPendingWhatsApp(userName: string, consultationTitle: string): string {
  return `مرحباً ${userName} 👋\n\nلديك استشارة قانونية لم تكتمل بعد:\n📋 *${consultationTitle}*\n\nيمكنك العودة واستكمالها في أي وقت من لوحة التحكم:\n${appUrl()}/dashboard`;
}

export async function sendPendingConsultationReminders(): Promise<void> {
  const cutoff = new Date(Date.now() - PENDING_HOURS * 60 * 60 * 1000);

  // Only fetch consultations that:
  // 1. Are still pending
  // 2. Were created more than 24 hours ago
  // 3. Have NOT had a reminder sent yet (reminder_sent_at IS NULL)
  const pendingConsultations = await db
    .select({
      id: consultationsTable.id,
      title: consultationsTable.title,
      userId: consultationsTable.userId,
      userName: usersTable.name,
      userEmail: usersTable.email,
      userPhone: usersTable.phone,
    })
    .from(consultationsTable)
    .innerJoin(usersTable, eq(consultationsTable.userId, usersTable.id))
    .where(
      and(
        eq(consultationsTable.status, "pending"),
        lt(consultationsTable.createdAt, cutoff),
        isNull(consultationsTable.reminderSentAt),
      ),
    );

  if (pendingConsultations.length === 0) {
    logger.debug("📋 لا توجد استشارات معلّقة تحتاج تذكيراً");
    return;
  }

  logger.info({ count: pendingConsultations.length }, "📋 استشارات معلّقة تستوجب التذكير");

  for (const c of pendingConsultations) {
    try {
      await sendEmail({
        to: c.userEmail,
        subject: "استشارتك القانونية في رباب بانتظارك",
        html: buildPendingEmailHtml(c.userName, c.title),
        text: `عزيزي ${c.userName}، لديك استشارة قانونية معلّقة: "${c.title}". استكملها على ${appUrl()}/dashboard`,
      });

      if (c.userPhone) {
        await sendWhatsAppGated(c.userPhone, buildPendingWhatsApp(c.userName, c.title), c.userId);
      }

      // Mark as reminded in the DB — survives server restarts
      await db
        .update(consultationsTable)
        .set({ reminderSentAt: new Date() })
        .where(eq(consultationsTable.id, c.id));

      logger.info({ consultationId: c.id, userId: c.userId }, "📋 تم إرسال تذكير الاستشارة المعلّقة");
    } catch (err) {
      logger.error({ err, consultationId: c.id }, "📋 خطأ أثناء إرسال تذكير الاستشارة");
    }
  }
}

/**
 * Starts the daily consultation reminder job.  Call once at server startup.
 */
export function startConsultationReminderScheduler(): void {
  // ⚠️ لا نُشغّل فوراً عند الإقلاع — نتحاشى إرسال رسائل فور كل إعادة تشغيل
  // الدورة الأولى تعمل بعد 24 ساعة من الإقلاع فقط

  const timer = setInterval(async () => {
    try {
      await sendPendingConsultationReminders();
    } catch (err) {
      logger.error({ err }, "📋 خطأ في جولة تذكيرات الاستشارات");
    }
  }, INTERVAL_MS);

  timer.unref();
  logger.info("⏰ جدولة تذكيرات الاستشارات المعلّقة نشطة (كل 24 ساعة)");
}
