import { Router, type IRouter } from "express";
import bcryptjs from "bcryptjs";
import jwt from "jsonwebtoken";
import { v4 as uuidv4 } from "uuid";
import crypto from "crypto";
import {
  db, usersTable, subscriptionsTable, packagesTable,
  tokenBlocklistTable, passwordResetTokensTable,
  emailVerificationTokensTable, phoneOtpTokensTable,
} from "@workspace/db";
import { eq, and, gt, isNull, desc } from "drizzle-orm";
import { sendEmail } from "../lib/email";
import { requireAuth, JWT_SECRET, tokenFingerprint, type JwtPayload } from "../middlewares/auth";
import { logAction } from "./audit-log";
import { sendSms, generateOtpCode, maskPhone, normalizePhoneE164 } from "../lib/sms";
import { RegisterBody, LoginBody, UpdateMeBody } from "@workspace/api-zod";
import { logger } from "../lib/logger";

const JWT_EXPIRES_IN = "30d";
const JWT_EXPIRES_SECONDS = 30 * 24 * 60 * 60;

// ── Phone OTP constants ───────────────────────────────────────────────────────
/** Max wrong OTP attempts before the phone token is locked (DB-tracked) */
const MAX_OTP_ATTEMPTS = 5;

// ── Email OTP brute-force / rate-limit guards (in-process) ───────────────────
interface OtpFailureEntry { count: number; since: number; }
interface RateLimitEntry  { count: number; since: number; }

const otpFailures   = new Map<string, OtpFailureEntry>(); // per-email failure counter
const resendByEmail = new Map<string, RateLimitEntry>();  // per-email resend limit
const resendByIp    = new Map<string, RateLimitEntry>();  // per-IP resend limit
const verifyByIp    = new Map<string, RateLimitEntry>();  // per-IP verify limit

const OTP_MAX_FAILURES      = 5;
const OTP_FAILURE_WINDOW_MS = 15 * 60 * 1000;
const RESEND_WINDOW_MS      = 15 * 60 * 1000;
const RESEND_MAX_PER_EMAIL  = 3;
const RESEND_MAX_PER_IP     = 10;
const VERIFY_WINDOW_MS      = 15 * 60 * 1000;
const VERIFY_MAX_PER_IP     = 10;

function checkRateLimit(
  map: Map<string, RateLimitEntry>,
  key: string,
  max: number,
  windowMs: number,
): boolean {
  const now = Date.now();
  const entry = map.get(key);
  if (!entry || now - entry.since > windowMs) {
    map.set(key, { count: 1, since: now });
    return true;
  }
  if (entry.count >= max) return false;
  entry.count++;
  return true;
}

function recordOtpFailure(email: string): number {
  const now = Date.now();
  const entry = otpFailures.get(email);
  if (!entry || now - entry.since > OTP_FAILURE_WINDOW_MS) {
    otpFailures.set(email, { count: 1, since: now });
    return 1;
  }
  entry.count++;
  return entry.count;
}

function clearOtpFailures(email: string): void {
  otpFailures.delete(email);
}

// ── Helpers ───────────────────────────────────────────────────────────────────

const router: IRouter = Router();

function issueToken(userId: number, userRole: string, tokenVersion: number): string {
  return jwt.sign({ userId, userRole, jti: uuidv4(), tokenVersion }, JWT_SECRET, { expiresIn: JWT_EXPIRES_IN });
}

/**
 * Revoke a raw JWT by inserting its SHA-256 fingerprint into the blocklist.
 */
async function revokeVerifiedToken(rawToken: string, exp?: number): Promise<void> {
  const key = tokenFingerprint(rawToken);
  const expiresAt = exp
    ? new Date(exp * 1000)
    : new Date(Date.now() + JWT_EXPIRES_SECONDS * 1000);
  await db.insert(tokenBlocklistTable)
    .values({ tokenKey: key, expiresAt })
    .onConflictDoNothing();
}

