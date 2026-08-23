/**
 * QuotaBadge — عدّاد الحصة الظاهر دائماً للمستخدم
 * يُظهر: ما تبقى من التجربة المجانية، أو الحصة الشهرية للمشترك
 */
import React from 'react';
import { useQuota, type ServiceType } from '@/hooks/useQuota';
import { Sparkles, AlertCircle, CheckCircle2 } from 'lucide-react';
import { cn } from '@/lib/utils';

const SERVICE_LABELS: Record<ServiceType, string> = {
  consultation:     'استشارة',
  contract_draft:   'عقد',
  contract_review:  'مراجعة',
};

interface Props {
  serviceType?: ServiceType;
  className?: string;
  compact?: boolean;
}

export function QuotaBadge({ serviceType, className, compact = false }: Props) {
  const { quota, loading } = useQuota();

  if (loading) return null;

  // Trial mode
  if (quota.isTrial) {
    const remaining = quota.trialRemaining ?? 0;
    const exhausted = remaining === 0;

    if (compact) {
      return (
        <span className={cn(
          'inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-bold border',
          exhausted
            ? 'bg-red-50 text-red-700 border-red-200'
            : remaining === 1
              ? 'bg-secondary/15 text-secondary border-secondary/30'
              : 'bg-secondary/10 text-secondary border-secondary/25',
          className
        )}>
          <Sparkles className="w-3 h-3" />
          {exhausted ? 'نفدت التجربة' : `${remaining} مجاناً`}
        </span>
      );
    }

    return (
      <div className={cn(
        'flex items-center gap-3 rounded-xl px-4 py-3 border',
        exhausted
          ? 'bg-red-50 border-red-200'
          : remaining === 1
            ? 'bg-secondary/10 border-secondary/30'
            : 'bg-secondary/5 border-secondary/20',
        className
      )}>
        {exhausted
          ? <AlertCircle className="w-4 h-4 text-red-500 shrink-0" />
          : <Sparkles className="w-4 h-4 text-secondary shrink-0" />}
        <div className="min-w-0">
          <p className={cn('text-sm font-bold', exhausted ? 'text-red-700' : 'text-secondary')}>
            {exhausted
              ? 'انتهت خدماتك المجانية الثلاث'
              : `${remaining} من ${3} خدمات مجانية متبقية`}
          </p>
          {!exhausted && (
            <p className="text-xs text-muted-foreground mt-0.5">
              {remaining === 1 ? 'خدمة مجانية أخيرة — اشترك قبل استنفادها' : 'جودة مطابقة تماماً للاشتراك المدفوع'}
            </p>
          )}
        </div>
        {!exhausted && (
          <div className="flex gap-1 ms-auto shrink-0">
            {Array.from({ length: 3 }).map((_, i) => (
              <div
                key={i}
                className={cn('w-2 h-2 rounded-full', i < remaining ? 'bg-secondary' : 'bg-muted')}
              />
            ))}
          </div>
        )}
      </div>
    );
  }

  // Paid subscription — show specific service quota if provided
  if (serviceType) {
    const remaining = quota.remaining[serviceType];
    const limit = quota.allowed_limits[serviceType];
    if (remaining === null || limit === null) return null;
    const exhausted = remaining <= 0;
    const label = SERVICE_LABELS[serviceType];

    if (compact) {
      return (
        <span className={cn(
          'inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-bold border',
          exhausted ? 'bg-red-50 text-red-700 border-red-200' : 'bg-green-50 text-green-700 border-green-200',
          className
        )}>
          {exhausted ? <AlertCircle className="w-3 h-3" /> : <CheckCircle2 className="w-3 h-3" />}
          {exhausted ? `نفدت حصة ${label}` : `${remaining}/${limit} ${label}`}
        </span>
      );
    }

    return (
      <div className={cn(
        'flex items-center gap-3 rounded-xl px-4 py-3 border',
        exhausted ? 'bg-red-50 border-red-200' : 'bg-green-50 border-green-200',
        className
      )}>
        {exhausted
          ? <AlertCircle className="w-4 h-4 text-red-500 shrink-0" />
          : <CheckCircle2 className="w-4 h-4 text-green-600 shrink-0" />}
        <p className={cn('text-sm font-bold', exhausted ? 'text-red-700' : 'text-green-700')}>
          {exhausted
            ? `نفدت حصة ${label} لهذا الشهر`
            : `${remaining} ${label} متبقية من ${limit}`}
        </p>
      </div>
    );
  }

  return null;
}
