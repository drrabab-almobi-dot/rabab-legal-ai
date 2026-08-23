/**
 * telegram-notify.ts
 * إشعارات Telegram للمدير — تُستخدم لإرسال تنبيهات فورية دون الحاجة إلى
 * استيراد telegram-bot.ts الكامل (لتجنب الاعتماد الدائري).
 *
 * المتغيرات البيئية المطلوبة:
 *   TELEGRAM_BOT_TOKEN              — رمز البوت
 *   TELEGRAM_ADMIN_ID               — معرّف المدير الرقمي (chat_id)
 *   CITATION_NOTIFY_COOLDOWN_HOURS  — مدة الهدنة بين إشعارَي استشهاد (افتراضي: 4 ساعات)
 */

import fs from "node:fs";
import path from "node:path";
import { logger } from "./logger.js";

// ─── ملف حالة إشعارات الاستشهاد ──────────────────────────────────────────────

const LOCAL_DIR = path.resolve(".local");
const CITATION_STATE_FILE = path.join(LOCAL_DIR, "citation_notify_state.json");

interface CitationNotifyState {
  suspiciousCitations?: string; // ISO timestamp آخر إرسال
  cleanedCitations?: string;
  needsReview?: string;
}

function readCitationState(): CitationNotifyState {
  try {
    const raw = fs.readFileSync(CITATION_STATE_FILE, "utf8");
    return JSON.parse(raw) as CitationNotifyState;
  } catch {
    return {};
  }
}

/**
 * يكتب مفتاحاً واحداً في ملف الحالة مع إعادة قراءة الملف لحظة الكتابة
 * لتفادي مشكلة last-writer-wins عند الاستدعاء المتزامن.
 */
function setCitationStateKey(
  key: keyof CitationNotifyState,
  value: string,
): void {
  try {
    fs.mkdirSync(LOCAL_DIR, { recursive: true });
    // أعِد القراءة مباشرةً قبل الكتابة لدمج أي تحديثات متزامنة
    const latest = readCitationState();
    latest[key] = value;
    fs.writeFileSync(CITATION_STATE_FILE, JSON.stringify(latest, null, 2));
  } catch (err: any) {
    logger.warn(
      { err: err?.message },
      "telegram-notify: تعذّر حفظ حالة إشعار الاستشهاد",
    );
  }
}

/**
 * تحقّق ما إذا كان يجب تخطّي الإشعار بسبب إشعار سابق لم تنقضِ مهلته بعد.
 * تُعيد true إذا كان يجب التخطّي.
 */
function shouldSkipDueToDedup(
  key: keyof CitationNotifyState,
  state: CitationNotifyState,
): boolean {
  const lastSentRaw = state[key];
  if (!lastSentRaw) return false;

  const cooldownHours = Math.max(
    0,
    parseFloat(process.env.CITATION_NOTIFY_COOLDOWN_HOURS ?? "4") || 4,
  );
  const cooldownMs = cooldownHours * 60 * 60 * 1000;
  const elapsed = Date.now() - new Date(lastSentRaw).getTime();

  if (elapsed < cooldownMs) {
    const remainingMin = Math.ceil((cooldownMs - elapsed) / 60_000);
    logger.info(
      { key, remainingMin },
      "telegram-notify: تخطّي الإشعار — لم تنقضِ مهلة التهدئة بعد",
    );
    return true;
  }
  return false;
}

// ─── مساعد هروب HTML ─────────────────────────────────────────────────────────

/** تهرب الأحرف الخاصة في HTML لمنع كسر parse_mode أو حقن وسوم */
function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

// ─── إرسال الرسائل ────────────────────────────────────────────────────────────

function getAdminChatId(): number | null {
  const raw = process.env.TELEGRAM_ADMIN_ID?.trim();
  if (!raw) return null;
  const n = parseInt(raw, 10);
  return isNaN(n) ? null : n;
}

/**
 * أرسل رسالة نصية مباشرةً عبر Telegram Bot API (بدون مكتبة خارجية).
 * تُعيد false بصمت إذا كانت الإعدادات غير مكتملة أو فشل الإرسال.
 */
async function sendTelegramMessage(text: string): Promise<boolean> {
  const token = process.env.TELEGRAM_BOT_TOKEN?.trim();
  const chatId = getAdminChatId();

  if (!token || !chatId) {
    logger.warn(
      "telegram-notify: TELEGRAM_BOT_TOKEN أو TELEGRAM_ADMIN_ID غير مضبوط — تم تخطّي الإشعار",
    );
    return false;
  }

  try {
    const res = await fetch(
      `https://api.telegram.org/bot${token}/sendMessage`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          chat_id: chatId,
          text,
          parse_mode: "HTML",
          disable_web_page_preview: true,
        }),
        signal: AbortSignal.timeout(10_000),
      },
    );

    if (!res.ok) {
      const body = await res.text().catch(() => "");
      logger.warn({ status: res.status, body }, "telegram-notify: فشل إرسال الإشعار");
      return false;
    }
    return true;
  } catch (err: any) {
    logger.warn({ err: err?.message }, "telegram-notify: خطأ في إرسال الإشعار");
    return false;
  }
}