/** Generate a 6-digit numeric OTP code (used for email verification) */
function generateOtp(): string {
  return Math.floor(100000 + Math.random() * 900000).toString();
}

/**
 * Hash an OTP with SHA-256 before persisting to the DB.
 * We never store raw email OTP codes — only their hash.
 */
function hashOtp(code: string): string {
  return crypto.createHash("sha256").update(code.trim()).digest("hex");
}

/** Send email verification OTP */
async function sendVerificationEmail(email: string, name: string, code: string): Promise<void> {
  await sendEmail({
    to: email,
    subject: "تأكيد البريد الإلكتروني — رباب",
    html: `
      <div dir="rtl" style="font-family:Arial,sans-serif;max-width:600px;margin:auto;padding:24px;background:#f9f9f9;border-radius:8px;">
        <h2 style="color:#1a2e5a;">تأكيد البريد الإلكتروني</h2>
        <p>مرحباً ${name}،</p>
        <p>استخدمي الرمز أدناه لتأكيد بريدك الإلكتروني في منصة <strong>رباب</strong>:</p>
        <div style="text-align:center;margin:32px 0;">
          <div style="display:inline-block;background:#1a2e5a;color:#d4a017;font-size:36px;font-weight:bold;letter-spacing:10px;padding:20px 36px;border-radius:12px;">${code}</div>
        </div>
        <p style="color:#555;">هذا الرمز صالح لمدة <strong>10 دقائق</strong> فقط.</p>
      </div>`,
    text: `رمز التحقق: ${code} — صالح 10 دقائق.`,
  });
}

function userResponse(user: typeof usersTable.$inferSelect) {
  return {
    id: user.id,
    name: user.name,
    email: user.email,
    phone: user.phone,
    role: user.role,
    phoneVerified: user.phoneVerified,
    emailVerified: user.emailVerified,
    freeConsultationsUsed: user.freeConsultationsUsed,
    createdAt: user.createdAt,
  };
}

