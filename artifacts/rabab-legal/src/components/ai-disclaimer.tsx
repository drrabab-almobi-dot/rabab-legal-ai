/**
 * AiDisclaimer — reusable AI output disclaimer.
 * Must appear at the top of the المساعدة القانونية hub and at the bottom of every AI output.
 */
import React from 'react';
import { AlertTriangle } from 'lucide-react';
import { Link } from 'wouter';
import { cn } from '@/lib/utils';

const DISCLAIMER_TEXT =
  'الإجابات أولية وإرشادية مدعومة بالذكاء الاصطناعي، ولا تُعدّ رأياً قانونياً نهائياً يُعتد به أمام المحاكم. RABAB LEGAL AI تخلي مسؤوليتها عن أي تصرف دون الرجوع لمستشار قانوني مختص. عند الرغبة في التأكيد، يمكنك الرجوع إلى المحامية د. رباب أحمد المعبي.';

/** Prominent banner — used at the top of the المساعدة القانونية page */
export function AiDisclaimerBanner() {
  return (
    <div className="flex items-start gap-3 bg-amber-50 border border-amber-300 rounded-2xl px-5 py-4">
      <AlertTriangle className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
      <p className="text-sm text-amber-800 leading-relaxed font-medium">
        {DISCLAIMER_TEXT.replace('يمكنك الرجوع إلى المحامية د. رباب أحمد المعبي.', '')}
        <Link href="/appointment" className="font-bold text-secondary underline decoration-secondary/60 underline-offset-2 hover:opacity-80">
          يمكنك الرجوع إلى المحامية د. رباب أحمد المعبي للتأكيد.
        </Link>
      </p>
    </div>
  );
}

/** Inline footer — used beneath each AI answer / output block */
export function AiDisclaimerInline({ className }: { className?: string }) {
  return (
    <div className={cn(
      'flex items-start gap-2 bg-amber-50 border border-amber-200 rounded-xl px-3 py-2.5 mt-3',
      className
    )}>
      <AlertTriangle className="w-3.5 h-3.5 text-amber-500 shrink-0 mt-0.5" />
      <p className="text-[11px] text-amber-800 leading-snug">
        {DISCLAIMER_TEXT.replace('يمكنك الرجوع إلى المحامية د. رباب أحمد المعبي.', '')}
        <Link href="/appointment" className="font-bold text-secondary underline decoration-secondary/60 underline-offset-2 hover:opacity-80">
          يمكنك الرجوع إلى المحامية د. رباب أحمد المعبي للتأكيد.
        </Link>
      </p>
    </div>
  );
}

/** Plain text version for inclusion in exported files */
export const AI_DISCLAIMER_TEXT = DISCLAIMER_TEXT;
