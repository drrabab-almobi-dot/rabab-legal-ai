/**
 * حالة المصادر — Source Status Admin Page
 * تُظهر كل مصدر: الحالة، عدد الوثائق، نسبة جودة النص، آخر مزامنة
 * وتحذير الجودة لكل مصدر مفعل
 */
import React, { useEffect, useState, useCallback } from 'react';
import { AdminSidebar } from '@/components/layout';
import { cn } from '@/lib/utils';
import {
  CheckCircle2, XCircle, AlertTriangle, RefreshCw,
  Loader2, Info, Shield, FileText, Upload,
} from 'lucide-react';
import { useLang } from '@/hooks/use-language';

const BASE = import.meta.env.BASE_URL.replace(/\/$/, '');

interface SourceInfo {
  label: string;
  icon: string;
  description: string;
  enabled: boolean;
  canToggle: boolean;
  qualityThreshold: number;
  docs: number;
  chunks: number;
  lowQualityChunks: number;
  qualityPct: number;
  lastSyncAt: string | null;
}

function StatusBadge({ enabled, t }: { enabled: boolean; t: (ar: string, en: string) => string }) {
  return (
    <span className={cn(
      'inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-bold',
      enabled
        ? 'bg-green-100 text-green-800 border border-green-200'
        : 'bg-red-100 text-red-700 border border-red-200'
    )}>
      {enabled
        ? <><CheckCircle2 className="w-3 h-3" /> {t('مفعّل', 'Enabled')}</>
        : <><XCircle className="w-3 h-3" /> {t('متوقف', 'Disabled')}</>
      }
    </span>
  );
}

function QualityBar({
  pct,
  threshold,
  lang,
  t,
}: {
  pct: number;
  threshold: number;
  lang: string;
  t: (ar: string, en: string) => string;
}) {
  const belowThreshold = threshold > 0 && pct < threshold;
  const locale = lang === 'ar' ? 'ar-SA' : 'en-US';
  const formattedPct = pct.toLocaleString(locale);
  const formattedThreshold = threshold.toLocaleString(locale);
  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between text-xs">
        <span className="text-muted-foreground">{t('جودة النص المستخرج', 'Extracted text quality')}</span>
        <span className={cn('font-bold', belowThreshold ? 'text-red-600' : pct >= 75 ? 'text-green-600' : 'text-amber-600')}>
          {formattedPct}%
        </span>
      </div>
      <div
        className="h-2 bg-muted rounded-full overflow-hidden"
        role="progressbar"
        aria-label={t('جودة النص المستخرج', 'Extracted text quality')}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={pct}
      >
        <div
          className={cn('h-full rounded-full transition-all duration-700',
            pct >= 75 ? 'bg-green-500' : pct >= 50 ? 'bg-amber-400' : 'bg-red-500'
          )}
          style={{ width: `${pct}%` }}
        />
      </div>
      {threshold > 0 && (
        <div className="relative h-0">
          <div
            className="absolute top-[-14px] w-0.5 h-4 bg-primary/40"
            style={{ left: `${threshold}%` }}
          />
        </div>
      )}
      {belowThreshold && (
        <p className="text-xs text-red-600 flex items-center gap-1 mt-1">
          <AlertTriangle className="w-3 h-3 shrink-0" />
          {t(
            `دون الحد المطلوب (${formattedThreshold}%) — لا يمكن تفعيل هذا المصدر في نتائج المستخدمين`,
            `Below the required threshold (${formattedThreshold}%) — this source cannot be enabled in user results`,
          )}
        </p>
      )}
    </div>
  );
}

function formatDate(
  iso: string | null,
  lang: string,
  t: (ar: string, en: string) => string,
): string {
  if (!iso) return t('لم تتم مزامنة', 'Not yet synchronized');
  try {
    const date = new Date(iso);
    if (Number.isNaN(date.getTime())) return t('تاريخ غير صالح', 'Invalid date');
    return date.toLocaleString(lang === 'ar' ? 'ar-SA' : 'en-US', {
      year: 'numeric', month: 'short', day: 'numeric',
      hour: '2-digit', minute: '2-digit',
    });
  } catch {
    return t('تعذّر عرض التاريخ', 'Unable to display date');
  }
}

