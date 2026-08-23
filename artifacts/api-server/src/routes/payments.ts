import { Router, type IRouter } from "express";
import { db, paymentsTable, invoicesTable, subscriptionsTable, packagesTable, couponsTable, usersTable } from "@workspace/db";
import { eq, and, inArray, desc } from "drizzle-orm";
import { requireAuth, requireAdmin } from "../middlewares/auth";
import { logAction } from "./audit-log";
import {
  InitiatePaymentBody,
  VerifyPaymentBody,
} from "@workspace/api-zod";
import { sql } from "drizzle-orm";
import { sendInvoiceEmail } from "../lib/mailer";
import PDFDocument from "pdfkit";

const router: IRouter = Router();

const VAT_RATE = 0.15;

// ── Moyasar helpers ───────────────────────────────────────────────────────────
function moyasarAuthHeader(): string {
  const key = process.env.MOYASAR_SECRET_KEY ?? "";
  return "Basic " + Buffer.from(key + ":").toString("base64");
}

async function getMoyasarPayment(moyasarId: string): Promise<{ status: string; amount: number; currency: string } | null> {
  try {
    const res = await fetch(`https://api.moyasar.com/v1/payments/${moyasarId}`, {
      headers: { Authorization: moyasarAuthHeader() },
    });
    if (!res.ok) return null;
    return await res.json();
  } catch {
    return null;
  }
}

function formatPayment(p: typeof paymentsTable.$inferSelect, pkg?: typeof packagesTable.$inferSelect) {
  return {
    id: p.id,
    userId: p.userId,
    packageId: p.packageId,
    package: pkg ? {
      id: pkg.id, nameAr: pkg.nameAr, nameEn: pkg.nameEn, descriptionAr: pkg.descriptionAr,
      price: parseFloat(pkg.price as string), questionsAllowed: pkg.questionsAllowed,
      type: pkg.type, isActive: pkg.isActive, isPopular: pkg.isPopular,
      features: pkg.features ?? [], sortOrder: pkg.sortOrder,
    } : undefined,
    amount: parseFloat(p.amount as string),
    vatAmount: parseFloat(p.vatAmount as string),
    totalAmount: parseFloat(p.totalAmount as string),
    discountAmount: parseFloat(p.discountAmount as string),
    couponCode: p.couponCode,
    status: p.status,
    gateway: p.gateway,
    gatewayRef: p.gatewayRef,
    billingName: p.billingName,
    billingEmail: p.billingEmail,
    billingPhone: p.billingPhone,
    createdAt: p.createdAt,
  };
}

function formatInvoice(inv: typeof invoicesTable.$inferSelect, payment?: ReturnType<typeof formatPayment>) {
  return {
    id: inv.id,
    invoiceNumber: inv.invoiceNumber,
    userId: inv.userId,
    paymentId: inv.paymentId,
    payment,
    amount: parseFloat(inv.amount as string),
    vatAmount: parseFloat(inv.vatAmount as string),
    totalAmount: parseFloat(inv.totalAmount as string),
    discountAmount: parseFloat(inv.discountAmount as string),
    billingName: inv.billingName,
    billingEmail: inv.billingEmail,
    status: inv.status,
    packageNameAr: inv.packageNameAr,
    createdAt: inv.createdAt,
  };
}

