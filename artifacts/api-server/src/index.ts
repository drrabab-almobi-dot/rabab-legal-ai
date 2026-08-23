import app from "./app";
import { logger } from "./lib/logger";
// بوت تلجرام — في بيئة التطوير يعمل بـ polling، في الإنتاج يعمل بوضع الإرسال فقط (بدون polling)
// لتجنب خطأ 409 Conflict عند تشغيل بيئتين في آنٍ واحد. انظر startTelegramBot() في telegram-bot.ts.
import { startTelegramBot } from "./lib/telegram-bot";
import { restoreAutoSync } from "./lib/telegram-mtproto";
import { restoreMojCrawlSchedule } from "./routes/knowledge";
import { purgeExpiredBlocklistEntries, assertBlocklistTableReachable, PURGE_WARN_THRESHOLD } from "./middlewares/auth";
import { startSubscriptionReminderScheduler } from "./lib/subscription-reminder";
import { expireOverdueSubscriptions, releaseExpiredServiceReservations } from "./lib/quota";
import { sendSubscriptionExpiryReminders } from "./lib/push-notifications";
import { startConsultationReminderScheduler } from "./lib/consultation-reminder";
import { sendExpiryAlerts } from "./lib/quota-alerts";
import { db } from "@workspace/db";
import { legalCodicesTable } from "@workspace/db/schema";
import { eq } from "drizzle-orm";

const rawPort = process.env["PORT"];

if (!rawPort) {
  throw new Error(
    "PORT environment variable is required but was not provided.",
  );
}

const port = Number(rawPort);

if (Number.isNaN(port) || port <= 0) {
  throw new Error(`Invalid PORT value: "${rawPort}"`);
}