const SOURCE_ICONS: Record<string, React.ReactNode> = {
  official:      <Shield className="w-6 h-6" />,
  lawyer_upload: <Upload className="w-6 h-6" />,
  unknown:       <FileText className="w-6 h-6" />,
};

interface LocalizedSourceCopy {
  label: [ar: string, en: string];
  description: [ar: string, en: string];
}

const SOURCE_COPY: Record<string, LocalizedSourceCopy> = {
  legacy_import: {
    label: ['أرشيفات مستوردة سابقاً', 'Previously imported archives'],
    description: ['وثائق تاريخية محفوظة من تكاملات أُوقفت ولا تخضع لمزامنة نشطة', 'Historical documents retained after retired integrations; no active sync'],
  },
  official: {
    label: ['بوابة الأنظمة السعودية', 'Saudi Laws Portal'],
    description: ['هيئة الخبراء بمجلس الوزراء — المصدر الرسمي المعتمد', 'Bureau of Experts at the Council of Ministers — the approved official source'],
  },
  official_portal: {
    label: ['بوابة الأنظمة السعودية', 'Saudi Laws Portal'],
    description: ['هيئة الخبراء بمجلس الوزراء — المصدر الرسمي المعتمد', 'Bureau of Experts at the Council of Ministers — the approved official source'],
  },
  lawyer_upload: {
    label: ['رفع المحامي', 'Lawyer upload'],
    description: ['مستندات رفعها المحامي يدوياً داخل حسابه', 'Documents uploaded manually by the lawyer within their account'],
  },
  unknown: {
    label: ['مصدر غير محدد', 'Unspecified source'],
    description: ['مستندات قديمة لم يُحدَّد مصدرها بعد', 'Older documents whose source has not yet been identified'],
  },
  other: {
    label: ['مصدر آخر', 'Other source'],
    description: ['مستندات من مصدر آخر', 'Documents from another source'],
  },
};

const SOURCE_ORDER = ['official', 'lawyer_upload', 'legacy_import', 'unknown'];

