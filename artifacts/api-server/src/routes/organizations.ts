/**
 * Organizations Router — نظام حسابات المنشآت
 *
 * صاحب حساب المنشأة (حامل اشتراك الأعمال) يدعو موظفين عبر البريد الإلكتروني.
 * جميع أعضاء المنشأة يستهلكون من حصة الاشتراك الواحد.
 *
 * POST   /organizations                    — إنشاء منشأة (صاحب اشتراك الأعمال)
 * GET    /organizations/my                 — معلومات منشأتي (مالك أو عضو)
 * POST   /organizations/invite             — دعوة موظف بالبريد (مالك فقط)
 * GET    /organizations/members            — قائمة الأعضاء + استهلاكهم (مالك فقط)
 * DELETE /organizations/members/:memberId  — إزالة عضو (مالك فقط)
 * POST   /organizations/join/:token        — قبول الدعوة (مستخدم مسجل)
 */
import { Router, type IRouter } from "express";
import { randomUUID } from "crypto";
import { db, organizationsTable, orgMembersTable, usersTable, subscriptionsTable, packagesTable, usageLogTable } from "@workspace/db";
import { eq, and, or, isNull, desc, gte, sql } from "drizzle-orm";
import { requireAuth } from "../middlewares/auth";
import { sendEmail } from "../lib/email";
import { logger } from "../lib/logger";

const router: IRouter = Router();

// ── helpers ───────────────────────────────────────────────────────────────────

