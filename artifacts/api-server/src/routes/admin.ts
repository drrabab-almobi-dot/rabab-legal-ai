import { Router, type IRouter } from "express";
import { db, usersTable, subscriptionsTable, paymentsTable, consultationsTable, consultationMessagesTable, couponsTable, packagesTable, platformSettingsTable, subscriptionRemindersTable } from "@workspace/db";
import { requireAdmin } from "../middlewares/auth";
import { GetAdminUserParams, UpdateAdminUserParams, UpdateAdminUserBody, UpdateAdminCouponParams, UpdateAdminCouponBody, DeleteAdminCouponParams, CreateAdminCouponBody } from "@workspace/api-zod";
import { eq, count, sum, and, gte, asc, inArray, isNotNull, sql, desc, type SQL } from "drizzle-orm";
import { sendEmail } from "../lib/email";
import { sendWhatsAppGated } from "../lib/whatsapp-gated";
import { logger } from "../lib/logger";
import { getEmailConfig, invalidateEmailConfigCache } from "../lib/email-config";
import { sendTestExpiryPush, sendSubscriptionExpiryReminders } from "../lib/push-notifications";

const router: IRouter = Router();

// ─── Stats ──────────────────────────────────────────────────────────────────

router.get("/admin/stats", requireAdmin, async (_req, res): Promise<void> => {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const firstOfMonth = new Date(today.getFullYear(), today.getMonth(), 1);

  const [totalUsersResult] = await db.select({ count: count() }).from(usersTable);
  const [activeSubsResult] = await db.select({ count: count() }).from(subscriptionsTable)
    .where(eq(subscriptionsTable.status, "active"));
  const [revenueResult] = await db.select({ total: sum(paymentsTable.totalAmount) }).from(paymentsTable)
    .where(eq(paymentsTable.status, "paid"));
  const [monthlyRevenueResult] = await db.select({ total: sum(paymentsTable.totalAmount) }).from(paymentsTable)
    .where(and(eq(paymentsTable.status, "paid"), gte(paymentsTable.createdAt, firstOfMonth)));
  const [pendingPaymentsResult] = await db.select({ count: count() }).from(paymentsTable)
    .where(eq(paymentsTable.status, "pending"));
  const [totalConsultationsResult] = await db.select({ count: count() }).from(consultationsTable);
  const [consultationsTodayResult] = await db.select({ count: count() }).from(consultationsTable)
    .where(gte(consultationsTable.createdAt, today));
  const [newUsersMontlyResult] = await db.select({ count: count() }).from(usersTable)
    .where(gte(usersTable.createdAt, firstOfMonth));

  res.json({
    totalUsers: totalUsersResult.count,
    activeSubscriptions: activeSubsResult.count,
    totalRevenue: parseFloat((revenueResult.total ?? "0") as string),
    revenueThisMonth: parseFloat((monthlyRevenueResult.total ?? "0") as string),
    consultationsToday: consultationsTodayResult.count,
    pendingPayments: pendingPaymentsResult.count,
    totalConsultations: totalConsultationsResult.count,
    newUsersThisMonth: newUsersMontlyResult.count,
  });
});

// ─── Users ───────────────────────────────────────────────────────────────────

router.get("/admin/users", requireAdmin, async (_req, res): Promise<void> => {
  const users = await db
    .select({
      id: usersTable.id,
      name: usersTable.name,
      email: usersTable.email,
      phone: usersTable.phone,
      role: usersTable.role,
      freeConsultationsUsed: usersTable.freeConsultationsUsed,
      createdAt: usersTable.createdAt,
    })
    .from(usersTable);

  res.json(users.map((u) => ({
    id: u.id, name: u.name, email: u.email, phone: u.phone, role: u.role,
    freeConsultationsUsed: u.freeConsultationsUsed, createdAt: u.createdAt,
  })));
});

router.get("/admin/users/:id", requireAdmin, async (req, res): Promise<void> => {
  const params = GetAdminUserParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  const [u] = await db.select().from(usersTable).where(eq(usersTable.id, params.data.id));
  if (!u) {
    res.status(404).json({ error: "المستخدم غير موجود" });
    return;
  }
  res.json({ id: u.id, name: u.name, email: u.email, phone: u.phone, role: u.role, freeConsultationsUsed: u.freeConsultationsUsed, createdAt: u.createdAt });
});

