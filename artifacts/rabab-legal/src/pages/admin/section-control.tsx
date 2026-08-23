/**
 * لوحة تحكم الأقسام — Section Visibility Control
 * يُظهر لكل قسم: حالته، نسبة جودة الأرشيف، عدد المقاطع السليمة/المحجوبة
 * ولا يُسمح بتفعيل أي قسم مخفي إلا بعد تجاوز حد الجودة المحدد
 */
import React, { useEffect, useState } from 'react';
import { AdminSidebar } from '@/components/layout';
import {
  Eye, EyeOff, RefreshCw, AlertTriangle, CheckCircle2,
  ShieldAlert, Loader2, Save, Settings,
} from 'lucide-react';
import { cn } from '@/lib/utils';

const BASE = import.meta.env.BASE_URL.replace(/\/$/, '');

interface SectionVisibility {
  showJudicial: boolean;
  showCirculars: boolean;
  showLegalBlog: boolean;
  showRegulations: boolean;
  qualityThresholds: { judicial: number; circular: number; legal_blog: number };
}

interface CategoryQuality {
  totalDocs: number;
  totalChunks: number;
  blockedChunks: number;
  healthPct: number;
}

function HealthBar({ pct }: { pct: number }) {
  return (
    <div className="flex items-center gap-2">
      <div className="flex-1 h-2 bg-muted rounded-full overflow-hidden">
        <div
          className={cn('h-full rounded-full transition-all duration-500',
            pct >= 75 ? 'bg-green-500' : pct >= 50 ? 'bg-amber-400' : 'bg-red-500'
          )}
          style={{ width: `${pct}%` }}
        />
      </div>
      <span className={cn('text-xs font-bold w-10 text-right',
        pct >= 75 ? 'text-green-600' : pct >= 50 ? 'text-amber-600' : 'text-red-600'
      )}>
        {pct}%
      </span>
    </div>
  );
}

const SECTION_DEFS = [
  {
    key: 'showJudicial' as const,
    catKey: 'judicial',
    threshKey: 'judicial' as const,
    label: 'السوابق القضائية والمدوّنات',
    desc: 'أحكام المحاكم، الدوائر، المدوّنات القضائية الصادرة عن وزارة العدل والجهات القضائية.',
    icon: '⚖️',
    warningNote: 'مغلق بسبب مشاكل في استخراج الأرقام والبيانات من ملفات PDF القضائية.',
  },
  {
    key: 'showCirculars' as const,
    catKey: 'circular',
    threshKey: 'circular' as const,
    label: 'التعاميم والأوامر الإدارية',
    desc: 'تعاميم وزارة العدل والجهات الرسمية المتزامنة عبر قنوات تيليجرام والزحف الآلي.',
    icon: '📋',
    warningNote: 'مغلق بسبب مشاكل في اكتمال بيانات التعاميم ودقة الاستشهاد.',
  },
  {
    key: 'showLegalBlog' as const,
    catKey: 'legal_blog',
    threshKey: 'legal_blog' as const,
    label: 'المدوّنات الفقهية',
    desc: 'المحتوى الفقهي والتحليلي غير الرسمي المرفوع في قاعدة المعرفة.',
    icon: '📖',
    warningNote: 'مغلق مؤقتاً ريثما يكتمل مراجعة المحتوى.',
  },
  {
    key: 'showRegulations' as const,
    catKey: 'regulation',
    threshKey: null,
    label: 'الأنظمة واللوائح (هيئة الخبراء)',
    desc: 'النصوص النظامية الصادرة عن هيئة الخبراء — المصدر المعتمد الرئيسي.',
    icon: '📜',
    warningNote: null,
  },
];

