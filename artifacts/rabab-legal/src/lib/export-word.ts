/**
 * export-word.ts — تصدير Word (.docx) وPDF لمنصة RABAB LEGAL AI
 *
 * يدعم ثلاثة أنواع من المستندات:
 *   1. مذكرة قانونية (memo)  — ترويسة + فقرات مرقّمة + خانة توقيع + ملاحظات منفصلة
 *   2. عقد (contract)        — ترويسة + فهرس مبسّط + بنود مرقّمة
 *   3. استشارة (consultation) — محادثة بين المستخدم ورباب
 *
 * ضوابط إلزامية:
 *  • نقاط الضعف تُصدَّر في ملف «ملاحظات للمحامي» منفصل — لا تُدرج في المذكرة
 *  • [يُستكمل ...] و[يستكمل ...] تظهر بخط عريض ولون أحمر
 */

import {
  Document, Paragraph, TextRun, AlignmentType, Packer,
  Header, Footer, PageNumber,
  Table, TableRow, TableCell, WidthType, BorderStyle,
  convertInchesToTwip,
} from 'docx';

// ── ثوابت ─────────────────────────────────────────────────────────────────────
const FONT          = 'Arial';
const SIZE_BODY     = 24;   // 12pt  (half-points)
const SIZE_HEADING  = 28;   // 14pt
const SIZE_TITLE    = 36;   // 18pt
const SIZE_BRAND    = 22;   // 11pt
const SIZE_SMALL    = 18;   // 9pt
const COLOR_BRAND   = '1a1a2e';
const COLOR_ACCENT  = 'c8a96e';  // الذهبي
const COLOR_PH      = 'cc0000';  // placeholder — أحمر

// ── مساعدات ──────────────────────────────────────────────────────────────────

/** تاريخ اليوم بالعربية */
function todayAr(): string {
  return new Date().toLocaleDateString('ar-SA', {
    year: 'numeric', month: 'long', day: 'numeric',
  });
}

/** تقسيم نص يحتوي على علامات [يُستكمل...] إلى TextRun[] مع تمييز العلامات */
function parseRuns(text: string, size = SIZE_BODY): TextRun[] {
  if (!text) return [new TextRun({ text: '', font: FONT, size })];
  const PLACEHOLDER = /(\[(?:يُستكمل|يستكمل)[^\]]*\])/g;
  const parts = text.split(PLACEHOLDER);
  return parts
    .filter(p => p !== '')
    .map(part => {
      const isPlaceholder = /^\[(?:يُستكمل|يستكمل)/.test(part);
      if (isPlaceholder) {
        return new TextRun({ text: part, bold: true, color: COLOR_PH, font: FONT, size });
      }
      return new TextRun({ text: part, font: FONT, size });
    });
}

/** فقرة RTL */
function rtlPar(
  children: TextRun[],
  opts: { spacing?: number; bold?: boolean; size?: number; align?: typeof AlignmentType[keyof typeof AlignmentType]; indent?: number } = {},
): Paragraph {
  return new Paragraph({
    bidirectional: true,
    alignment: opts.align ?? AlignmentType.RIGHT,
    spacing: { after: opts.spacing ?? 160 },
    indent: opts.indent ? { right: opts.indent } : undefined,
    children,
  });
}

/** سطر نصي بسيط */
function rtlLine(text: string, opts: {
  size?: number; bold?: boolean; color?: string; align?: typeof AlignmentType[keyof typeof AlignmentType];
  spacing?: number; italic?: boolean;
} = {}): Paragraph {
  return rtlPar(
    [new TextRun({ text, font: FONT, size: opts.size ?? SIZE_BODY, bold: opts.bold, color: opts.color, italics: opts.italic })],
    { align: opts.align, spacing: opts.spacing },
  );
}

/** فاصل أفقي (فقرة فارغة بحجم صغير) */
function divider(): Paragraph {
  return rtlLine('────────────────────────────────', { size: SIZE_SMALL, color: 'd0c090', align: AlignmentType.CENTER, spacing: 100 });
}