// ── POST /api/auth/register ───────────────────────────────────────────────────
router.post("/auth/register", async (req, res): Promise<void> => {
  const parsed = RegisterBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const { name, email: rawEmail, password, phone } = parsed.data;
  const email = rawEmail.toLowerCase().trim();

  // حقول نوع الحساب (اختيارية — لا تُتحقق في RegisterBody الأساسية)
  const accountType    = req.body.accountType    === "entity" ? "entity" : "individual";
  const entityName     = accountType === "entity" ? (req.body.entityName     as string | undefined) ?? null : null;
  const entityCrNumber = accountType === "entity" ? (req.body.entityCrNumber as string | undefined) ?? null : null;
  const entityTaxNumber= accountType === "entity" ? (req.body.entityTaxNumber as string | undefined) ?? null : null;

  // التحقق من وحدانية رقم الجوال لمنع حساب واحد لكل رقم
  if (phone) {
    const existingPhone = await db.select({ id: usersTable.id }).from(usersTable).where(eq(usersTable.phone, phone));
    if (existingPhone.length > 0) {
      res.status(400).json({ error: "رقم الجوال مسجل مسبقاً" });
      return;
    }
  }

  const existing = await db.select({ id: usersTable.id }).from(usersTable).where(eq(usersTable.email, email));
  if (existing.length > 0) {
    res.status(400).json({ error: "البريد الإلكتروني مسجل مسبقاً" });
    return;
  }

  // تاريخ انتهاء التجربة المجانية — 7 أيام من التسجيل
  const trialExpiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);

  const passwordHash = await bcryptjs.hash(password, 12);
  const [user] = await db.insert(usersTable)
    .values({ name, email, passwordHash, phone: phone ?? null, emailVerified: false, phoneVerified: false,
      accountType, entityName, entityCrNumber, entityTaxNumber, trialExpiresAt })
    .returning();

  // Auto-create free trial subscription
  const [freePkg] = await db.select().from(packagesTable).where(eq(packagesTable.type, "free"));
  if (freePkg) {
    await db.insert(subscriptionsTable).values({
      userId: user.id,
      packageId: freePkg.id,
      questionsAllowed: freePkg.questionsAllowed,
      questionsUsed: 0,
      status: "active",
    });
  }

  // ── Send phone OTP (primary verification flow) ──────────────────────────
  if (phone) {
    const code = generateOtpCode();
    const verifyToken = uuidv4();
    const expiresAt = new Date(Date.now() + 60 * 60 * 1000); // 1 hour

    await db.update(phoneOtpTokensTable)
      .set({ usedAt: new Date() })
      .where(and(
        eq(phoneOtpTokensTable.userId, user.id),
        isNull(phoneOtpTokensTable.usedAt),
      ));
    await db.insert(phoneOtpTokensTable).values({ userId: user.id, verifyToken, code, expiresAt });

    try {
      const normalizedPhone = normalizePhoneE164(phone);
      await sendSms({ to: normalizedPhone, body: `رمز التحقق في رباب: ${code} — صالح 10 دقائق` });

      logAction({ userId: user.id, action: "register", details: { email }, ip: req.ip, userAgent: req.get("user-agent") });
      res.status(201).json({
        pendingVerification: true,
        verifyToken,
        maskedPhone: maskPhone(phone),
      });
      return;
    } catch (err) {
      logger.warn({ err: (err as any)?.message }, "[SMS] Failed to send OTP — falling back to email verification");
      // Clean up phone OTP tokens since SMS delivery failed
      await db.delete(phoneOtpTokensTable).where(eq(phoneOtpTokensTable.userId, user.id)).catch(() => {});
      // Fall back to email OTP verification instead of rejecting registration
      const emailOtpCode = generateOtp();
      const emailOtpExpiry = new Date(Date.now() + 10 * 60 * 1000);
      await db.delete(emailVerificationTokensTable)
        .where(eq(emailVerificationTokensTable.userId, user.id));
      await db.insert(emailVerificationTokensTable).values({
        userId: user.id, code: hashOtp(emailOtpCode), expiresAt: emailOtpExpiry,
      });
      sendVerificationEmail(user.email, user.name, emailOtpCode).catch(() => {});
      logAction({ userId: user.id, action: "register", details: { email, smsFallbackToEmail: true }, ip: req.ip, userAgent: req.get("user-agent") });
      res.status(201).json({ needsVerification: true, email: user.email });
      return;
    }
  }

  // Fallback (no phone): send email OTP — stored as SHA-256 hash
  const code = generateOtp();
  const expiresAt = new Date(Date.now() + 10 * 60 * 1000);
  await db.delete(emailVerificationTokensTable)
    .where(eq(emailVerificationTokensTable.userId, user.id));
  await db.insert(emailVerificationTokensTable).values({ userId: user.id, code: hashOtp(code), expiresAt });
  sendVerificationEmail(user.email, user.name, code).catch(() => {});

  logAction({ userId: user.id, action: "register", details: { email }, ip: req.ip, userAgent: req.get("user-agent") });
  res.status(201).json({ needsVerification: true, email: user.email });
});