// ─── الإشعارات المُصدَّرة ─────────────────────────────────────────────────────

/**
 * أرسل تنبيهاً للمدير عند اكتشاف حقول استشهاد مشبوهة بعد دورة extract-all-metadata.
 *
 * @param rejectedFields  إجمالي عدد الحقول المرفوضة في هذه الدورة
 * @param affectedDocs    عدد الوثائق التي رُفض لها حقل واحد على الأقل
 * @param totalProcessed  إجمالي الوثائق التي جرى فحصها
 */
export async function notifyAdminSuspiciousCitations(
  rejectedFields: number,
  affectedDocs: number,
  totalProcessed: number,
): Promise<void> {
  if (rejectedFields <= 0) return;

  const state = readCitationState();
  if (shouldSkipDueToDedup("suspiciousCitations", state)) return;

  const adminUrl = `${process.env.SITE_URL ?? "https://rabablegal.com"}/admin/knowledge-quality`;

  const message =
    `⚠️ <b>تنبيه: بيانات استشهاد مشبوهة</b>\n\n` +
    `اكتشف النظام بعد انتهاء دورة الاستخراج:\n` +
    `• <b>${rejectedFields}</b> حقل مرفوض\n` +
    `• <b>${affectedDocs}</b> وثيقة متأثرة (من أصل ${totalProcessed})\n\n` +
    `🔍 <a href="${adminUrl}">مراجعة جودة الاستشهاد في لوحة التحكم</a>`;

  const sent = await sendTelegramMessage(message);
  if (sent) {
    setCitationStateKey("suspiciousCitations", new Date().toISOString());
    logger.info(
      { rejectedFields, affectedDocs, totalProcessed },
      "telegram-notify: أُرسل تنبيه الاستشهاد المشبوه",
    );
  }
}

/**
 * أرسل تنبيهاً للمدير عند تنفيذ التنظيف التلقائي لبيانات الاستشهاد الفاسدة.
 *
 * @param cleanedCount    عدد الوثائق التي نُظِّفت بيانات الاستشهاد فيها
 * @param docNames        أسماء الوثائق المنظَّفة (عينة — بحد أقصى 10)
 * @param totalProcessed  إجمالي الوثائق التي جرى فحصها في هذه الدورة
 */
export async function notifyAdminCleanedCitations(
  cleanedCount: number,
  docNames: string[],
  totalProcessed: number,
): Promise<void> {
  if (cleanedCount <= 0) return;

  const state = readCitationState();
  if (shouldSkipDueToDedup("cleanedCitations", state)) return;

  const adminUrl = `${process.env.SITE_URL ?? "https://rabablegal.com"}/admin/citations`;

  // عرض عينة لا تتجاوز 10 أسماء
  const sample = docNames.slice(0, 10);
  const remaining = docNames.length - sample.length;
  const nameLines = sample.map((n) => `  • ${n}`).join("\n");
  const remainingLine =
    remaining > 0 ? `\n  … و<b>${remaining}</b> وثيقة أخرى` : "";

  const message =
    `🧹 <b>تنبيه: تنظيف تلقائي لبيانات الاستشهاد</b>\n\n` +
    `نُظِّفت بيانات الاستشهاد لـ <b>${cleanedCount}</b> وثيقة ` +
    `(فشلت جميع حقولها الجوهرية) من أصل ${totalProcessed} وثيقة مفحوصة.\n\n` +
    `<b>الوثائق المنظَّفة:</b>\n${nameLines}${remainingLine}\n\n` +
    `🔍 <a href="${adminUrl}">مراجعة الاستشهاد في لوحة التحكم</a>`;

  const sent = await sendTelegramMessage(message);
  if (sent) {
    setCitationStateKey("cleanedCitations", new Date().toISOString());
    logger.info(
      { cleanedCount, totalProcessed },
      "telegram-notify: أُرسل تنبيه التنظيف التلقائي للاستشهاد",
    );
  }
}

