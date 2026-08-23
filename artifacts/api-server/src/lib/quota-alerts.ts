/**
 * Quota threshold alerts — 80%, 2 remaining, depleted, 3-day expiry.
 * Each alert type fires at most once per subscription cycle (deduped via quota_alert_log).
 */
import { db, quotaAlertLogTable, usersTable, subscriptionsTable, packagesTable } from "@workspace/db";
import { eq, and } from "drizzle-orm";
import { sendEmail } from "./email";
import { logger } from "./logger";

export type AlertType = "80pct" | "2remaining" | "depleted" | "3day_expiry";

/** Build a unique ref key so each alert fires once per subscription */
function refKey(subscriptionId: number, alert: AlertType): string {
  return `sub-${subscriptionId}-${alert}`;
}

async function alreadySent(key: string): Promise<boolean> {
  const [row] = await db
    .select({ id: quotaAlertLogTable.id })
    .from(quotaAlertLogTable)
    .where(eq(quotaAlertLogTable.refKey, key))
    .limit(1);
  return !!row;
}

async function markSent(userId: number, alert: AlertType, key: string): Promise<void> {
  await db
    .insert(quotaAlertLogTable)
    .values({ userId, alertType: alert, refKey: key })
    .onConflictDoNothing();
}

// ── email templates ──────────────────────────────────────────────────────────
function emailHtml(title: string, body: string, cta?: { href: string; label: string }): string {
  return `
<div dir="rtl" style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;background:#0d0d1a;color:#e8e0d0;padding:32px;border-radius:12px">
  <h2 style="color:#c8a96e;margin-bottom:16px">⚖ رباب — محاميتك الرقمية</h2>
  <h3 style="color:#ffffff;margin-bottom:12px">${title}</h3>
  <p style="line-height:1.7;color:#ccbbaa">${body}</p>
  ${cta ? `<div style="margin-top:24px"><a href="${cta.href}" style="background:#c8a96e;color:#0d0d1a;padding:12px 24px;border-radius:8px;text-decoration:none;font-weight:bold">${cta.label}</a></div>` : ""}
  <p style="margin-top:32px;font-size:12px;color:#666">هذا البريد تلقائي من منصة RABAB LEGAL AI</p>
</div>`;
}

// ── public API ────────────────────────────────────────────────────────────────
export interface AlertContext {
  userId: number;
  subscriptionId: number;
  /** رصيد الخدمة المعنية بعد الخصم */
  remainingAfter: number;
  /** إجمالي حصة الخدمة في هذه الدورة */
  totalAllowed: number;
  /** نوع الخدمة للتوضيح في الرسالة */
  serviceLabel: string;
  isTrial?: boolean;
}

