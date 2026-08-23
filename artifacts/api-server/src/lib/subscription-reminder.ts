/**
 * Subscription renewal reminder scheduler.
 *
 * Runs once per day. Three reminder types:
 *   1. "3_days_before_expiry"  – email + WhatsApp 3 days before endDate
 *   2. "7_days_before_expiry"  – email + WhatsApp 7 days before endDate
 *   3. "after_expiry"          – email + WhatsApp 1–3 days after endDate (renewal offer)
 *
 * Deduplication: subscription_reminders table prevents double-sending.
 */

import { db, subscriptionsTable, usersTable, subscriptionRemindersTable } from "@workspace/db";
import { eq, and, lte, gte, lt, sql } from "drizzle-orm";
import { logger } from "./logger";
import { sendEmail } from "./email";
import { sendWhatsAppGated } from "./whatsapp-gated";

const INTERVAL_MS = 24 * 60 * 60 * 1000; // 24 hours

function renewalUrl(): string {
  return process.env.APP_URL ? `${process.env.APP_URL}/pricing` : "https://www.rabablegal.com/pricing";
}

function fmtDate(d: Date): string {
  return d.toLocaleDateString("ar-SA", {
    weekday: "long", year: "numeric", month: "long", day: "numeric",
    timeZone: "Asia/Riyadh",
  });
}

function buildRenewalEmailHtml(userName: string, endDate: Date, daysLeft: number): string {
  const isExpired = daysLeft <= 0;
  const heading = isExpired ? "انتهى اشتراكك في رباب" : `اشتراكك ينتهي خلال ${daysLeft} ${daysLeft === 1 ? "يوم" : "أيام"}`;
  const intro = isExpired
    ? `انتهى اشتراكك بتاريخ <strong>${fmtDate(endDate)}</strong>. جدّدي الآن للاستمرار في الحصول على الاستشارات القانونية.`
    : `اشتراكك سينتهي بتاريخ <strong>${fmtDate(endDate)}</strong>. جدّدي قبل هذا التاريخ لضمان الاستمرار دون انقطاع.`;
  const btnLabel = isExpired ? "جدّد اشتراكك الآن 🔄" : "جدّد الآن";

  return `<!DOCTYPE html>
<html dir="rtl" lang="ar">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>${heading}</title>
  <style>
    body{font-family:'Segoe UI',Tahoma,Arial,sans-serif;background:#f5f7fa;margin:0;padding:0;direction:rtl}
    .container{max-width:560px;margin:40px auto;background:#fff;border-radius:12px;overflow:hidden;box-shadow:0 2px 12px rgba(0,0,0,.08)}
    .header{background:linear-gradient(135deg,#1a3c6e 0%,#2563eb 100%);padding:32px 40px;text-align:center}
    .header h1{color:#fff;margin:0;font-size:22px;font-weight:700}
    .header p{color:#bfdbfe;margin:8px 0 0;font-size:14px}
    .body{padding:36px 40px;color:#374151}
    .body p{line-height:1.8;font-size:15px;margin:0 0 16px}
    .highlight{background:#fef3c7;border-right:4px solid #f59e0b;padding:14px 18px;border-radius:6px;margin:20px 0;font-size:15px}
    .cta{text-align:center;margin:28px 0 0}
    .cta a{display:inline-block;background:#2563eb;color:#fff;text-decoration:none;padding:14px 36px;border-radius:8px;font-size:16px;font-weight:600}
    .footer{background:#f9fafb;border-top:1px solid #e5e7eb;padding:20px 40px;text-align:center;color:#9ca3af;font-size:12px}
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <h1>RABAB LEGAL AI | رباب محاميتك الرقمية</h1>
      <p>${heading}</p>
    </div>
    <div class="body">
      <p>عزيزي / عزيزتي <strong>${userName}</strong>،</p>
      <p>${intro}</p>
      <div class="highlight">📅 تاريخ انتهاء الاشتراك: <strong>${fmtDate(endDate)}</strong></div>
      <div class="cta"><a href="${renewalUrl()}">${btnLabel}</a></div>
    </div>
    <div class="footer">
      <p>هذه رسالة تلقائية من منصة رباب. إذا جدّدت اشتراكك بالفعل، تجاهل هذه الرسالة.</p>
    </div>
  </div>
</body>
</html>`.trim();
}