/**
 * أرسل تنبيهاً للمدير عند ارتفاع معدل الفشل في دورة extract-all-metadata.
 * يُرسَل الإشعار فقط إذا تجاوز عدد الوثائق الفاشلة 20% من الإجمالي.
 *
 * @param failedCount    عدد الوثائق التي فشل استخراج بياناتها كلياً
 * @param totalProcessed إجمالي الوثائق التي جرت محاولة معالجتها
 */
export async function notifyAdminHighFailureRate(
  failedCount: number,
  totalProcessed: number,
): Promise<void> {
  if (failedCount <= 0 || totalProcessed <= 0) return;

  const failureRate = failedCount / totalProcessed;
  if (failureRate <= 0.2) return; // أقل من أو يساوي 20% — لا حاجة لتنبيه

  const pct = Math.round(failureRate * 100);
  const adminUrl = `${process.env.SITE_URL ?? "https://rabablegal.com"}/admin/knowledge`;

  const message =
    `🚨 <b>تنبيه: معدل فشل مرتفع في استخراج البيانات</b>\n\n` +
    `اكتشف النظام بعد انتهاء دورة استخراج البيانات الأخيرة:\n` +
    `• <b>${failedCount}</b> وثيقة فشل استخراجها كلياً\n` +
    `• من إجمالي <b>${totalProcessed}</b> وثيقة (نسبة الفشل: <b>${pct}%</b>)\n\n` +
    `قد يشير ذلك إلى مشكلة في OpenAI API أو جودة النصوص المستخرجة.\n\n` +
    `🔍 <a href="${adminUrl}">مراجعة قاعدة المعرفة في لوحة التحكم</a>`;

  const sent = await sendTelegramMessage(message);
  if (sent) {
    logger.info(
      { failedCount, totalProcessed, pct },
      "telegram-notify: أُرسل تنبيه معدل الفشل المرتفع",
    );
  }
}

/**
 * أرسل تنبيهاً فورياً للمدير عند وصول رسالة جديدة من نموذج التواصل.
 *
 * @param name    اسم مُرسِل الرسالة
 * @param email   بريده الإلكتروني
 * @param message نص الرسالة
 */
export async function notifyAdminNewContactMessage(
  name: string,
  email: string,
  message: string,
): Promise<void> {
  const safeName    = escapeHtml(name);
  const safeEmail   = escapeHtml(email);
  const rawPreview  = message.length > 300 ? message.slice(0, 300) + "…" : message;
  const safeMessage = escapeHtml(rawPreview);
  const adminUrl    = `${process.env.SITE_URL ?? "https://rabablegal.com"}/admin/contact-messages`;

  const text =
    `📩 <b>رسالة تواصل جديدة</b>\n\n` +
    `👤 <b>الاسم:</b> ${safeName}\n` +
    `📧 <b>البريد:</b> ${safeEmail}\n\n` +
    `💬 <b>الرسالة:</b>\n${safeMessage}\n\n` +
    `🔗 <a href="${adminUrl}">عرض جميع الرسائل في لوحة التحكم</a>`;

  const sent = await sendTelegramMessage(text);
  if (sent) {
    logger.info({ name, email }, "telegram-notify: أُرسل تنبيه رسالة التواصل الجديدة");
  }
}

/**
 * أرسل تنبيهاً للمدير عند وجود وثائق ذات بيانات استشهاد تحتاج مراجعة بعد دورة extract-all-metadata.
 *
 * @param needsReviewCount  عدد الوثائق ذات needsReview: true
 * @param totalJudicial     إجمالي الوثائق القضائية ذات بيانات استشهاد
 */
export async function notifyAdminNeedsReview(
  needsReviewCount: number,
  totalJudicial: number,
): Promise<void> {
  if (needsReviewCount <= 0) return;

  const state = readCitationState();
  if (shouldSkipDueToDedup("needsReview", state)) return;

  const base = process.env.SITE_URL ?? "https://rabablegal.com";
  const adminUrl = `${base}/admin/knowledge-quality?citFilter=review`;

  const message =
    `🔍 <b>تنبيه: وثائق تحتاج مراجعة بيانات الاستشهاد</b>\n\n` +
    `بعد اكتمال دورة الاستخراج الأخيرة اكتُشف:\n` +
    `• <b>${needsReviewCount}</b> وثيقة ذات بيانات استشهاد مشبوهة\n` +
    `• من إجمالي ${totalJudicial} وثيقة قضائية لديها بيانات\n\n` +
    `🔗 <a href="${adminUrl}">مراجعة الوثائق المشبوهة مباشرةً</a>`;

  const sent = await sendTelegramMessage(message);
  if (sent) {
    setCitationStateKey("needsReview", new Date().toISOString());
    logger.info(
      { needsReviewCount, totalJudicial },
      "telegram-notify: أُرسل تنبيه needsReview",
    );
  }
}
