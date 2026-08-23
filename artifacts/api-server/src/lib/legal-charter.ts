/**
 * legal-charter.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * يقرأ ميثاق التشغيل القانوني من الملف النصي ويُخزّنه في الذاكرة.
 * يُعاد إرسال الميثاق كرسالة system مع كل استدعاء OpenAI دون استثناء.
 *
 * الملف المصدري: artifacts/api-server/prompts/legal_system_prompt.md
 * لتعديل الميثاق: عدِّل الملف المذكور فقط — لا تعديل في الكود.
 */

import { readFileSync, existsSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));

// ── خريطة أنواع المهام إلى ملفات الملحقات ──────────────────────────────────
const SERVICE_MODULE_MAP: Record<string, string> = {
  consultation:      "01_consultation_legal.md",
  judicial:          "02_consultation_judicial.md",
  case_management:   "03_case_management.md",
  pleadings:         "04_pleadings.md",
  judgment_analysis: "05_judgment_analysis.md",
  contract_draft:    "06_contracts.md",
  contract_review:   "06_contracts.md",
  research:          "07_research.md",
};

const _moduleCache = new Map<string, string | null>();

/**
 * يُحمِّل ملحق تعليمات الخدمة المناسب بحسب نوع المهمة.
 * يُعيد null إذا كان الملف غير موجود أو فارغاً (graceful fallback).
 */
export function loadServiceModule(taskType: string | null): string | null {
  if (!taskType) return null;
  const fileName = SERVICE_MODULE_MAP[taskType];
  if (!fileName) return null;

  if (_moduleCache.has(taskType)) return _moduleCache.get(taskType) ?? null;

  try {
    const filePath = join(__dirname, "../../prompts/modules", fileName);
    if (!existsSync(filePath)) { _moduleCache.set(taskType, null); return null; }
    const content = readFileSync(filePath, "utf-8").trim();
    // لا تُضف محتوى placeholder فارغاً — فقط الملحقات المؤلَّفة فعلاً
    const useful = content && !content.startsWith("# ملحق خدمة — قيد التحرير");
    const value = useful ? content : null;
    _moduleCache.set(taskType, value);
    return value;
  } catch {
    _moduleCache.set(taskType, null);
    return null;
  }
}

let _charter: string | null = null;

/** يُعيد نص الميثاق من الذاكرة (يُحمَّل من الملف عند أول طلب). */
export function getLegalCharter(): string {
  if (!_charter) {
    const filePath = join(__dirname, "../../prompts/legal_system_prompt.md");
    _charter = readFileSync(filePath, "utf-8").trim();
  }
  return _charter;
}

/** رسالة system جاهزة للإدراج كأول عنصر في مصفوفة messages. */
export function charterSystemMsg(): { role: "system"; content: string } {
  return { role: "system" as const, content: getLegalCharter() };
}

/**
 * تُدمج رسالة الميثاق مع مصفوفة رسائل موجودة.
 * تضع الميثاق دائماً في المقدمة — قبل أي system message آخر.
 */
export function prependCharter(
  messages: Array<{ role: string; content: string }>
): Array<{ role: string; content: string }> {
  return [charterSystemMsg(), ...messages];
}