// ── POST /api/auth/phone-verify/confirm ──────────────────────────────────────
router.post("/auth/phone-verify/confirm", async (req, res): Promise<void> => {
  const { verifyToken, code } = req.body ?? {};
  if (!verifyToken || !code || typeof verifyToken !== "string" || typeof code !== "string") {
    res.status(400).json({ error: "بيانات غير صحيحة" });
    return;
  }

  const [record] = await db.select().from(phoneOtpTokensTable)
    .where(and(
      eq(phoneOtpTokensTable.verifyToken, verifyToken),
      gt(phoneOtpTokensTable.expiresAt, new Date()),
      isNull(phoneOtpTokensTable.usedAt),
    ));

  if (!record) {
    res.status(400).json({ error: "الرمز غير صحيح أو منتهي الصلاحية" });
    return;
  }
  if ((record.attempts ?? 0) >= MAX_OTP_ATTEMPTS) {
    res.status(429).json({ error: "تجاوزت الحد الأقصى للمحاولات، يرجى طلب رمز جديد" });
    return;
  }
  if (record.code !== code) {
    await db.update(phoneOtpTokensTable)
      .set({ attempts: (record.attempts ?? 0) + 1 })
      .where(eq(phoneOtpTokensTable.id, record.id));
    res.status(400).json({ error: "الرمز غير صحيح" });
    return;
  }

  // Mark token used + set phoneVerified
  await db.update(phoneOtpTokensTable).set({ usedAt: new Date() }).where(eq(phoneOtpTokensTable.id, record.id));
  await db.update(usersTable).set({ phoneVerified: true }).where(eq(usersTable.id, record.userId));

  const [user] = await db.select().from(usersTable).where(eq(usersTable.id, record.userId));
  if (!user) { res.status(404).json({ error: "المستخدم غير موجود" }); return; }

  const token = issueToken(user.id, user.role, user.tokenVersion ?? 1);
  req.session!.userId = user.id;
  req.session!.userRole = user.role;
  await new Promise<void>((resolve) => req.session!.save(() => resolve()));

  logAction({ userId: user.id, action: "phone_verified", details: {}, ip: req.ip, userAgent: req.get("user-agent") });
  res.json({ token, user: userResponse({ ...user, phoneVerified: true }) });
});

// ── POST /api/auth/phone-verify/resend ───────────────────────────────────────
router.post("/auth/phone-verify/resend", async (req, res): Promise<void> => {
  const { verifyToken } = req.body ?? {};
  if (!verifyToken || typeof verifyToken !== "string") {
    res.status(400).json({ error: "بيانات غير صحيحة" });
    return;
  }

  const [record] = await db.select().from(phoneOtpTokensTable)
    .where(and(
      eq(phoneOtpTokensTable.verifyToken, verifyToken),
      isNull(phoneOtpTokensTable.usedAt),
    ));

  if (!record || record.usedAt) {
    res.status(400).json({ error: "طلب التحقق غير صالح" });
    return;
  }

  // Enforce 60-second cooldown (per user)
  const [latestToken] = await db.select().from(phoneOtpTokensTable)
    .where(eq(phoneOtpTokensTable.userId, record.userId))
    .orderBy(desc(phoneOtpTokensTable.createdAt))
    .limit(1);

  const secondsSinceLastSend = latestToken
    ? (Date.now() - latestToken.createdAt.getTime()) / 1000
    : 61;
  if (secondsSinceLastSend < 60) {
    res.status(429).json({ error: "انتظري دقيقة واحدة قبل طلب رمز جديد", secondsRemaining: Math.ceil(60 - secondsSinceLastSend) });
    return;
  }

  const [user] = await db.select().from(usersTable).where(eq(usersTable.id, record.userId));
  if (!user || !user.phone) {
    res.status(400).json({ error: "المستخدم غير موجود" });
    return;
  }

  const newCode = generateOtpCode();
  const newVerifyToken = uuidv4();
  const expiresAt = new Date(Date.now() + 60 * 60 * 1000);

  await db.update(phoneOtpTokensTable)
    .set({ usedAt: new Date() })
    .where(and(
      eq(phoneOtpTokensTable.userId, user.id),
      isNull(phoneOtpTokensTable.usedAt),
    ));
  await db.insert(phoneOtpTokensTable).values({ userId: user.id, verifyToken: newVerifyToken, code: newCode, expiresAt });

  try {
    const normalizedPhone = normalizePhoneE164(user.phone);
    await sendSms({ to: normalizedPhone, body: `رمز التحقق في رباب: ${newCode} — صالح 10 دقائق` });
  } catch (err) {
    if (process.env.NODE_ENV === "production") {
      res.status(503).json({ error: "فشل إرسال رمز التحقق، يرجى المحاولة مرة أخرى" });
      return;
    }
    logger.warn({ err: (err as any)?.message }, "[SMS] Failed to resend OTP");
  }

  res.json({ verifyToken: newVerifyToken, maskedPhone: maskPhone(user.phone) });
});