router.post("/payments/initiate", requireAuth, async (req, res): Promise<void> => {
  const parsed = InitiatePaymentBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const { packageId, couponCode, billingName, billingEmail, billingPhone, gateway } = parsed.data;

  // 1. Fetch package
  const [pkg] = await db.select().from(packagesTable)
    .where(and(eq(packagesTable.id, packageId), eq(packagesTable.isActive, true)));
  if (!pkg) {
    res.status(404).json({ error: "الباقة غير موجودة" });
    return;
  }

  const basePrice = parseFloat(pkg.price as string);
  let discountAmount = 0;
  let appliedCoupon: string | undefined;

  // 2. Apply coupon if provided
  if (couponCode) {
    const [coupon] = await db.select().from(couponsTable)
      .where(eq(couponsTable.code, couponCode.toUpperCase()));
    if (coupon && coupon.isActive && (!coupon.maxUses || coupon.usageCount < coupon.maxUses)) {
      if (!coupon.expiresAt || coupon.expiresAt > new Date()) {
        const val = parseFloat(coupon.discountValue as string);
        discountAmount = coupon.discountType === "percentage"
          ? (basePrice * val) / 100
          : Math.min(val, basePrice);
        appliedCoupon = coupon.code;
      }
    }
  }

  // 3. Calculate amounts (VAT 15%)
  const discountedPrice = Math.max(0, basePrice - discountAmount);
  const vatAmount       = parseFloat((discountedPrice * VAT_RATE).toFixed(2));
  const totalAmount     = parseFloat((discountedPrice + vatAmount).toFixed(2));

  // 4. Insert pending payment record
  const [payment] = await db.insert(paymentsTable).values({
    userId:        req.userId!,
    packageId:     pkg.id,
    amount:        String(basePrice),
    vatAmount:     String(vatAmount),
    totalAmount:   String(totalAmount),
    discountAmount: String(parseFloat(discountAmount.toFixed(2))),
    couponCode:    appliedCoupon ?? null,
    status:        "pending",
    gateway:       gateway ?? "moyasar",
    billingName:   billingName || null,
    billingEmail:  billingEmail || null,
    billingPhone:  billingPhone || null,
  }).returning();

  res.json({
    paymentId:      payment.id,
    amount:         basePrice,
    vatAmount,
    totalAmount,
    discountAmount: parseFloat(discountAmount.toFixed(2)),
    gateway:        gateway ?? "moyasar",
    checkoutUrl:    null,
  });
});

router.post("/payments/verify", requireAuth, async (req, res): Promise<void> => {
  const parsed = VerifyPaymentBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const { paymentId, gatewayRef } = parsed.data;

  // 1. Fetch payment — must belong to this user
  const [payment] = await db.select().from(paymentsTable)
    .where(and(eq(paymentsTable.id, paymentId), eq(paymentsTable.userId, req.userId!)));
  if (!payment) {
    res.status(404).json({ error: "الدفعة غير موجودة" });
    return;
  }

  // 2. Fetch associated package
  const [pkg] = await db.select().from(packagesTable)
    .where(eq(packagesTable.id, payment.packageId));

  // 3. Idempotency — already paid
  if (payment.status === "paid") {
    res.json({ success: true, status: "paid", payment: formatPayment(payment, pkg) });
    return;
  }

  if (payment.status === "failed" || payment.status === "refunded") {
    res.status(400).json({ error: "لا يمكن تفعيل دفعة مرفوضة أو مُستردة" });
    return;
  }

  // 4. Verify with Moyasar
  const secretKey = process.env.MOYASAR_SECRET_KEY ?? "";
  if (!secretKey) { res.status(503).json({ error: "مفتاح ميسّر غير مُعيَّن" }); return; }

  const moyasarId = gatewayRef ?? "";
  if (!moyasarId) {
    res.status(400).json({ error: "gatewayRef (معرّف ميسّر) مطلوب" });
    return;
  }

  const mPayment = await getMoyasarPayment(moyasarId);
  if (!mPayment) {
    res.status(502).json({ error: "تعذّر الاتصال ببوابة الدفع — يرجى المحاولة مجدداً" });
    return;
  }
  if (mPayment.status !== "paid") {
    res.status(400).json({ error: "الدفعة لم تكتمل بعد — الحالة: " + mPayment.status });
    return;
  }

  // 5. Verify amount (Moyasar uses halalas)
  const expectedHalalas = Math.round(parseFloat(payment.totalAmount as string) * 100);
  if (mPayment.amount !== expectedHalalas) {
    res.status(400).json({ error: `المبلغ غير متطابق — ميسّر: ${mPayment.amount} هللة، المتوقع: ${expectedHalalas} هللة` });
    return;
  }

  // 6. Complete the transaction atomically
  const now = new Date();
  const endDate = pkg?.type === "monthly"
    ? new Date(now.getFullYear(), now.getMonth() + 1, now.getDate())
    : pkg?.type === "annual"
    ? new Date(now.getFullYear() + 1, now.getMonth(), now.getDate())
    : null;

  const invoiceNumber = `INV-${now.getFullYear()}-${String(payment.id).padStart(6, "0")}`;

  await db.transaction(async (tx) => {
    // Update payment status
    const [updatedPayment] = await tx.update(paymentsTable)
      .set({ status: "paid", gatewayRef: moyasarId })
      .where(eq(paymentsTable.id, payment.id))
      .returning();

    // Create invoice
    await tx.insert(invoicesTable).values({
      invoiceNumber,
      userId:        req.userId!,
      paymentId:     payment.id,
      amount:        payment.amount,
      vatAmount:     payment.vatAmount,
      totalAmount:   payment.totalAmount,
      discountAmount: payment.discountAmount,
      billingName:   payment.billingName ?? "",
      billingEmail:  payment.billingEmail ?? "",
      status:        "issued",
      packageNameAr: pkg?.nameAr ?? "",
    }).onConflictDoNothing();

    // Cancel existing active subscriptions
    await tx.update(subscriptionsTable)
      .set({ status: "cancelled" })
      .where(and(eq(subscriptionsTable.userId, req.userId!), eq(subscriptionsTable.status, "active")));

    // Create new subscription
    await tx.insert(subscriptionsTable).values({
      userId:           req.userId!,
      packageId:        payment.packageId,
      questionsAllowed: pkg?.questionsAllowed ?? 0,
      questionsUsed:    0,
      grandfatheredUnlimited: false,
      status:           "active",
      startDate:        now,
      endDate,
    });

    // Update coupon usage counter
    if (payment.couponCode) {
      await tx.update(couponsTable)
        .set({ usageCount: sql`${couponsTable.usageCount} + 1` })
        .where(eq(couponsTable.code, payment.couponCode));
    }

    logAction({ userId: req.userId!, action: "payment.verify", targetType: "payment", targetId: payment.id, details: { packageId: payment.packageId, total: payment.totalAmount }, ip: req.ip });

    res.json({ success: true, status: "paid", payment: formatPayment(updatedPayment, pkg) });

    // Fire-and-forget invoice email
    if (payment.billingEmail) {
      sendInvoiceEmail({
        toEmail:        payment.billingEmail,
        toName:         payment.billingName ?? "عميل رباب",
        invoiceNumber,
        packageNameAr:  pkg?.nameAr ?? "",
        amount:         parseFloat(payment.amount as string),
        vatAmount:      parseFloat(payment.vatAmount as string),
        totalAmount:    parseFloat(payment.totalAmount as string),
        discountAmount: parseFloat(payment.discountAmount as string),
        createdAt:      now,
      }).catch(() => {});
    }
  });
});