// ── Startup sequence (async so we can probe the DB before accepting traffic) ─
(async () => {
  // ── Schema readiness checks — apply pending migrations idempotently ──────
  // Each block probes for a feature's schema; if missing it applies the
  // corresponding SQL migration file so the server self-heals on first boot
  // after the migration is shipped. Errors are fatal to prevent silent data
  // corruption or missing-column crashes under live traffic.
  {
    const { sql: sqlRaw } = await import("drizzle-orm");
    const { readFileSync } = await import("node:fs");
    const { resolve, dirname } = await import("node:path");
    const { fileURLToPath } = await import("node:url");
    const __dir = dirname(fileURLToPath(import.meta.url));
    // __dir is dist/ inside artifacts/api-server; go up 3 levels to reach workspace root
    const migrationsRoot = resolve(__dir, "../../../lib/db/migrations");

    async function applyMigrationIfMissing(
      probes: Array<() => Promise<unknown>>,
      migrationFile: string,
      label: string,
    ): Promise<void> {
      try {
        for (const probe of probes) await probe();
        logger.info(`✅ ${label} schema reachable`);
      } catch {
        logger.warn(`⚙️ ${label} schema missing — applying ${migrationFile}`);
        try {
          const migSql = readFileSync(resolve(migrationsRoot, migrationFile), "utf-8");
          const { sql: sqlRaw2 } = await import("drizzle-orm");
          await db.execute(sqlRaw2.raw(migSql));
          logger.info(`✅ ${migrationFile} applied`);
        } catch (migErr) {
          logger.fatal({ err: migErr }, `🚨 CRITICAL: ${migrationFile} failed — refusing to start`);
          process.exit(1);
        }
      }
    }

    // 0001: phone OTP verification (phone_otp_tokens table + users.phone_verified)
    await applyMigrationIfMissing(
      [
        () => db.execute(sqlRaw`SELECT 1 FROM phone_otp_tokens LIMIT 0`),
        () => db.execute(sqlRaw`SELECT phone_verified FROM users LIMIT 0`),
      ],
      "0001_phone_otp_verification.sql",
      "OTP",
    );

    // 0004: consultation_params_history — audit table for param edits
    await applyMigrationIfMissing(
      [() => db.execute(sqlRaw`SELECT 1 FROM consultation_params_history LIMIT 0`)],
      "0004_consultation_params_history.sql",
      "consultation_params_history",
    );

    // 0004b: users.email_verified — required by auth login query
    await applyMigrationIfMissing(
      [() => db.execute(sqlRaw`SELECT email_verified FROM users LIMIT 0`)],
      "0004_add_email_verified_to_users.sql",
      "users.email_verified",
    );

    // 0005: users.token_version — used to invalidate JWTs on account re-enable
    await applyMigrationIfMissing(
      [() => db.execute(sqlRaw`SELECT token_version FROM users LIMIT 0`)],
      "0005_add_token_version_to_users.sql",
      "users.token_version",
    );

    // 0002: consultation_messages.sources column
    await applyMigrationIfMissing(
      [() => db.execute(sqlRaw`SELECT sources FROM consultation_messages LIMIT 0`)],
      "0002_consultation_messages_sources.sql",
      "consultation_messages.sources",
    );

    // 0006a: push_notification_log table (Expo push dedup guard)
    await applyMigrationIfMissing(
      [() => db.execute(sqlRaw`SELECT 1 FROM push_notification_log LIMIT 0`)],
      "0006_push_notification_log.sql",
      "push_notification_log",
    );

    // 0006b: partial unique index — one uncounted session per (user_id, service_type, client_session)
    await applyMigrationIfMissing(
      [
        () =>
          db.execute(
            sqlRaw`SELECT 1 FROM pg_indexes WHERE tablename = 'service_sessions' AND indexname = 'uq_service_sessions_pending_client'`,
          ).then((r: any) => {
            if (!r.rows || r.rows.length === 0)
              throw new Error("index uq_service_sessions_pending_client missing");
          }),
      ],
      "0006_service_sessions_pending_unique.sql",
      "service_sessions pending_client unique index",
    );

    // 0007: tavily_cache table — persistent cross-session Tavily result cache
    await applyMigrationIfMissing(
      [() => db.execute(sqlRaw`SELECT 1 FROM tavily_cache LIMIT 0`)],
      "0007_tavily_cache.sql",
      "tavily_cache",
    );

    // 0008: consultation_messages.attachment_name — persists file name for history display
    await applyMigrationIfMissing(
      [() => db.execute(sqlRaw`SELECT attachment_name FROM consultation_messages LIMIT 0`)],
      "0008_consultation_messages_attachment_name.sql",
      "consultation_messages.attachment_name",
    );

    // 0009: contract_drafts.used_live_search — tracks whether Tavily live search was used
    await applyMigrationIfMissing(
      [() => db.execute(sqlRaw`SELECT used_live_search FROM contract_drafts LIMIT 0`)],
      "0009_contract_drafts_used_live_search.sql",
      "contract_drafts.used_live_search",
    );

    // 0010: moj_circulars — MOJ official circulars integration
    await applyMigrationIfMissing(
      [() => db.execute(sqlRaw`SELECT tameem_id FROM moj_circulars LIMIT 0`)],
      "0010_moj_circulars.sql",
      "moj_circulars",
    );

    // 0010b: consultations.reminder_sent_at — tracks when reminder was sent (avoids re-send after restart)
    await applyMigrationIfMissing(
      [() => db.execute(sqlRaw`SELECT reminder_sent_at FROM consultations LIMIT 0`)],
      "0010_consultation_reminder_sent_at.sql",
      "consultations.reminder_sent_at",
    );

    // 0011: legal_codices + legal_cases — legal codex system
    await applyMigrationIfMissing(
      [() => db.execute(sqlRaw`SELECT id FROM legal_codices LIMIT 0`)],
      "0011_legal_codex.sql",
      "legal_codices",
    );

    // 0012: document_status enum — add queued + retrying values to match production
    await applyMigrationIfMissing(
      [
        () =>
          db.execute(sqlRaw`
            SELECT 1 FROM pg_enum e
            JOIN pg_type t ON t.oid = e.enumtypid
            WHERE t.typname = 'document_status' AND e.enumlabel = 'queued'
          `).then((r: any) => {
            if (!r.rows || r.rows.length === 0)
              throw new Error("document_status.queued missing");
          }),
      ],
      "0012_document_status_queued_retrying.sql",
      "document_status queued/retrying values",
    );

    // 0013: organizations + org_members — team accounts with shared quota
    await applyMigrationIfMissing(
      [
        () => db.execute(sqlRaw`SELECT 1 FROM organizations LIMIT 0`),
        () => db.execute(sqlRaw`SELECT 1 FROM org_members LIMIT 0`),
      ],
      "0013_organizations.sql",
      "organizations + org_members",
    );

    // 0014: grandfathered_unlimited — protect existing subscribers from new quota limits
    // All currently-active subscriptions are flagged; new/renewed subs default to false.
    await applyMigrationIfMissing(
      [() => db.execute(sqlRaw`SELECT grandfathered_unlimited FROM subscriptions LIMIT 0`)],
      "0014_grandfathered_unlimited.sql",
      "subscriptions.grandfathered_unlimited",
    );

    // 0015: concrete consultation reservation binding + pending reservation expiry index
    await applyMigrationIfMissing(
      [
        () => db.execute(sqlRaw`SELECT service_session_id FROM consultations LIMIT 0`),
        () => db.execute(sqlRaw`SELECT 1 FROM pg_indexes WHERE indexname = 'service_sessions_pending_expiry_idx'`),
      ],
      "0015_service_reservation_lifecycle.sql",
      "consultation reservation lifecycle",
    );

    await applyMigrationIfMissing(
      [() => db.execute(sqlRaw`SELECT 1 FROM pg_constraint WHERE conname = 'consultations_service_session_unique'`).then((result: any) => {
        if (!result.rows || result.rows.length === 0) {
          throw new Error("constraint consultations_service_session_unique missing");
        }
      })],
      "0016_consultation_reservation_unique.sql",
      "one reservation per consultation",
    );

  }

  // ── One-time migration: backfill phone_verified for legacy users ──────────
  // Users who registered before OTP verification was introduced default to
  // phoneVerified=false, which would lock them out of login. This migration
  // sets phoneVerified=true ONLY for accounts created strictly before the OTP
  // feature was deployed (2026-07-30T11:06:03Z — the timestamp of the first
  // ever OTP token in the system). Any account created at or after that
  // cutoff went through the new registration flow and must confirm SMS OTP.
  // Safe to re-run on every startup: already-verified users are skipped.
  const OTP_FEATURE_CUTOFF = new Date("2026-07-30T11:06:03Z");
  try {
    const { sql } = await import("drizzle-orm");
    const result = await db.execute(sql`
      UPDATE users
      SET phone_verified = true
      WHERE phone_verified = false
        AND created_at < ${OTP_FEATURE_CUTOFF}
    `);
    const count = (result as any).rowCount ?? 0;
    if (count > 0) {
      logger.info({ count }, "✅ تم ترحيل المستخدمين القدامى: phone_verified=true");
    }
  } catch (err) {
    // Non-fatal: log and continue. The table may not exist in very old envs.
    logger.warn({ err }, "⚠️ تعذّر تشغيل migration لـ phone_verified — سيُعاد المحاولة في التشغيل القادم");
  }

  // Critical safety check: confirm the token_blocklist table exists and is
  // queryable before we open the port.  If a migration accidentally drops or
  // renames the table, every previously-revoked JWT would be silently accepted
  // again — we prefer a hard crash over that invisible security regression.
  try {
    await assertBlocklistTableReachable();
    logger.info("✅ token_blocklist table is reachable");
  } catch (err) {
    logger.fatal(
      { err },
      "🚨 CRITICAL: token_blocklist table is not reachable. " +
      "JWT revocation is broken — refusing to start. " +
      "Restore the table via migration and restart the server.",
    );
    process.exit(1);
  }

  app.listen(port, (err) => {
    if (err) {
      logger.error({ err }, "Error listening on port");
      process.exit(1);
    }

    logger.info({ port }, "Server listening");

    // البوت: polling في التطوير فقط، إرسال-فقط في الإنتاج — لا 409 بعد الآن.
    startTelegramBot();

    // Restore auto-sync schedule if previously configured (async — checks DB toggle)
    restoreAutoSync(logger).catch(err => logger.warn({ err }, "restoreAutoSync failed"));

    // Restore MOJ circular crawl schedule
    restoreMojCrawlSchedule();
    logger.info("⏰ جدولة زحف تعاميم وزارة العدل استُعيدت");

    // #370: Reset any legal_codices stuck in "extracting" from a previous crashed run.
    // The extraction process is in-process (not a worker), so any restart kills it mid-flight.
    // We reset to "error" so the admin can see and re-trigger — better than a permanent spinner.
    db.update(legalCodicesTable)
      .set({ status: "error", errorMessage: "الاستخراج انقطع بسبب إعادة تشغيل الخادم — أعد تشغيل الاستخراج.", updatedAt: new Date() })
      .where(eq(legalCodicesTable.status, "extracting"))
      .then(r => {
        const count = (r as unknown as { rowCount?: number }).rowCount ?? 0;
        if (count > 0) logger.warn({ count }, "⚠️ إعادة ضبط مدونات عالقة في حالة 'extracting'");
      })
      .catch(err => logger.error({ err }, "خطأ أثناء إعادة ضبط حالات extracting العالقة"));

    // Start daily subscription renewal reminder emails
    startSubscriptionReminderScheduler();

    // Start consultation reminder scheduler
    startConsultationReminderScheduler();

    // Quota expiry alerts — run once daily (checks 3-day window)
    const scheduleExpiryAlerts = () => {
      setTimeout(async () => {
        try {
          await sendExpiryAlerts();
        } catch (err) {
          logger.error({ err }, "خطأ أثناء إرسال تنبيهات انتهاء الاشتراك");
        } finally {
          scheduleExpiryAlerts();
        }
      }, 24 * 60 * 60 * 1000).unref();
    };
    scheduleExpiryAlerts();
    sendExpiryAlerts().catch(err => logger.warn({ err }, "تنبيهات الانتهاء: خطأ عند التشغيل الأول"));

    // Expire overdue subscriptions every hour (endDate passed but status still active)
    const expireSubscriptions = async () => {
      try {
        const count = await expireOverdueSubscriptions();
        if (count > 0) logger.info({ count }, "⏰ اشتراكات منتهية أُغلقت تلقائياً");
      } catch (err) {
        logger.error({ err }, "خطأ أثناء إغلاق الاشتراكات المنتهية");
      }
    };
    expireSubscriptions(); // run once at startup
    setInterval(expireSubscriptions, 60 * 60 * 1000).unref(); // then every hour

    // Pending quota reservations hold shared team capacity only while a real
    // operation is being delivered. Abandoned work is released automatically.
    const releaseExpiredReservations = async () => {
      try {
        const count = await releaseExpiredServiceReservations();
        if (count > 0) logger.info({ count }, "🧹 تم تحرير حجوزات الحصة المنتهية");
      } catch (err) {
        logger.error({ err }, "خطأ أثناء تحرير حجوزات الحصة المنتهية");
      }
    };
    releaseExpiredReservations();
    setInterval(releaseExpiredReservations, 30 * 60 * 1000).unref();

    // Purge expired blocklist entries every hour.
    // Note: pg_cron is not available in this PostgreSQL instance
    // (shared_preload_libraries = timescaledb,helium only), so the
    // cleanup is driven by a Node.js interval.  The interval uses
    // recursive-setTimeout style error isolation: a failed purge is
    // logged and the next tick is still guaranteed to fire.
    const schedulePurge = () => {
      setTimeout(async () => {
        try {
          await purgeExpiredBlocklistEntries();
          logger.info("🧹 تم تنظيف الـ tokens المنتهية من قائمة الإبطال");
        } catch (err) {
          logger.error({ err }, "خطأ أثناء تنظيف قائمة إبطال الـ JWT");
        } finally {
          schedulePurge(); // always reschedule — even after an error
        }
      }, 60 * 60 * 1000).unref(); // 1 hour
    };
    schedulePurge();
    // Run once at startup to clean up any rows that accumulated during downtime
    purgeExpiredBlocklistEntries().catch((err) =>
      logger.error({ err }, "خطأ أثناء تنظيف أولي لقائمة إبطال الـ JWT"),
    );

    // ── Periodic blocklist health-check (every 5 minutes) ─────────────────
    // The startup probe above only runs once.  If the token_blocklist table
    // is dropped (or the DB connection is lost) while the server is already
    // serving traffic, JWT revocation silently breaks until the next restart.
    // This recurring check re-probes the table and fires a CRITICAL log (and
    // an optional alert webhook) so the operations team is notified immediately.
    const BLOCKLIST_CHECK_INTERVAL_MS = 5 * 60 * 1000; // 5 minutes
    const BLOCKLIST_ALERT_WEBHOOK = process.env["BLOCKLIST_ALERT_WEBHOOK"];

    const scheduleBlocklistHealthCheck = () => {
      setTimeout(async () => {
        try {
          await assertBlocklistTableReachable();
          logger.debug("✅ [health] token_blocklist table reachable");
        } catch (err) {
          logger.fatal(
            { err },
            "🚨 CRITICAL: token_blocklist table is no longer reachable while the server is running. " +
            "JWT revocation is broken — all previously-revoked tokens are being silently accepted. " +
            "Restore the table immediately and restart the server.",
          );
          // Optional alert webhook: set BLOCKLIST_ALERT_WEBHOOK env var to a URL
          // that accepts a POST request (e.g. a Slack incoming webhook, PagerDuty, etc.)
          if (BLOCKLIST_ALERT_WEBHOOK) {
            fetch(BLOCKLIST_ALERT_WEBHOOK, {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                severity: "CRITICAL",
                service: "rabab-legal-api",
                message:
                  "token_blocklist table unreachable — JWT revocation is broken. " +
                  "Restore the table and restart the server immediately.",
                timestamp: new Date().toISOString(),
                error: String(err),
              }),
            }).catch((webhookErr) =>
              logger.error(
                { webhookErr },
                "⚠️ فشل إرسال تنبيه webhook لانعدام جدول blocklist",
              ),
            );
          }
        } finally {
          scheduleBlocklistHealthCheck(); // always reschedule — even after failure
        }
      }, BLOCKLIST_CHECK_INTERVAL_MS).unref();
    };
    scheduleBlocklistHealthCheck();
    logger.info("⏰ فحص دوري لجدول token_blocklist كل 5 دقائق مفعّل");

    // Push notification expiry reminders — run daily
    const PUSH_NOTIF_INTERVAL_MS = 24 * 60 * 60 * 1000; // 24 hours
    setInterval(async () => {
      try {
        await sendSubscriptionExpiryReminders();
      } catch (err) {
        logger.error({ err }, "خطأ أثناء إرسال إشعارات انتهاء الاشتراك");
      }
    }, PUSH_NOTIF_INTERVAL_MS).unref();
    // Run once shortly after startup to catch any missed notifications
    setTimeout(() => {
      sendSubscriptionExpiryReminders().catch((err) =>
        logger.error({ err }, "خطأ أثناء إرسال إشعارات انتهاء الاشتراك عند البدء"),
      );
    }, 30_000).unref(); // 30-second delay to let the server warm up
    logger.info("⏰ جدولة إشعارات انتهاء الاشتراك اليومية نشطة");
  });
})();

    const runBlocklistPurge = async (label: string) => {
      try {
        const deleted = await purgeExpiredBlocklistEntries();
        logger.info({ deleted, label }, "🧹 تم تنظيف الـ tokens المنتهية من قائمة الإبطال");
        if (deleted >= PURGE_WARN_THRESHOLD) {
          logger.warn(
            { deleted, threshold: PURGE_WARN_THRESHOLD, label },
            "⚠️ عدد كبير من الـ tokens المحذوفة في دورة التنظيف — قد يكون هجوم إبطال أو خطأ في التطبيق",
          );
        }
      } catch (err) {
        logger.error({ err, label }, "خطأ أثناء تنظيف قائمة إبطال الـ JWT");
      }
    };
