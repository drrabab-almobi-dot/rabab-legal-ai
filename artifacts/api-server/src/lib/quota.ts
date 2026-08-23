/**
 * Quota Engine — الحصص والتجربة المجانية
 *
 * قواعد التصميم:
 * - التجربة المجانية: 3 خدمات إجمالية لكل مستخدم (مجموع الاستشارات + العقود + المراجعات)
 * - الاشتراك المدفوع: حصص منفصلة لكل نوع، تُعاد شهرياً/سنوياً حسب الباقة
 * - فترة السماح: 10 دقائق من أول إنجاز الخدمة تُعتبر استمراراً لنفس الخدمة (لا شحن إضافي)
 * - المدراء: بلا حصة دائماً
 */
import { db, subscriptionsTable, packagesTable, serviceSessionsTable, usageLogTable, usersTable, orgMembersTable, organizationsTable } from "@workspace/db";
import { eq, and, desc, gte, gt, sql, or, isNull, lt, lte } from "drizzle-orm";
import { checkAndSendQuotaAlerts } from "./quota-alerts";

/** الحد اليومي = 25% من الرصيد الشهري */
const DAILY_QUOTA_FRACTION = 0.25;

export type ServiceType = "consultation" | "contract_draft" | "contract_review";

export interface QuotaStatus {
  /** هل يملك المستخدم صلاحية تشغيل الخدمة الآن؟ */
  allowed: boolean;
  /** هل في التجربة المجانية؟ */
  isTrial: boolean;
  /** الخدمات المجانية المتبقية (null = اشتراك مدفوع) */
  trialRemaining: number | null;
  /** الحصة المتبقية للنوع المطلوب (null = تجربة مجانية أو غير محدد) */
  remaining: Record<ServiceType, number | null>;
  /** الحصة الكاملة المتاحة في الفترة الحالية */
  allowed_limits: Record<ServiceType, number | null>;
  /** هل نفدت التجربة المجانية ويحتاج اشتراكاً؟ */
  needsUpgrade: boolean;
  /** رسالة للمستخدم عند الحجب */
  message?: string;
}

/** عدد الخدمات المجانية الممنوحة لكل مستخدم جديد */
export const FREE_TRIAL_SERVICES = 3;
/** فترة السماح بالتعديل (10 دقائق) */
const GRACE_MS = 10 * 60 * 1000;
/** Pending work reserves capacity briefly, then is released automatically. */
const RESERVATION_MS = 30 * 60 * 1000;

// ── جلب الاشتراك النشط مع بيانات الباقة ──────────────────────────────────────
//
// الأولوية:
//   1. إذا كان المستخدم عضواً نشطاً في منشأة → يُعاد اشتراك المالك دائماً
//      (الحصة المشتركة تغلب على الاشتراك الفردي سواء كان مجانياً أو مدفوعاً)
//   2. وإلا → يُعاد اشتراك المستخدم الشخصي النشط (مدفوع أو تجريبي مجاني)
//
// هذا يضمن أن أعضاء المنشأة لا يستهلكون تجربتهم المجانية ولا اشتراكهم الخاص،
// بل يستهلكون من حصة الباقة الواحدة المشتركة للمنشأة.
async function getActiveSub(userId: number) {
  const now = new Date();

  // 1. تحقق أولاً من العضوية النشطة في منشأة — لها الأولوية المطلقة
  const [membership] = await db
    .select({ ownerId: organizationsTable.ownerId })
    .from(orgMembersTable)
    .innerJoin(organizationsTable, eq(orgMembersTable.orgId, organizationsTable.id))
    .where(
      and(
        eq(orgMembersTable.userId, userId),
        eq(orgMembersTable.status, "active"),
      ),
    )
    .limit(1);

  if (membership) {
    // جلب اشتراك المالك — يجب أن يكون باقة أعمال (business) نشطة بالتحديد
    // إذا انتهى اشتراك الأعمال أو تحول إلى باقة أخرى، يُحجب الأعضاء
    const ownerRows = await db
      .select({ sub: subscriptionsTable, pkg: packagesTable })
      .from(subscriptionsTable)
      .innerJoin(packagesTable, eq(subscriptionsTable.packageId, packagesTable.id))
      .where(
        and(
          eq(subscriptionsTable.userId, membership.ownerId),
          eq(subscriptionsTable.status, "active"),
          eq(packagesTable.type, "business"),
          or(isNull(subscriptionsTable.endDate), gte(subscriptionsTable.endDate, now)),
        ),
      )
      .orderBy(desc(subscriptionsTable.id))
      .limit(1);
    // إذا لم يكن للمالك اشتراك أعمال نشط، يُحجب العضو برسالة واضحة
    return ownerRows[0] ?? null;
  }

  // 2. لا عضوية منشأة — استخدم اشتراك المستخدم الشخصي
  const rows = await db
    .select({ sub: subscriptionsTable, pkg: packagesTable })
    .from(subscriptionsTable)
    .innerJoin(packagesTable, eq(subscriptionsTable.packageId, packagesTable.id))
    .where(
      and(
        eq(subscriptionsTable.userId, userId),
        eq(subscriptionsTable.status, "active"),
        or(isNull(subscriptionsTable.endDate), gte(subscriptionsTable.endDate, now)),
      ),
    )
    .orderBy(desc(subscriptionsTable.id))
    .limit(1);

  return rows[0] ?? null;
}

