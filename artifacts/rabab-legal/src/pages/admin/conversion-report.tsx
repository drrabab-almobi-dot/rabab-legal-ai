/**
 * تقرير التحويل — Conversion Report
 * يعرض: المسجلين، من استنفد التجربة، نسبة التحويل، متوسط الخدمات قبل الاشتراك
 */
import React, { useEffect, useState } from 'react';
import { AdminSidebar } from '@/components/layout';
import { Loader2, Users, TrendingUp, Sparkles, BarChart3, RefreshCw } from 'lucide-react';

const BASE = import.meta.env.BASE_URL.replace(/\/$/, '');

interface ReportData {
  summary: {
    totalUsers: number;
    paidUsers: number;
    exhaustedTrialUsers: number;
    conversionRate: string;
    avgServicesBeforeUpgrade: number;
  };
  byServiceType: { service_type: string; cnt: number }[];
  dailyRegistrations: { day: string; registrations: number }[];
  dailyConversions: { day: string; conversions: number }[];
}

const SERVICE_LABELS: Record<string, string> = {
  consultation: 'استشارات قانونية',
  contract_draft: 'صياغة عقود',
  contract_review: 'مراجعة عقود',
};

function StatCard({ label, value, sub, icon, color }: { label: string; value: string | number; sub?: string; icon: React.ReactNode; color: string }) {
  return (
    <div className={`bg-card border-2 rounded-2xl p-5 ${color}`}>
      <div className="flex items-start justify-between gap-2 mb-3">
        <p className="text-sm font-medium text-muted-foreground">{label}</p>
        <div className="text-muted-foreground/60">{icon}</div>
      </div>
      <p className="text-3xl font-black text-foreground">{value}</p>
      {sub && <p className="text-xs text-muted-foreground mt-1">{sub}</p>}
    </div>
  );
}

