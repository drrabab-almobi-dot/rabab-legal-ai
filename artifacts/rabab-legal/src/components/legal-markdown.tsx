/**
 * legal-markdown.tsx
 * ──────────────────────────────────────────────────────────────────────────────
 * مكوّن موحّد لعرض مخرجات الذكاء الاصطناعي القانوني.
 * يُستخدم في جميع الشاشات بدون استثناء.
 *
 * يشمل أيضاً:
 *  - cleanAiText()      — ينظّف الرموز الزائدة قبل العرض أو التصدير
 *  - markdownToHtml()   — يحوّل Markdown إلى HTML للـ PDF / Word exports
 */

import React from 'react';
import ReactMarkdown from 'react-markdown';

// ── 1. تنظيف الرموز الزائدة + حذف التوقيع (طبقة احتياطية frontend) ────────────
export function cleanAiText(text: string): string {
  if (!text) return '';

  let s = text;

  // ── حذف كتلة التوقيع بكل صيغها ──────────────────────────────────────────
  // الصيغة المضغوطة بفواصل رأسية: "سعدنا بخدمتكم، RABAB LEGAL AI | بإشراف ... | 966... | https://..."
  s = s.replace(/سعدنا\s*بخدمتكم[^\n]*(?:\|[^\n]*)*/gi, '');
  // اسم المشرفة بأي صيغة (مع أو بدون "بإشراف")
  s = s.replace(/(?:بإشراف\s+)?(?:المحامية\s+(?:والمحكم\s+التجاري\s+)?)?د[\.\s]*رباب\s+أحمد\s+المعبي[^\n]*/gi, '');
  // عبارة "بإشراف المحامية" منفردة
  s = s.replace(/بإشراف\s+المحامية\s+(?:والمحكم\s+التجاري\s*)?[^\n]*/gi, '');
  // أرقام الجوال المحددة
  s = s.replace(/[\+]?966\s*5\s*0\s*4\s*6\s*4\s*7\s*6\s*4\s*9[^\n]*/g, '');
  s = s.replace(/[\+]?966\s*5\s*7\s*0\s*7\s*7\s*3\s*9\s*9\s*9[^\n]*/g, '');
  // بريد rababmobilaw
  s = s.replace(/rababmobilaw@gmail\.com[^\n]*/gi, '');
  // حساب X / تويتر
  s = s.replace(/https?:\/\/x\.com\/rabab[^\s\n]*/gi, '');
  // سطر "للتواصل:"
  s = s.replace(/للتواصل\s*:[^\n]*/gi, '');
  // rabablegal.com كتوقيع (بعد | أو في سطر يبدأ بـ https)
  s = s.replace(/(?<=\|[^|]{0,30})https?:\/\/(?:www\.)?rabablegal\.com[^\s\n]*/gi, '');
  s = s.replace(/^https?:\/\/(?:www\.)?rabablegal\.com\s*$/gm, '');
  // RABAB LEGAL AI في سطر منفرد (توقيع)
  s = s.replace(/^RABAB LEGAL AI\s*$/gm, '');
  // أسطر عناوين التواصل المتبقية (العنوان + النقطتان + أي قيمة أو [رابط محذوف])
  s = s.replace(/^[^\n]*البريد الإلكتروني\s*:?[^\n]*/gm, '');
  s = s.replace(/^[^\n]*حساب\s*[Xx×]\s*:?[^\n]*/gm, '');
  s = s.replace(/^[^\n]*الموقع الرسمي\s*:?[^\n]*/gm, '');
  s = s.replace(/^[^\n]*تويتر\s*:?[^\n]*/gm, '');
  s = s.replace(/^[^\n]*\[رابط محذوف\][^\n]*/gm, '');
  s = s.replace(/\[رابط محذوف\]/g, '');

  // ── تنظيف الرموز الزائدة ─────────────────────────────────────────────────
  // خطوط رسم الصناديق → --- قياسي
  s = s.replace(/[━─]{3,}/g, '---');
  // *** زائدة بلا نص
  s = s.replace(/^\s*\*{3,}\s*$/gm, '');
  // *** نص *** → ** نص **
  s = s.replace(/\*\*\*(.*?)\*\*\*/gs, '**$1**');
  // أسطر # فارغة
  s = s.replace(/^#{1,6}\s*$/gm, '');
  // --- متكررة في نهاية النص
  s = s.replace(/(?:\n---\s*){2,}$/, '');
  // أسطر فارغة زائدة في النهاية
  s = s.replace(/(\n\s*){3,}$/, '\n');

  return s.trimEnd();
}

// ── 2. تحويل Markdown إلى HTML (للـ PDF / Word) ───────────────────────────────
export function markdownToHtml(text: string): string {
  const clean = cleanAiText(text);
  let html = clean
    // حماية HTML
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    // عناوين
    .replace(/^### (.+)$/gm, '<h3 style="font-size:13pt;color:#1a1a2e;margin:10pt 0 4pt;font-weight:bold">$1</h3>')
    .replace(/^## (.+)$/gm, '<h2 style="font-size:14pt;color:#1a1a2e;border-bottom:1pt solid #ddd;padding-bottom:3pt;margin:12pt 0 5pt;font-weight:bold">$1</h2>')
    .replace(/^# (.+)$/gm, '<h1 style="font-size:16pt;color:#1a1a2e;border-bottom:2pt solid #1a1a2e;padding-bottom:4pt;margin:14pt 0 6pt;font-weight:bold">$1</h1>')
    // Bold / Italic
    .replace(/\*\*(.+?)\*\*/gs, '<strong>$1</strong>')
    .replace(/\*(.+?)\*/gs, '<em>$1</em>')
    // خط أفقي
    .replace(/^---\s*$/gm, '<hr style="border:none;border-top:1pt solid #ddd;margin:10pt 0">')
    // نقاط غير مرقمة (- item أو • item)
    .replace(/^[-•]\s+(.+)$/gm, '<li style="margin:3pt 0;line-height:1.7">$1</li>')
    // نقاط مرقمة
    .replace(/^\d+\.\s+(.+)$/gm, '<li style="margin:3pt 0;line-height:1.7;list-style-type:decimal">$1</li>')
    // تجميع <li> داخل <ul>
    .replace(/(<li[^>]*>[\s\S]*?<\/li>\n?)+/g, (m) => `<ul style="padding-right:16pt;margin:6pt 0">${m}</ul>`)
    // أسطر جديدة → فقرات
    .split(/\n{2,}/).map(p => {
      p = p.trim();
      if (!p) return '';
      if (p.startsWith('<h') || p.startsWith('<ul') || p.startsWith('<hr')) return p;
      return `<p style="margin:5pt 0;line-height:1.8">${p.replace(/\n/g, '<br>')}</p>`;
    }).join('\n');
  return html;
}

// ── 3. مكوّنات ReactMarkdown المشتركة ─────────────────────────────────────────
const MD_COMPONENTS: React.ComponentProps<typeof ReactMarkdown>['components'] = {
  // ── عناوين: حجم أكبر، وزن أثقل، مسافات واسعة بين الأقسام ──────────────────
  h1: ({ children }) => (
    <h1 className="text-[19px] font-bold text-primary mt-8 mb-3 pb-2 border-b-2 border-primary/30 leading-snug tracking-tight">
      {children}
    </h1>
  ),
  h2: ({ children }) => (
    <h2 className="text-[17px] font-bold text-primary mt-7 mb-3 pb-1.5 border-b border-primary/20 leading-snug">
      {children}
    </h2>
  ),
  h3: ({ children }) => (
    <h3 className="text-[15px] font-semibold text-primary/85 mt-5 mb-2.5 leading-snug">
      {children}
    </h3>
  ),
  // ── فقرات: حجم مريح للقراءة القانونية، تباعد أسطر واسع ───────────────────
  p: ({ children }) => (
    <p className="mb-4 leading-[1.9] text-[15px]">{children}</p>
  ),
  // ── قوائم: نقطة بسيطة (•) بدلاً من ◆، مسافة بادئة واضحة ─────────────────
  ul: ({ children }) => (
    <ul className="mb-4 space-y-2 ps-2">{children}</ul>
  ),
  ol: ({ children }) => (
    <ol className="mb-4 space-y-2 ps-5 list-decimal">{children}</ol>
  ),
  li: ({ children }) => (
    <li className="text-[15px] leading-[1.85] flex gap-2.5 items-start">
      <span className="text-secondary mt-[5px] shrink-0 text-[8px] leading-none select-none">●</span>
      <span className="flex-1">{children}</span>
    </li>
  ),
  strong: ({ children }) => (
    <strong className="font-semibold text-foreground">{children}</strong>
  ),
  em: ({ children }) => (
    <em className="not-italic text-primary/80">{children}</em>
  ),
  hr: () => <hr className="border-border/30 my-6" />,
  blockquote: ({ children }) => (
    <blockquote className="border-s-4 border-secondary/60 ps-4 my-3 text-muted-foreground text-[14px] leading-[1.8] bg-muted/30 py-2 rounded-sm">
      {children}
    </blockquote>
  ),
  a: ({ href, children }) => (
    <a href={href} target="_blank" rel="noopener noreferrer"
      className="text-primary underline underline-offset-2 hover:text-primary/80 break-all text-[14px]">
      {children}
    </a>
  ),
  code: ({ children }) => (
    <code className="bg-muted px-1.5 py-0.5 rounded text-[12px] font-mono">{children}</code>
  ),
  table: ({ children }) => (
    <div className="overflow-x-auto my-4">
      <table className="w-full text-[14px] border-collapse border border-border/40">{children}</table>
    </div>
  ),
  th: ({ children }) => (
    <th className="border border-border/40 bg-muted/60 px-3 py-2 text-start font-semibold text-foreground/90">{children}</th>
  ),
  td: ({ children }) => (
    <td className="border border-border/40 px-3 py-2 text-start">{children}</td>
  ),
};

// ── 4. المكوّن الرئيسي ────────────────────────────────────────────────────────
interface LegalMarkdownProps {
  children: string;
  className?: string;
  maxHeight?: string;
}

export function LegalMarkdown({ children, className = '', maxHeight }: LegalMarkdownProps) {
  const cleaned = cleanAiText(children);
  return (
    <div
      className={`legal-response text-[15px] leading-[1.9] ${className}`}
      dir="auto"
      style={{
        textAlign: 'start',
        ...(maxHeight ? { maxHeight, overflowY: 'auto' } : {}),
      }}
    >
      <ReactMarkdown components={MD_COMPONENTS}>
        {cleaned}
      </ReactMarkdown>
    </div>
  );
}

export default LegalMarkdown;
