import React, { useEffect, useState } from 'react';
import { useGetAdminStats, AdminStats } from '@workspace/api-client-react';
import { AdminSidebar } from '@/components/layout';
import { Card, CardContent, CardHeader, CardTitle, Skeleton } from '@/components/ui';
import { useLang } from '@/hooks/use-language';
import { Users, CreditCard, MessageSquare, TrendingUp, ThumbsUp, Gavel, FileText, Landmark, Database, BookOpen } from 'lucide-react';
const API_BASE = import.meta.env.BASE_URL.replace(/\/$/, '');

interface KBStats {
  judicial: number;
  circular: number;
  regulation: number;
  totalDocs: number;
  totalChunks: number;
}

function useKBStats() {
  const [data, setData] = useState<KBStats | null>(null);
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    fetch(`${API_BASE}/api/knowledge/stats`, { credentials: 'include' })
      .then(r => r.ok ? r.json() : null)
      .then(d => { if (d) setData(d); })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);
  return { data, loading };
}

interface RatingsSummary {
  total_ratings: number;
  rated_consultations: number;
  raters: number;
  rating_pct: number;
  last_7d: number;
}

function useRatingsSummary() {
  const [data, setData] = useState<RatingsSummary | null>(null);
  useEffect(() => {
    fetch(`${API_BASE}/api/admin/ratings-summary`, { credentials: 'include' })
      .then(r => r.json())
      .then(setData)
      .catch(() => {});
  }, []);
  return data;
}