export default function ConversionReport() {
  const [data, setData] = useState<ReportData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const load = () => {
    setLoading(true);
    setError('');
    fetch(`${BASE}/api/admin/conversion-report`, { credentials: 'include' })
      .then(r => r.json())
      .then(d => { if (d.error) throw new Error(d.error); setData(d); })
      .catch(e => setError(e.message))
      .finally(() => setLoading(false));
  };

  useEffect(load, []);

  return (
    <AdminSidebar>
      <div className="max-w-5xl mx-auto space-y-6" dir="rtl">
        {/* Header */}
        <div className="flex items-start justify-between gap-4">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <TrendingUp className="w-5 h-5 text-primary" />
              <h1 className="text-2xl font-bold text-primary">تقرير التحويل</h1>
            </div>
            <p className="text-sm text-muted-foreground">
              من التجربة المجانية إلى الاشتراك المدفوع — يتحدّث فورياً من قاعدة البيانات
            </p>
          </div>
          <button onClick={load} disabled={loading}
            className="flex items-center gap-2 px-4 py-2 border border-border rounded-xl text-sm font-bold hover:bg-muted/50 transition disabled:opacity-50">
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
            تحديث
          </button>
        </div>

        {error && <div className="p-4 bg-red-50 border border-red-200 rounded-xl text-red-700 text-sm">{error}</div>}

        {loading && !data && (
          <div className="flex items-center justify-center h-48">
            <Loader2 className="w-6 h-6 animate-spin text-primary" />
          </div>
        )}

        {data && (
          <>
            {/* KPI Cards */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <StatCard
                label="إجمالي المسجلين"
                value={data.summary.totalUsers.toLocaleString('ar')}
                icon={<Users className="w-5 h-5" />}
                color="border-border"
              />
              <StatCard
                label="استنفدوا التجربة"
                value={data.summary.exhaustedTrialUsers.toLocaleString('ar')}
                sub="استخدموا الخدمات الثلاث"
                icon={<Sparkles className="w-5 h-5" />}
                color="border-amber-200"
              />
              <StatCard
                label="مشتركون مدفوعون"
                value={data.summary.paidUsers.toLocaleString('ar')}
                icon={<TrendingUp className="w-5 h-5" />}
                color="border-green-200"
              />
              <StatCard
                label="نسبة التحويل"
                value={`${data.summary.conversionRate}%`}
                sub={`متوسط ${data.summary.avgServicesBeforeUpgrade} خدمة قبل الاشتراك`}
                icon={<BarChart3 className="w-5 h-5" />}
                color="border-primary/30"
              />
            </div>

            {/* Conversion Funnel */}
            <div className="bg-card border-2 border-border rounded-2xl p-6">
              <h2 className="font-bold text-primary mb-5">قمع التحويل</h2>
              <div className="space-y-3">
                {[
                  { label: 'مسجلون', value: data.summary.totalUsers, pct: 100, color: 'bg-primary' },
                  { label: 'استنفدوا التجربة المجانية', value: data.summary.exhaustedTrialUsers, pct: data.summary.totalUsers > 0 ? Math.round((data.summary.exhaustedTrialUsers / data.summary.totalUsers) * 100) : 0, color: 'bg-amber-500' },
                  { label: 'اشتركوا بخطة مدفوعة', value: data.summary.paidUsers, pct: data.summary.totalUsers > 0 ? Math.round((data.summary.paidUsers / data.summary.totalUsers) * 100) : 0, color: 'bg-green-500' },
                ].map(row => (
                  <div key={row.label} className="flex items-center gap-4">
                    <p className="w-48 shrink-0 text-sm text-muted-foreground text-right">{row.label}</p>
                    <div className="flex-1 h-4 bg-muted rounded-full overflow-hidden">
                      <div className={`h-full ${row.color} rounded-full transition-all`} style={{ width: `${row.pct}%` }} />
                    </div>
                    <div className="w-24 text-left shrink-0">
                      <span className="text-sm font-bold">{row.value.toLocaleString('ar')}</span>
                      <span className="text-xs text-muted-foreground ms-1">({row.pct}%)</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* By Service Type */}
            {data.byServiceType.length > 0 && (
              <div className="bg-card border-2 border-border rounded-2xl p-6">
                <h2 className="font-bold text-primary mb-4">الخدمات المستخدمة حسب النوع</h2>
                <div className="space-y-3">
                  {data.byServiceType.map(row => {
                    const total = data.byServiceType.reduce((s, r) => s + r.cnt, 0);
                    const pct = total > 0 ? Math.round((row.cnt / total) * 100) : 0;
                    return (
                      <div key={row.service_type} className="flex items-center gap-4">
                        <p className="w-40 shrink-0 text-sm text-right">{SERVICE_LABELS[row.service_type] ?? row.service_type}</p>
                        <div className="flex-1 h-3 bg-muted rounded-full overflow-hidden">
                          <div className="h-full bg-primary rounded-full" style={{ width: `${pct}%` }} />
                        </div>
                        <p className="w-20 text-left text-sm font-bold shrink-0">{row.cnt.toLocaleString('ar')} ({pct}%)</p>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Daily registrations table (last 7 rows) */}
            {data.dailyRegistrations.length > 0 && (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="bg-card border-2 border-border rounded-2xl p-5">
                  <h2 className="font-bold text-primary mb-3">التسجيلات اليومية (آخر 30 يوماً)</h2>
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead><tr className="border-b border-border"><th className="py-1 text-right font-medium text-muted-foreground">اليوم</th><th className="py-1 text-left font-medium text-muted-foreground">تسجيلات</th></tr></thead>
                      <tbody>
                        {[...data.dailyRegistrations].reverse().slice(0, 10).map(r => (
                          <tr key={r.day} className="border-b border-border/50">
                            <td className="py-1.5 text-right font-mono text-xs">{r.day}</td>
                            <td className="py-1.5 text-left font-bold">{r.registrations}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
                <div className="bg-card border-2 border-border rounded-2xl p-5">
                  <h2 className="font-bold text-primary mb-3">الاشتراكات اليومية (آخر 30 يوماً)</h2>
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead><tr className="border-b border-border"><th className="py-1 text-right font-medium text-muted-foreground">اليوم</th><th className="py-1 text-left font-medium text-muted-foreground">اشتراكات</th></tr></thead>
                      <tbody>
                        {[...data.dailyConversions].reverse().slice(0, 10).map(r => (
                          <tr key={r.day} className="border-b border-border/50">
                            <td className="py-1.5 text-right font-mono text-xs">{r.day}</td>
                            <td className="py-1.5 text-left font-bold">{r.conversions}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              </div>
            )}
          </>
        )}

        {/* ── أعلى الحسابات استهلاكاً ───────────────────────────────────── */}
        <TopConsumers />
      </div>
    </AdminSidebar>
  );
}

// ─── أعلى 15 حساباً استهلاكاً ─────────────────────────────────────────────────
interface Consumer {
  id: number; name: string; email: string;
  package_name: string; today_used: number; month_used: number; month_pct: number | null;
}

function TopConsumers() {
  const [data, setData] = useState<Consumer[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch(`${BASE}/api/admin/usage-stats/top-consumers`, { credentials: 'include' })
      .then(r => r.json())
      .then(d => { setData(d.consumers ?? []); setLoading(false); })
      .catch(() => setLoading(false));
  }, []);

  if (loading) return <div className="flex items-center gap-2 text-sm text-muted-foreground py-4"><Loader2 className="w-4 h-4 animate-spin" />جارٍ تحميل إحصائيات الاستهلاك…</div>;
  if (!data.length) return null;

  return (
    <div className="bg-card border-2 border-border rounded-2xl p-5">
      <h2 className="font-bold text-primary mb-4">أعلى الحسابات استهلاكاً — الشهر الحالي</h2>
      <div className="overflow-x-auto">
        <table className="w-full text-sm" dir="rtl">
          <thead>
            <tr className="border-b border-border text-muted-foreground text-xs">
              <th className="py-2 text-right font-medium">الحساب</th>
              <th className="py-2 text-right font-medium">الباقة</th>
              <th className="py-2 text-left font-medium">اليوم</th>
              <th className="py-2 text-left font-medium">الشهر</th>
              <th className="py-2 text-left font-medium">% الشهري</th>
            </tr>
          </thead>
          <tbody>
            {data.map(c => (
              <tr key={c.id} className="border-b border-border/40 hover:bg-muted/30">
                <td className="py-2 text-right">
                  <p className="font-medium">{c.name}</p>
                  <p className="text-xs text-muted-foreground">{c.email}</p>
                </td>
                <td className="py-2 text-right text-xs text-muted-foreground">{c.package_name}</td>
                <td className="py-2 text-left font-bold">{c.today_used}</td>
                <td className="py-2 text-left font-bold">{c.month_used}</td>
                <td className="py-2 text-left">
                  {c.month_pct !== null ? (
                    <span className={`font-bold ${Number(c.month_pct) >= 80 ? 'text-destructive' : Number(c.month_pct) >= 50 ? 'text-yellow-600' : 'text-green-600'}`}>
                      {c.month_pct}%
                    </span>
                  ) : <span className="text-muted-foreground">—</span>}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