/**
 * Recovery: called when user has no active subscription but may have paid.
 * Finds the latest PAID payment with no corresponding active subscription and activates it.
 * Safe to call multiple times — idempotent.
 */
router.post("/payments/recover", requireAuth, async (req, res): Promise<void> => {
  // Check if already has active subscription
  const [activeSub] = await db.select().from(subscriptionsTable)
    .where(and(eq(subscriptionsTable.userId, req.userId!), eq(subscriptionsTable.status, "active")))
    .orderBy(sql`id DESC`)
    .limit(1);

  if (activeSub) {
    res.json({ recovered: false, reason: "already_active", subscription: { questionsAllowed: activeSub.questionsAllowed, questionsUsed: activeSub.questionsUsed } });
    return;
  }

  // Find latest paid payment for this user
  const [paidPayment] = await db.select().from(paymentsTable)
    .where(and(eq(paymentsTable.userId, req.userId!), eq(paymentsTable.status, "paid")))
    .orderBy(sql`id DESC`)
    .limit(1);

  if (!paidPayment) {
    // No paid payment — find if there's a pending Moyasar payment we can verify now
    res.json({ recovered: false, reason: "no_paid_payment" });
    return;
  }

  // Paid payment exists — activate subscription
  const [pkg] = await db.select().from(packagesTable)
    .where(eq(packagesTable.id, paidPayment.packageId));

  const now = new Date();
  const endDate = pkg?.type === "monthly"
    ? new Date(now.getFullYear(), now.getMonth() + 1, now.getDate())
    : pkg?.type === "annual"
    ? new Date(now.getFullYear() + 1, now.getMonth(), now.getDate())
    : null;

  await db.transaction(async (tx) => {
    await tx.update(subscriptionsTable)
      .set({ status: "cancelled" })
      .where(and(eq(subscriptionsTable.userId, req.userId!), eq(subscriptionsTable.status, "active")));

    await tx.insert(subscriptionsTable).values({
      userId:           req.userId!,
      packageId:        paidPayment.packageId,
      questionsAllowed: pkg?.questionsAllowed ?? 0,
      questionsUsed:    0,
      grandfatheredUnlimited: false,
      status:           "active",
      startDate:        now,
      endDate,
    });
  });

  logAction({ userId: req.userId!, action: "payment.recover", targetType: "payment", targetId: paidPayment.id, details: { packageId: paidPayment.packageId }, ip: req.ip });
  res.json({ recovered: true, message: "تم تفعيل الاشتراك بنجاح" });
});