// ── إغلاق الاشتراكات المنتهية تلقائياً ───────────────────────────────────────
export async function expireOverdueSubscriptions(): Promise<number> {
  const now = new Date();
  const result = await db
    .update(subscriptionsTable)
    .set({ status: "expired" })
    .where(
      and(
        eq(subscriptionsTable.status, "active"),
        lt(subscriptionsTable.endDate, now),
      ),
    )
    .returning({ id: subscriptionsTable.id });
  return result.length;
}

// ── عدد الخدمات المجانية المستخدمة (مجموع الثلاثة أنواع) ───────────────────
async function countFreeSessions(userId: number): Promise<number> {
  const row = await db
    .select({ total: sql<number>`COUNT(*)::int` })
    .from(serviceSessionsTable)
    .where(and(
      eq(serviceSessionsTable.userId, userId),
      or(
        eq(serviceSessionsTable.counted, true),
        gt(serviceSessionsTable.graceEnd!, new Date()),
      ),
    ));
  return row[0]?.total ?? 0;
}

// ── التحقق من فترة السماح: هل هذا client_session ضمن نافذة 10 دقائق؟ ──────
async function getGraceSession(userId: number, serviceType: ServiceType, clientSession?: string) {
  if (!clientSession) return null;
  const [existing] = await db
    .select({ id: serviceSessionsTable.id, subscriptionId: serviceSessionsTable.subscriptionId })
    .from(serviceSessionsTable)
    .where(
      and(
        eq(serviceSessionsTable.userId, userId),
        eq(serviceSessionsTable.serviceType, serviceType),
        eq(serviceSessionsTable.clientSession, clientSession),
        eq(serviceSessionsTable.counted, true),
        gt(serviceSessionsTable.graceEnd!, new Date()),
      ),
    )
    .limit(1);
  return existing ?? null;
}

/**
 * جلب حالة الحصة الكاملة للمستخدم
 */