// ── POST /api/auth/verify-email ───────────────────────────────────────────────
router.post("/auth/verify-email", async (req, res): Promise<void> => {
  const { email, code } = req.body ?? {};
  if (!email || !code || typeof email !== "string" || typeof code !== "string") {
    res.status(400).json({ error: "بيانات غير صحيحة" });
    return;
  }

  // ── Per-IP rate limit: max 10 attempts per 15 min ────────────────────────
  const ip = req.ip ?? "unknown";
  if (!checkRateLimit(verifyByIp, ip, VERIFY_MAX_PER_IP, VERIFY_WINDOW_MS)) {
    res.status(429).json({ error: "تجاوزتِ الحد المسموح به من المحاولات، حاولي لاحقاً" });
    return;
  }

  const normalizedEmail = email.toLowerCase().trim();
  const [user] = await db.select().from(usersTable).where(eq(usersTable.email, normalizedEmail));
  if (!user) {
    res.status(400).json({ error: "البريد الإلكتروني غير موجود" });
    return;
  }
  if (user.emailVerified) {
    res.status(400).json({ error: "البريد الإلكتروني مؤكد بالفعل" });
    return;
  }

  // ── Per-email failure check: lock out after OTP_MAX_FAILURES bad guesses ──
  const failEntry = otpFailures.get(normalizedEmail);
  if (failEntry && failEntry.count >= OTP_MAX_FAILURES && Date.now() - failEntry.since <= OTP_FAILURE_WINDOW_MS) {
    res.status(429).json({ error: "تم تجاوز عدد المحاولات المسموح بها، اطلبي رمزاً جديداً" });
    return;
  }

  const [record] = await db.select()
    .from(emailVerificationTokensTable)
    .where(and(
      eq(emailVerificationTokensTable.userId, user.id),
      eq(emailVerificationTokensTable.code, hashOtp(code)), // compare hash
      gt(emailVerificationTokensTable.expiresAt, new Date()),
    ));

  if (!record) {
    const failures = recordOtpFailure(normalizedEmail);
    if (failures >= OTP_MAX_FAILURES) {
      await db.delete(emailVerificationTokensTable)
        .where(eq(emailVerificationTokensTable.userId, user.id));
      logAction({ userId: user.id, action: "otp_locked", details: { email: normalizedEmail, failures }, ip, userAgent: req.get("user-agent") });
      res.status(429).json({ error: "تم تجاوز عدد المحاولات المسموح بها، اطلبي رمزاً جديداً" });
    } else {
      res.status(400).json({ error: "الرمز غير صحيح أو منتهي الصلاحية" });
    }
    return;
  }

  // ── Success: clear counters, mark verified, issue token ──────────────────
  clearOtpFailures(normalizedEmail);
  await db.update(usersTable)
    .set({ emailVerified: true })
    .where(eq(usersTable.id, user.id));
  await db.delete(emailVerificationTokensTable)
    .where(eq(emailVerificationTokensTable.userId, user.id));

  req.session!.userId = user.id;
  req.session!.userRole = user.role;

  logAction({ userId: user.id, action: "email_verified", details: { email: normalizedEmail }, ip, userAgent: req.get("user-agent") });

  // Issue a real JWT so the blocklist can protect it
  const token = issueToken(user.id, user.role, user.tokenVersion ?? 1);
  res.json({ token, user: userResponse({ ...user, emailVerified: true }) });
});