/**
 * Fallback: look up a pending payment by its Moyasar gateway ref.
 * Used when sessionStorage is lost between redirects (page refresh / cross-origin redirect).
 */
router.get("/payments/by-gateway/:ref", requireAuth, async (req, res): Promise<void> => {
  const raw = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  if (!raw) { res.status(400).json({ error: "معرّف غير صالح" }); return; }

  // First check our DB (in case already verified)
  const [existing] = await db.select().from(paymentsTable)
    .where(and(eq(paymentsTable.userId, req.userId!), eq(paymentsTable.gatewayRef, raw)));
  if (existing) {
    const [pkg] = await db.select().from(packagesTable)
      .where(eq(packagesTable.id, existing.packageId));
    res.json({ found: true, payment: formatPayment(existing, pkg) });
    return;
  }

  // Not found by gateway ref — try to find latest pending payment for this user
  const pending = await db.select().from(paymentsTable)
    .where(and(eq(paymentsTable.userId, req.userId!), eq(paymentsTable.status, "pending")))
    .orderBy(sql`created_at DESC`)
    .limit(1);

  if (pending.length === 0) {
    res.status(404).json({ error: "لا توجد دفعة معلّقة لهذا الحساب", found: false });
    return;
  }

  res.json({ found: true, payment: formatPayment(pending[0]), recoveredFromPending: true });
});

/**
 * Admin: list all payments across all users.
 */
router.get("/admin/payments", requireAdmin, async (_req, res): Promise<void> => {
  const rows = await db
    .select({
      id: paymentsTable.id,
      userId: paymentsTable.userId,
      packageId: paymentsTable.packageId,
      amount: paymentsTable.amount,
      vatAmount: paymentsTable.vatAmount,
      totalAmount: paymentsTable.totalAmount,
      discountAmount: paymentsTable.discountAmount,
      couponCode: paymentsTable.couponCode,
      status: paymentsTable.status,
      gateway: paymentsTable.gateway,
      gatewayRef: paymentsTable.gatewayRef,
      billingName: paymentsTable.billingName,
      billingEmail: paymentsTable.billingEmail,
      billingPhone: paymentsTable.billingPhone,
      createdAt: paymentsTable.createdAt,
      // user
      userName: usersTable.name,
      userEmail: usersTable.email,
      // package
      packageNameAr: packagesTable.nameAr,
    })
    .from(paymentsTable)
    .leftJoin(usersTable, eq(paymentsTable.userId, usersTable.id))
    .leftJoin(packagesTable, eq(paymentsTable.packageId, packagesTable.id))
    .orderBy(desc(paymentsTable.id));

  res.json(
    rows.map((r) => ({
      id: r.id,
      userId: r.userId,
      package: r.packageNameAr ? { nameAr: r.packageNameAr } : undefined,
      amount: parseFloat(r.amount as string),
      vatAmount: parseFloat(r.vatAmount as string),
      totalAmount: parseFloat(r.totalAmount as string),
      discountAmount: parseFloat(r.discountAmount as string),
      couponCode: r.couponCode,
      status: r.status,
      gateway: r.gateway,
      gatewayRef: r.gatewayRef,
      billingName: r.billingName ?? r.userName,
      billingEmail: r.billingEmail ?? r.userEmail,
      billingPhone: r.billingPhone,
      userName: r.userName,
      userEmail: r.userEmail,
      createdAt: r.createdAt,
    }))
  );
});

/**
 * Admin: manually verify a real Moyasar payment and activate the subscription.
 * Used when callback redirect fails (sessionStorage lost, network error, etc.)
 */
