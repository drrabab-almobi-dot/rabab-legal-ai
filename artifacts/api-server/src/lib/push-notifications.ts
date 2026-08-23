/**
 * Expo Push Notifications — subscription expiry reminder job.
 *
 * Runs once per day (scheduled in index.ts).
 * Finds every active subscription whose endDate is within the next 3 days
 * and sends a single Expo push notification to the owner's registered device.
 *
 * Duplicate-send guard: before sending we check push_notification_log and skip
 * any user who already received this notification type within the last 20 hours.
 * After a successful send we insert a log row so a server restart later that
 * same day will not re-notify the same user.
 */

import { db, usersTable, subscriptionsTable, pushNotificationLogTable } from "@workspace/db";
import { eq, and, gte, lte, isNotNull, inArray } from "drizzle-orm";
import { logger } from "./logger";

const EXPO_PUSH_URL = "https://exp.host/--/api/v2/push/send";
const DEDUP_WINDOW_MS = 20 * 60 * 60 * 1000; // 20 hours
const NOTIFICATION_TYPE = "subscription_expiry";

interface ExpoPushMessage {
  to: string;
  title: string;
  body: string;
  data?: Record<string, unknown>;
  sound?: "default" | null;
  priority?: "default" | "normal" | "high";
  /** carry userId through so we can log after send */
  _userId?: number;
}

interface ExpoPushTicket {
  status: "ok" | "error";
  id?: string;
  message?: string;
  details?: { error?: string };
}

/** Send a batch of Expo push messages (max 100 per call). */
async function sendExpoPushBatch(messages: ExpoPushMessage[]): Promise<ExpoPushTicket[]> {
  // Strip the internal _userId field before sending to Expo
  const payload = messages.map(({ _userId: _omit, ...rest }) => rest);

  const res = await fetch(EXPO_PUSH_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Accept": "application/json",
      "Accept-Encoding": "gzip, deflate",
    },
    body: JSON.stringify(payload),
  });

  if (!res.ok) {
    throw new Error(`Expo push API returned ${res.status}: ${await res.text()}`);
  }

  const json = await res.json() as { data: ExpoPushTicket[] };
  return json.data;
}

/**
 * Returns the set of userIds that have already been sent a notification of
 * `type` within the last `windowMs` milliseconds.
 */
async function getRecentlyNotifiedUserIds(
  userIds: number[],
  type: string,
  windowMs: number,
): Promise<Set<number>> {
  if (userIds.length === 0) return new Set();

  const cutoff = new Date(Date.now() - windowMs);
  const rows = await db
    .select({ userId: pushNotificationLogTable.userId })
    .from(pushNotificationLogTable)
    .where(
      and(
        inArray(pushNotificationLogTable.userId, userIds),
        eq(pushNotificationLogTable.type, type),
        gte(pushNotificationLogTable.sentAt, cutoff),
      ),
    );

  return new Set(rows.map(r => r.userId));
}

/** Record a successful send in the dedup log. */
async function logNotificationSent(userId: number, type: string): Promise<void> {
  try {
    await db.insert(pushNotificationLogTable).values({ userId, type });
  } catch (err) {
    // Non-fatal: logging failure must not break the notification flow
    logger.warn({ err, userId, type }, "📱 فشل تسجيل إشعار في push_notification_log");
  }
}

/**
 * Query users with active subscriptions expiring in 1–3 days
 * and send them a push notification if they have a registered push token.
 *
 * Users who already received this notification in the last 20 hours are skipped
 * to prevent duplicate sends on server restart.
 */