router.patch("/admin/users/:id", requireAdmin, async (req, res): Promise<void> => {
  const params = UpdateAdminUserParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  const parsed = UpdateAdminUserBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const updates: Omit<Partial<typeof usersTable.$inferInsert>, "tokenVersion"> & {
    tokenVersion?: number | SQL;
  } = {};
  if (parsed.data.name !== undefined) updates.name = parsed.data.name;
  if (parsed.data.role !== undefined) updates.role = parsed.data.role;
  if (parsed.data.isActive !== undefined) updates.isActive = parsed.data.isActive;

  // When re-enabling a previously disabled account (false → true), bump tokenVersion so
  // that any JWT issued before the disable cannot silently become valid again.
  // We must read the current state first to distinguish a disable→enable transition
  // from a no-op enable on an already-active account (which must NOT invalidate sessions).
  if (parsed.data.isActive === true) {
    const [current] = await db
      .select({ isActive: usersTable.isActive })
      .from(usersTable)
      .where(eq(usersTable.id, params.data.id));
    if (current && current.isActive === false) {
      updates.tokenVersion = sql`${usersTable.tokenVersion} + 1`;
    }
  }

  const [u] = await db.update(usersTable).set(updates).where(eq(usersTable.id, params.data.id)).returning();
  if (!u) {
    res.status(404).json({ error: "المستخدم غير موجود" });
    return;
  }
  res.json({ id: u.id, name: u.name, email: u.email, phone: u.phone, role: u.role, freeConsultationsUsed: u.freeConsultationsUsed, createdAt: u.createdAt });
});

// ─── Coupons ─────────────────────────────────────────────────────────────────

router.get("/admin/coupons", requireAdmin, async (_req, res): Promise<void> => {
  const coupons = await db.select().from(couponsTable).orderBy(asc(couponsTable.createdAt));
  res.json(coupons.map((c) => ({
    id: c.id, code: c.code, descriptionAr: c.descriptionAr,
    discountType: c.discountType, discountValue: parseFloat(c.discountValue as string),
    maxUses: c.maxUses, usageCount: c.usageCount, isActive: c.isActive,
    expiresAt: c.expiresAt, createdAt: c.createdAt,
  })));
});

router.post("/admin/coupons", requireAdmin, async (req, res): Promise<void> => {
  const parsed = CreateAdminCouponBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const [c] = await db.insert(couponsTable).values({
    code: parsed.data.code.toUpperCase(),
    descriptionAr: parsed.data.descriptionAr,
    discountType: parsed.data.discountType,
    discountValue: String(parsed.data.discountValue),
    maxUses: parsed.data.maxUses,
    expiresAt: parsed.data.expiresAt,
  }).returning();
  res.json({
    id: c.id, code: c.code, descriptionAr: c.descriptionAr,
    discountType: c.discountType, discountValue: parseFloat(c.discountValue as string),
    maxUses: c.maxUses, usageCount: c.usageCount, isActive: c.isActive,
    expiresAt: c.expiresAt, createdAt: c.createdAt,
  });
});

router.patch("/admin/coupons/:id", requireAdmin, async (req, res): Promise<void> => {
  const params = UpdateAdminCouponParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  const parsed = UpdateAdminCouponBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const updates: Partial<typeof couponsTable.$inferInsert> = {};
  if (parsed.data.descriptionAr !== undefined) updates.descriptionAr = parsed.data.descriptionAr;
  if (parsed.data.discountValue !== undefined) updates.discountValue = String(parsed.data.discountValue);
  if (parsed.data.maxUses !== undefined) updates.maxUses = parsed.data.maxUses;
  if (parsed.data.isActive !== undefined) updates.isActive = parsed.data.isActive;
  if (parsed.data.expiresAt !== undefined) updates.expiresAt = new Date(parsed.data.expiresAt);

  const [c] = await db.update(couponsTable).set(updates).where(eq(couponsTable.id, params.data.id)).returning();
  if (!c) {
    res.status(404).json({ error: "الكوبون غير موجود" });
    return;
  }
  res.json({
    id: c.id, code: c.code, descriptionAr: c.descriptionAr,
    discountType: c.discountType, discountValue: parseFloat(c.discountValue as string),
    maxUses: c.maxUses, usageCount: c.usageCount, isActive: c.isActive,
    expiresAt: c.expiresAt, createdAt: c.createdAt,
  });
});