// ── POST /api/auth/resend-verification ───────────────────────────────────────
router.post("/auth/resend-verification", async (req, res): Promise<void> => {
  const { email } = req.body ?? {};
  if (!email || typeof email !== "string") {
    res.status(400).json({ error: "البريد الإلكتروني مطلوب" });
    return;
  }

  const ip = req.ip ?? "unknown";
  if (!checkRateLimit(resendByIp, ip, RESEND_MAX_PER_IP, RESEND_WINDOW_MS)) {
    res.status(429).json({ error: "تجاوزتِ الحد المسموح به، حاولي لاحقاً" });
    return;
  }

  const normalizedEmail = email.toLowerCase().trim();
  if (!checkRateLimit(resendByEmail, normalizedEmail, RESEND_MAX_PER_EMAIL, RESEND_WINDOW_MS)) {
    res.status(429).json({ error: "تم إرسال الرمز مؤخراً، انتظري قليلاً قبل الطلب مجدداً" });
    return;
  }

  const [user] = await db.select().from(usersTable).where(eq(usersTable.email, normalizedEmail));
  if (!user || user.emailVerified) {
    // Don't leak existence or status — return success silently
    res.json({ success: true });
    return;
  }

  const code = generateOtp();
  const expiresAt = new Date(Date.now() + 10 * 60 * 1000);
  clearOtpFailures(normalizedEmail);
  await db.delete(emailVerificationTokensTable)
    .where(eq(emailVerificationTokensTable.userId, user.id));
  await db.insert(emailVerificationTokensTable).values({ userId: user.id, code: hashOtp(code), expiresAt });

  sendVerificationEmail(user.email, user.name, code).catch(() => {});

  res.json({ success: true });
});

// ── POST /api/auth/login ──────────────────────────────────────────────────────
router.post("/auth/login", async (req, res): Promise<void> => {
  const parsed = LoginBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const { email, password } = parsed.data;

  const [user] = await db.select().from(usersTable).where(eq(usersTable.email, email.toLowerCase().trim()));

  if (!user) {
    res.status(401).json({ error: "بيانات الدخول غير صحيحة" });
    return;
  }

  const valid = await bcryptjs.compare(password, user.passwordHash);
  if (!valid) {
    res.status(401).json({ error: "بيانات الدخول غير صحيحة" });
    return;
  }
  if (!user.isActive) {
    res.status(401).json({ error: "الحساب موقوف" });
    return;
  }

  // ── Phone not yet verified: send a fresh SMS OTP ─────────────────────────
  if (!user.phoneVerified && user.phone) {
    const code = generateOtpCode();
    const verifyToken = uuidv4();
    const expiresAt = new Date(Date.now() + 60 * 60 * 1000);

    await db.update(phoneOtpTokensTable)
      .set({ usedAt: new Date() })
      .where(and(
        eq(phoneOtpTokensTable.userId, user.id),
        isNull(phoneOtpTokensTable.usedAt),
      ));
    await db.insert(phoneOtpTokensTable).values({ userId: user.id, verifyToken, code, expiresAt });

    try {
      const normalizedPhone = normalizePhoneE164(user.phone);
      await sendSms({ to: normalizedPhone, body: `رمز التحقق في رباب: ${code} — صالح 10 دقائق` });
    } catch (err) {
      if (process.env.NODE_ENV === "production") {
        res.status(503).json({ error: "فشل إرسال رمز التحقق، يرجى المحاولة مرة أخرى" });
        return;
      }
      logger.warn({ err: (err as any)?.message }, "[SMS] Failed to send login OTP — proceeding without verification");
    }

    res.status(403).json({
      error: "phoneNotVerified",
      pendingVerification: true,
      verifyToken,
      maskedPhone: maskPhone(user.phone),
    });
    return;
  }

  // ── Email not yet verified (no phone on account): resend email OTP ────────
  if (!user.emailVerified && !user.phone) {
    const code = generateOtp();
    const expiresAt = new Date(Date.now() + 10 * 60 * 1000);
    clearOtpFailures(user.email);
    await db.delete(emailVerificationTokensTable)
      .where(eq(emailVerificationTokensTable.userId, user.id));
    await db.insert(emailVerificationTokensTable).values({ userId: user.id, code: hashOtp(code), expiresAt });
    sendVerificationEmail(user.email, user.name, code).catch(() => {});

    res.status(403).json({ error: "emailNotVerified", email: user.email });
    return;
  }

  req.session!.userId = user.id;
  req.session!.userRole = user.role;

  logAction({ userId: user.id, action: "login", ip: req.ip, userAgent: req.get("user-agent") });

  const token = issueToken(user.id, user.role, user.tokenVersion ?? 1);

  req.session!.save((err) => {
    if (err) { res.status(500).json({ error: "خطأ في حفظ الجلسة" }); return; }
    res.json({ token, user: userResponse(user) });
  });
});

