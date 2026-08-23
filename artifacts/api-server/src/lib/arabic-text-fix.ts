/**
 * Arabic Text Quality & Direction Fix
 * ─────────────────────────────────────
 * Addresses two distinct PDF extraction problems:
 *
 * Problem A — Character-reversed text (old issue, partially fixed):
 *   Stored:  "نأ زوجي لا عيقوت ةبوقع ةيئازج"
 *   Correct: "جزائية عقوبة توقيع لا يجوز أن"
 *   Cause: PDF.js reads visual LTR stream, reversing individual characters.
 *   Fix: character-level reversal per line.
 *
 * Problem B — Word-order-reversed text (new issue):
 *   Stored:  "أو لغة لأي ترجمته أو الشرح من جزء أي طبع يجوز ولا محفوظة، والنشر الطبع حقوق جميع"
 *   Correct: "جميع حقوق الطبع والنشر محفوظة، ولا يجوز طبع أي جزء من الشرح أو ترجمته لأي لغة أو"
 *   Cause: PDF.js picks up RTL words in left-to-right visual order; each word's
 *          characters are intact but the word sequence within the line is reversed.
 *   Fix: token-sequence reversal per line (keep characters, reverse word order).
 */

// ─── Detection helpers ─────────────────────────────────────────────────────────

const FORWARD_WORDS = new Set([
  'في', 'من', 'على', 'إلى', 'أن', 'أو', 'كان', 'حتى', 'بين', 'لقد',
  'وقد', 'كما', 'وفق', 'بعد', 'قبل', 'عند', 'لدى', 'نحو', 'مع', 'عن',
  'لا', 'إلا', 'لكن', 'بل', 'هذا', 'هذه', 'ذلك', 'التي', 'الذي',
]);

const REVERSED_WORDS = new Set(
  [...FORWARD_WORDS].map(w => [...w].reverse().join(''))
);

/**
 * Connectors / particles that should NOT end an Arabic sentence/line.
 * Their presence at line-ends is a strong signal of word-order reversal.
 */
const DANGLING_END_CONNECTORS = new Set([
  'أو', 'و', 'من', 'في', 'على', 'إلى', 'أن', 'لأي', 'لأن',
  'ثم', 'بل', 'لكن', 'حتى', 'عن', 'مع', 'هو', 'هي',
]);

// ─── Detection A: character-reversed text ──────────────────────────────────────

export function isReversedArabic(text: string): boolean {
  const arabicChars = (text.match(/[\u0600-\u06FF]/g) ?? []).length;
  if (arabicChars < 15) return false;

  let reversedScore = 0;
  let forwardScore  = 0;

  // Signal 1: Ta marbuta (ة) position
  const taAtEnd   = (text.match(/[\u0600-\u06FE]ة(?:\s|[,.،؛:!؟\n]|$)/g) ?? []).length;
  const taAtStart = (text.match(/(?:^|\s|[,.،؛:!؟])ة[\u0600-\u06FE]/g) ?? []).length;
  reversedScore += taAtStart * 3;
  forwardScore  += taAtEnd   * 3;

  // Signal 2: Function word presence
  const wordBoundary = /(?:^|\s|[,.،؛:!؟()])([ء-ي]+)(?:\s|[,.،؛:!؟()]|$)/g;
  let m: RegExpExecArray | null;
  while ((m = wordBoundary.exec(text)) !== null) {
    const w = m[1];
    if (REVERSED_WORDS.has(w)) reversedScore += 2;
    if (FORWARD_WORDS.has(w))  forwardScore  += 2;
  }

  // Signal 3: Hijri year plausibility
  const years = text.match(/\d{4}هـ/g) ?? [];
  for (const yr of years) {
    const y = parseInt(yr);
    if (y >= 1300 && y <= 1460) forwardScore  += 2;
    else                        reversedScore  += 2;
  }

  if (reversedScore + forwardScore === 0) return false;
  return reversedScore >= 4 && reversedScore > forwardScore * 0.8;
}

// ─── Detection B: word-order-reversed text ────────────────────────────────────

/**
 * Detect lines where individual Arabic words are correct but their sequence
 * within each line is reversed (RTL content extracted in LTR visual order).
 *
 * Signals:
 *  1. Lines frequently END with connectors/prepositions that shouldn't end lines.
 *  2. Individual words pass as valid Arabic (characters are not scrambled).
 *  3. The text is NOT already character-reversed (different problem).
 */