router.delete("/admin/coupons/:id", requireAdmin, async (req, res): Promise<void> => {
  const params = DeleteAdminCouponParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  await db.delete(couponsTable).where(eq(couponsTable.id, params.data.id));
  res.json({ success: true });
});

// ─── Payments ────────────────────────────────────────────────────────────────

router.get("/admin/payments", requireAdmin, async (_req, res): Promise<void> => {
  const payments = await db.select().from(paymentsTable).orderBy(asc(paymentsTable.createdAt));
  const pkgIds = [...new Set(payments.map((p) => p.packageId))];
  const pkgs = pkgIds.length > 0 ? await db.select().from(packagesTable) : [];
  const pkgMap = new Map(pkgs.map((p) => [p.id, p]));
  res.json(payments.map((p) => {
    const pkg = pkgMap.get(p.packageId);
    return {
      id: p.id, userId: p.userId, packageId: p.packageId,
      package: pkg ? {
        id: pkg.id, nameAr: pkg.nameAr, nameEn: pkg.nameEn, descriptionAr: pkg.descriptionAr,
        price: parseFloat(pkg.price as string), questionsAllowed: pkg.questionsAllowed,
        type: pkg.type, isActive: pkg.isActive, isPopular: pkg.isPopular,
        features: pkg.features ?? [], sortOrder: pkg.sortOrder,
      } : undefined,
      amount: parseFloat(p.amount as string), vatAmount: parseFloat(p.vatAmount as string),
      totalAmount: parseFloat(p.totalAmount as string), discountAmount: parseFloat(p.discountAmount as string),
      couponCode: p.couponCode, status: p.status, gateway: p.gateway, gatewayRef: p.gatewayRef,
      billingName: p.billingName, billingEmail: p.billingEmail, billingPhone: p.billingPhone,
      createdAt: p.createdAt,
    };
  }));
});

// ─── Consultations ───────────────────────────────────────────────────────────

router.get("/admin/consultations", requireAdmin, async (_req, res): Promise<void> => {
  const consultations = await db.select().from(consultationsTable).orderBy(asc(consultationsTable.createdAt));
  res.json(consultations.map((c) => ({
    id: c.id, userId: c.userId, subscriptionId: c.subscriptionId,
    title: c.title, areaAr: c.areaAr, status: c.status, chatgptUrl: c.chatgptUrl, createdAt: c.createdAt,
  })));
});

router.get("/admin/consultations/:id/messages", requireAdmin, async (req, res): Promise<void> => {
  const id = parseInt(req.params.id as string, 10);
  if (isNaN(id)) { res.status(400).json({ error: "معرّف غير صالح" }); return; }

  const messages = await db.select().from(consultationMessagesTable)
    .where(eq(consultationMessagesTable.consultationId, id))
    .orderBy(asc(consultationMessagesTable.createdAt));

  res.json(messages);
});

// ─── Broadcast Notifications ──────────────────────────────────────────────────