export async function getQuotaStatus(userId: number): Promise<QuotaStatus> {
  const record = await getActiveSub(userId);

  if (!record) {
    return {
      allowed: false,
      isTrial: false,
      trialRemaining: null,
      remaining: { consultation: null, contract_draft: null, contract_review: null },
      allowed_limits: { consultation: null, contract_draft: null, contract_review: null },
      needsUpgrade: true,
      message: "لا يوجد اشتراك نشط — يرجى الاشتراك في إحدى الباقات",
    };
  }

  const { sub, pkg } = record;
  const isTrial = pkg.type === "free";

  if (isTrial) {
    // التحقق من انتهاء صلاحية التجربة (7 أيام من التسجيل)
    const [userRow] = await db.select({ trialExpiresAt: usersTable.trialExpiresAt }).from(usersTable).where(eq(usersTable.id, userId));
    const trialExpired = userRow?.trialExpiresAt != null && userRow.trialExpiresAt < new Date();

    if (trialExpired) {
      return {
        allowed: false,
        isTrial: true,
        trialRemaining: 0,
        remaining: { consultation: 0, contract_draft: 0, contract_review: 0 },
        allowed_limits: { consultation: FREE_TRIAL_SERVICES, contract_draft: FREE_TRIAL_SERVICES, contract_review: FREE_TRIAL_SERVICES },
        needsUpgrade: true,
        message: "انتهت صلاحية التجربة المجانية (7 أيام) — اشترك للمتابعة",
      };
    }

    const used = await countFreeSessions(userId);
    const remaining = Math.max(0, FREE_TRIAL_SERVICES - used);
    return {
      allowed: remaining > 0,
      isTrial: true,
      trialRemaining: remaining,
      remaining: { consultation: remaining, contract_draft: remaining, contract_review: remaining },
      allowed_limits: { consultation: FREE_TRIAL_SERVICES, contract_draft: FREE_TRIAL_SERVICES, contract_review: FREE_TRIAL_SERVICES },
      needsUpgrade: remaining === 0,
      message: remaining === 0 ? "انتهت خدماتك المجانية الثلاث — اشترك للمتابعة" : undefined,
    };
  }

  // ── اشتراك مدفوع ──────────────────────────────────────────────────────────
  // مشتركو ما قبل تخفيض حدود الباقات يحتفظون بحصة 9999 (غير محدودة) حتى تجديدهم
  const GRANDFATHERED_LIMIT = 9999;
  const consultationAllowed = sub.grandfatheredUnlimited ? GRANDFATHERED_LIMIT : pkg.consultationsAllowed;
  const contractAllowed     = sub.grandfatheredUnlimited ? GRANDFATHERED_LIMIT : pkg.contractsAllowed;
  const reviewAllowed       = sub.grandfatheredUnlimited ? GRANDFATHERED_LIMIT : pkg.reviewsAllowed;

  const consultationR = consultationAllowed - sub.consultationsUsed;
  const contractR     = contractAllowed     - sub.contractsUsed;
  const reviewR       = reviewAllowed       - sub.reviewsUsed;

  return {
    allowed: true, // نتحقق تفصيلياً عند كل نوع
    isTrial: false,
    trialRemaining: null,
    remaining: {
      consultation: consultationR,
      contract_draft: contractR,
      contract_review: reviewR,
    },
    allowed_limits: {
      consultation: consultationAllowed,
      contract_draft: contractAllowed,
      contract_review: reviewAllowed,
    },
    needsUpgrade: false,
  };
}

/**
 * التحقق من إمكانية تشغيل خدمة معينة، مع مراعاة فترة السماح.
 * يُعيد { ok, sessionId?, subscriptionId?, message? }
 * sessionId يُخزَّن في service_sessions ويُرجَع للكود ليستكمل التسجيل بعد النجاح.
 */