export default function AdminDashboard() {
  const { lang, t } = useLang();
  const { data: stats, isLoading } = useGetAdminStats();
  const ratings = useRatingsSummary();
  const { data: kbStats, loading: kbLoading } = useKBStats();

  const mockStats: AdminStats = {
    totalUsers: 1245,
    activeSubscriptions: 890,
    totalRevenue: 145000,
    consultationsToday: 42,
    pendingPayments: 5,
    totalConsultations: 3450,
    revenueThisMonth: 32000,
    newUsersThisMonth: 120
  };

  const displayStats = stats || mockStats; // Fallback to mock for UI dev

  return (
    <AdminSidebar><div dir={lang === 'ar' ? 'rtl' : 'ltr'}>
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-primary">{t('لوحة القيادة', 'Dashboard')}</h1>
        <p className="text-muted-foreground mt-1">{t('نظرة عامة على أداء المنصة', 'Platform performance overview')}</p>
      </div>

      {isLoading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
          {[1,2,3,4].map(i => <Card key={i}><CardContent className="p-6"><Skeleton className="h-16 w-full" /></CardContent></Card>)}
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
          <Card className="border-2 border-primary/45 shadow-sm shadow-primary/10 border-l-4 border-l-primary">
            <CardContent className="p-6 flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-muted-foreground mb-1">{t('إجمالي المستخدمين', 'Total users')}</p>
                <h3 className="text-3xl font-bold text-primary">{displayStats.totalUsers}</h3>
              </div>
              <div className="w-12 h-12 bg-primary/10 rounded-full flex items-center justify-center text-primary">
                <Users className="w-6 h-6" />
              </div>
            </CardContent>
          </Card>
          
          <Card className="border-2 border-secondary/55 shadow-sm shadow-secondary/10 border-l-4 border-l-secondary">
            <CardContent className="p-6 flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-muted-foreground mb-1">{t('الاشتراكات النشطة', 'Active subscriptions')}</p>
                <h3 className="text-3xl font-bold text-primary">{displayStats.activeSubscriptions}</h3>
              </div>
              <div className="w-12 h-12 bg-secondary/20 rounded-full flex items-center justify-center text-secondary">
                <CreditCard className="w-6 h-6" />
              </div>
            </CardContent>
          </Card>

          <Card className="border-2 border-green-400/60 shadow-sm shadow-green-400/10 border-l-4 border-l-green-500">
            <CardContent className="p-6 flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-muted-foreground mb-1">{t('إيرادات الشهر', 'Monthly revenue')}</p>
                <h3 className="text-3xl font-bold text-primary">{displayStats.revenueThisMonth?.toLocaleString(lang === 'ar' ? 'ar-SA' : 'en-US')} {t('ر.س', 'SAR')}</h3>
              </div>
              <div className="w-12 h-12 bg-green-100 rounded-full flex items-center justify-center text-green-600">
                <TrendingUp className="w-6 h-6" />
              </div>
            </CardContent>
          </Card>

          <Card className="border-2 border-blue-400/60 shadow-sm shadow-blue-400/10 border-l-4 border-l-blue-500">
            <CardContent className="p-6 flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-muted-foreground mb-1">{t('استشارات اليوم', 'Consultations today')}</p>
                <h3 className="text-3xl font-bold text-primary">{displayStats.consultationsToday}</h3>
              </div>
              <div className="w-12 h-12 bg-blue-100 rounded-full flex items-center justify-center text-blue-600">
                <MessageSquare className="w-6 h-6" />
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* ── إحصاءات قاعدة المعرفة ── */}
      <div className="mb-6">
        <h2 className="text-base font-semibold text-foreground mb-3 flex items-center gap-2">
          <BookOpen className="w-4 h-4 text-primary" />
          {t('قاعدة المعرفة القانونية', 'Legal knowledge base')}
        </h2>
        {kbLoading ? (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            {[1,2,3,4].map(i => <Card key={i}><CardContent className="p-4"><Skeleton className="h-10 w-full" /></CardContent></Card>)}
          </div>
        ) : (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            {[
              { label: t("أحكام قضائية", "Judicial rulings"), value: kbStats?.judicial ?? 0, icon: <Gavel className="w-5 h-5" />, color: "text-amber-500", border: "border-l-amber-500" },
              { label: t("تعاميم ولوائح", "Circulars & regulations"), value: kbStats?.circular ?? 0, icon: <FileText className="w-5 h-5" />, color: "text-cyan-600", border: "border-l-cyan-600" },
              { label: t("أنظمة وقرارات", "Laws & decisions"), value: kbStats?.regulation ?? 0, icon: <Landmark className="w-5 h-5" />, color: "text-emerald-600", border: "border-l-emerald-600" },
              { label: t("إجمالي الوثائق", "Total documents"), value: kbStats?.totalDocs ?? 0, icon: <Database className="w-5 h-5" />, color: "text-primary", border: "border-l-primary" },
            ].map((s, i) => (
              <Card key={i} className={`border-2 border-primary/35 shadow-sm shadow-primary/5 border-l-4 ${s.border}`}>
                <CardContent className="p-4 flex items-center justify-between">
                  <div>
                    <p className="text-xs text-muted-foreground mb-1">{s.label}</p>
                     <p className={`text-2xl font-bold ${s.color}`}>{s.value.toLocaleString(lang === 'ar' ? 'ar-SA' : 'en-US')}</p>
                  </div>
                  <div className={`opacity-60 ${s.color}`}>{s.icon}</div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </div>

      {/* Ratings stats */}
      <div className="mb-6">
        <h2 className="text-base font-semibold text-foreground mb-3 flex items-center gap-2">
          <ThumbsUp className="w-4 h-4 text-green-600" />
          {t('تقييمات الردود', 'Response ratings')}
        </h2>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {[
            { label: t("إجمالي الإعجابات", "Total likes"), value: ratings?.total_ratings ?? "—", color: "text-green-600" },
            { label: t("استشارات مُقيَّمة", "Rated consultations"), value: ratings?.rated_consultations ?? "—", color: "text-primary" },
            { label: t("آخر 7 أيام", "Last 7 days"), value: ratings?.last_7d ?? "—", color: "text-blue-600" },
            { label: t("نسبة الردود المُقيَّمة", "Rated response rate"), value: ratings ? `${ratings.rating_pct ?? 0}%` : "—", color: "text-amber-600" },
          ].map((s, i) => (
            <Card key={i} className="border-2 border-blue-300/55 shadow-sm shadow-blue-400/5">
              <CardContent className="p-4">
                <p className="text-xs text-muted-foreground mb-1">{s.label}</p>
                <p className={`text-2xl font-bold ${s.color}`}>{s.value}</p>
              </CardContent>
            </Card>
          ))}
        </div>
      </div>

      {/* Chart mock area */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        <Card className="lg:col-span-2 border-2 border-primary/40 shadow-sm shadow-primary/10">
          <CardHeader>
            <CardTitle>{t('أداء الإيرادات (آخر 6 أشهر)', 'Revenue performance (last 6 months)')}</CardTitle>
          </CardHeader>
          <CardContent className="h-80 flex items-center justify-center bg-blue-50/30 border-2 border-dashed border-blue-400/60 m-6 rounded-lg">
            <p className="text-muted-foreground">{t('رسم بياني للإيرادات', 'Revenue chart')}</p>
          </CardContent>
        </Card>
        
        <Card className="border-2 border-purple-300/55 shadow-sm shadow-purple-400/5">
          <CardHeader>
            <CardTitle>{t('النشاط الأخير', 'Recent activity')}</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {[
                {text: t("اشتراك جديد في باقة الأعمال", "New Business plan subscription"), time: t("قبل 10 دقائق", "10 minutes ago")},
                {text: t("استشارة جديدة (قانون العمل)", "New consultation (Labor Law)"), time: t("قبل ساعة", "1 hour ago")},
                {text: t("تسجيل مستخدم جديد", "New user registration"), time: t("قبل ساعتين", "2 hours ago")},
                {text: t("تجديد اشتراك شهري", "Monthly subscription renewal"), time: t("قبل 3 ساعات", "3 hours ago")},
                {text: t("استشارة مجاب عليها", "Consultation answered"), time: t("قبل 5 ساعات", "5 hours ago")},
              ].map((act, i) => (
                <div key={i} className="flex gap-3 items-start border-b border-border/50 pb-3 last:border-0">
                  <div className="w-2 h-2 mt-2 rounded-full bg-secondary shrink-0"></div>
                  <div>
                    <p className="text-sm font-medium text-foreground">{act.text}</p>
                    <p className="text-xs text-muted-foreground">{act.time}</p>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>
    </div></AdminSidebar>
  );
}