/** فقرة فارغة */
function gap(size = SIZE_SMALL): Paragraph {
  return new Paragraph({ children: [new TextRun({ text: '', font: FONT, size })], spacing: { after: 120 } });
}

// ── ترويسة مشتركة ──────────────────────────────────────────────────────────────
function buildHeader(dateStr: string): Header {
  return new Header({
    children: [
      new Paragraph({
        bidirectional: true,
        alignment: AlignmentType.RIGHT,
        border: { bottom: { style: BorderStyle.SINGLE, size: 6, color: COLOR_ACCENT, space: 4 } },
        children: [
          new TextRun({ text: '⚖ رباب محاميتك الرقمية', bold: true, font: FONT, size: SIZE_BRAND, color: COLOR_BRAND }),
          new TextRun({ text: '   ·   RABAB LEGAL AI', font: FONT, size: SIZE_SMALL, color: '888888' }),
          new TextRun({ text: `   —   ${dateStr}`, font: FONT, size: SIZE_SMALL, color: '888888' }),
        ],
      }),
    ],
  });
}

/** تذييل بأرقام الصفحات */
function buildFooter(label = 'رباب محاميتك الرقمية'): Footer {
  return new Footer({
    children: [
      new Paragraph({
        bidirectional: true,
        alignment: AlignmentType.CENTER,
        border: { top: { style: BorderStyle.SINGLE, size: 4, color: 'ddccaa', space: 4 } },
        children: [
          new TextRun({ text: `${label}   |   صفحة `, font: FONT, size: SIZE_SMALL, color: '888888' }),
          new TextRun({ children: [PageNumber.CURRENT], font: FONT, size: SIZE_SMALL, color: '888888' }),
          new TextRun({ text: ' من ', font: FONT, size: SIZE_SMALL, color: '888888' }),
          new TextRun({ children: [PageNumber.TOTAL_PAGES], font: FONT, size: SIZE_SMALL, color: '888888' }),
        ],
      }),
    ],
  });
}

/** إعدادات الصفحة القياسية */
const PAGE_PROPS = {
  page: {
    margin: {
      top:    convertInchesToTwip(1.2),
      bottom: convertInchesToTwip(1.0),
      right:  convertInchesToTwip(1.0),  // يمين = هامش داخلي RTL
      left:   convertInchesToTwip(1.0),
    },
  },
};

// ─────────────────────────────────────────────────────────────────────────────
// 1. تصدير المذكرة القانونية
// ─────────────────────────────────────────────────────────────────────────────