export async function checkAndReserveService(
  userId: number,
  serviceType: ServiceType,
  clientSession?: string,
): Promise<{ ok: boolean; sessionId?: number; subscriptionId?: number; message?: string; needsUpgrade?: boolean }> {
  // Grace period check — نفس الجلسة خلال 10 دقائق
  if (clientSession) {
    const graceSession = await getGraceSession(userId, serviceType, clientSession);
    if (graceSession) {
      return {
        ok: true,
        sessionId: graceSession.id,
        subscriptionId: graceSession.subscriptionId ?? undefined,
      };
    }
  }

  const record = await getActiveSub(userId);
  if (!record) {
    return { ok: false, needsUpgrade: true, message: "لا يوجد اشتراك نشط" };
  }

  const { sub, pkg } = record;
  const isTrial = pkg.type === "free";

  // مشتركو ما قبل تخفيض حدود الباقات يحتفظون بحصة 9999 (غير محدودة) حتى التجديد
  // (يُحسب هنا في النطاق الخارجي حتى يكون متاحاً لكلا الفحصَيْن: المبدئي والمقفول)
  const GRANDFATHERED_LIMIT = 9999;
  const effectiveConsultationsAllowed = (!isTrial && sub.grandfatheredUnlimited) ? GRANDFATHERED_LIMIT : pkg.consultationsAllowed;
  const effectiveContractsAllowed     = (!isTrial && sub.grandfatheredUnlimited) ? GRANDFATHERED_LIMIT : pkg.contractsAllowed;
  const effectiveReviewsAllowed       = (!isTrial && sub.grandfatheredUnlimited) ? GRANDFATHERED_LIMIT : pkg.reviewsAllowed;

  if (!isTrial) {
    // ── تحقق مبدئي من الحصة (بدون قفل) — مشترك بين أعضاء المنشأة ─────────────
    // تُقرأ القيم هنا لعرض رسالة سريعة قبل الدخول في المعاملة.
    // سيُعاد التحقق الدقيق داخل المعاملة مع القفل (FOR UPDATE) لضمان الذرية.
    let preCheckRemaining = 0;
    if (serviceType === "consultation")   preCheckRemaining = effectiveConsultationsAllowed - sub.consultationsUsed;
    if (serviceType === "contract_draft") preCheckRemaining = effectiveContractsAllowed     - sub.contractsUsed;
    if (serviceType === "contract_review") preCheckRemaining = effectiveReviewsAllowed      - sub.reviewsUsed;
    if (preCheckRemaining <= 0) {
      return { ok: false, needsUpgrade: false, message: "نفدت حصتك من هذه الخدمة في الفترة الحالية — يرجى ترقية الباقة أو انتظار تجديد الاشتراك" };
    }

    // ── حد يومي: 25% من الرصيد الشهري (بدون قفل — حد مرن لكل مستخدم) ─────────
    let monthlyAllowed = 0;
    if (serviceType === "consultation")    monthlyAllowed = effectiveConsultationsAllowed;
    if (serviceType === "contract_draft")  monthlyAllowed = effectiveContractsAllowed;
    if (serviceType === "contract_review") monthlyAllowed = effectiveReviewsAllowed;
    if (monthlyAllowed > 0 && monthlyAllowed < 9999) {
      const dailyLimit = Math.max(1, Math.ceil(monthlyAllowed * DAILY_QUOTA_FRACTION));
      const todayStart = new Date();
      todayStart.setHours(0, 0, 0, 0);
      const [dayRow] = await db
        .select({ total: sql<number>`COALESCE(SUM(units_deducted), 0)::int` })
        .from(usageLogTable)
        .where(and(eq(usageLogTable.userId, userId), gte(usageLogTable.createdAt, todayStart)));
      const todayUsed = dayRow?.total ?? 0;
      if (todayUsed >= dailyLimit) {
        return { ok: false, needsUpgrade: false, message: `بلغت الحد اليومي المسموح به — يُجدَّد في منتصف الليل (مستخدَم اليوم: ${todayUsed} من ${dailyLimit})` };
      }
    }
  }

  // ── إنشاء service_session مع ضمان الذرية للاشتراكات المشتركة (باقة الأعمال) ──
  //
  // للاشتراكات المدفوعة نستخدم معاملة مع SELECT ... FOR UPDATE على صف الاشتراك
  // لمنع تجاوز الحصة عند وجود طلبات متزامنة من أعضاء المنشأة.
  //
  // للتجربة المجانية نقفل صف المستخدم لكي تعدّ الحجوزات المعلقة فوراً.
  const graceEnd = new Date(Date.now() + RESERVATION_MS);

  if (isTrial) {
    try {
      const txResult = await db.transaction(async (tx) => {
        await tx.execute(sql`SELECT id FROM users WHERE id = ${userId} FOR UPDATE`);
        if (clientSession) {
          const countedGraceRows = await tx.execute(
            sql`SELECT id, subscription_id FROM service_sessions
                WHERE user_id = ${userId} AND service_type = ${serviceType}
                  AND client_session = ${clientSession} AND counted = true
                  AND grace_end > NOW()
                FOR UPDATE`,
          );
          const countedGrace = countedGraceRows.rows[0] as { id: number; subscription_id: number | null } | undefined;
          if (countedGrace) return { sessionId: countedGrace.id, subscriptionId: countedGrace.subscription_id ?? sub.id };

          await tx.delete(serviceSessionsTable).where(and(
            eq(serviceSessionsTable.userId, userId),
            eq(serviceSessionsTable.serviceType, serviceType),
            eq(serviceSessionsTable.clientSession, clientSession),
            eq(serviceSessionsTable.counted, false),
            lte(serviceSessionsTable.graceEnd!, new Date()),
          ));
          const existingRows = await tx.execute(
            sql`SELECT id, subscription_id FROM service_sessions
                WHERE user_id = ${userId} AND service_type = ${serviceType}
                  AND client_session = ${clientSession} AND counted = false
                FOR UPDATE`,
          );
          const existing = existingRows.rows[0] as { id: number; subscription_id: number | null } | undefined;
          if (existing) return { sessionId: existing.id, subscriptionId: existing.subscription_id ?? sub.id };
        }
        const usageRows = await tx.execute(
          sql`SELECT COUNT(*)::int AS total
              FROM service_sessions
              WHERE user_id = ${userId}
                AND (counted = true OR grace_end > NOW())`,
        );
        const usedOrPending = Number((usageRows.rows[0] as { total?: number | string } | undefined)?.total ?? 0);
        if (usedOrPending >= FREE_TRIAL_SERVICES) {
          throw Object.assign(new Error("انتهت خدماتك المجانية — اشترك للمتابعة"), { httpStatus: 429 });
        }
        const inserted = await tx.insert(serviceSessionsTable)
          .values({ userId, subscriptionId: sub.id, serviceType, clientSession: clientSession ?? null, graceEnd, counted: false })
          .returning();
        return { sessionId: inserted[0].id, subscriptionId: sub.id };
      });
      return { ok: true, sessionId: txResult.sessionId, subscriptionId: txResult.subscriptionId };
    } catch (err: any) {
      if (err?.httpStatus === 429) {
        return { ok: false, needsUpgrade: true, message: err.message };
      }
      throw err;
    }
  } else {
    // اشتراك مدفوع — معاملة مع FOR UPDATE لضمان الذرية
    try {
      const txResult = await db.transaction(async (tx) => {
        // اقفل صف الاشتراك: يُسلسل الطلبات المتزامنة على نفس الاشتراك
        const lockedRows = await tx.execute(
          sql`SELECT consultations_used, contracts_used, reviews_used FROM subscriptions WHERE id = ${sub.id} FOR UPDATE`,
        );
        const lockedSub = lockedRows.rows[0] as {
          consultations_used: string | number;
          contracts_used: string | number;
          reviews_used: string | number;
        };
        if (!lockedSub) throw Object.assign(new Error("subscription_gone"), { httpStatus: 409 });

        // الطلب المكرّر لنفس clientSession يعيد الحجز القائم قبل احتساب السعة.
        // القيد الجزئي في DB يحمي كذلك من التكرار عبر العمليات المتزامنة.
        if (clientSession) {
          const countedGraceRows = await tx.execute(
            sql`SELECT id, subscription_id FROM service_sessions
                WHERE user_id = ${userId} AND service_type = ${serviceType}
                  AND client_session = ${clientSession} AND counted = true
                  AND grace_end > NOW()
                FOR UPDATE`,
          );
          const countedGrace = countedGraceRows.rows[0] as { id: number; subscription_id: number | null } | undefined;
          if (countedGrace) return { sessionId: countedGrace.id, subscriptionId: countedGrace.subscription_id ?? sub.id };

          // Remove an abandoned duplicate before the partial unique index can
          // turn it into a permanently blocked retry.
          await tx.delete(serviceSessionsTable).where(and(
            eq(serviceSessionsTable.userId, userId),
            eq(serviceSessionsTable.serviceType, serviceType),
            eq(serviceSessionsTable.clientSession, clientSession),
            eq(serviceSessionsTable.counted, false),
            lte(serviceSessionsTable.graceEnd!, new Date()),
          ));

          const existingRows = await tx.execute(
            sql`SELECT id, subscription_id
                FROM service_sessions
                WHERE user_id = ${userId}
                  AND service_type = ${serviceType}
                  AND client_session = ${clientSession}
                  AND counted = false
                FOR UPDATE`,
          );
          const existing = existingRows.rows[0] as { id: number; subscription_id: number | null } | undefined;
          if (existing) {
            return { sessionId: existing.id, subscriptionId: existing.subscription_id ?? sub.id };
          }
        }

        // أعد التحقق من الحصة بالقيم المقفولة، مع احتساب الحجوزات المعلّقة.
        // يبقى الخصم النهائي عند نجاح الخدمة، لكن لا يمكن لطلبين حجز آخر مقعد.
        const pendingRows = await tx.execute(
          sql`SELECT COUNT(*)::int AS total
              FROM service_sessions
              WHERE subscription_id = ${sub.id}
                AND service_type = ${serviceType}
                AND counted = false
                AND grace_end > NOW()`,
        );
        const pendingCount = Number((pendingRows.rows[0] as { total?: number | string } | undefined)?.total ?? 0);

        let remaining = 0;
        if (serviceType === "consultation")    remaining = effectiveConsultationsAllowed - Number(lockedSub.consultations_used) - pendingCount;
        if (serviceType === "contract_draft")  remaining = effectiveContractsAllowed     - Number(lockedSub.contracts_used) - pendingCount;
        if (serviceType === "contract_review") remaining = effectiveReviewsAllowed       - Number(lockedSub.reviews_used) - pendingCount;
        if (remaining <= 0) {
          throw Object.assign(
            new Error("نفدت حصتك من هذه الخدمة في الفترة الحالية — يرجى ترقية الباقة أو انتظار تجديد الاشتراك"),
            { httpStatus: 429 },
          );
        }

        // أدرج الجلسة داخل نفس المعاملة المقفولة؛ ستظهر كحجز معلّق للطلب التالي.
        const inserted = await tx
          .insert(serviceSessionsTable)
          .values({ userId, subscriptionId: sub.id, serviceType, clientSession: clientSession ?? null, graceEnd, counted: false })
          .onConflictDoNothing()
          .returning();

        if (!inserted[0]) {
          throw Object.assign(new Error("duplicate_reservation"), { httpStatus: 409 });
        }
        return { sessionId: inserted[0].id, subscriptionId: sub.id };
      });

      if (txResult) return { ok: true, sessionId: txResult.sessionId, subscriptionId: txResult.subscriptionId };
    } catch (err: any) {
      if (err?.httpStatus === 429) {
        return { ok: false, needsUpgrade: false, message: err.message };
      }
      if (err?.httpStatus === 409) {
        return { ok: false, needsUpgrade: true, message: "لا يوجد اشتراك نشط" };
      }
      throw err; // خطأ غير متوقع
    }
  }

  // تعارض (clientSession متطابق): طلب متزامن سبق وأنشأ الجلسة — أعد استخدامها
  if (clientSession) {
    const [existing] = await db
      .select()
      .from(serviceSessionsTable)
      .where(
        and(
          eq(serviceSessionsTable.userId, userId),
          eq(serviceSessionsTable.serviceType, serviceType),
          eq(serviceSessionsTable.clientSession, clientSession),
          eq(serviceSessionsTable.counted, false),
        ),
      )
      .limit(1);

    if (existing) return { ok: true, sessionId: existing.id, subscriptionId: existing.subscriptionId ?? undefined };

    // حافة نادرة: الجلسة احتُسبت بين INSERT والـ SELECT — نعتبرها ضمن فترة السماح
    return { ok: true };
  }

  return { ok: false, message: "تعذّر حجز جلسة الخدمة — يرجى المحاولة مرة أخرى" };
}