router.post("/admin/payments/manual-verify", requireAdmin, async (req, res): Promise<void> => {
  // Only allow with secret key (admin-level operation)
  const { moyasarId, paymentId } = req.body ?? {};
  if (!moyasarId || !paymentId) {
    res.status(400).json({ error: "moyasarId و paymentId مطلوبان" });
    return;
  }

  const secretKey = process.env.MOYASAR_SECRET_KEY ?? "";
  if (!secretKey) { res.status(503).json({ error: "مفتاح ميسّر غير مُعيَّن" }); return; }

  const mPayment = await getMoyasarPayment(moyasarId);
  if (!mPayment) { res.status(502).json({ error: "تعذّر جلب الدفعة من ميسّر" }); return; }
  if (mPayment.status !== "paid") {
    res.status(400).json({ error: `حالة الدفع في ميسّر: ${mPayment.status}` });
    return;
  }

  // Fetch the exact payment row by ID — must be pending
  const [payment] = await db.select().from(paymentsTable)
    .where(eq(paymentsTable.id, Number(paymentId)));
  if (!payment) {
    res.status(404).json({ error: "الدفعة غير موجودة" });
    return;
  }

  // Idempotency: reject if already bound to a different Moyasar ID
  if (payment.gatewayRef && payment.gatewayRef !== moyasarId) {
    res.status(409).json({ error: `الدفعة مرتبطة بمعرّف ميسّر مختلف: ${payment.gatewayRef}` });
    return;
  }

  // Verify amount
  const expectedHalalas = Math.round(parseFloat(payment.totalAmount as string) * 100);
  if (mPayment.amount !== expectedHalalas) {
    res.status(400).json({ error: `المبلغ غير متطابق — ميسّر: ${mPayment.amount} هللة، المتوقع: ${expectedHalalas} هللة` });
    return;
  }

  // Fetch package
  const [pkg] = await db.select().from(packagesTable)
    .where(eq(packagesTable.id, payment.packageId));

  const now = new Date();
  const endDate = pkg?.type === "monthly"
    ? new Date(now.getFullYear(), now.getMonth() + 1, now.getDate())
    : pkg?.type === "annual"
    ? new Date(now.getFullYear() + 1, now.getMonth(), now.getDate())
    : null;

  const invoiceNumber = `INV-${now.getFullYear()}-${String(payment.id).padStart(6, "0")}`;

  await db.transaction(async (tx) => {
    const [updatedPayment] = await tx.update(paymentsTable)
      .set({ status: "paid", gatewayRef: moyasarId })
      .where(eq(paymentsTable.id, payment.id))
      .returning();

    await tx.insert(invoicesTable).values({
      invoiceNumber,
      userId:        payment.userId!,
      paymentId:     payment.id,
      amount:        payment.amount,
      vatAmount:     payment.vatAmount,
      totalAmount:   payment.totalAmount,
      discountAmount: payment.discountAmount,
      billingName:   payment.billingName ?? "",
      billingEmail:  payment.billingEmail ?? "",
      status:        "paid",
      packageNameAr: pkg?.nameAr ?? "",
    }).onConflictDoNothing();

    await tx.update(subscriptionsTable)
      .set({ status: "cancelled" })
      .where(and(eq(subscriptionsTable.userId, payment.userId!), eq(subscriptionsTable.status, "active")));

    await tx.insert(subscriptionsTable).values({
      userId:           payment.userId!,
      packageId:        payment.packageId,
      status:           "active",
      questionsAllowed: pkg?.questionsAllowed ?? 0,
      questionsUsed:    0,
      grandfatheredUnlimited: false,
      startDate:        now,
      endDate,
    });

    res.json({
      success: true,
      message: "تم تفعيل الاشتراك يدوياً بنجاح",
      payment: formatPayment(updatedPayment, pkg),
    });
  });
});

/**
 * Admin: resend invoice email for a paid payment.
 */
router.post("/admin/payments/:id/resend-email", requireAdmin, async (req, res): Promise<void> => {
  const id = parseInt(req.params.id as string, 10);
  if (isNaN(id)) { res.status(400).json({ error: "معرّف غير صالح" }); return; }

  const [payment] = await db.select().from(paymentsTable).where(eq(paymentsTable.id, id));
  if (!payment) { res.status(404).json({ error: "الدفعة غير موجودة" }); return; }
  if (payment.status !== "paid") { res.status(400).json({ error: "لا يمكن إرسال فاتورة لدفعة غير مكتملة" }); return; }

  const email = payment.billingEmail;
  if (!email) { res.status(400).json({ error: "لا يوجد بريد إلكتروني مرتبط بهذه الدفعة" }); return; }

  const [inv] = await db.select().from(invoicesTable).where(eq(invoicesTable.paymentId, id));
  const [pkg] = await db.select().from(packagesTable).where(eq(packagesTable.id, payment.packageId));

  const invoiceNumber = inv?.invoiceNumber ?? `INV-${new Date().getFullYear()}-${String(payment.id).padStart(6, "0")}`;

  const sent = await sendInvoiceEmail({
    toEmail:        email,
    toName:         payment.billingName ?? "عميل رباب",
    invoiceNumber,
    packageNameAr:  pkg?.nameAr ?? inv?.packageNameAr ?? "",
    amount:         parseFloat(payment.amount as string),
    vatAmount:      parseFloat(payment.vatAmount as string),
    totalAmount:    parseFloat(payment.totalAmount as string),
    discountAmount: parseFloat(payment.discountAmount as string),
    createdAt:      payment.createdAt ? new Date(payment.createdAt) : new Date(),
  });

  if (!sent) {
    res.status(502).json({ error: "فشل إرسال البريد — تحقق من إعدادات RESEND_API_KEY" });
    return;
  }

  logAction({ userId: req.userId!, action: "invoice.resend", targetType: "payment", targetId: id, details: { email }, ip: req.ip });
  res.json({ success: true, message: `تم إعادة إرسال الفاتورة إلى ${email}` });
});

