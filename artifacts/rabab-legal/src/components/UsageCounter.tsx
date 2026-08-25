/**
 * UsageCounter — عدّاد الاستهلاك الثابت أسفل يسار الشاشة.
 * يظهر للمستخدمين المسجّلين فقط (ليس للزوار، ليس في الشريط العلوي).
 * قابل للطيّ إلى أيقونة صغيرة.
 */
import React, { useState, useEffect, useRef } from 'react';
import { ChevronUp, ChevronDown, X, BarChart2, TrendingUp, RefreshCw } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useAuth } from '@/hooks/use-auth';
import { useLang } from '@/hooks/use-language';

const API_BASE = import.meta.env.BASE_URL.replace(/\/$/, '');

interface QuotaStatus {
  allowed: boolean;
  isTrial: boolean;
  trialRemaining: number | null;
  remaining: { consultation: number | null; contract_draft: number | null; contract_review: number | null };
  allowed_limits: { consultation: number | null; contract_draft: number | null; contract_review: number | null };
  needsUpgrade: boolean;
}

function pct(used: number, total: number): number {
  if (total <= 0) return 100;
  return Math.round((used / total) * 100);
}

function color(remaining: number, total: number): string {
  if (total <= 0) return 'text-muted-foreground';
  const p = (remaining / total) * 100;
  if (p > 50) return 'text-green-400';
  if (p >= 20) return 'text-amber-400';
  return 'text-red-400';
}

function bgRing(remaining: number, total: number): string {
  if (total <= 0) return 'border-muted-foreground/40';
  const p = (remaining / total) * 100;
  if (p > 50) return 'border-green-500/70';
  if (p >= 20) return 'border-amber-500/70';
  return 'border-red-500/70';
}

const SERVICE_LABELS: Record<string, [string, string]> = {
  consultation: ['استشارة', 'Consultation'],
  contract_draft: ['صياغة عقد', 'Contract drafting'],
  contract_review: ['مراجعة عقد', 'Contract review'],
};