router.post("/admin/broadcast", requireAdmin, async (req, res): Promise<void> => {
  const { subject, message, channels, segment } = req.body as {
    subject: string;
    message: string;
    channels: string[];
    segment: "all" | "active" | "expired";
  };

  const validSegments = ["all", "active", "expired"];
  if (!subject || !message || !Array.isArray(channels) || channels.length === 0 || !validSegments.includes(segment)) {
    res.status(400).json({ error: "بيانات غير مكتملة: subject, message, channels[], segment مطلوبة" });
    return;
  }

  const sendEmail_ = channels.includes("email");
  const sendWhatsApp_ = channels.includes("whatsapp");

  let targetUserIds: number[];
  if (segment === "all") {
    const rows = await db.select({ id: usersTable.id }).from(usersTable);
    targetUserIds = rows.map(r => r.id);
  } else {
    const rows = await db
      .select({ userId: subscriptionsTable.userId })
      .from(subscriptionsTable)
      .where(eq(subscriptionsTable.status, segment));
    targetUserIds = rows.map(r => r.userId);
  }

  if (targetUserIds.length === 0) {
    res.json({ sent: 0, failed: 0, message: "لا يوجد مستخدمون في هذه الفئة" });
    return;
  }

  const users = await db
    .select({ id: usersTable.id, name: usersTable.name, email: usersTable.email, phone: usersTable.phone })
    .from(usersTable)
    .where(inArray(usersTable.id, targetUserIds));

  const htmlBody = `<!DOCTYPE html>
<html dir="rtl" lang="ar">
<head><meta charset="UTF-8" /><style>
body{font-family:'Segoe UI',Tahoma,Arial,sans-serif;background:#f5f7fa;margin:0;padding:0;direction:rtl}
.container{max-width:560px;margin:40px auto;background:#fff;border-radius:12px;overflow:hidden;box-shadow:0 2px 12px rgba(0,0,0,.08)}
.header{background:linear-gradient(135deg,#1a3c6e 0%,#2563eb 100%);padding:28px 40px;text-align:center}
.header h1{color:#fff;margin:0;font-size:20px;font-weight:700}
.body{padding:32px 40px;color:#374151;font-size:15px;line-height:1.8;white-space:pre-line}
.footer{background:#f9fafb;border-top:1px solid #e5e7eb;padding:16px 40px;text-align:center;color:#9ca3af;font-size:12px}
</style></head>
<body><div class="container">
<div class="header"><h1>RABAB LEGAL AI | رباب محاميتك الرقمية</h1></div>
<div class="body">${message.replace(/</g, "&lt;").replace(/>/g, "&gt;")}</div>
<div class="footer"><p>رسالة من فريق منصة رباب القانونية.</p></div>
</div></body></html>`;

  const BATCH = 10;
  let sent = 0;
  let failed = 0;

  for (let i = 0; i < users.length; i += BATCH) {
    const batch = users.slice(i, i + BATCH);
    await Promise.all(batch.map(async (u) => {
      try {
        const results = await Promise.all([
          sendEmail_ ? sendEmail({ to: u.email, subject, html: htmlBody, text: message }) : Promise.resolve(true),
          sendWhatsApp_
            ? (u.phone ? sendWhatsAppGated(u.phone, message, u.id) : Promise.resolve(false))
            : Promise.resolve(true),
        ]);
        if (results.every(Boolean)) sent++;
        else failed++;
      } catch (err) {
        failed++;
        logger.error({ err, userId: u.id }, "broadcast: فشل إرسال الإشعار");
      }
    }));
  }

  res.json({ sent, failed, total: users.length });
});

// ─── Email Config ─────────────────────────────────────────────────────────────

router.get("/admin/email-config", requireAdmin, async (_req, res): Promise<void> => {
  const cfg = await getEmailConfig();
  const maskedApiKey = cfg.apiKey ? "••••••••••••••••" + cfg.apiKey.slice(-4) : null;
  const cfgSource = cfg.provider === "smtp" ? "env" : (cfg.apiKey ? "db" : "default");
  res.json({ apiKey: maskedApiKey, fromAddress: cfg.fromAddress ?? null, source: cfgSource, provider: cfg.provider });
});

router.post("/admin/email-config", requireAdmin, async (req, res): Promise<void> => {
  const { apiKey, fromAddress } = req.body as { apiKey?: string; fromAddress?: string };
  if (!fromAddress?.trim()) { res.status(400).json({ error: "fromAddress مطلوب" }); return; }

  const existing = await getEmailConfig();
  const newValue = {
    apiKey: apiKey?.trim() || existing.apiKey || null,
    fromAddress: fromAddress.trim(),
  };
  const source = process.env.SMTP_HOST && process.env.SMTP_USER && process.env.SMTP_PASS
    ? "env"
    : (newValue.apiKey ? "db" : "default");

  await db.insert(platformSettingsTable)
    .values({ key: "email_config", value: newValue })
    .onConflictDoUpdate({ target: platformSettingsTable.key, set: { value: newValue } });

  invalidateEmailConfigCache();
  res.json({ ok: true, source });
});