router.post("/payments/webhook", async (req, res): Promise<void> => {
  // Gateway webhook handler — would verify signature and update payment status
  req.log.info({ body: req.body }, "Payment webhook received");
  res.json({ success: true, message: "تم الاستلام" });
});

router.get("/payments/history", requireAuth, async (req, res): Promise<void> => {
  const payments = await db.select().from(paymentsTable).where(eq(paymentsTable.userId, req.userId!));
  const pkgIds = [...new Set(payments.map((p) => p.packageId))];
  // Fix: was fetching ALL packages without a WHERE clause
  const pkgs = pkgIds.length > 0
    ? await db.select().from(packagesTable).where(inArray(packagesTable.id, pkgIds))
    : [];
  const pkgMap = new Map(pkgs.map((p) => [p.id, p]));
  res.json(payments.map((p) => formatPayment(p, pkgMap.get(p.packageId))));
});

router.get("/invoices", requireAuth, async (req, res): Promise<void> => {
  const invoices = await db.select().from(invoicesTable).where(eq(invoicesTable.userId, req.userId!));
  res.json(invoices.map((i) => formatInvoice(i)));
});

router.get("/invoices/:id/pdf", requireAuth, async (req, res): Promise<void> => {
  const raw = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const id = parseInt(raw, 10);
  if (isNaN(id)) {
    res.status(400).json({ error: "معرّف غير صالح" });
    return;
  }

  const [inv] = await db.select().from(invoicesTable)
    .where(and(eq(invoicesTable.id, id), eq(invoicesTable.userId, req.userId!)));
  if (!inv) {
    res.status(404).json({ error: "الفاتورة غير موجودة" });
    return;
  }
  const [payment] = await db.select().from(paymentsTable).where(eq(paymentsTable.id, inv.paymentId));
  void payment; // reserved for future use

  const doc = new PDFDocument({ size: "A4", margin: 50, info: { Title: `فاتورة ${inv.invoiceNumber}` } });
  res.setHeader("Content-Type", "application/pdf");
  res.setHeader("Content-Disposition", `attachment; filename="invoice-${inv.invoiceNumber}.pdf"`);
  doc.pipe(res);

  const pageW = doc.page.width;
  const marginX = 50;
  const contentW = pageW - marginX * 2;
  const date = new Date(inv.createdAt ?? Date.now());
  const dateStr = date.toLocaleDateString("ar-SA", { year: "numeric", month: "long", day: "numeric" });
  let y = 160;
  const footerY = doc.page.height - 60;
  const amount = parseFloat(inv.amount as string);
  const vatAmount = parseFloat(inv.vatAmount as string);
  const totalAmount = parseFloat(inv.totalAmount as string);
  const discountAmount = parseFloat(inv.discountAmount as string);

  const drawRow = (label: string, value: string, bg = "#ffffff", bold = false) => {
    doc.rect(marginX, y, contentW, 24).fill(bg);
    doc.fillColor("#333333").fontSize(10).font(bold ? "Helvetica-Bold" : "Helvetica")
      .text(label, marginX + 8, y + 7, { width: contentW * 0.55 })
      .text(value, marginX + contentW * 0.55, y + 7, { width: contentW * 0.45, align: "right" });
    y += 24;
  };

  // Header
  doc.rect(0, 0, pageW, 120).fill("#1a3a6e");
  doc.fillColor("#ffffff").fontSize(22).font("Helvetica-Bold")
    .text("رباب القانونية", marginX, 40, { align: "center", width: contentW });
  doc.fontSize(12).font("Helvetica")
    .text("المساعد القانوني الذكي", marginX, 70, { align: "center", width: contentW });

  // Invoice title
  doc.fillColor("#333333").fontSize(14).font("Helvetica-Bold")
    .text(`فاتورة رقم: ${inv.invoiceNumber}`, marginX, 130);

  // Rows
  drawRow("التاريخ", dateStr, "#f8fafc");
  drawRow("الباقة", inv.packageName ?? "", "#ffffff");
  drawRow("السعر الأساسي", `${amount.toFixed(2)} ر.س`, "#f8fafc");
  if (discountAmount > 0) {
    drawRow("الخصم", `- ${discountAmount.toFixed(2)} ر.س`, "#ffffff");
  }
  drawRow("ضريبة القيمة المضافة (15%)", `${vatAmount.toFixed(2)} ر.س`, "#f8fafc");
  drawRow("الإجمالي المدفوع", `${totalAmount.toFixed(2)} ر.س`, "#eff6ff", true);

  // Footer
  doc.rect(0, footerY, pageW, 60).fill("#f8fafc");
  doc.fillColor("#9ca3af").fontSize(10).font("Helvetica")
    .text("هذه الفاتورة صادرة تلقائياً من منصة رباب القانونية", marginX, footerY + 20, { align: "center", width: contentW });

  doc.end();
});