export async function exportMemoWord(opts: {
  memoText: string;
  title?: string;
  weaknesses?: string[];
  hasCitations?: boolean;
}): Promise<void> {
  const { memoText, title = 'المذكرة القانونية', weaknesses = [], hasCitations } = opts;
  const dateStr = todayAr();

  // ── نص المذكرة: تقسيم إلى فقرات ──────────────────────────────────────────
  const rawParagraphs = memoText
    .split(/\n{2,}/)
    .map(p => p.trim())
    .filter(Boolean);

  let paraCounter = 0;
  const bodyChildren: Array<Paragraph | Table> = [];

  // تحذير إذا لم تكن هناك استشهادات
  if (hasCitations === false) {
    bodyChildren.push(
      rtlLine('⚠ مذكرة غير موثّقة بمصادر معتمدة — للاسترشاد فقط', {
        size: SIZE_BRAND, bold: true, color: 'aa6600', spacing: 200,
      }),
    );
  }

  bodyChildren.push(rtlLine('بسم الله الرحمن الرحيم', { align: AlignmentType.CENTER, size: SIZE_BRAND, bold: true, spacing: 120 }));
  bodyChildren.push(rtlLine(title, { align: AlignmentType.CENTER, size: SIZE_TITLE, bold: true, color: COLOR_BRAND, spacing: 200 }));
  bodyChildren.push(divider());
  bodyChildren.push(gap());

  for (const p of rawParagraphs) {
    // تحقق من أن الفقرة عنوان (قصيرة، تبدأ برقم أو تنتهي بنقطتين)
    const isHeading = p.length < 80 && (/^(المادة|البند|أولاً|ثانياً|ثالثاً|رابعاً|خامساً|\d+[\-.]|#{1,3}\s)/.test(p) || p.endsWith(':'));
    if (isHeading) {
      bodyChildren.push(rtlPar(parseRuns(p, SIZE_HEADING), { bold: true, spacing: 180 }));
    } else {
      paraCounter++;
      const numRun = new TextRun({ text: `${paraCounter}.  `, font: FONT, size: SIZE_BODY, bold: false, color: '888888' });
      const contentRuns = parseRuns(p);
      bodyChildren.push(rtlPar([numRun, ...contentRuns], { spacing: 180 }));
    }
    bodyChildren.push(gap(16));
  }

  // ── خانة التوقيع ──────────────────────────────────────────────────────────
  bodyChildren.push(gap(200));
  bodyChildren.push(divider());
  bodyChildren.push(rtlLine('خانة التوقيع', { bold: true, size: SIZE_HEADING, color: COLOR_BRAND, spacing: 160 }));

  const signatureTable = new Table({
    width: { size: 100, type: WidthType.PERCENTAGE },
    rows: [
      new TableRow({
        children: [
          new TableCell({
            width: { size: 33, type: WidthType.PERCENTAGE },
            children: [
              rtlLine('المحامي / المحامية:', { bold: true, size: SIZE_BRAND }),
              rtlLine('_________________________', { color: '999999', size: SIZE_BODY }),
            ],
          }),
          new TableCell({
            width: { size: 33, type: WidthType.PERCENTAGE },
            children: [
              rtlLine('التاريخ:', { bold: true, size: SIZE_BRAND }),
              rtlLine('_________________________', { color: '999999', size: SIZE_BODY }),
            ],
          }),
          new TableCell({
            width: { size: 34, type: WidthType.PERCENTAGE },
            children: [
              rtlLine('التوقيع:', { bold: true, size: SIZE_BRAND }),
              rtlLine('_________________________', { color: '999999', size: SIZE_BODY }),
            ],
          }),
        ],
      }),
    ],
  });
  bodyChildren.push(signatureTable);
  bodyChildren.push(gap());
  bodyChildren.push(
    rtlLine('هذه المذكرة أُعدّت بمساعدة الذكاء الاصطناعي — يُنصح بمراجعة محامٍ مرخّص قبل التقديم الرسمي.', {
      size: SIZE_SMALL, italic: true, color: '999999', align: AlignmentType.CENTER,
    }),
  );

  const doc = new Document({
    sections: [{
      properties: PAGE_PROPS,
      headers: { default: buildHeader(dateStr) },
      footers: { default: buildFooter() },
      children: bodyChildren,
    }],
  });

  const blob = await Packer.toBlob(doc);
  triggerDownload(blob, `مذكرة-قانونية-${new Date().toISOString().slice(0, 10)}.docx`);

  // ── ملف ملاحظات المحامي (منفصل — لا تُدرج في المذكرة أبداً) ───────────────
  if (weaknesses.length > 0) {
    const noteChildren: Paragraph[] = [
      rtlLine('بسم الله الرحمن الرحيم', { align: AlignmentType.CENTER, size: SIZE_BRAND, bold: true, spacing: 100 }),
      rtlLine('ملاحظات للمحامي — نقاط الضعف', {
        align: AlignmentType.CENTER, size: SIZE_TITLE, bold: true, color: 'aa0000', spacing: 200,
      }),
      rtlLine('⚠ هذا الملف مخصّص للمحامي فقط ولا يُسلَّم للموكّل', {
        size: SIZE_BRAND, color: 'cc6600', bold: true, spacing: 180,
      }),
      divider(),
      gap(),
    ];
    weaknesses.forEach((w, i) => {
      noteChildren.push(
        rtlPar(
          [new TextRun({ text: `${i + 1}. `, font: FONT, size: SIZE_BODY, bold: true, color: 'aa0000' }), ...parseRuns(w)],
          { spacing: 200 },
        ),
      );
    });
    noteChildren.push(gap());
    noteChildren.push(
      rtlLine('يُرجى التحقق من هذه النقاط ومعالجتها قبل رفع المذكرة للجهة القضائية.', {
        size: SIZE_BRAND, italic: true, color: '666666', align: AlignmentType.CENTER,
      }),
    );

    const notesDoc = new Document({
      sections: [{
        properties: PAGE_PROPS,
        headers: { default: buildHeader(dateStr) },
        footers: { default: buildFooter('ملاحظات للمحامي — سري') },
        children: noteChildren,
      }],
    });
    const notesBlob = await Packer.toBlob(notesDoc);
    // تأخير بسيط لتجنّب تعارض نوافذ التنزيل
    await new Promise(r => setTimeout(r, 600));
    triggerDownload(notesBlob, `ملاحظات-للمحامي-${new Date().toISOString().slice(0, 10)}.docx`);
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// 2. تصدير العقد
// ─────────────────────────────────────────────────────────────────────────────

export async function exportContractWord(opts: {
  text: string;
  title?: string;
  type?: string;
}): Promise<void> {
  const { text, title = 'العقد', type } = opts;
  const dateStr = todayAr();

  // ── استخراج عناوين العقد لبناء الفهرس ───────────────────────────────────
  const lines = text.split('\n').map(l => l.trim()).filter(Boolean);
  const headingLines: string[] = [];

  for (const line of lines) {
    if (
      line.length < 100 &&
      (/^(البند|المادة|الفصل|أولاً|ثانياً|ثالثاً|رابعاً|خامساً|سادساً|سابعاً|ثامناً|عاشراً|\d+[\-.])/.test(line) ||
        /^#{1,3}\s/.test(line))
    ) {
      headingLines.push(line.replace(/^#+\s*/, ''));
    }
  }

  // ── بناء الفهرس ──────────────────────────────────────────────────────────
  const tocChildren: Paragraph[] = [
    rtlLine('الفهرس', { bold: true, size: SIZE_HEADING, color: COLOR_BRAND, spacing: 160 }),
    divider(),
    gap(80),
  ];
  headingLines.forEach((h, i) => {
    tocChildren.push(
      rtlPar(
        [new TextRun({ text: `${i + 1}.  ${h}`, font: FONT, size: SIZE_BODY, color: COLOR_BRAND })],
        { spacing: 140 },
      ),
    );
  });
  tocChildren.push(gap(200));

  // ── بناء جسم العقد ───────────────────────────────────────────────────────
  const bodyChildren: Array<Paragraph | Table> = [
    rtlLine('بسم الله الرحمن الرحيم', { align: AlignmentType.CENTER, size: SIZE_BRAND, bold: true, spacing: 120 }),
    rtlLine(title + (type ? ` — ${type}` : ''), {
      align: AlignmentType.CENTER, size: SIZE_TITLE, bold: true, color: COLOR_BRAND, spacing: 60,
    }),
    rtlLine(`التاريخ: ${dateStr}`, { align: AlignmentType.CENTER, size: SIZE_BRAND, color: '777777', spacing: 200 }),
    divider(),
    gap(),
  ];

  let clauseNum = 0;
  for (const line of lines) {
    const isHeading =
      line.length < 100 &&
      (/^(البند|المادة|الفصل|أولاً|ثانياً|ثالثاً|رابعاً|خامساً|سادساً|سابعاً|ثامناً|عاشراً|\d+[\-.])/.test(line) ||
        /^#{1,3}\s/.test(line));

    if (isHeading) {
      clauseNum++;
      bodyChildren.push(gap(80));
      bodyChildren.push(
        rtlPar(
          [new TextRun({
            text: line.replace(/^#+\s*/, ''),
            font: FONT, size: SIZE_HEADING, bold: true, color: COLOR_BRAND,
          })],
          { spacing: 160 },
        ),
      );
    } else {
      bodyChildren.push(rtlPar(parseRuns(line), { spacing: 180 }));
    }
  }

  bodyChildren.push(gap(200));
  bodyChildren.push(divider());
  bodyChildren.push(rtlLine('توقيعات الأطراف', { bold: true, size: SIZE_HEADING, color: COLOR_BRAND, spacing: 160 }));

  const sigTable = new Table({
    width: { size: 100, type: WidthType.PERCENTAGE },
    rows: [
      new TableRow({
        children: [
          new TableCell({
            width: { size: 50, type: WidthType.PERCENTAGE },
            children: [
              rtlLine('الطرف الأول:', { bold: true, size: SIZE_BRAND }),
              rtlLine('الاسم: _________________________', { color: '999999', size: SIZE_BODY }),
              rtlLine('التوقيع: _______________________', { color: '999999', size: SIZE_BODY }),
              rtlLine('التاريخ: _______________________', { color: '999999', size: SIZE_BODY }),
            ],
          }),
          new TableCell({
            width: { size: 50, type: WidthType.PERCENTAGE },
            children: [
              rtlLine('الطرف الثاني:', { bold: true, size: SIZE_BRAND }),
              rtlLine('الاسم: _________________________', { color: '999999', size: SIZE_BODY }),
              rtlLine('التوقيع: _______________________', { color: '999999', size: SIZE_BODY }),
              rtlLine('التاريخ: _______________________', { color: '999999', size: SIZE_BODY }),
            ],
          }),
        ],
      }),
    ],
  });
  bodyChildren.push(sigTable);
  bodyChildren.push(gap());
  bodyChildren.push(
    rtlLine('هذه المسودة للاسترشاد فقط — يُنصح بمراجعة محامٍ مرخّص قبل التوقيع.', {
      size: SIZE_SMALL, italic: true, color: '999999', align: AlignmentType.CENTER,
    }),
  );

  const doc = new Document({
    sections: [
      // قسم الفهرس
      {
        properties: PAGE_PROPS,
        headers: { default: buildHeader(dateStr) },
        footers: { default: buildFooter() },
        children: tocChildren,
      },
      // قسم نص العقد
      {
        properties: PAGE_PROPS,
        headers: { default: buildHeader(dateStr) },
        footers: { default: buildFooter() },
        children: bodyChildren,
      },
    ],
  });

  const blob = await Packer.toBlob(doc);
  triggerDownload(blob, `عقد-${title.slice(0, 20)}-${new Date().toISOString().slice(0, 10)}.docx`);
}

// ─────────────────────────────────────────────────────────────────────────────
// 3. تصدير الاستشارة / التحليل القانوني
// ─────────────────────────────────────────────────────────────────────────────

export interface ExportMessage {
  role: 'user' | 'assistant';
  content: string;
}

export async function exportConsultationWord(opts: {
  messages: ExportMessage[];
  area?: string;
  title?: string;
}): Promise<void> {
  const { messages, area = '', title = 'الاستشارة القانونية' } = opts;
  const dateStr = todayAr();

  const children: Paragraph[] = [
    rtlLine('بسم الله الرحمن الرحيم', { align: AlignmentType.CENTER, size: SIZE_BRAND, bold: true, spacing: 100 }),
    rtlLine('الاستشارة القانونية', { align: AlignmentType.CENTER, size: SIZE_TITLE, bold: true, color: COLOR_BRAND, spacing: 60 }),
  ];

  if (area || title) {
    children.push(
      rtlLine(`${area ? `التصنيف: ${area}` : ''}${area && title ? '   |   ' : ''}${title ? `الموضوع: ${title}` : ''}`, {
        align: AlignmentType.CENTER, size: SIZE_BRAND, color: '666666', spacing: 60,
      }),
    );
  }

  children.push(rtlLine(`التاريخ: ${dateStr}`, { align: AlignmentType.CENTER, size: SIZE_BRAND, color: '888888', spacing: 200 }));
  children.push(divider());

  // تحذير
  children.push(
    rtlPar(
      [new TextRun({
        text: '⚠ هذه إجابة صادرة عن الذكاء الاصطناعي وهي للاسترشاد فقط، ولا تُعدّ رأياً قانونياً ملزماً، ولا تغني عن مراجعة المحامية المختصة.',
        font: FONT, size: SIZE_SMALL, italics: true, color: '8a6a00',
      })],
      { spacing: 200 },
    ),
  );
  children.push(divider());
  children.push(gap());

  for (const msg of messages) {
    const isUser = msg.role === 'user';
    const roleLabel = isUser ? '👤 السائل' : '⚖ رباب — محاميتك الرقمية';

    // تسمية الدور
    children.push(
      rtlPar(
        [new TextRun({ text: roleLabel, font: FONT, size: SIZE_SMALL, bold: true, color: isUser ? COLOR_BRAND : '5a3a00' })],
        { spacing: 80 },
      ),
    );

    // محتوى الرسالة — تقسيم إلى سطور
    const msgLines = msg.content.split('\n').filter(l => l.trim());
    for (const line of msgLines) {
      children.push(
        rtlPar(parseRuns(line, SIZE_BODY), {
          spacing: 140,
          indent: isUser ? 0 : convertInchesToTwip(0.2),
        }),
      );
    }
    children.push(gap(80));
    children.push(
      new Paragraph({
        bidirectional: true,
        border: { bottom: { style: BorderStyle.DOTTED, size: 3, color: 'cccccc', space: 2 } },
        children: [],
        spacing: { after: 120 },
      }),
    );
  }

  children.push(gap());
  children.push(
    rtlLine('رباب محاميتك الرقمية في الأنظمة السعودية والخليجية · جميع الحقوق محفوظة', {
      size: SIZE_SMALL, color: '999999', align: AlignmentType.CENTER,
    }),
  );

  const doc = new Document({
    sections: [{
      properties: PAGE_PROPS,
      headers: { default: buildHeader(dateStr) },
      footers: { default: buildFooter() },
      children,
    }],
  });

  const blob = await Packer.toBlob(doc);
  triggerDownload(blob, `استشارة-${title.slice(0, 20)}-${new Date().toISOString().slice(0, 10)}.docx`);
}

// ─────────────────────────────────────────────────────────────────────────────
// 4. تصدير PDF (يفتح نافذة طباعة HTML للمتصفح — RTL سليم)
// ─────────────────────────────────────────────────────────────────────────────

/** تحويل نص عادي إلى HTML مع تمييز [يُستكمل] */
function textToHtml(text: string): string {
  const escaped = text
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  return escaped
    .replace(/\[(?:يُستكمل|يستكمل)[^\]]*\]/g, m =>
      `<span style="font-weight:bold;color:#cc0000;background:#fff3f3;padding:0 2px">${m}</span>`,
    )
    .replace(/\n/g, '<br>');
}

export function exportMemoPdf(opts: {
  memoText: string;
  title?: string;
  hasCitations?: boolean;
  weaknesses?: string[];
}): void {
  const { memoText, title = 'المذكرة القانونية', hasCitations, weaknesses = [] } = opts;
  const dateStr = todayAr();
  const win = window.open('', '_blank', 'width=860,height=1000');
  if (!win) return;

  const weaknessHtml = weaknesses.length > 0
    ? `<div style="margin-top:24pt;padding:16pt;background:#fff5f5;border:2pt solid #cc0000;border-radius:8pt;page-break-before:always">
        <div style="font-weight:bold;font-size:14pt;color:#cc0000;margin-bottom:8pt">⚠ ملاحظات للمحامي فقط — نقاط الضعف</div>
        <ul>${weaknesses.map((w, i) => `<li style="margin-bottom:6pt"><b>${i + 1}.</b> ${textToHtml(w)}</li>`).join('')}</ul>
       </div>`
    : '';

  win.document.write(`<!DOCTYPE html><html dir="rtl" lang="ar"><head>
<meta charset="UTF-8"><title>${title} — رباب</title>
<style>
  * { box-sizing:border-box; }
  body { font-family:'Segoe UI',Arial,sans-serif; font-size:13pt; color:#1a1a2e; margin:0; padding:32pt; direction:rtl; }
  .header { border-bottom:3pt solid #c8a96e; padding-bottom:12pt; margin-bottom:20pt; display:flex; justify-content:space-between; align-items:baseline; }
  .brand { font-size:15pt; font-weight:bold; }
  .date  { font-size:10pt; color:#888; }
  h1 { font-size:18pt; text-align:center; margin-bottom:6pt; }
  .sub { text-align:center; font-size:10pt; color:#888; margin-bottom:24pt; }
  .warn { background:#fff8e1; border:1pt solid #f0c040; border-radius:6pt; padding:8pt 12pt; margin-bottom:20pt; font-size:10pt; color:#7a5f00; }
  p { line-height:1.9; margin:6pt 0; }
  .sig { margin-top:48pt; border-top:1pt solid #ccc; padding-top:16pt; display:grid; grid-template-columns:1fr 1fr 1fr; gap:24pt; }
  .sig-cell { font-size:11pt; }
  .sig-line { border-bottom:1pt solid #aaa; margin-top:24pt; }
  .footer-note { margin-top:32pt; font-size:9pt; color:#aaa; text-align:center; }
  @counter-style arabic-numbers { system:numeric; symbols:'٠' '١' '٢' '٣' '٤' '٥' '٦' '٧' '٨' '٩'; }
  .body-para { counter-increment:para; padding-right:0; }
  .body-para::before { content:counter(para) ".  "; color:#888; font-size:11pt; }
  @media print { body { padding:16pt; } }
</style></head><body>
<div class="header">
  <div><div class="brand">⚖ رباب محاميتك الرقمية</div><div style="font-size:9pt;color:#888">RABAB LEGAL AI</div></div>
  <div class="date">${dateStr}</div>
</div>
${hasCitations === false ? '<div class="warn">⚠ مذكرة غير موثّقة بمصادر معتمدة — للاسترشاد فقط</div>' : ''}
<h1>${title}</h1>
<div class="sub">المذكرة القانونية</div>
<div class="warn">⚠ هذه المذكرة أُعدّت بمساعدة الذكاء الاصطناعي ولا تُعدّ رأياً قانونياً ملزماً — يُنصح بمراجعة محامٍ مرخّص.</div>
<div style="counter-reset:para">
${memoText.split(/\n{2,}/).map(p => `<p class="body-para">${textToHtml(p.trim())}</p>`).join('\n')}
</div>
<div class="sig">
  <div class="sig-cell"><b>المحامي / المحامية:</b><div class="sig-line"></div></div>
  <div class="sig-cell"><b>التاريخ:</b><div class="sig-line"></div></div>
  <div class="sig-cell"><b>التوقيع:</b><div class="sig-line"></div></div>
</div>
${weaknessHtml}
<div class="footer-note">رباب محاميتك الرقمية · جميع الحقوق محفوظة</div>
</body></html>`);
  win.document.close();
  setTimeout(() => { win.focus(); win.print(); }, 600);
}

export function exportContractPdf(opts: { text: string; title?: string }): void {
  const { text, title = 'العقد' } = opts;
  const dateStr = todayAr();
  const win = window.open('', '_blank', 'width=860,height=1000');
  if (!win) return;

  win.document.write(`<!DOCTYPE html><html dir="rtl" lang="ar"><head>
<meta charset="UTF-8"><title>${title} — رباب</title>
<style>
  * { box-sizing:border-box; }
  body { font-family:'Segoe UI',Arial,sans-serif; font-size:13pt; color:#1a1a2e; margin:0; padding:32pt; direction:rtl; }
  .header { border-bottom:3pt solid #c8a96e; padding-bottom:10pt; margin-bottom:18pt; }
  .brand { font-size:14pt; font-weight:bold; }
  h1 { text-align:center; font-size:18pt; margin-bottom:4pt; }
  h2 { font-size:14pt; color:#1a1a2e; border-right:4pt solid #c8a96e; padding-right:10pt; margin:18pt 0 8pt; }
  p  { line-height:2.0; margin:4pt 0; }
  .disclaimer { font-size:10pt; color:#9a7a00; background:#fff8e0; border:1pt solid #f0c040; border-radius:5pt; padding:8pt; margin:20pt 0; }
  @media print { body { padding:16pt; } }
</style></head><body>
<div class="header"><div class="brand">⚖ رباب محاميتك الرقمية — RABAB LEGAL AI</div><div style="font-size:9pt;color:#888">${dateStr}</div></div>
<h1>${title}</h1>
<div class="disclaimer">⚠ هذه المسودة للاسترشاد فقط — يُنصح بمراجعة محامٍ مرخّص قبل التوقيع.</div>
${text.split('\n').map(line => {
  const stripped = line.trim();
  if (!stripped) return '';
  if (stripped.length < 100 && /^(البند|المادة|الفصل|أولاً|ثانياً|ثالثاً|\d+[\-.])/.test(stripped)) {
    return `<h2>${textToHtml(stripped)}</h2>`;
  }
  return `<p>${textToHtml(stripped)}</p>`;
}).join('\n')}
</body></html>`);
  win.document.close();
  setTimeout(() => { win.focus(); win.print(); }, 600);
}

export function exportConsultationPdf(opts: {
  messages: ExportMessage[];
  area?: string;
  title?: string;
}): void {
  const { messages, area = '', title = '' } = opts;
  const dateStr = todayAr();
  const win = window.open('', '_blank', 'width=860,height=1000');
  if (!win) return;

  const rows = messages.map(m => {
    const isUser = m.role === 'user';
    return `<div style="margin:10pt 0 6pt">
      <div style="font-size:10pt;font-weight:bold;color:${isUser ? '#1a1a2e' : '#5a3000'};margin-bottom:4pt">${isUser ? '👤 السائل' : '⚖ رباب — محاميتك الرقمية'}</div>
      <div style="background:${isUser ? '#1a1a2e' : '#fdf6e3'};color:${isUser ? '#fff' : '#1a1a2e'};border-radius:8pt;padding:10pt 14pt;line-height:1.9">${textToHtml(m.content)}</div>
    </div><hr style="border:0;border-bottom:1pt dotted #ddd;margin:8pt 0">`;
  }).join('');

  win.document.write(`<!DOCTYPE html><html dir="rtl" lang="ar"><head>
<meta charset="UTF-8"><title>استشارة — رباب</title>
<style>
  * { box-sizing:border-box; }
  body { font-family:'Segoe UI',Arial,sans-serif; font-size:12pt; color:#1a1a2e; margin:0; padding:28pt; direction:rtl; }
  .header { border-bottom:3pt solid #c8a96e; padding-bottom:10pt; margin-bottom:16pt; display:flex; justify-content:space-between; }
  .warn { background:#fff8e1; border:1pt solid #f0c040; border-radius:5pt; padding:7pt 12pt; font-size:10pt; color:#7a5f00; margin-bottom:16pt; }
  @media print { body { padding:14pt; } }
</style></head><body>
<div class="header">
  <div><b style="font-size:14pt">⚖ رباب محاميتك الرقمية</b><br><span style="font-size:9pt;color:#888">RABAB LEGAL AI</span></div>
  <div style="font-size:10pt;color:#888">${dateStr}</div>
</div>
${area || title ? `<div style="font-size:11pt;color:#666;margin-bottom:12pt">${area ? `التصنيف: ${area}` : ''}${area && title ? ' — ' : ''}${title ? `الموضوع: ${title}` : ''}</div>` : ''}
<div class="warn">⚠ هذه إجابة صادرة عن الذكاء الاصطناعي وهي للاسترشاد فقط.</div>
${rows}
<div style="margin-top:24pt;font-size:9pt;color:#aaa;text-align:center">رباب محاميتك الرقمية · جميع الحقوق محفوظة</div>
</body></html>`);
  win.document.close();
  setTimeout(() => { win.focus(); win.print(); }, 600);
}

// ─────────────────────────────────────────────────────────────────────────────
// مساعد داخلي: تنزيل Blob
// ─────────────────────────────────────────────────────────────────────────────
function triggerDownload(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const a   = document.createElement('a');
  a.href     = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 5000);
}