export async function sendSubscriptionExpiryReminders(): Promise<void> {
  const now = new Date();
  const in3Days = new Date(now.getTime() + 3 * 24 * 60 * 60 * 1000);

  // Fetch users + their subscription end date
  const rows = await db
    .select({
      userId: usersTable.id,
      pushToken: usersTable.pushToken,
      endDate: subscriptionsTable.endDate,
    })
    .from(subscriptionsTable)
    .innerJoin(usersTable, eq(subscriptionsTable.userId, usersTable.id))
    .where(
      and(
        eq(subscriptionsTable.status, "active"),
        isNotNull(usersTable.pushToken),
        isNotNull(subscriptionsTable.endDate),
        gte(subscriptionsTable.endDate, now),
        lte(subscriptionsTable.endDate, in3Days),
      ),
    );

  if (rows.length === 0) {
    logger.info("📱 لا توجد اشتراكات تنتهي خلال 3 أيام — لا إشعارات مطلوبة");
    return;
  }

  // --- Dedup: skip users notified within the last 20 hours ---
  const allUserIds = rows.map(r => r.userId);
  const recentlyNotified = await getRecentlyNotifiedUserIds(
    allUserIds,
    NOTIFICATION_TYPE,
    DEDUP_WINDOW_MS,
  );

  const eligibleRows = rows.filter(r => !recentlyNotified.has(r.userId));

  if (eligibleRows.length === 0) {
    logger.info(
      { skipped: rows.length },
      "📱 جميع المستخدمين المستحقين تلقّوا إشعاراً مسبقاً — لا شيء لإرساله",
    );
    return;
  }

  if (recentlyNotified.size > 0) {
    logger.info(
      { skipped: recentlyNotified.size, eligible: eligibleRows.length },
      "📱 تم تخطّي مستخدمين تلقّوا إشعاراً مؤخراً",
    );
  }

  // Build Expo push messages (valid tokens only)
  const messages: ExpoPushMessage[] = eligibleRows
    .filter(r => r.pushToken && r.pushToken.startsWith("ExponentPushToken["))
    .map(r => {
      const daysLeft = Math.ceil(
        (new Date(r.endDate!).getTime() - now.getTime()) / (24 * 60 * 60 * 1000),
      );
      const dayLabel = daysLeft <= 1 ? "غداً" : `خلال ${daysLeft} أيام`;
      return {
        to: r.pushToken!,
        title: "⚠️ اشتراكك على وشك الانتهاء",
        body: `يوم انتهاء اشتراكك هو ${dayLabel}. جدّد الآن للاستمرار في الوصول.`,
        data: { screen: "subscription" },
        sound: "default" as const,
        priority: "high" as const,
        _userId: r.userId,
      };
    });

  if (messages.length === 0) {
    logger.info("📱 لا توجد push tokens صالحة لإرسال الإشعارات");
    return;
  }

  // Expo allows max 100 per batch
  const BATCH_SIZE = 100;
  let sent = 0;
  let failed = 0;

  for (let i = 0; i < messages.length; i += BATCH_SIZE) {
    const batch = messages.slice(i, i + BATCH_SIZE);
    try {
      const tickets = await sendExpoPushBatch(batch);
      for (let j = 0; j < tickets.length; j++) {
        const t = tickets[j];
        if (t.status === "ok") {
          sent++;
          // Log successful send for dedup on next run
          const userId = batch[j]._userId;
          if (userId !== undefined) {
            await logNotificationSent(userId, NOTIFICATION_TYPE);
          }
        } else {
          failed++;
          logger.warn({ ticket: t }, "📱 فشل إرسال إشعار Push");
        }
      }
    } catch (err) {
      logger.error({ err }, "📱 خطأ أثناء إرسال دفعة Expo Push");
      failed += batch.length;
    }
  }

  logger.info(
    { sent, failed, total: messages.length },
    "📱 اكتمل إرسال إشعارات انتهاء الاشتراك",
  );
}

/**
 * Send a single test expiry push notification.
 *
 * - If `pushToken` is supplied it is used directly (useful for quick device checks).
 * - Otherwise the token is loaded from the user record identified by `userId`.
 *
 * Returns a summary object so the admin endpoint can relay it back to the caller.
 */
export async function sendTestExpiryPush(opts: {
  userId?: number;
  pushToken?: string;
}): Promise<{ ok: boolean; ticket?: ExpoPushTicket; error?: string }> {
  let token: string | null | undefined = opts.pushToken;

  if (!token && opts.userId !== undefined) {
    const [user] = await db
      .select({ pushToken: usersTable.pushToken })
      .from(usersTable)
      .where(eq(usersTable.id, opts.userId));

    if (!user) {
      return { ok: false, error: `المستخدم ${opts.userId} غير موجود` };
    }
    token = user.pushToken;
  }

  if (!token) {
    return { ok: false, error: "لا يوجد push token مسجّل لهذا المستخدم" };
  }

  if (!token.startsWith("ExponentPushToken[")) {
    return { ok: false, error: `push token غير صالح: ${token}` };
  }

  const message: ExpoPushMessage = {
    to: token,
    title: "🧪 إشعار تجريبي — انتهاء الاشتراك",
    body: "هذا إشعار اختباري للتحقق من وصول التنبيهات بشكل صحيح.",
    data: { screen: "subscription", test: true },
    sound: "default",
    priority: "high",
  };

  try {
    const [ticket] = await sendExpoPushBatch([message]);
    const ok = ticket.status === "ok";
    if (!ok) {
      logger.warn({ ticket }, "📱 فشل إرسال إشعار Push التجريبي");
    } else {
      logger.info({ ticket }, "📱 تم إرسال إشعار Push التجريبي بنجاح");
    }
    return { ok, ticket };
  } catch (err) {
    const error = err instanceof Error ? err.message : String(err);
    logger.error({ err }, "📱 خطأ أثناء إرسال إشعار Push التجريبي");
    return { ok: false, error };
  }
}