/** Returns a live, uncounted reservation owned by the requesting user. */
export async function getPendingServiceReservation(
  sessionId: number,
  userId: number,
  serviceType: ServiceType,
): Promise<{ id: number; subscriptionId: number | null } | null> {
  const [session] = await db.select({
    id: serviceSessionsTable.id,
    subscriptionId: serviceSessionsTable.subscriptionId,
  }).from(serviceSessionsTable).where(and(
    eq(serviceSessionsTable.id, sessionId),
    eq(serviceSessionsTable.userId, userId),
    eq(serviceSessionsTable.serviceType, serviceType),
    eq(serviceSessionsTable.counted, false),
    gt(serviceSessionsTable.graceEnd!, new Date()),
  )).limit(1);
  return session ?? null;
}

/**
 * Releases pending work whose reservation window elapsed before delivery.
 * Safe to call repeatedly; releaseService locks the shared subscription first.
 */
export async function releaseExpiredServiceReservations(): Promise<number> {
  const expired = await db.select({ id: serviceSessionsTable.id })
    .from(serviceSessionsTable)
    .where(and(
      eq(serviceSessionsTable.counted, false),
      lte(serviceSessionsTable.graceEnd!, new Date()),
    ));

  for (const session of expired) {
    await releaseService(session.id);
  }
  return expired.length;
}