export default function AdminSourceStatus() {
  const { lang, t } = useLang();
  const [sources, setSources] = useState<Record<string, SourceInfo>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [saveMsg, setSaveMsg] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const res = await fetch(`${BASE}/api/admin/source-status`, { credentials: 'include' });
      if (!res.ok) throw new Error(await res.text());
      const data = await res.json();
      setSources(data.sources ?? {});
    } catch (e: any) {
      setError(e?.message || t('خطأ في جلب البيانات', 'Failed to load source data'));
    } finally {
      setLoading(false);
    }
  }, [t]);

  useEffect(() => { load(); }, [load]);

  return (
    <AdminSidebar>
       <div className="max-w-4xl mx-auto space-y-6" dir={lang === 'ar' ? 'rtl' : 'ltr'}>
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
             <h1 className="text-2xl font-black text-primary">{t('حالة المصادر', 'Source status')}</h1>
            <p className="text-muted-foreground text-sm mt-1">
               {t('مراقبة وتحكم في مصادر المحتوى المستخدمة في الاستشارات والبحث', 'Monitor and manage content sources used in consultations and search')}
            </p>
          </div>
          <button
            onClick={load}
            disabled={loading}
            title={t('تحديث حالة المصادر', 'Refresh source status')}
            aria-label={t('تحديث حالة المصادر', 'Refresh source status')}
            className="flex items-center gap-2 text-sm text-muted-foreground hover:text-primary transition-colors px-3 py-2 rounded-lg hover:bg-muted"
          >
            {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}
             {t('تحديث', 'Refresh')}
          </button>
        </div>

        {/* Approved sources notice */}
        <div className="bg-primary/5 border border-primary/20 rounded-xl p-4 flex gap-3">
          <Info className="w-5 h-5 text-primary shrink-0 mt-0.5" />
          <div className="text-sm">
            <p className="font-bold text-primary mb-1">
              {t('المصادر المعتمدة رسمياً', 'Officially approved sources')}
            </p>
            <p className="text-muted-foreground">
              {t('المصدر الوحيد المعتمد للنصوص النظامية هو ', 'The only approved source for statutory texts is the ')}
              <strong>{t('بوابة الأنظمة السعودية', 'Saudi Laws Portal')}</strong>
              {t(
                ' التابعة لهيئة الخبراء بمجلس الوزراء، إضافة إلى ',
                ' of the Bureau of Experts at the Council of Ministers, in addition to ',
              )}
              <strong>{t('المستندات التي يرفعها المحامي بنفسه', 'documents uploaded by the lawyer')}</strong>
              {t(
                ' داخل حسابه. أي مصدر آخر يخضع لمراجعة الجودة قبل إتاحته للمستخدمين.',
                ' within their account. Any other source is subject to quality review before it is made available to users.',
              )}
            </p>
          </div>
        </div>

        {error && (
          <div className="bg-red-50 border border-red-200 rounded-xl p-4 text-red-700 text-sm flex items-center gap-2">
            <XCircle className="w-4 h-4 shrink-0" />
             <span dir="auto">{error}</span>
          </div>
        )}

        {saveMsg && (
          <div className={cn(
            'rounded-xl p-3 text-sm font-semibold text-center border',
            saveMsg.startsWith('✅') ? 'bg-green-50 border-green-200 text-green-800' :
            saveMsg.startsWith('⏸') ? 'bg-blue-50 border-blue-200 text-blue-800' :
            'bg-red-50 border-red-200 text-red-700'
          )}>
            <span dir="auto">{saveMsg}</span>
          </div>
        )}

        {loading && (
          <div className="flex items-center justify-center gap-3 rounded-2xl border-2 border-secondary/45 bg-secondary/5 py-16" role="status">
            <Loader2 className="w-8 h-8 animate-spin text-primary" />
            <span className="text-sm text-muted-foreground">{t('جارٍ تحميل حالة المصادر…', 'Loading source status…')}</span>
          </div>
        )}

        {!loading && !error && SOURCE_ORDER.every(key => !sources[key]) && (
          <div className="rounded-xl border-2 border-blue-300/65 bg-card p-8 text-center text-sm text-muted-foreground shadow-sm shadow-blue-400/10">
            {t('لا توجد مصادر لعرضها حالياً.', 'There are currently no sources to display.')}
          </div>
        )}

        {!loading && SOURCE_ORDER.map(key => {
          const src = sources[key];
          if (!src) return null;
          const belowThreshold = src.qualityThreshold > 0 && src.qualityPct < src.qualityThreshold;
          const localizedSource = SOURCE_COPY[key];
          const sourceLabel = localizedSource
            ? t(...localizedSource.label)
            : lang === 'ar'
              ? (src.label || t('مصدر آخر', 'Other source'))
              : t('مصدر آخر', 'Other source');
          const sourceDescription = localizedSource
            ? t(...localizedSource.description)
            : lang === 'ar'
              ? (src.description || t('لا يتوفر وصف لهذا المصدر.', 'No description is available for this source.'))
              : t('لا يتوفر وصف لهذا المصدر.', 'No description is available for this source.');

          return (
            <div
              key={key}
              className={cn(
                'bg-card border-2 rounded-2xl p-6 space-y-4 transition-all',
                !src.enabled ? 'opacity-75 border-purple-300/55' : 'border-primary/45 shadow-sm shadow-primary/10 hover:border-primary/70',
                belowThreshold && src.enabled && 'border-amber-300'
              )}
            >
              {/* Title row */}
              <div className="flex items-start gap-4">
                <div className={cn(
                  'w-12 h-12 rounded-xl flex items-center justify-center shrink-0 text-2xl',
                  src.enabled ? 'bg-primary/10 text-primary' : 'bg-muted text-muted-foreground'
                )}>
                  {SOURCE_ICONS[key] ?? src.icon}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-3 flex-wrap">
                    <h2 className="text-lg font-black text-primary" dir="auto">{sourceLabel}</h2>
                    <StatusBadge enabled={src.enabled} t={t} />
                    {!src.canToggle && (
                      <span className="text-xs text-muted-foreground bg-muted px-2 py-0.5 rounded-full">
                        {t('دائم التفعيل', 'Always enabled')}
                      </span>
                    )}
                  </div>
                  <p className="text-sm text-muted-foreground mt-1" dir="auto">{sourceDescription}</p>
                </div>

                {/* [DISABLED Aug-2026] Toggle — أُزيل لأن البوت (المصدر الوحيد القابل للتبديل) معطَّل */}
              </div>

              {/* Stats row */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                <div className="bg-muted/40 rounded-xl p-3 text-center">
                  <p className="text-2xl font-black text-primary">{src.docs.toLocaleString(lang === 'ar' ? 'ar-SA' : 'en-US')}</p>
                  <p className="text-xs text-muted-foreground mt-0.5">{t('وثيقة مُفهرَسة', 'Indexed documents')}</p>
                </div>
                <div className="bg-muted/40 rounded-xl p-3 text-center">
                  <p className="text-2xl font-black text-primary">{src.chunks.toLocaleString(lang === 'ar' ? 'ar-SA' : 'en-US')}</p>
                  <p className="text-xs text-muted-foreground mt-0.5">{t('مقطع نصي', 'Text chunks')}</p>
                </div>
                <div className="bg-muted/40 rounded-xl p-3 text-center">
                  <p className={cn('text-2xl font-black', src.lowQualityChunks > 0 ? 'text-amber-600' : 'text-green-600')}>
                    {src.lowQualityChunks.toLocaleString(lang === 'ar' ? 'ar-SA' : 'en-US')}
                  </p>
                  <p className="text-xs text-muted-foreground mt-0.5">{t('مقطع منخفض الجودة', 'Low-quality chunks')}</p>
                </div>
                <div className="bg-muted/40 rounded-xl p-3 text-center">
                  <p className="text-xs text-muted-foreground mb-1">{t('آخر تحديث', 'Last updated')}</p>
                  <p className="text-xs font-semibold text-foreground leading-tight" dir="auto">
                    {formatDate(src.lastSyncAt, lang, t)}
                  </p>
                </div>
              </div>

              {/* Quality bar */}
              <QualityBar pct={src.qualityPct} threshold={src.qualityThreshold} lang={lang} t={t} />
            </div>
          );
        })}

        {/* Legend */}
        {!loading && (
          <div className="bg-muted/30 rounded-xl p-4 text-xs text-muted-foreground space-y-1 border border-primary/35">
            <p className="font-bold text-foreground text-sm mb-2">{t('مفتاح القراءة', 'Legend')}</p>
            <p>{t('• مفعّل: المصدر يظهر في نتائج البحث وفي الاستشارات.', '• Enabled: The source appears in search results and consultations.')}</p>
            <p>{t('• متوقف: الوثائق محفوظة في قاعدة البيانات لكنها مستثناة من نتائج المستخدمين.', '• Disabled: Documents remain in the database but are excluded from user results.')}</p>
            <p>{t('• الجودة: نسبة المقاطع التي تحوي نصاً قانونياً واضحاً. يُمنع تفعيل أي مصدر دون الحد المطلوب.', '• Quality: The percentage of chunks containing clear legal text. Sources below the required threshold cannot be enabled.')}</p>
            <p>{t('• المقطع منخفض الجودة: مقطع أقل من 80 حرفاً أو يحتوي على رموز غير مقروءة.', '• Low-quality chunk: A chunk shorter than 80 characters or containing unreadable symbols.')}</p>
          </div>
        )}
      </div>
    </AdminSidebar>
  );
}