// ── POST /api/payments/dev-simulate ──────────────────────────────────────────
// Dev-only: instantly grant a paid subscription without going through Moyasar.
// BLOCKED in production.
router.post("/payments/dev-simulate", requireAuth, async (req, res): Promise<void> => {
  if (process.env.NODE_ENV === "production") {
    res.status(404).json({ error: "Not found" });
    return;
  }

  const packageId = Number(req.body?.packageId ?? 3); // default: الاشتراك الشهري
  const [pkg] = await db.select().from(packagesTable)
    .where(and(eq(packagesTable.id, packageId), eq(packagesTable.isActive, true)));

  if (!pkg) {
    res.status(404).json({ error: "الباقة غير موجودة" });
    return;
  }

  const now     = new Date();
  const endDate = new Date(now);
  endDate.setMonth(endDate.getMonth() + 1);

  await db.transaction(async (tx) => {
    // Cancel any active subscriptions
    await tx.update(subscriptionsTable)
      .set({ status: "cancelled" })
      .where(and(eq(subscriptionsTable.userId, req.userId!), eq(subscriptionsTable.status, "active")));

    // Create mock payment record
    const [payment] = await tx.insert(paymentsTable).values({
      userId:        req.userId!,
      packageId:     pkg.id,
      amount:        pkg.price,
      vatAmount:     "0",
      totalAmount:   pkg.price,
      discountAmount:"0",
      status:        "paid",
      gateway:       "dev_simulate",
      gatewayRef:    `DEV-${Date.now()}`,
      billingName:   "مستخدم تجريبي",
      billingEmail:  "dev@rabab.ai",
    }).returning();

    const invoiceNumber = `INV-DEV-${now.getFullYear()}-${String(payment.id).padStart(6, "0")}`;
    await tx.update(paymentsTable).set({ invoiceNumber }).where(eq(paymentsTable.id, payment.id));

    // Create subscription
    await tx.insert(subscriptionsTable).values({
      userId:              req.userId!,
      packageId:           pkg.id,
      questionsAllowed:    pkg.questionsAllowed,
      consultationsUsed:   0,
      contractsUsed:       0,
      reviewsUsed:         0,
      questionsUsed:       0,
      grandfatheredUnlimited: false,
      status:              "active",
      startDate:           now,
      endDate,
    });
  });

  res.json({ success: true, package: pkg.nameAr, endDate });
});

// ── GET /api/payments/dev-packages ───────────────────────────────────────────
// Dev-only: list available packages for the simulate dropdown.
router.get("/payments/dev-packages", requireAuth, async (req, res): Promise<void> => {
  if (process.env.NODE_ENV === "production") {
    res.status(404).json({ error: "Not found" });
    return;
  }
  const pkgs = await db.select({
    id: packagesTable.id,
    nameAr: packagesTable.nameAr,
    price: packagesTable.price,
  }).from(packagesTable).where(and(eq(packagesTable.isActive, true)));
  res.json(pkgs);
});

export default router;