/**
 * إلغاء حجز الجلسة: يحذف جلسة الخدمة غير المحتسبة عند فشل الخدمة قبل الاكتمال.
 * يُستدعى في مسارات الخطأ بعد حجز الجلسة لضمان عدم بقاء جلسات يتيمة في قاعدة البيانات.
 */
export async function releaseService(sessionId: number): Promise<void> {
  try {
    await db.transaction(async (tx) => {
      // Lock order is always subscription → session for paid work. Reading the
      // id first then re-reading under lock avoids a deadlock with reservation.
      const preliminaryRows = await tx.execute(
        sql`SELECT subscription_id FROM service_sessions WHERE id = ${sessionId}`,
      );
      const preliminary = preliminaryRows.rows[0] as { subscription_id: number | null } | undefined;
      if (preliminary?.subscription_id) {
        await tx.execute(sql`SELECT id FROM subscriptions WHERE id = ${preliminary.subscription_id} FOR UPDATE`);
      }

      const sessionRows = await tx.execute(
        sql`SELECT subscription_id, counted FROM service_sessions WHERE id = ${sessionId} FOR UPDATE`,
      );
      const session = sessionRows.rows[0] as { subscription_id: number | null; counted: boolean } | undefined;
      if (!session || session.counted) return;

      await tx
        .delete(serviceSessionsTable)
        .where(and(eq(serviceSessionsTable.id, sessionId), eq(serviceSessionsTable.counted, false)));
    });
  } catch {
    // صامت — الإخفاق هنا لا يؤثر على المستخدم
  }
}