/** Escape characters that could break HTML email templates */
function escapeHtml(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

async function getActiveSub(ownerId: number) {
  const now = new Date();
  const rows = await db
    .select({ sub: subscriptionsTable, pkg: packagesTable })
    .from(subscriptionsTable)
    .innerJoin(packagesTable, eq(subscriptionsTable.packageId, packagesTable.id))
    .where(
      and(
        eq(subscriptionsTable.userId, ownerId),
        eq(subscriptionsTable.status, "active"),
        or(isNull(subscriptionsTable.endDate), gte(subscriptionsTable.endDate, now)),
      ),
    )
    .orderBy(desc(subscriptionsTable.id))
    .limit(1);
  return rows[0] ?? null;
}

async function getOrgForOwner(ownerId: number) {
  const [org] = await db
    .select()
    .from(organizationsTable)
    .where(eq(organizationsTable.ownerId, ownerId));
  return org ?? null;
}

async function getOrgMembershipForUser(userId: number) {
  const [row] = await db
    .select({ org: organizationsTable, member: orgMembersTable })
    .from(orgMembersTable)
    .innerJoin(organizationsTable, eq(orgMembersTable.orgId, organizationsTable.id))
    .where(
      and(
        eq(orgMembersTable.userId, userId),
        eq(orgMembersTable.status, "active"),
      ),
    )
    .limit(1);
  return row ?? null;
}

// ── POST /organizations — إنشاء منشأة ────────────────────────────────────────
router.post("/organizations", requireAuth, async (req, res): Promise<void> => {
  const userId = req.userId!;
  const { name } = req.body as { name?: string };
  if (!name?.trim()) {
    res.status(400).json({ error: "اسم المنشأة مطلوب" });
    return;
  }

  // تحقق أن المستخدم يملك اشتراك أعمال نشطاً (خارج المعاملة — قراءة فقط)
  const sub = await getActiveSub(userId);
  if (!sub || sub.pkg.type !== "business") {
    res.status(403).json({ error: "إنشاء المنشأة متاح لمشتركي باقة الأعمال فقط" });
    return;
  }

  try {
    const org = await db.transaction(async (tx) => {
      // قفل استشاري على مستوى المستخدم — يمنع الطلبات المتزامنة من التعارض
      await tx.execute(sql`SELECT pg_advisory_xact_lock(${userId})`);

      // تحقق داخل المعاملة من غياب منشأة سابقة وعدم العضوية في أخرى
      const [existingOrg] = await tx.select({ id: organizationsTable.id })
        .from(organizationsTable).where(eq(organizationsTable.ownerId, userId));
      if (existingOrg) throw Object.assign(new Error("لديك منشأة مسجلة بالفعل"), { httpStatus: 409 });

      const [activeMember] = await tx.select({ orgId: orgMembersTable.orgId })
        .from(orgMembersTable)
        .where(and(eq(orgMembersTable.userId, userId), eq(orgMembersTable.status, "active")));
      if (activeMember) throw Object.assign(
        new Error("لا يمكنك إنشاء منشأة بينما أنت عضو في منشأة أخرى — تواصل مع مالكها لإزالتك أولاً"),
        { httpStatus: 409 },
      );

      const [newOrg] = await tx.insert(organizationsTable)
        .values({ ownerId: userId, name: name!.trim() })
        .returning();
      return newOrg;
    });

    logger.info({ userId, orgId: org.id, name: org.name }, "🏢 تم إنشاء منشأة جديدة");
    res.status(201).json(org);
  } catch (err: any) {
    const status = err?.httpStatus ?? (err?.code === "23505" ? 409 : 500);
    const message = status === 409
      ? (err?.message ?? "لديك منشأة مسجلة بالفعل")
      : "تعذّر إنشاء المنشأة — يرجى المحاولة مرة أخرى";
    res.status(status).json({ error: message });
  }
});

// ── GET /organizations/my — معلومات المنشأة ──────────────────────────────────
router.get("/organizations/my", requireAuth, async (req, res): Promise<void> => {
  const userId = req.userId!;

  // مالك؟
  const ownedOrg = await getOrgForOwner(userId);
  if (ownedOrg) {
    const sub = await getActiveSub(userId);
    const memberCount = await db
      .select({ cnt: sql<number>`COUNT(*)::int` })
      .from(orgMembersTable)
      .where(and(eq(orgMembersTable.orgId, ownedOrg.id), eq(orgMembersTable.status, "active")));
    res.json({
      role: "owner",
      org: ownedOrg,
      memberCount: memberCount[0]?.cnt ?? 0,
      subscription: sub
        ? {
            consultationsAllowed: sub.pkg.consultationsAllowed,
            consultationsUsed: sub.sub.consultationsUsed,
            contractsAllowed: sub.pkg.contractsAllowed,
            contractsUsed: sub.sub.contractsUsed,
            endDate: sub.sub.endDate,
          }
        : null,
    });
    return;
  }

  // عضو؟
  const membership = await getOrgMembershipForUser(userId);
  if (membership) {
    const ownerSub = await getActiveSub(membership.org.ownerId);
    res.json({
      role: "member",
      org: membership.org,
      subscription: ownerSub
        ? {
            consultationsAllowed: ownerSub.pkg.consultationsAllowed,
            consultationsUsed: ownerSub.sub.consultationsUsed,
            contractsAllowed: ownerSub.pkg.contractsAllowed,
            contractsUsed: ownerSub.sub.contractsUsed,
            endDate: ownerSub.sub.endDate,
          }
        : null,
    });
    return;
  }

  res.status(404).json({ error: "لا توجد منشأة مرتبطة بحسابك" });
});

// ── POST /organizations/invite — دعوة موظف ───────────────────────────────────
router.post("/organizations/invite", requireAuth, async (req, res): Promise<void> => {
  const userId = req.userId!;
  const { email } = req.body as { email?: string };
  if (!email?.trim()) {
    res.status(400).json({ error: "البريد الإلكتروني مطلوب" });
    return;
  }
  const normalizedEmail = email.toLowerCase().trim();

  const org = await getOrgForOwner(userId);
  if (!org) {
    res.status(403).json({ error: "أنت لست مالك منشأة" });
    return;
  }

  // تحقق أن الاشتراك لا يزال نشطاً
  const sub = await getActiveSub(userId);
  if (!sub || sub.pkg.type !== "business") {
    res.status(403).json({ error: "اشتراك الأعمال غير نشط" });
    return;
  }

  // لا تدعو المالك لمنشأته
  const [ownerRow] = await db.select({ email: usersTable.email }).from(usersTable).where(eq(usersTable.id, userId));
  if (ownerRow?.email === normalizedEmail) {
    res.status(400).json({ error: "لا يمكنك دعوة نفسك" });
    return;
  }

  // هل هذا البريد مدعو مسبقاً أو عضو نشط؟
  const [existingMember] = await db
    .select()
    .from(orgMembersTable)
    .where(
      and(
        eq(orgMembersTable.orgId, org.id),
        eq(orgMembersTable.email, normalizedEmail),
        or(eq(orgMembersTable.status, "pending"), eq(orgMembersTable.status, "active")),
      ),
    );
  if (existingMember) {
    res.status(409).json({ error: "هذا البريد الإلكتروني مدعو أو عضو بالفعل" });
    return;
  }

  // هل هذا البريد لمستخدم مسجل؟
  const [targetUser] = await db.select({ id: usersTable.id }).from(usersTable).where(eq(usersTable.email, normalizedEmail));

  const token = randomUUID();
  const [member] = await db
    .insert(orgMembersTable)
    .values({
      orgId: org.id,
      userId: targetUser?.id ?? null,
      email: normalizedEmail,
      status: "pending",
      inviteToken: token,
    })
    .returning();

  // إرسال بريد الدعوة — يُهرَّب اسم المنشأة لمنع حقن HTML
  const safeOrgName = escapeHtml(org.name);
  const joinUrl = `https://rabablegal.com/join-org?token=${token}`;
  await sendEmail({
    to: normalizedEmail,
    subject: `دعوة للانضمام إلى منشأة ${safeOrgName} على منصة RABAB LEGAL`,
    html: `
<!DOCTYPE html>
<html dir="rtl" lang="ar">
<head><meta charset="UTF-8"/><title>دعوة إلى منشأة</title></head>
<body style="font-family:Arial,sans-serif;background:#f4f6f9;padding:32px;direction:rtl">
  <div style="max-width:560px;margin:0 auto;background:#fff;border-radius:12px;padding:32px;box-shadow:0 2px 8px rgba(0,0,0,.08)">
    <h2 style="color:#1a3a6e;margin-top:0">دعوة للانضمام إلى منشأة ${safeOrgName}</h2>
    <p>تمت دعوتك للانضمام إلى فريق <strong>${safeOrgName}</strong> على منصة RABAB LEGAL AI للخدمات القانونية الذكية.</p>
    <p>بعد الانضمام، ستتمكن من استخدام خدمات المنصة ضمن حصة فريق العمل المشتركة.</p>
    <div style="text-align:center;margin:32px 0">
      <a href="${joinUrl}"
         style="background:#1a3a6e;color:#fff;text-decoration:none;padding:14px 32px;border-radius:8px;font-size:16px;font-weight:bold;display:inline-block">
        قبول الدعوة
      </a>
    </div>
    <p style="color:#888;font-size:12px">هذا الرابط صالح للاستخدام مرة واحدة فقط. إذا لم تتوقع هذه الدعوة يمكنك تجاهل هذا البريد.</p>
  </div>
</body>
</html>`,
  });

  logger.info({ orgId: org.id, email: normalizedEmail, memberId: member.id }, "📧 تم إرسال دعوة عضوية");
  res.status(201).json({ success: true, memberId: member.id, email: normalizedEmail });
});

// ── GET /organizations/members — قائمة الأعضاء مع الاستهلاك ──────────────────
router.get("/organizations/members", requireAuth, async (req, res): Promise<void> => {
  const userId = req.userId!;

  const org = await getOrgForOwner(userId);
  if (!org) {
    res.status(403).json({ error: "غير مصرح" });
    return;
  }

  const members = await db
    .select({
      member: orgMembersTable,
      user: {
        name: usersTable.name,
        email: usersTable.email,
      },
    })
    .from(orgMembersTable)
    .leftJoin(usersTable, eq(orgMembersTable.userId, usersTable.id))
    .where(eq(orgMembersTable.orgId, org.id))
    .orderBy(desc(orgMembersTable.invitedAt));

  // احسب الاستهلاك لكل عضو نشط من usage_log
  const activeIds = members.filter(m => m.member.status === "active" && m.member.userId).map(m => m.member.userId!);

  // حضر خريطة الاستهلاك الشهري الحالي لكل عضو
  const usageMap: Record<number, number> = {};
  if (activeIds.length > 0) {
    const monthStart = new Date();
    monthStart.setDate(1);
    monthStart.setHours(0, 0, 0, 0);

    for (const uid of activeIds) {
      const [row] = await db
        .select({ total: sql<number>`COALESCE(SUM(units_deducted), 0)::int` })
        .from(usageLogTable)
        .where(and(eq(usageLogTable.userId, uid), gte(usageLogTable.createdAt, monthStart)));
      usageMap[uid] = row?.total ?? 0;
    }
  }

  const result = members.map(m => ({
    id: m.member.id,
    userId: m.member.userId,
    email: m.member.email,
    name: m.user?.name ?? null,
    status: m.member.status,
    invitedAt: m.member.invitedAt,
    joinedAt: m.member.joinedAt,
    usageThisMonth: m.member.userId ? (usageMap[m.member.userId] ?? 0) : 0,
  }));

  res.json({ org, members: result });
});

// ── DELETE /organizations/members/:memberId — إزالة عضو ─────────────────────
router.delete("/organizations/members/:memberId", requireAuth, async (req, res): Promise<void> => {
  const userId = req.userId!;
  const memberId = parseInt(req.params.memberId, 10);

  const org = await getOrgForOwner(userId);
  if (!org) {
    res.status(403).json({ error: "غير مصرح" });
    return;
  }

  const [member] = await db
    .select()
    .from(orgMembersTable)
    .where(and(eq(orgMembersTable.id, memberId), eq(orgMembersTable.orgId, org.id)));

  if (!member) {
    res.status(404).json({ error: "العضو غير موجود" });
    return;
  }

  await db
    .update(orgMembersTable)
    .set({ status: "removed" })
    .where(eq(orgMembersTable.id, memberId));

  logger.info({ orgId: org.id, memberId, email: member.email }, "🗑️ تم إزالة عضو من المنشأة");
  res.json({ success: true });
});

// ── POST /organizations/join/:token — قبول الدعوة ────────────────────────────
router.post("/organizations/join/:token", requireAuth, async (req, res): Promise<void> => {
  const userId = req.userId!;
  const { token } = req.params;

  // تحقق من الرمز وبريد المستخدم خارج المعاملة (قراءة آمنة)
  const [invite] = await db
    .select({ member: orgMembersTable, org: organizationsTable })
    .from(orgMembersTable)
    .innerJoin(organizationsTable, eq(orgMembersTable.orgId, organizationsTable.id))
    .where(and(eq(orgMembersTable.inviteToken, token), eq(orgMembersTable.status, "pending")));

  if (!invite) {
    res.status(404).json({ error: "رابط الدعوة غير صالح أو انتهت صلاحيته" });
    return;
  }

  const [currentUser] = await db.select({ email: usersTable.email }).from(usersTable).where(eq(usersTable.id, userId));
  if (!currentUser || currentUser.email !== invite.member.email) {
    res.status(403).json({ error: "هذه الدعوة مخصصة لبريد إلكتروني آخر" });
    return;
  }

  try {
    const org = await db.transaction(async (tx) => {
      // قفل استشاري على مستوى المستخدم — يمنع التعارض بين طلبات الانضمام المتزامنة
      await tx.execute(sql`SELECT pg_advisory_xact_lock(${userId})`);

      // تأكد داخل المعاملة أن المستخدم ليس مالكاً ولا عضواً نشطاً في منشأة أخرى
      const [ownedOrg] = await tx.select({ id: organizationsTable.id })
        .from(organizationsTable).where(eq(organizationsTable.ownerId, userId));
      if (ownedOrg) throw Object.assign(
        new Error("أنت مالك منشأة — لا يمكنك الانضمام كعضو في منشأة أخرى"),
        { httpStatus: 409 },
      );

      const [existingActive] = await tx.select({ orgId: orgMembersTable.orgId })
        .from(orgMembersTable)
        .where(and(eq(orgMembersTable.userId, userId), eq(orgMembersTable.status, "active")));
      if (existingActive && existingActive.orgId !== invite.org.id) {
        throw Object.assign(new Error("أنت بالفعل عضو في منشأة أخرى"), { httpStatus: 409 });
      }

      // قبول الدعوة — يُزال inviteToken منعاً للإعادة
      await tx.update(orgMembersTable)
        .set({ status: "active", userId, joinedAt: new Date(), inviteToken: null })
        .where(and(eq(orgMembersTable.id, invite.member.id), eq(orgMembersTable.status, "pending")));

      return invite.org;
    });

    logger.info({ orgId: org.id, userId, email: invite.member.email }, "✅ انضم عضو جديد إلى المنشأة");
    res.json({ success: true, org });
  } catch (err: any) {
    const status = err?.httpStatus ?? (err?.code === "23505" ? 409 : 500);
    const message = status === 409
      ? (err?.message ?? "تعارض في البيانات — يرجى المحاولة مرة أخرى")
      : "تعذّر قبول الدعوة — يرجى المحاولة مرة أخرى";
    res.status(status).json({ error: message });
  }
});

// ── GET /organizations/join/:token — التحقق من صلاحية رابط الدعوة ─────────────
router.get("/organizations/join/:token", async (req, res): Promise<void> => {
  const { token } = req.params;
  const [member] = await db
    .select({ member: orgMembersTable, org: organizationsTable })
    .from(orgMembersTable)
    .innerJoin(organizationsTable, eq(orgMembersTable.orgId, organizationsTable.id))
    .where(
      and(
        eq(orgMembersTable.inviteToken, token),
        eq(orgMembersTable.status, "pending"),
      ),
    );

  if (!member) {
    res.status(404).json({ error: "رابط الدعوة غير صالح أو انتهت صلاحيته" });
    return;
  }

  res.json({ email: member.member.email, orgName: member.org.name });
});

export default router;