router.post("/admin/email-config/test", requireAdmin, async (req, res): Promise<void> => {
  const { to } = req.body as { to?: string };
  if (!to?.trim()) { res.status(400).json({ error: "to مطلوب" }); return; }

  const ok = await sendEmail({
    to: to.trim(),
    subject: "✅ اختبار إعدادات البريد — RABAB LEGAL AI",
    html: `<!DOCTYPE html><html dir="rtl" lang="ar"><head><meta charset="UTF-8"/></head>
<body style="font-family:'Segoe UI',Tahoma,Arial,sans-serif;direction:rtl;padding:32px;color:#333">
  <h2 style="color:#2563eb">تم إعداد البريد بنجاح ✅</h2>
  <p>مرحباً، هذه رسالة اختبار تلقائية من منصة RABAB LEGAL AI.</p>
  <p>إذا استلمتِ هذه الرسالة، فإن إعدادات Resend API تعمل بشكل صحيح.</p>
  <hr style="border:none;border-top:1px solid #e5e7eb;margin:24px 0"/>
  <p style="font-size:12px;color:#9ca3af">RABAB LEGAL AI — رباب محاميتك الرقمية</p>
</body></html>`,
    text: "تم إعداد البريد بنجاح. هذه رسالة اختبار تلقائية من منصة RABAB LEGAL AI.",
  });

  res.json({ ok });
});

// ── Email settings UI aliases ──────────────────────────────────────────────────
// The web admin screen uses these RESTful paths. Keep the older email-config
// endpoints above for backwards compatibility with existing admin clients.
router.get("/admin/email-settings", requireAdmin, async (_req, res): Promise<void> => {
  const cfg = await getEmailConfig();
  const configured = cfg.provider !== "unconfigured";
  const source = cfg.provider === "smtp" ? "env" : (cfg.apiKey ? "db" : "default");

  res.json({
    configured,
    maskedApiKey: cfg.provider === "smtp"
      ? "Gmail SMTP"
      : (cfg.apiKey ? "••••••••••••••••" + cfg.apiKey.slice(-4) : null),
    fromAddress: cfg.fromAddress,
    source,
    provider: cfg.provider,
  });
});

router.put("/admin/email-settings", requireAdmin, async (req, res): Promise<void> => {
  const { apiKey, fromAddress } = req.body as { apiKey?: string; fromAddress?: string };
  const normalizedFrom = fromAddress?.trim();
  if (!normalizedFrom || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizedFrom)) {
    res.status(400).json({ error: "عنوان المُرسِل غير صالح" });
    return;
  }

  const [stored] = await db
    .select({ value: platformSettingsTable.value })
    .from(platformSettingsTable)
    .where(eq(platformSettingsTable.key, "email_config"));
  const previous = (stored?.value as { apiKey?: string } | undefined) ?? {};
  const value = {
    apiKey: apiKey?.trim() || previous.apiKey || null,
    fromAddress: normalizedFrom,
  };

  await db.insert(platformSettingsTable)
    .values({ key: "email_config", value })
    .onConflictDoUpdate({
      target: platformSettingsTable.key,
      set: { value, updatedAt: new Date() },
    });
  invalidateEmailConfigCache();

  const cfg = await getEmailConfig();
  res.json({
    ok: true,
    settings: {
      configured: cfg.provider !== "unconfigured",
      maskedApiKey: cfg.provider === "smtp"
        ? "Gmail SMTP"
        : (cfg.apiKey ? "••••••••••••••••" + cfg.apiKey.slice(-4) : null),
      fromAddress: cfg.fromAddress,
      source: cfg.provider === "smtp" ? "env" : (cfg.apiKey ? "db" : "default"),
      provider: cfg.provider,
    },
  });
});

router.post("/admin/email-settings/test", requireAdmin, async (req, res): Promise<void> => {
  const { to } = req.body as { to?: string };
  const recipient = to?.trim();
  if (!recipient || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(recipient)) {
    res.status(400).json({ success: false, message: "عنوان البريد المستلم غير صالح" });
    return;
  }

  const ok = await sendEmail({
    to: recipient,
    subject: "اختبار Gmail — RABAB LEGAL AI",
    html: `<!DOCTYPE html><html dir="rtl" lang="ar"><head><meta charset="UTF-8"/></head>
<body style="font-family:'Segoe UI',Tahoma,Arial,sans-serif;direction:rtl;padding:32px;color:#202938">
  <h2 style="color:#0f8ca8">تم إعداد بريد RABAB LEGAL AI بنجاح</h2>
  <p>هذه رسالة اختبار من <strong>info@rabablegal.com</strong>.</p>
  <p>وصول هذه الرسالة يعني أن البريد جاهز لإرسال الفواتير والإشعارات إلى المستفيدين.</p>
</body></html>`,
    text: "تم إعداد بريد RABAB LEGAL AI بنجاح. البريد جاهز لإرسال الفواتير والإشعارات إلى المستفيدين.",
  });

  if (!ok) {
    res.status(502).json({
      success: false,
      message: "فشل اتصال Gmail. تحققي من بريد Google Workspace وكلمة مرور التطبيقات في الأسرار.",
    });
    return;
  }

  res.json({ success: true, message: "تم إرسال بريد الاختبار بنجاح من info@rabablegal.com." });
});

