/**
 * حالة المصادر — Source Status Admin Page
 * تُظهر كل مصدر: الحالة، عدد الوثائق، نسبة جودة النص، آخر مزامنة
 * ومفتاح تشغيل تيليجرام + تحذير الجودة
 */
import React, { useEffect, useState, useCallback } from 'react';
import { AdminSidebar } from '@/components/layout';
import { cn } from '@/lib/utils';
import {
  CheckCircle2, XCircle, AlertTriangle, RefreshCw,
  Loader2, ToggleLeft, ToggleRight, Info, Shield,
  FileText, Upload, Wifi,
} from 'lucide-react';

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

function StatusBadge({ enabled }: { enabled: boolean }) {
  return (
    <span className={cn(
      'inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-bold',
      enabled
        ? 'bg-green-100 text-green-800 border border-green-200'
        : 'bg-red-100 text-red-700 border border-red-200'
    )}>
      {enabled
        ? <><CheckCircle2 className="w-3 h-3" /> مفعّل</>
        : <><XCircle className="w-3 h-3" /> متوقف</>
      }
    </span>
  );
}

function QualityBar({ pct, threshold }: { pct: number; threshold: number }) {
  const belowThreshold = threshold > 0 && pct < threshold;
  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between text-xs">
        <span className="text-muted-foreground">جودة النص المستخرج</span>
        <span className={cn('font-bold', belowThreshold ? 'text-red-600' : pct >= 75 ? 'text-green-600' : 'text-amber-600')}>
          {pct}%
        </span>
      </div>
      <div className="h-2 bg-muted rounded-full overflow-hidden">
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
          دون الحد المطلوب ({threshold}%) — لا يمكن تفعيل هذا المصدر في نتائج المستخدمين
        </p>
      )}
    </div>
  );
}

function formatDate(iso: string | null): string {
  if (!iso) return 'لم تتم مزامنة';
  try {
    return new Date(iso).toLocaleString('ar-SA', {
      year: 'numeric', month: 'short', day: 'numeric',
      hour: '2-digit', minute: '2-digit',
    });
  } catch { return iso; }
}

const SOURCE_ICONS: Record<string, React.ReactNode> = {
  // [DISABLED Aug-2026] telegram: <Wifi className="w-6 h-6" />,
  official:      <Shield className="w-6 h-6" />,
  lawyer_upload: <Upload className="w-6 h-6" />,
  unknown:       <FileText className="w-6 h-6" />,
};

// [DISABLED Aug-2026] 'telegram' أُزيل — البوت معطَّل ولا يُعرض كمصدر نشط
const SOURCE_ORDER = ['official', 'lawyer_upload', 'unknown'];