export function isWordOrderReversed(text: string): boolean {
  // If already character-reversed, that's a different problem
  if (isReversedArabic(text)) return false;

  const arabicChars = (text.match(/[\u0600-\u06FF]/g) ?? []).length;
  if (arabicChars < 30) return false;

  const lines = text.split('\n')
    .map(l => l.trim())
    .filter(l => (l.match(/[\u0600-\u06FF]/g) ?? []).length >= 5);

  if (lines.length < 2) return false;

  let reversalScore = 0;
  let judgedLineCount = 0;

  // Words that almost never legitimately start an independent Arabic line
  const ORPHAN_LINE_STARTERS = new Set(['أو', 'ثم', 'لأي', 'لأن', 'بل']);

  for (const line of lines) {
    const tokens = line.split(/\s+/).filter(t => t.length > 0);
    if (tokens.length < 3) continue; // too short to judge
    judgedLineCount++;

    // Signal A: line ENDS with a dangling connector (weight 2)
    const lastToken = tokens[tokens.length - 1].replace(/[،.؛:!؟,()«»"]/g, '');
    if (DANGLING_END_CONNECTORS.has(lastToken)) reversalScore += 2;

    // Signal B: line STARTS with an orphan connector (weight 1)
    const firstToken = tokens[0].replace(/[،.؛:!؟,()«»"]/g, '');
    if (ORPHAN_LINE_STARTERS.has(firstToken)) reversalScore += 1;
  }

  if (judgedLineCount < 2) return false;

  // Threshold: combined score ≥ 0.6 per line → word-order reversed
  return reversalScore / judgedLineCount >= 0.60;
}

// ─── Fix A: character reversal ────────────────────────────────────────────────

function reverseLine(line: string): string {
  return [...line].reverse().join('');
}

// ─── Fix B: word-order reversal ───────────────────────────────────────────────

/**
 * Reverse the sequence of word-tokens within a line, preserving spacing.
 * Numbers and punctuation stay attached to their word token.
 */
function reverseWordOrder(line: string): string {
  // Split into [word, space, word, space, ...] segments
  const parts = line.split(/(\s+)/);
  const words: string[]  = [];
  const spaces: string[] = [];

  for (const p of parts) {
    if (/^\s+$/.test(p)) spaces.push(p);
    else if (p.length > 0) words.push(p);
  }

  words.reverse();

  // Re-weave words with original spacing
  const result: string[] = [];
  for (let i = 0; i < words.length; i++) {
    result.push(words[i]);
    if (i < spaces.length) result.push(spaces[i]);
  }
  return result.join('');
}

// ─── Combined direction fix ───────────────────────────────────────────────────

/**
 * Fix reversed Arabic text direction.
 * Processes paragraph by paragraph.
 * Detects WHICH type of reversal is present and applies the right fix:
 *   - Character-reversed  → character-level reversal per line
 *   - Word-order-reversed → token-sequence reversal per line
 *   - Already correct     → no change
 */
export function fixArabicTextDirection(text: string): string {
  if (!text || text.length < 20) return text;

  const paragraphs = text.split(/\n{2,}/);

  return paragraphs.map(para => {
    if (!para.trim()) return para;

    const arabicChars = (para.match(/[\u0600-\u06FF]/g) ?? []).length;
    if (arabicChars < 10) return para;

    // Check character-reversal first (most severe)
    if (isReversedArabic(para)) {
      return para
        .split('\n')
        .map(line => {
          const lineAr = (line.match(/[\u0600-\u06FF]/g) ?? []).length;
          return lineAr >= 3 ? reverseLine(line) : line;
        })
        .join('\n');
    }

    // Check word-order reversal
    if (isWordOrderReversed(para)) {
      return para
        .split('\n')
        .map(line => {
          const lineAr = (line.match(/[\u0600-\u06FF]/g) ?? []).length;
          return lineAr >= 3 ? reverseWordOrder(line) : line;
        })
        .join('\n');
    }

    return para; // already correct
  }).join('\n\n');
}

// ─── Non-legal page detection ──────────────────────────────────────────────────

/** Patterns that indicate a page has no legal content value */
const COPYRIGHT_PATTERNS = [
  /حقوق الطبع/,
  /جميع الحقوق محفوظة/,
  /رقم الإيداع/,
  /\bISBN\b/i,
  /\bISSN\b/i,
  /الطبعة (الأولى|الثانية|الثالثة|الرابعة|الخامسة|السادسة)/,
  /حق المؤلف/,
  /دار النشر/,
  /للنشر والتوزيع/,
  /محفوظة للناشر/,
  /يُمنع إعادة الطباعة/,
  /لا يجوز إعادة طبع/,
  /لا يجوز.*طبع.*لأي لغة/,
  /يجوز طبع.*لأي لغة/,
  /Printed in/i,
];

const DEDICATION_PATTERNS = [
  /^إهداء/m,
  /أهدي هذا/,
  /أقدم هذا العمل/,
  /إلى روح (والدي|والدتي)/,
  /مهداة إلى/,
];

const ACKNOWLEDGMENT_PATTERNS = [
  /شكر وتقدير/,
  /شكر وعرفان/,
  /الشكر والتقدير/,
  /أتقدم بالشكر/,
  /أتوجه بالشكر/,
];

/**
 * Determine if a PDF page should be excluded from legal indexing.
 *
 * @param text       Extracted text of the page
 * @param pageNum    1-based page number (optional)
 * @param totalPages Total pages in document (optional)
 */
export function isNonLegalPage(
  text: string,
  pageNum?: number,
  totalPages?: number,
): { skip: boolean; reason: string } {
  const clean = text.trim();

  // Empty pages
  if (!clean || clean.length < 5) {
    return { skip: true, reason: 'صفحة فارغة' };
  }

  const arabicChars = (clean.match(/[\u0600-\u06FF]/g) ?? []).length;

  // Extremely short pages (< 80 Arabic chars) in first 10% of document = cover/separator
  if (arabicChars < 80) {
    const isEarlyPage = !pageNum || !totalPages || pageNum <= Math.max(3, Math.ceil(totalPages * 0.10));
    if (isEarlyPage) {
      return { skip: true, reason: `صفحة غير محتوى (${arabicChars} حرف فقط)` };
    }
  }

  // Copyright page — require 2+ signals OR 1 signal with low text
  const copyrightMatches = COPYRIGHT_PATTERNS.filter(p => p.test(clean));
  if (copyrightMatches.length >= 2) {
    return { skip: true, reason: 'صفحة حقوق الطبع والنشر' };
  }
  if (copyrightMatches.length === 1 && arabicChars < 250) {
    return { skip: true, reason: 'صفحة حقوق النشر' };
  }

  // Dedication page (short page with dedication phrases)
  if (DEDICATION_PATTERNS.some(p => p.test(clean)) && arabicChars < 350) {
    return { skip: true, reason: 'صفحة الإهداء' };
  }

  // Acknowledgment page
  if (ACKNOWLEDGMENT_PATTERNS.some(p => p.test(clean)) && arabicChars < 700) {
    return { skip: true, reason: 'صفحة شكر وتقدير' };
  }

  return { skip: false, reason: '' };
}

// ─── Numeral normalization ────────────────────────────────────────────────────

export function normalizeArabicNumerals(text: string): string {
  return text
    .replace(/[٠-٩]/g, d => String(d.charCodeAt(0) - 0x0660))
    .replace(/[۰-۹]/g, d => String(d.charCodeAt(0) - 0x06F0));
}

// ─── Date validation ──────────────────────────────────────────────────────────

const HIJRI_MIN = 1300;
const HIJRI_MAX = 1460;

export interface DateValidation {
  raw: string;
  year: number;
  valid: boolean;
  note?: string;
}

export function validateHijriDates(text: string): DateValidation[] {
  const results: DateValidation[] = [];
  const pattern = /\b(\d{4})هـ\b/g;
  let m: RegExpExecArray | null;
  while ((m = pattern.exec(text)) !== null) {
    const year = parseInt(m[1]);
    results.push({
      raw: m[0],
      year,
      valid: year >= HIJRI_MIN && year <= HIJRI_MAX,
      note: year < HIJRI_MIN || year > HIJRI_MAX
        ? `خارج النطاق المتوقع (${HIJRI_MIN}–${HIJRI_MAX}هـ) — يُرجح أن يكون مشوّهاً`
        : undefined,
    });
  }
  return results;
}

// ─── Comprehensive quality assessment ────────────────────────────────────────

export interface QualityResult {
  passed: boolean;
  score: number;
  reasons: string[];
  category: 'pass' | 'reversed' | 'word_order_reversed' | 'presentation_forms' | 'low_density' | 'toc_suspected' | 'too_short';
}

export function assessChunkQuality(text: string): QualityResult {
  const reasons: string[] = [];
  const nonSpace   = text.replace(/\s/g, '');
  const totalChars = nonSpace.length;
  const arabicChars = (text.match(/[\u0600-\u06FF]/g) ?? []).length;

  // Hard stop: too short
  if (totalChars < 30 || arabicChars < 20) {
    return { passed: false, score: 0, reasons: ['نص قصير جداً — أقل من الحد الأدنى'], category: 'too_short' };
  }

  // Hard stop: character-reversed Arabic
  if (isReversedArabic(text)) {
    return {
      passed: false,
      score: 5,
      reasons: ['نص عربي معكوس الحروف — يجب إعادة استخراجه من الملف الأصلي'],
      category: 'reversed',
    };
  }

  // Hard stop: word-order-reversed Arabic
  if (isWordOrderReversed(text)) {
    return {
      passed: false,
      score: 5,
      reasons: ['ترتيب كلمات معكوس — السطور تُقرأ من اليسار لليمين بدلاً من اليمين لليسار'],
      category: 'word_order_reversed',
    };
  }

  let deductions = 0;

  // Arabic Presentation Forms
  const presentationForms = (text.match(/[\uFB50-\uFDFF\uFE70-\uFEFF]/g) ?? []).length;
  if (presentationForms > 5) {
    deductions += 70;
    reasons.push(`أحرف OCR تالفة (Arabic Presentation Forms): ${presentationForms} حرف`);
    return { passed: false, score: Math.max(0, 100 - deductions), reasons, category: 'presentation_forms' };
  } else if (presentationForms > 0) {
    deductions += presentationForms * 5;
    reasons.push(`بعض أحرف OCR تالفة: ${presentationForms} حرف`);
  }

  // Arabic character density
  const arabicRatio = totalChars > 0 ? arabicChars / totalChars : 0;
  if (arabicRatio < 0.25) {
    deductions += 55;
    reasons.push(`كثافة الأحرف العربية منخفضة جداً: ${Math.round(arabicRatio * 100)}%`);
  } else if (arabicRatio < 0.35) {
    deductions += 25;
    reasons.push(`كثافة الأحرف العربية متوسطة: ${Math.round(arabicRatio * 100)}%`);
  }

  // Minimum Arabic character count
  if (arabicChars < 50) {
    deductions += 30;
    reasons.push(`عدد الأحرف العربية قليل جداً: ${arabicChars} حرف`);
  }

  // Invalid Hijri dates
  const hijriDates = validateHijriDates(text);
  const badDates   = hijriDates.filter(d => !d.valid);
  if (badDates.length > 0) {
    const penalty = Math.min(badDates.length * 15, 40);
    deductions += penalty;
    reasons.push(`تواريخ هجرية مشبوهة (${badDates.length}): ${badDates.map(d => d.raw).join('، ')}`);
  }

  // Unrecognized character ratio
  const recognised = (text.match(/[\u0600-\u06FF\u0020-\u007E\s\n\r]/g) ?? []).length;
  const unrecognisedRatio = totalChars > 0 ? (totalChars - recognised) / totalChars : 0;
  if (unrecognisedRatio > 0.20) {
    deductions += 40;
    reasons.push(`نسبة أحرف غير معروفة مرتفعة: ${Math.round(unrecognisedRatio * 100)}%`);
  } else if (unrecognisedRatio > 0.10) {
    deductions += 15;
    reasons.push(`بعض الأحرف غير المعروفة: ${Math.round(unrecognisedRatio * 100)}%`);
  }

  const score = Math.max(0, 100 - deductions);
  const passed = score >= 50 && deductions < 55;

  return { passed, score, reasons, category: passed ? 'pass' : 'low_density' };
}

// ─── Kashida stripping ────────────────────────────────────────────────────────

/**
 * Strip kashida / tatweel (U+0640) from Arabic text.
 * Kashida is a visual stretching character with no semantic value.
 * It inflates word lengths and breaks search matching.
 */
export function stripKashida(text: string): string {
  return text.replace(/\u0640/g, '');
}

// ─── Full document text preprocessing ────────────────────────────────────────

export function preprocessExtractedText(rawText: string): {
  text: string;
  wasReversed: boolean;
  wasWordOrderReversed: boolean;
  stats: { charsBefore: number; charsAfter: number };
} {
  const charsBefore = rawText.length;

  // Step 1: Strip kashida (tatweel) — semantic-free stretching character
  let text = stripKashida(rawText);

  // Step 2: Normalize numerals
  text = normalizeArabicNumerals(text);

  // Step 3: Detect and fix direction issues
  const sample = text.slice(0, 2000);
  const wasReversed = isReversedArabic(sample);
  const wasWordOrderReversed = !wasReversed && isWordOrderReversed(sample);

  text = fixArabicTextDirection(text);

  // Step 4: Normalize whitespace
  text = text.replace(/\r\n/g, '\n').replace(/\n{4,}/g, '\n\n').trim();

  return { text, wasReversed, wasWordOrderReversed, stats: { charsBefore, charsAfter: text.length } };
}

// ─── Batch document quality scanner ──────────────────────────────────────────

export interface DocumentQualityScan {
  hasIssue: boolean;
  category: QualityResult['category'];
  score: number;
  reasons: string[];
  sampleText: string; // first 200 chars for admin display
}

/**
 * Scan a text sample (e.g. first chunks of a document) for quality issues.
 * Used by the admin batch-check endpoint to identify reversed/corrupted docs.
 */
export function scanDocumentQuality(text: string): DocumentQualityScan {
  const result = assessChunkQuality(text);
  return {
    hasIssue: !result.passed,
    category: result.category,
    score: result.score,
    reasons: result.reasons,
    sampleText: text.slice(0, 200).replace(/\n/g, ' '),
  };
}