function buildRenewalEmailText(userName: string, endDate: Date, daysLeft: number): string {
  const isExpired = daysLeft <= 0;
  const lines = [
    `عزيزي / عزيزتي ${userName}،`,
    "",
    isExpired
      ? `انتهى اشتراكك في منصة رباب بتاريخ ${fmtDate(endDate)}.`
      : `اشتراكك في منصة رباب سينتهي بتاريخ ${fmtDate(endDate)} (خلال ${daysLeft} أيام).`,
    "",
    `جدّد اشتراكك على الرابط التالي: ${renewalUrl()}`,
    "",
    "شكراً لاستخدامك منصة رباب.",
  ];
  return lines.join("\n");
}

function buildRenewalWhatsApp(userName: string, endDate: Date, daysLeft: number): string {
  const isExpired = daysLeft <= 0;
  if (isExpired) {
    return `مرحباً ${userName} 👋\n\nاشتراكك في منصة رباب القانونية قد انتهى بتاريخ ${fmtDate(endDate)}.\n\nلا تفوّتي الوصول إلى استشاراتك القانونية — جدّدي الآن:\n${renewalUrl()}`;
  }
  return `مرحباً ${userName} 👋\n\nتذكير: اشتراكك في منصة رباب القانونية سينتهي خلال ${daysLeft} ${daysLeft === 1 ? "يوم" : "أيام"} بتاريخ ${fmtDate(endDate)}.\n\nجدّدي قبل الانتهاء لضمان الاستمرار:\n${renewalUrl()}`;
}

// ─────────────────────────── Reminder specs ──────────────────────────────────

interface ReminderSpec {
  type: string;
  daysLeft: number;        // positive = before expiry, negative = after expiry
  windowDaysStart: number; // start of detection window (days from now)
  windowDaysEnd: number;   // end of detection window
  emailSubject: (daysLeft: number) => string;
}

const REMINDER_SPECS: ReminderSpec[] = [
  {
    type: "3_days_before_expiry",
    daysLeft: 3,
    windowDaysStart: 0,
    windowDaysEnd: 3,
    emailSubject: () => "تذكير: اشتراكك في رباب ينتهي خلال 3 أيام",
  },
  {
    type: "7_days_before_expiry",
    daysLeft: 7,
    windowDaysStart: 3,
    windowDaysEnd: 7,
    emailSubject: () => "تذكير: اشتراكك في رباب ينتهي خلال أسبوع",
  },
  {
    type: "after_expiry",
    daysLeft: -1,
    windowDaysStart: -3,
    windowDaysEnd: 0,
    emailSubject: () => "اشتراكك في رباب قد انتهى — جدّدي الآن",
  },
];

// ─────────────────────────── Core job ────────────────────────────────────────

export async function sendExpiryReminders(): Promise<void> {
  const now = new Date();

  for (const spec of REMINDER_SPECS) {
    try {
      await processReminderSpec(now, spec);
    } catch (err) {
      logger.error({ err, type: spec.type }, "📧 خطأ في معالجة نوع التذكير");
    }
  }
}