export async function checkAndSendQuotaAlerts(ctx: AlertContext): Promise<void> {
  // Integration tests create deliberate quota-exhaustion scenarios; those must
  // never send an external email.
  if (process.env.NODE_ENV === "test") return;

  const { userId, subscriptionId, remainingAfter, totalAllowed, serviceLabel, isTrial } = ctx;

  // جلب بيانات المستخدم للبريد
  const [user] = await db
    .select({ email: usersTable.email, name: usersTable.name })
    .from(usersTable)
    .where(eq(usersTable.id, userId));

  if (!user?.email) return;

  const used = totalAllowed - remainingAfter;
  const pct = totalAllowed > 0 ? (used / totalAllowed) * 100 : 0;

  // ── 2 remaining alert ──────────────────────────────────────────────────────
  if (remainingAfter <= 2 && remainingAfter > 0) {
    const key = refKey(subscriptionId, "2remaining");
    if (!(await alreadySent(key))) {
      await sendEmail({
        to: user.email,
        subject: `⚠️ تبقّى لديك ${remainingAfter} عمليات فقط — رباب القانونية`,
        html: emailHtml(
          `تبقّى ${remainingAfter} عمليات`,
          `مرحباً ${user.name ?? ""},<br>تبقّى لديك <strong>${remainingAfter}</strong> عمليات فقط من خدمة ${serviceLabel}. لا تنقطع عن خدماتك القانونية.`,
          { href: "https://rabablegal.com/pricing", label: "جدِّد الاشتراك الآن" }
        ),
      });
      await markSent(userId, "2remaining", key);
      logger.info({ userId, remainingAfter }, "📊 تنبيه: تبقّى عمليتان");
    }
  }

  // ── 80% consumed alert ─────────────────────────────────────────────────────
  if (pct >= 80 && remainingAfter > 2) {
    const key = refKey(subscriptionId, "80pct");
    if (!(await alreadySent(key))) {
      await sendEmail({
        to: user.email,
        subject: `📊 استهلكت 80% من رصيدك — رباب القانونية`,
        html: emailHtml(
          "وصلت لـ 80٪ من استهلاك رصيدك",
          `مرحباً ${user.name ?? ""},<br>لقد استهلكت <strong>${Math.round(pct)}٪</strong> من خدمة ${serviceLabel}. تبقّى لديك <strong>${remainingAfter}</strong> عمليات.`,
          { href: "https://rabablegal.com/pricing", label: "ترقية الباقة" }
        ),
      });
      await markSent(userId, "80pct", key);
      logger.info({ userId, pct: Math.round(pct) }, "📊 تنبيه: 80% استهلاك");
    }
  }

  // ── depleted alert ─────────────────────────────────────────────────────────
  if (remainingAfter <= 0) {
    const key = refKey(subscriptionId, "depleted");
    if (!(await alreadySent(key))) {
      await sendEmail({
        to: user.email,
        subject: `🔴 نفد رصيدك من ${serviceLabel} — رباب القانونية`,
        html: emailHtml(
          "نفد رصيدك",
          `مرحباً ${user.name ?? ""},<br>نفد رصيدك من خدمة <strong>${serviceLabel}</strong>. جميع بياناتك ومخرجاتك محفوظة ويمكنك الاطلاع عليها بعد تجديد الاشتراك.`,
          { href: "https://rabablegal.com/pricing", label: "اشترك الآن" }
        ),
      });
      await markSent(userId, "depleted", key);
      logger.info({ userId }, "📊 تنبيه: نفاد الرصيد");
    }
  }
}

/** تنبيه انتهاء الاشتراك خلال 3 أيام — يُستدعى من scheduler */
export async function sendExpiryAlerts(): Promise<void> {
  const now = new Date();
  const in3days = new Date(now.getTime() + 3 * 24 * 60 * 60 * 1000);

  const subs = await db
    .select({ sub: subscriptionsTable, pkg: packagesTable, user: usersTable })
    .from(subscriptionsTable)
    .innerJoin(packagesTable, eq(subscriptionsTable.packageId, packagesTable.id))
    .innerJoin(usersTable, eq(subscriptionsTable.userId, usersTable.id))
    .where(
      and(
        eq(subscriptionsTable.status, "active"),
      )
    );

  for (const { sub, pkg, user } of subs) {
    if (!sub.endDate || !user.email) continue;
    const daysLeft = (sub.endDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24);
    if (daysLeft > 3 || daysLeft < 0) continue;

    const key = refKey(sub.id, "3day_expiry");
    if (await alreadySent(key)) continue;

    const daysRound = Math.ceil(daysLeft);
    await sendEmail({
      to: user.email,
      subject: `⏰ اشتراكك ينتهي خلال ${daysRound} يوم — رباب القانونية`,
      html: emailHtml(
        `اشتراكك ينتهي خلال ${daysRound} يوم`,
        `مرحباً ${user.name ?? ""},<br>اشتراكك في باقة <strong>${pkg.name}</strong> سينتهي بتاريخ <strong>${sub.endDate.toLocaleDateString("ar-SA")}</strong>. جدِّده الآن لضمان الاستمرارية.`,
        { href: "https://rabablegal.com/pricing", label: "تجديد الاشتراك" }
      ),
    });
    await markSent(user.id, "3day_expiry", key);
    logger.info({ userId: user.id, daysLeft: daysRound }, "📅 تنبيه: انتهاء اشتراك قريب");
  }
}