/**
 * تسجيل نجاح الخدمة: يحتسب الجلسة ويزيد العداد في الاشتراك.
 * يُستدعى بعد الحصول على رد ناجح من OpenAI.
 * يكتب في usage_log ويُطلق تنبيهات العتبة إذا اقتضى الأمر.
 */
export async function commitService(sessionId: number): Promise<void> {
  const committed = await db.transaction(async (tx) => {
    // Acquire the shared subscription lock before the session row. Reservation,
    // commit, and release therefore use one lock order.
    const preliminaryRows = await tx.execute(
      sql`SELECT subscription_id, user_id FROM service_sessions WHERE id = ${sessionId}`,
    );
    const preliminary = preliminaryRows.rows[0] as { subscription_id: number | null; user_id: number } | undefined;
    // Trial reservation takes this lock first. Commit does too, so a retry and
    // an in-flight completion cannot deadlock on user/session in reverse order.
    if (preliminary?.user_id) {
      await tx.execute(sql`SELECT id FROM users WHERE id = ${preliminary.user_id} FOR UPDATE`);
    }
    if (preliminary?.subscription_id) {
      await tx.execute(sql`SELECT id FROM subscriptions WHERE id = ${preliminary.subscription_id} FOR UPDATE`);
    }

    const sessionRows = await tx.execute(
      sql`SELECT user_id, subscription_id, service_type, counted, grace_end
          FROM service_sessions
          WHERE id = ${sessionId}
          FOR UPDATE`,
    );
    const session = sessionRows.rows[0] as {
      user_id: number;
      subscription_id: number | null;
      service_type: ServiceType;
      counted: boolean;
      grace_end: Date;
    } | undefined;
    if (!session || session.counted) return null;
    if (new Date(session.grace_end).getTime() <= Date.now()) {
      await tx.delete(serviceSessionsTable)
        .where(and(eq(serviceSessionsTable.id, sessionId), eq(serviceSessionsTable.counted, false)));
      return null;
    }

    if (session.subscription_id) {
      const incr: Record<string, any> = {};
      if (session.service_type === "consultation")   incr.consultationsUsed = sql`consultations_used + 1`;
      if (session.service_type === "contract_draft") incr.contractsUsed     = sql`contracts_used + 1`;
      if (session.service_type === "contract_review") incr.reviewsUsed      = sql`reviews_used + 1`;
      if (Object.keys(incr).length > 0) {
        await tx
          .update(subscriptionsTable)
          .set(incr)
          .where(eq(subscriptionsTable.id, session.subscription_id));
      }
    }

    await tx
      .update(serviceSessionsTable)
      .set({ counted: true, graceEnd: new Date(Date.now() + GRACE_MS) })
      .where(and(eq(serviceSessionsTable.id, sessionId), eq(serviceSessionsTable.counted, false)));

    const [usageLog] = await tx.insert(usageLogTable).values({
      userId: session.user_id,
      subscriptionId: session.subscription_id,
      serviceType: session.service_type,
      unitsDeducted: 1,
      balanceAfter: null,
    }).returning({ id: usageLogTable.id });

    return {
      userId: session.user_id,
      subscriptionId: session.subscription_id,
      serviceType: session.service_type,
      usageLogId: usageLog?.id,
    };
  });

  if (!committed) return;

  // احسب الرصيد بعد الخصم وأطلق تنبيهات العتبة خارج معاملة القفل.
  try {
    const quotaAfter = await getQuotaStatus(committed.userId);
    const svcType = committed.serviceType;
    const remainingAfter = quotaAfter.remaining[svcType] ?? 0;
    const totalAllowed   = quotaAfter.allowed_limits[svcType] ?? 0;

    if (committed.usageLogId) {
      await db.update(usageLogTable)
        .set({ balanceAfter: remainingAfter })
        .where(eq(usageLogTable.id, committed.usageLogId));
    }

    // تنبيهات العتبة (لا تُوقف commitService عند الفشل)
    const SERVICE_LABELS: Record<string, string> = {
      consultation: "الاستشارة القانونية",
      contract_draft: "صياغة العقد",
      contract_review: "مراجعة العقد",
    };
    if (committed.subscriptionId !== null) {
      checkAndSendQuotaAlerts({
        userId: committed.userId,
        subscriptionId: committed.subscriptionId,
        remainingAfter,
        totalAllowed,
        serviceLabel: SERVICE_LABELS[svcType] ?? svcType,
      }).catch(() => {/* صامت */});
    }
  } catch {
    // لا تُوقف العملية الرئيسية
  }
}