export default function SectionControl() {
  const [settings, setSettings] = useState<SectionVisibility | null>(null);
  const [quality, setQuality] = useState<Record<string, CategoryQuality>>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState('');
  const [thresholdEdit, setThresholdEdit] = useState<{ judicial: string; circular: string; legal_blog: string }>({
    judicial: '80', circular: '75', legal_blog: '80',
  });

  useEffect(() => {
    Promise.all([
      fetch(`${BASE}/api/admin/platform-settings`, { credentials: 'include' }).then(r => r.json()),
      fetch(`${BASE}/api/admin/section-quality`, { credentials: 'include' }).then(r => r.json()),
    ])
      .then(([settingsData, qualityData]) => {
        setSettings(settingsData.sectionVisibility);
        setQuality(qualityData.categories ?? {});
        const t = settingsData.sectionVisibility?.qualityThresholds;
        if (t) setThresholdEdit({ judicial: String(t.judicial), circular: String(t.circular), legal_blog: String(t.legal_blog) });
      })
      .catch(() => setError('فشل في تحميل البيانات'))
      .finally(() => setLoading(false));
  }, []);

  const canEnable = (sec: typeof SECTION_DEFS[number]) => {
    if (!sec.threshKey || sec.catKey === 'regulation') return true;
    const q = quality[sec.catKey];
    if (!q) return false;
    const threshold = settings?.qualityThresholds[sec.threshKey] ?? 80;
    return q.healthPct >= threshold;
  };

  const toggle = (key: keyof SectionVisibility) => {
    if (!settings) return;
    const sec = SECTION_DEFS.find(s => s.key === key);
    if (sec && !settings[key] && !canEnable(sec)) return; // blocked
    setSettings(prev => prev ? { ...prev, [key]: !prev[key] } : prev);
  };

  const save = async () => {
    if (!settings) return;
    setSaving(true);
    setError('');
    try {
      const merged = {
        ...settings,
        qualityThresholds: {
          judicial: parseInt(thresholdEdit.judicial) || 80,
          circular: parseInt(thresholdEdit.circular) || 75,
          legal_blog: parseInt(thresholdEdit.legal_blog) || 80,
        },
      };
      const r = await fetch(`${BASE}/api/admin/platform-settings`, {
        method: 'PUT',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sectionVisibility: merged }),
      });
      if (!r.ok) throw new Error('فشل الحفظ');
      setSettings(merged);
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } catch (e: any) {
      setError(e?.message ?? 'فشل في الحفظ');
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <AdminSidebar>
        <div className="flex items-center justify-center h-48"><Loader2 className="w-6 h-6 animate-spin text-primary" /></div>
      </AdminSidebar>
    );
  }

  return (
    <AdminSidebar>
      <div className="max-w-4xl mx-auto space-y-6" dir="rtl">

        {/* Header */}
        <div className="flex items-start justify-between gap-4">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <Settings className="w-5 h-5 text-primary" />
              <h1 className="text-2xl font-bold text-primary">تحكم الأقسام</h1>
            </div>
            <p className="text-muted-foreground text-sm max-w-xl">
              أظهر أو أخفِ أقسام المنصة دون حذف البيانات. كل قسم مغلق يُمنع فيه النموذج من الاستشهاد بمصادره تلقائياً.
              لا يمكن تفعيل قسم مغلق إلا بعد تجاوز حد الجودة المحدد.
            </p>
          </div>
          <button
            onClick={save}
            disabled={saving}
            className="flex items-center gap-2 px-5 py-2.5 bg-primary text-primary-foreground rounded-xl font-bold hover:bg-primary/90 transition disabled:opacity-50 shrink-0"
          >
            {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : saved ? <CheckCircle2 className="w-4 h-4 text-green-300" /> : <Save className="w-4 h-4" />}
            {saved ? 'تم الحفظ' : 'حفظ التغييرات'}
          </button>
        </div>

        {error && (
          <div className="flex items-center gap-2 p-3 bg-red-50 border border-red-200 rounded-xl text-red-700 text-sm">
            <AlertTriangle className="w-4 h-4 shrink-0" />
            {error}
          </div>
        )}

        {/* Source restriction notice */}
        <div className="flex items-start gap-3 p-4 bg-amber-50 border border-amber-200 rounded-2xl">
          <AlertTriangle className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
          <div className="text-sm text-amber-800">
            <p className="font-bold mb-1">قيد المصادر الفعّال</p>
            <p>الأقسام المخفية تؤثر مباشرةً على محتوى الاستشارات: النموذج لن يستشهد بأي سابقة قضائية أو تعميم أو مدوّنة
            ما دامت مغلقة. المصدر الوحيد المعتمد في تلك الحالة هو <strong>بوابة هيئة الخبراء (laws.boe.gov.sa)</strong>.</p>
          </div>
        </div>

        {/* Sections */}
        {settings && SECTION_DEFS.map(sec => {
          const isOn = settings[sec.key] as boolean;
          const q = quality[sec.catKey];
          const threshold = sec.threshKey ? (settings.qualityThresholds[sec.threshKey] ?? 80) : null;
          const meetsThreshold = canEnable(sec);
          const blockedByQuality = !isOn && !meetsThreshold;

          return (
            <div
              key={sec.key}
              className={cn(
                'border-2 rounded-2xl p-5 transition-all',
                isOn ? 'border-green-300 bg-green-50/50' : 'border-muted bg-card'
              )}
            >
              <div className="flex items-start gap-4">
                <span className="text-3xl">{sec.icon}</span>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1 flex-wrap">
                    <h2 className="text-lg font-bold text-primary">{sec.label}</h2>
                    <span className={cn(
                      'text-xs font-bold px-2 py-0.5 rounded-full',
                      isOn ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'
                    )}>
                      {isOn ? '● ظاهر' : '● مخفي'}
                    </span>
                  </div>
                  <p className="text-sm text-muted-foreground mb-4 leading-relaxed">{sec.desc}</p>

                  {/* Quality bar */}
                  {q ? (
                    <div className="mb-4 space-y-1.5">
                      <div className="flex justify-between items-center text-xs text-muted-foreground">
                        <span>جودة الأرشيف</span>
                        <span>{q.totalChunks.toLocaleString('ar')} مقطع — {q.blockedChunks} محجوب — {q.totalDocs} وثيقة</span>
                      </div>
                      <HealthBar pct={q.healthPct} />
                      {threshold !== null && (
                        <p className="text-xs text-muted-foreground">
                          حد التفعيل: <strong>{threshold}%</strong>
                          {q.healthPct < threshold
                            ? ` — يحتاج ${threshold - q.healthPct}% إضافية`
                            : ' ✓ تجاوز الحد'}
                        </p>
                      )}
                    </div>
                  ) : (
                    <p className="text-xs text-muted-foreground mb-4">لا توجد بيانات مفهرسة في هذا القسم</p>
                  )}

                  {/* Warning */}
                  {sec.warningNote && !isOn && (
                    <p className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2 mb-3">
                      ⚠️ {sec.warningNote}
                    </p>
                  )}

                  {/* Blocked notice */}
                  {blockedByQuality && (
                    <div className="flex items-center gap-1.5 text-xs text-red-600 mb-3">
                      <ShieldAlert className="w-3.5 h-3.5" />
                      <span>لا يمكن التفعيل — الجودة الحالية ({q?.healthPct ?? 0}%) أقل من الحد المطلوب ({threshold}%)</span>
                    </div>
                  )}
                </div>

                {/* Toggle */}
                <button
                  onClick={() => toggle(sec.key)}
                  disabled={blockedByQuality}
                  title={blockedByQuality ? 'الجودة غير كافية للتفعيل' : isOn ? 'إخفاء القسم' : 'إظهار القسم'}
                  className={cn(
                    'flex items-center gap-1.5 px-4 py-2 rounded-xl text-sm font-bold transition shrink-0',
                    isOn
                      ? 'bg-red-100 text-red-700 hover:bg-red-200'
                      : blockedByQuality
                        ? 'bg-muted text-muted-foreground cursor-not-allowed'
                        : 'bg-green-100 text-green-700 hover:bg-green-200'
                  )}
                >
                  {isOn ? <><EyeOff className="w-4 h-4" />إخفاء</> : <><Eye className="w-4 h-4" />إظهار</>}
                </button>
              </div>
            </div>
          );
        })}

        {/* Quality Thresholds */}
        <div className="border-2 border-muted rounded-2xl p-5 bg-card">
          <div className="flex items-center gap-2 mb-4">
            <RefreshCw className="w-4 h-4 text-primary" />
            <h2 className="font-bold text-primary">حدود الجودة للتفعيل</h2>
          </div>
          <p className="text-sm text-muted-foreground mb-4">
            النسبة المئوية الدنيا لنظافة المقاطع المطلوبة قبل السماح بتفعيل كل قسم.
          </p>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            {([
              { key: 'judicial' as const, label: 'السوابق القضائية' },
              { key: 'circular' as const, label: 'التعاميم' },
              { key: 'legal_blog' as const, label: 'المدوّنات الفقهية' },
            ]).map(({ key, label }) => (
              <div key={key}>
                <label className="block text-xs font-bold text-muted-foreground mb-1">{label}</label>
                <div className="flex items-center gap-2">
                  <input
                    type="number"
                    min={0} max={100}
                    value={thresholdEdit[key]}
                    onChange={e => setThresholdEdit(prev => ({ ...prev, [key]: e.target.value }))}
                    className="w-20 px-2 py-1.5 border border-border rounded-lg text-sm text-center font-bold"
                  />
                  <span className="text-sm text-muted-foreground">%</span>
                </div>
              </div>
            ))}
          </div>
        </div>

      </div>
    </AdminSidebar>
  );
}