export function UsageCounter() {
  const { isAuthenticated, user } = useAuth();
  const { lang, t } = useLang();
  const [quota, setQuota] = useState<QuotaStatus | null>(null);
  const [open, setOpen] = useState(false);
  const [collapsed, setCollapsed] = useState(false);
  const [loading, setLoading] = useState(false);
  const panelRef = useRef<HTMLDivElement>(null);

  const fetchQuota = async () => {
    if (!isAuthenticated) return;
    setLoading(true);
    try {
      const res = await fetch(`${API_BASE}/api/quota/status`, { credentials: 'include' });
      if (res.ok) setQuota(await res.json());
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (isAuthenticated) {
      fetchQuota();
      const interval = setInterval(fetchQuota, 60_000);
      return () => clearInterval(interval);
    }
    return undefined;
  }, [isAuthenticated]);

  // إغلاق اللوحة عند النقر خارجها
  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (panelRef.current && !panelRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open]);

  if (!isAuthenticated || !quota) return null;

  // حساب الرصيد الرئيسي للعرض
  const isTrial = quota.isTrial;
  const mainRemaining = isTrial
    ? (quota.trialRemaining ?? 0)
    : Math.min(
        quota.remaining.consultation ?? 9999,
        quota.remaining.contract_draft ?? 9999,
        quota.remaining.contract_review ?? 9999
      );
  const mainTotal = isTrial
    ? 3
    : Math.min(
        quota.allowed_limits.consultation ?? 9999,
        quota.allowed_limits.contract_draft ?? 9999,
        quota.allowed_limits.contract_review ?? 9999
      );

  const mainColor = color(mainRemaining, mainTotal);
  const mainRing  = bgRing(mainRemaining, mainTotal);

  if (collapsed) {
    return (
      <button
        onClick={() => setCollapsed(false)}
        className={cn(
          'fixed bottom-5 left-5 z-50 w-10 h-10 rounded-full border-2 flex items-center justify-center',
          'bg-background/90 backdrop-blur-sm shadow-lg transition-all hover:scale-110',
          mainRing
        )}
        title={t('عدّاد الاستهلاك', 'Usage counter')}
      >
        <BarChart2 className={cn('w-4 h-4', mainColor)} />
      </button>
    );
  }

  return (
    <div
      ref={panelRef}
      dir={lang === 'ar' ? 'rtl' : 'ltr'}
      className="fixed bottom-5 left-5 z-50 select-none"
    >
      {/* ── Expanded Panel ── */}
      {open && (
        <div className="mb-2 w-72 bg-card/95 backdrop-blur-md border border-border rounded-2xl shadow-2xl p-4 text-sm">
          {/* Header */}
          <div className="flex items-center justify-between mb-3">
            <span className="font-bold text-foreground flex items-center gap-1.5">
              <BarChart2 className="w-3.5 h-3.5 text-primary" />
               {t('استهلاك الخدمات', 'Service usage')}
            </span>
            <div className="flex items-center gap-1">
              <button onClick={fetchQuota} disabled={loading} className="p-1 rounded hover:bg-muted transition-colors">
                <RefreshCw className={cn('w-3 h-3 text-muted-foreground', loading && 'animate-spin')} />
              </button>
              <button onClick={() => setOpen(false)} className="p-1 rounded hover:bg-muted transition-colors">
                <X className="w-3 h-3 text-muted-foreground" />
              </button>
            </div>
          </div>

          {isTrial ? (
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-muted-foreground">{t('التجربة المجانية', 'Free trial')}</span>
                <span className={cn('font-bold', mainColor)}>{t(`${quota.trialRemaining} / 3 متبقٍ`, `${quota.trialRemaining} / 3 remaining`)}</span>
              </div>
              <div className="w-full bg-muted rounded-full h-1.5">
                <div
                  className={cn('h-1.5 rounded-full transition-all', mainColor.replace('text-', 'bg-'))}
                  style={{ width: `${Math.min(100, ((quota.trialRemaining ?? 0) / 3) * 100)}%` }}
                />
              </div>
              {quota.needsUpgrade && (
                <a href="/pricing" className="block text-center text-xs text-secondary hover:underline font-bold mt-2">
                  {t('اشترك للحصول على المزيد ←', 'Subscribe for more →')}
                </a>
              )}
            </div>
          ) : (
            <div className="space-y-3">
              {(Object.entries(quota.remaining) as [keyof typeof quota.remaining, number | null][]).map(([svc, rem]) => {
                const total = quota.allowed_limits[svc] ?? 0;
                if (rem === null || total === null) return null;
                const used = total - rem;
                const p = pct(used, total);
                const c = color(rem, total);
                return (
                  <div key={svc}>
                    <div className="flex items-center justify-between mb-1">
                       <span className="text-muted-foreground text-xs">{t(...SERVICE_LABELS[svc])}</span>
                      <span className={cn('text-xs font-bold', c)}>{rem} / {total}</span>
                    </div>
                    <div className="w-full bg-muted rounded-full h-1">
                      <div
                        className={cn('h-1 rounded-full transition-all', c.replace('text-', 'bg-'))}
                        style={{ width: `${Math.min(100, (rem / total) * 100)}%` }}
                      />
                    </div>
                    <div className="text-[10px] text-muted-foreground mt-0.5">
                       {t(`مستهلك: ${used} (${p}%)`, `Used: ${used} (${p}%)`)}
                    </div>
                  </div>
                );
              })}

              <div className="border-t border-border pt-2 mt-2">
                <a href="/usage-log" className="text-xs text-primary hover:underline flex items-center gap-1">
                  <TrendingUp className="w-3 h-3" />
                   {t('سجل الاستهلاك التفصيلي', 'Detailed usage log')}
                </a>
              </div>
            </div>
          )}
        </div>
      )}

      {/* ── Toggle Button ── */}
      <div className="flex items-center gap-1">
        <button
          onClick={() => setCollapsed(true)}
          className="p-1 rounded-lg hover:bg-muted/80 transition-colors"
           title={t('طيّ', 'Collapse')}
        >
          <ChevronDown className="w-3 h-3 text-muted-foreground" />
        </button>

        <button
          onClick={() => setOpen(v => !v)}
          className={cn(
            'flex items-center gap-2 px-3 py-1.5 rounded-xl border-2 transition-all',
            'bg-background/90 backdrop-blur-sm shadow-lg hover:shadow-xl hover:scale-105',
            mainRing
          )}
        >
          <BarChart2 className={cn('w-3.5 h-3.5', mainColor)} />
          <span className={cn('text-xs font-bold tabular-nums', mainColor)}>
            {isTrial ? `${quota.trialRemaining}/3` : mainRemaining}
          </span>
          <span className="text-[10px] text-muted-foreground">
             {isTrial ? t('تجربة', 'Trial') : t('متبقٍ', 'Remaining')}
          </span>
          {open ? <ChevronDown className="w-3 h-3 text-muted-foreground" /> : <ChevronUp className="w-3 h-3 text-muted-foreground" />}
        </button>
      </div>
    </div>
  );
}