// ── POST /api/auth/logout ─────────────────────────────────────────────────────
router.post("/auth/logout", async (req, res): Promise<void> => {
  const authHeader = req.headers.authorization;
  if (authHeader?.startsWith("Bearer ")) {
    const rawToken = authHeader.slice(7);
    try {
      const payload = jwt.verify(rawToken, JWT_SECRET) as JwtPayload & { exp?: number };
      await revokeVerifiedToken(rawToken, payload.exp);
    } catch { /* invalid/expired token — skip blocklist */ }
  }
  req.session!.destroy(() => { res.json({ success: true, message: "تم تسجيل الخروج" }); });
});

// ── GET /api/auth/me ──────────────────────────────────────────────────────────
router.get("/auth/me", requireAuth, async (req, res): Promise<void> => {
  const [user] = await db.select().from(usersTable).where(eq(usersTable.id, (req as any).userId));
  if (!user) { res.status(401).json({ error: "غير مصرح" }); return; }
  res.json(userResponse(user));
});

// ── POST /api/auth/refresh ────────────────────────────────────────────────────
router.post("/auth/refresh", requireAuth, async (req, res): Promise<void> => {
  const [user] = await db.select().from(usersTable).where(eq(usersTable.id, req.userId!));
  if (!user || !user.isActive) {
    res.status(401).json({ error: "غير مصرح" });
    return;
  }

  // Revoke the old token before issuing a new one
  const authHeader = req.headers.authorization;
  if (authHeader?.startsWith("Bearer ")) {
    const rawToken = authHeader.slice(7);
    try {
      const payload = jwt.verify(rawToken, JWT_SECRET) as JwtPayload & { exp?: number };
      await revokeVerifiedToken(rawToken, payload.exp);
    } catch { /* skip gracefully */ }
  }

  // Issue a fresh JWT
  const token = issueToken(user.id, user.role, user.tokenVersion ?? 1);
  res.json({ token });
});

// ── POST /api/auth/forgot-password ───────────────────────────────────────────
router.post("/auth/forgot-password", async (req, res): Promise<void> => {
  res.json({ success: true }); // Always 200 to avoid leaking email existence

  const { email } = req.body ?? {};
  if (!email || typeof email !== "string") return;

  const [user] = await db.select().from(usersTable)
    .where(eq(usersTable.email, email.toLowerCase().trim()));
  if (!user) return;

  const token = crypto.randomBytes(32).toString("hex");
  const expiresAt = new Date(Date.now() + 60 * 60 * 1000);
  await db.insert(passwordResetTokensTable).values({ userId: user.id, token, expiresAt });

  // In the development preview, keep reset links on the same preview host.
  // FRONTEND_URL may intentionally point at production, which would show
  // Replit's private-app page when a developer requests a reset locally.
  const forwardedProto = req.get("x-forwarded-proto")?.split(",")[0]?.trim();
  const forwardedHost = req.get("x-forwarded-host")?.split(",")[0]?.trim();
  const requestOrigin = (forwardedHost || req.get("host"))
    ? `${forwardedProto || req.protocol}://${forwardedHost || req.get("host")}`
    : null;
  const frontendBaseUrl = process.env.NODE_ENV === "development"
    ? (requestOrigin || process.env.FRONTEND_URL || "https://rabablegal.com")
    : (process.env.FRONTEND_URL || "https://rabablegal.com");
  const resetUrl = `${frontendBaseUrl.replace(/\/$/, "")}/reset-password?token=${token}`;
  await sendEmail({
    to: user.email,
    subject: "إعادة تعيين كلمة المرور — رباب",
    html: `
      <div dir="rtl" style="font-family:Arial,sans-serif;max-width:600px;margin:auto;padding:24px;background:#f9f9f9;border-radius:8px;">
        <h2 style="color:#1a2e5a;">إعادة تعيين كلمة المرور</h2>
        <p>مرحباً ${user.name}،</p>
        <p>اضغط على الزر أدناه لإعادة التعيين — الرابط صالح ساعة واحدة:</p>
        <div style="text-align:center;margin:32px 0;">
          <a href="${resetUrl}" style="background:#d4a017;color:#fff;padding:14px 32px;border-radius:8px;text-decoration:none;font-weight:bold;font-size:16px;">إعادة تعيين كلمة المرور</a>
        </div>
        <p style="color:#666;font-size:13px;">إذا لم تطلب ذلك، تجاهل هذه الرسالة.</p>
      </div>`,
    text: `رابط إعادة تعيين كلمة المرور (صالح ساعة واحدة):\n${resetUrl}`,
  });
});