async function processReminderSpec(now: Date, spec: ReminderSpec): Promise<void> {
  const windowStart = new Date(now.getTime() + spec.windowDaysStart * 24 * 60 * 60 * 1000);
  const windowEnd   = new Date(now.getTime() + spec.windowDaysEnd   * 24 * 60 * 60 * 1000);

  const isAfterExpiry = spec.windowDaysEnd <= 0;

  let subs;
  if (isAfterExpiry) {
    // endDate < now AND endDate > (now - 3 days)
    subs = await db
      .select({
        subId: subscriptionsTable.id,
        endDate: subscriptionsTable.endDate,
        userId: subscriptionsTable.userId,
        userName: usersTable.name,
        userEmail: usersTable.email,
        userPhone: usersTable.phone,
      })
      .from(subscriptionsTable)
      .innerJoin(usersTable, eq(subscriptionsTable.userId, usersTable.id))
      .where(
        and(
          eq(subscriptionsTable.status, "expired"),
          gte(subscriptionsTable.endDate, windowStart),
          lt(subscriptionsTable.endDate, now),
        ),
      );
  } else {
    // endDate > now AND endDate < now+windowEnd days
    subs = await db
      .select({
        subId: subscriptionsTable.id,
        endDate: subscriptionsTable.endDate,
        userId: subscriptionsTable.userId,
        userName: usersTable.name,
        userEmail: usersTable.email,
        userPhone: usersTable.phone,
      })
      .from(subscriptionsTable)
      .innerJoin(usersTable, eq(subscriptionsTable.userId, usersTable.id))
      .where(
        and(
          eq(subscriptionsTable.status, "active"),
          gte(subscriptionsTable.endDate, windowStart),
          lte(subscriptionsTable.endDate, windowEnd),
        ),
      );
  }

  if (subs.length === 0) {
    logger.debug({ type: spec.type }, "📧 لا توجد اشتراكات في هذا النطاق");
    return;
  }

  logger.info({ type: spec.type, count: subs.length }, "📧 اشتراكات في نطاق التذكير");

  for (const sub of subs) {
    try {
      // Dedup check
      const existing = await db
        .select({ id: subscriptionRemindersTable.id })
        .from(subscriptionRemindersTable)
        .where(
          and(
            eq(subscriptionRemindersTable.subscriptionId, sub.subId),
            eq(subscriptionRemindersTable.reminderType, spec.type),
          ),
        )
        .limit(1);

      if (existing.length > 0) continue;

      const daysLeft = spec.daysLeft;
      const endDate  = sub.endDate ?? new Date();

      // Send email
      await sendEmail({
        to: sub.userEmail,
        subject: spec.emailSubject(daysLeft),
        html: buildRenewalEmailHtml(sub.userName, endDate, daysLeft),
        text: buildRenewalEmailText(sub.userName, endDate, daysLeft),
      });

      // Send WhatsApp if phone available
      if (sub.userPhone) {
        await sendWhatsAppGated(sub.userPhone, buildRenewalWhatsApp(sub.userName, endDate, daysLeft), sub.userId);
      }

      // Record dedup
      await db.insert(subscriptionRemindersTable).values({
        subscriptionId: sub.subId,
        reminderType: spec.type,
      });

      logger.info(
        { subId: sub.subId, email: sub.userEmail, type: spec.type },
        "📧 تم إرسال التذكير",
      );
    } catch (err) {
      logger.error({ err, subId: sub.subId, type: spec.type }, "📧 خطأ أثناء إرسال التذكير");
    }
  }
}

/**
 * Deletes subscription_reminders records older than 90 days.
 * These are only needed to prevent duplicate sends within a billing cycle;
 * once stale they just bloat the table and slow down dedup queries.
 */
async function pruneOldReminderLogs(): Promise<void> {
  try {
    const cutoff = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000);
    const result = await db
      .delete(subscriptionRemindersTable)
      .where(sql`${subscriptionRemindersTable.sentAt} < ${cutoff}`);
    const count = (result as unknown as { rowCount?: number }).rowCount ?? 0;
    if (count > 0) logger.info({ count }, "🧹 تم حذف سجلات تذكيرات قديمة");
  } catch (err) {
    logger.error({ err }, "🧹 خطأ أثناء تنظيف سجلات التذكيرات القديمة");
  }
}

/**
 * Starts the daily reminder job.  Call once at server startup.
 */
export function startSubscriptionReminderScheduler(): void {
  // ⚠️ لا نُشغّل فوراً عند الإقلاع — كل إعادة تشغيل كانت ترسل رسائل لجميع المستخدمين وتستنزف الرصيد
  // الدورة الأولى تعمل بعد 24 ساعة من الإقلاع فقط

  const timer = setInterval(async () => {
    try {
      await sendExpiryReminders();
    } catch (err) {
      logger.error({ err }, "📧 خطأ في جولة التذكيرات الدورية");
    }
  }, INTERVAL_MS);

  timer.unref();

  // #363: Prune old dedup logs once at startup, then weekly
  pruneOldReminderLogs();
  setInterval(pruneOldReminderLogs, 7 * 24 * 60 * 60 * 1000).unref();

  logger.info("⏰ جدولة تذكيرات انتهاء الاشتراك نشطة (كل 24 ساعة)");
}