// ── POST /admin/test-whatsapp ─────────────────────────────────────────────────
// Sends a test WhatsApp message to verify Twilio credentials are working.
// Body: { phone: "+9665xxxxxxxx" }
router.post("/admin/test-whatsapp", requireAdmin, async (req, res): Promise<void> => {
  const { phone } = req.body as { phone?: string };

  if (!phone) {
    res.status(400).json({ ok: false, error: "phone مطلوب" });
    return;
  }

  const { sendWhatsApp } = await import("../lib/whatsapp");
  const ok = await sendWhatsApp(
    phone,
    "✅ اختبار واتساب من منصة رباب\n\nوصلتك هذه الرسالة بنجاح — Twilio مُفعَّل وجاهز.",
  );

  if (!ok) {
    res.status(502).json({
      ok: false,
      error:
        "فشل الإرسال — تحقق من صحة TWILIO_ACCOUNT_SID و TWILIO_AUTH_TOKEN و TWILIO_WHATSAPP_FROM في الـ Secrets، وأن الرقم مسجَّل في WhatsApp Sandbox.",
    });
    return;
  }

  res.json({ ok: true, message: `تم إرسال رسالة الاختبار إلى ${phone}` });
});

// ── POST /admin/backfill-live-search ─────────────────────────────────────────
// One-time (idempotent) backfill: marks assistant messages as used_live_search
// = true when their persisted `sources` JSONB contains a web-type source.
// Safe to call multiple times — only untouched rows are updated.
router.post("/admin/backfill-live-search", requireAdmin, async (_req, res): Promise<void> => {
  try {
    // Count qualifying rows before touching anything
    const [{ candidateCount }] = await db
      .select({ candidateCount: sql<number>`count(*)::int` })
      .from(consultationMessagesTable)
      .where(
        and(
          eq(consultationMessagesTable.role, "assistant"),
          eq(consultationMessagesTable.usedLiveSearch, false),
          isNotNull(consultationMessagesTable.sources),
          sql`jsonb_typeof(${consultationMessagesTable.sources}) = 'array'`,
          sql`EXISTS (
                SELECT 1
                FROM jsonb_array_elements(${consultationMessagesTable.sources}) AS s
                WHERE s->>'sourceType' = 'web'
              )`,
        ),
      );

    if (candidateCount > 0) {
      await db
        .update(consultationMessagesTable)
        .set({ usedLiveSearch: true })
        .where(
          and(
            eq(consultationMessagesTable.role, "assistant"),
            eq(consultationMessagesTable.usedLiveSearch, false),
            isNotNull(consultationMessagesTable.sources),
            sql`jsonb_typeof(${consultationMessagesTable.sources}) = 'array'`,
            sql`EXISTS (
                  SELECT 1
                  FROM jsonb_array_elements(${consultationMessagesTable.sources}) AS s
                  WHERE s->>'sourceType' = 'web'
                )`,
          ),
        );
    }

    // Count messages that cannot be recovered (sources column absent — pre-date
    // the verification layer; no reliable signal to distinguish Tavily vs KB-only)
    const [{ unknownCount }] = await db
      .select({ unknownCount: sql<number>`count(*)::int` })
      .from(consultationMessagesTable)
      .where(
        and(
          eq(consultationMessagesTable.role, "assistant"),
          eq(consultationMessagesTable.usedLiveSearch, false),
          sql`${consultationMessagesTable.sources} IS NULL`,
        ),
      );

    logger.info(
      { updated: candidateCount, unrecoverable: unknownCount },
      "backfill-live-search completed",
    );

    res.json({
      ok: true,
      updated: candidateCount,
      unrecoverable: unknownCount,
      note:
        unknownCount > 0
          ? `${unknownCount} assistant message(s) have no saved sources (pre-date the ` +
            `verification layer) and cannot be recovered — left as-is to avoid false positives.`
          : "All qualifying historical messages have been backfilled.",
    });
  } catch (err: any) {
    logger.error({ err: err?.message }, "backfill-live-search failed");
    res.status(500).json({ ok: false, error: err?.message ?? "Unknown error" });
  }
});