export default function AdminSourceStatus() {
  const [sources, setSources] = useState<Record<string, SourceInfo>>({});
  const [loading, setLoading] = useState(true);
  // [DISABLED Aug-2026] const [toggling, setToggling] = useState(false);
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
      setError(e?.message ?? 'خطأ في جلب البيانات');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  // [DISABLED Aug-2026] toggleTelegram — البوت معطَّل، حُذف الزر من الواجهة
  // الكود محفوظ هنا لإمكانية الإحياء:
  // const toggleTelegram = async (newEnabled: boolean) => { ... PUT /api/admin/telegram-import ... };

  return (
    <AdminSidebar>
      <div className="max-w-4xl mx-auto space-y-6" dir="rtl">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-black text-primary">حالة المصادر</h1>
            <p className="text-muted-foreground text-sm mt-1">
              مراقبة وتحكم في مصادر المحتوى المستخدمة في الاستشارات والبحث
            </p>
          </div>
          <button
            onClick={load}
            disabled={loading}
            className="flex items-center gap-2 text-sm text-muted-foreground hover:text-primary transition-colors px-3 py-2 rounded-lg hover:bg-muted"
          >
            {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}
            تحديث
          </button>
        </div>

        {/* Approved sources notice */}
        <div className="bg-primary/5 border border-primary/20 rounded-xl p-4 flex gap-3">
          <Info className="w-5 h-5 text-primary shrink-0 mt-0.5" />
          <div className="text-sm">
            <p className="font-bold text-primary mb-1">المصادر المعتمدة رسمياً</p>
            <p className="text-muted-foreground">
              المصدر الوحيد المعتمد للنصوص النظامية هو <strong>بوابة الأنظمة السعودية</strong> التابعة لهيئة الخبراء بمجلس الوزراء،
              إضافة إلى <strong>المستندات التي يرفعها المحامي بنفسه</strong> داخل حسابه.
              أي مصدر آخر يخضع لمراجعة الجودة قبل إتاحته للمستخدمين.
            </p>
          </div>
        </div>

        {error && (
          <div className="bg-red-50 border border-red-200 rounded-xl p-4 text-red-700 text-sm flex items-center gap-2">
            <XCircle className="w-4 h-4 shrink-0" />
            {error}
          </div>
        )}

        {saveMsg && (
          <div className={cn(
            'rounded-xl p-3 text-sm font-semibold text-center border',
            saveMsg.startsWith('✅') ? 'bg-green-50 border-green-200 text-green-800' :
            saveMsg.startsWith('⏸') ? 'bg-blue-50 border-blue-200 text-blue-800' :
            'bg-red-50 border-red-200 text-red-700'
          )}>
            {saveMsg}
          </div>
        )}

        {loading && (
          <div className="flex items-center justify-center py-16">
            <Loader2 className="w-8 h-8 animate-spin text-primary" />
          </div>
        )}

        {!loading && SOURCE_ORDER.map(key => {
          const src = sources[key];
          if (!src) return null;
          const belowThreshold = src.qualityThreshold > 0 && src.qualityPct < src.qualityThreshold;

          return (
            <div
              key={key}
              className={cn(
                'bg-card border rounded-2xl p-6 space-y-4 transition-all',
                !src.enabled ? 'opacity-75 border-muted' : 'border-border shadow-sm',
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
                    <h2 className="text-lg font-black text-primary">{src.label}</h2>
                    <StatusBadge enabled={src.enabled} />
                    {!src.canToggle && (
                      <span className="text-xs text-muted-foreground bg-muted px-2 py-0.5 rounded-full">
                        دائم التفعيل
                      </span>
                    )}
                  </div>
                  <p className="text-sm text-muted-foreground mt-1">{src.description}</p>
                </div>

                {/* [DISABLED Aug-2026] Toggle — أُزيل لأن البوت (المصدر الوحيد القابل للتبديل) معطَّل */}
              </div>

              {/* Stats row */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                <div className="bg-muted/40 rounded-xl p-3 text-center">
                  <p className="text-2xl font-black text-primary">{src.docs.toLocaleString('ar-SA')}</p>
                  <p className="text-xs text-muted-foreground mt-0.5">وثيقة مُفهرَسة</p>
                </div>
                <div className="bg-muted/40 rounded-xl p-3 text-center">
                  <p className="text-2xl font-black text-primary">{src.chunks.toLocaleString('ar-SA')}</p>
                  <p className="text-xs text-muted-foreground mt-0.5">مقطع نصي</p>
                </div>
                <div className="bg-muted/40 rounded-xl p-3 text-center">
                  <p className={cn('text-2xl font-black', src.lowQualityChunks > 0 ? 'text-amber-600' : 'text-green-600')}>
                    {src.lowQualityChunks.toLocaleString('ar-SA')}
                  </p>
                  <p className="text-xs text-muted-foreground mt-0.5">مقطع منخفض الجودة</p>
                </div>
                <div className="bg-muted/40 rounded-xl p-3 text-center">
                  <p className="text-xs text-muted-foreground mb-1">آخر تحديث</p>
                  <p className="text-xs font-semibold text-foreground leading-tight">
                    {formatDate(src.lastSyncAt)}
                  </p>
                </div>
              </div>

              {/* Quality bar */}
              <QualityBar pct={src.qualityPct} threshold={src.qualityThreshold} />
            </div>
          );
        })}

        {/* Legend */}
        {!loading && (
          <div className="bg-muted/30 rounded-xl p-4 text-xs text-muted-foreground space-y-1 border border-border">
            <p className="font-bold text-foreground text-sm mb-2">مفتاح القراءة</p>
            <p>• <strong>مفعّل</strong>: المصدر يظهر في نتائج البحث وفي الاستشارات.</p>
            <p>• <strong>متوقف</strong>: الوثائق محفوظة في قاعدة البيانات لكنها مستثناة من نتائج المستخدمين.</p>
            <p>• <strong>الجودة</strong>: نسبة المقاطع التي تحوي نصاً قانونياً واضحاً. يُمنع تفعيل أي مصدر دون الحد المطلوب.</p>
            <p>• <strong>المقطع منخفض الجودة</strong>: مقطع أقل من 80 حرفاً أو يحتوي على رموز غير مقروءة.</p>
          </div>
        )}
      </div>
    </AdminSidebar>
  );
}