// ── POST /api/auth/reset-password ────────────────────────────────────────────
router.post("/auth/reset-password", async (req, res): Promise<void> => {
  const { token, password } = req.body ?? {};
  if (!token || !password || typeof token !== "string" || typeof password !== "string") {
    res.status(400).json({ error: "بيانات غير صحيحة" });
    return;
  }
  if (password.length < 8) {
    res.status(400).json({ error: "كلمة المرور يجب أن تكون 8 أحرف على الأقل" });
    return;
  }

  const [record] = await db.select().from(passwordResetTokensTable)
    .where(and(
      eq(passwordResetTokensTable.token, token),
      gt(passwordResetTokensTable.expiresAt, new Date()),
      isNull(passwordResetTokensTable.usedAt),
    ));

  if (!record) {
    res.status(400).json({ error: "الرابط منتهي الصلاحية أو سبق استخدامه" });
    return;
  }

  const passwordHash = await bcryptjs.hash(password, 12);
  await db.update(usersTable).set({ passwordHash }).where(eq(usersTable.id, record.userId));
  await db.update(passwordResetTokensTable).set({ usedAt: new Date() }).where(eq(passwordResetTokensTable.id, record.id));

  res.json({ success: true });
});

// ── PATCH /api/auth/me/update ─────────────────────────────────────────────────
router.patch("/auth/me/update", requireAuth, async (req, res): Promise<void> => {
  const parsed = UpdateMeBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const updates: Partial<typeof usersTable.$inferInsert> = {};
  if (parsed.data.name)  updates.name  = parsed.data.name;
  if (parsed.data.phone) updates.phone = parsed.data.phone;
  if (parsed.data.email) updates.email = parsed.data.email;

  const [user] = await db.update(usersTable).set(updates).where(eq(usersTable.id, (req as any).userId)).returning();
  if (!user) { res.status(404).json({ error: "المستخدم غير موجود" }); return; }
  res.json(userResponse(user));
});

// ── POST /api/auth/dev-login ──────────────────────────────────────────────────
// Dev-only shortcut: instantly log in as admin or a regular user without OTP.
// BLOCKED in production (NODE_ENV === "production").
router.post("/auth/dev-login", async (req, res): Promise<void> => {
  if (process.env.NODE_ENV === "production") {
    res.status(404).json({ error: "Not found" });
    return;
  }

  const role = (req.body?.role as string) ?? "admin";

  // Find the first matching user by role
  const [user] = await db
    .select()
    .from(usersTable)
    .where(eq(usersTable.role, role === "admin" ? "admin" : "user"))
    .limit(1);

  if (!user) {
    res.status(404).json({ error: `لا يوجد مستخدم بدور: ${role}` });
    return;
  }

  req.session!.userId   = user.id;
  req.session!.userRole = user.role;

  const token = issueToken(user.id, user.role, user.tokenVersion ?? 1);

  req.session!.save((err) => {
    if (err) { res.status(500).json({ error: "خطأ في حفظ الجلسة" }); return; }
    res.json({ token, user: userResponse(user) });
  });
});

export default router;