// ── GET /admin/reminder-stats ─────────────────────────────────────────────────
// Returns subscription-reminder statistics for the admin dashboard.
router.get("/admin/reminder-stats", requireAdmin, async (_req, res): Promise<void> => {
  try {
    const now = new Date();
    const firstOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);

    // Total reminders sent this month
    const [{ sentThisMonth }] = await db
      .select({ sentThisMonth: sql<number>`count(*)::int` })
      .from(subscriptionRemindersTable)
      .where(gte(subscriptionRemindersTable.sentAt, firstOfMonth));

    // Total reminders all-time
    const [{ totalSent }] = await db
      .select({ totalSent: sql<number>`count(*)::int` })
      .from(subscriptionRemindersTable);

    // Breakdown by reminder type
    const byType = await db
      .select({
        reminderType: subscriptionRemindersTable.reminderType,
        cnt: sql<number>`count(*)::int`,
      })
      .from(subscriptionRemindersTable)
      .groupBy(subscriptionRemindersTable.reminderType);

    // Conversion rate: "after_expiry" reminders where the user later renewed.
    // Renewals create a NEW subscription row (old one stays expired), so we
    // look for any active subscription belonging to the same user that was
    // created AFTER the reminder was sent — not the original expired row.
    const [{ afterExpirySent }] = await db
      .select({ afterExpirySent: sql<number>`count(*)::int` })
      .from(subscriptionRemindersTable)
      .where(eq(subscriptionRemindersTable.reminderType, "after_expiry"));

    // Count distinct after_expiry reminders where the user later re-subscribed
    // (user_id resolved via the expired subscription, new active sub created after sentAt)
    const [{ converted }] = await db
      .select({ converted: sql<number>`count(*)::int` })
      .from(subscriptionRemindersTable)
      .innerJoin(subscriptionsTable, eq(subscriptionRemindersTable.subscriptionId, subscriptionsTable.id))
      .where(
        and(
          eq(subscriptionRemindersTable.reminderType, "after_expiry"),
          sql`EXISTS (
            SELECT 1 FROM subscriptions renewed
            WHERE renewed.user_id = ${subscriptionsTable.userId}
              AND renewed.status = 'active'
              AND renewed.created_at > ${subscriptionRemindersTable.sentAt}
          )`,
        ),
      );

    const conversionRate = afterExpirySent > 0
      ? Math.round((converted / afterExpirySent) * 100)
      : 0;

    // Last 20 reminders with user details
    const recent = await db
      .select({
        id: subscriptionRemindersTable.id,
        reminderType: subscriptionRemindersTable.reminderType,
        sentAt: subscriptionRemindersTable.sentAt,
        subscriptionId: subscriptionRemindersTable.subscriptionId,
        userName: usersTable.name,
        userEmail: usersTable.email,
        userPhone: usersTable.phone,
        subStatus: subscriptionsTable.status,
        subEndDate: subscriptionsTable.endDate,
      })
      .from(subscriptionRemindersTable)
      .innerJoin(subscriptionsTable, eq(subscriptionRemindersTable.subscriptionId, subscriptionsTable.id))
      .innerJoin(usersTable, eq(subscriptionsTable.userId, usersTable.id))
      .orderBy(desc(subscriptionRemindersTable.sentAt))
      .limit(20);

    res.json({
      sentThisMonth,
      totalSent,
      afterExpirySent,
      converted,
      conversionRate,
      byType,
      recent: recent.map(r => ({
        id: r.id,
        reminderType: r.reminderType,
        sentAt: r.sentAt,
        subscriptionId: r.subscriptionId,
        userName: r.userName,
        userEmail: r.userEmail,
        hasPhone: !!r.userPhone,
        subStatus: r.subStatus,
        subEndDate: r.subEndDate,
      })),
    });
  } catch (err: any) {
    logger.error({ err: err?.message }, "reminder-stats failed");
    res.status(500).json({ error: err?.message ?? "خطأ في الخادم" });
  }
});

export default router;
