import React from 'react';
import { Link } from 'wouter';
import {
  getGetMySubscriptionQueryKey,
  useGetMySubscription,
  useListMyConsultations,
  useListMyInvoices,
} from '@workspace/api-client-react';
import { useAuth } from '@/hooks/use-auth';
import { Navbar, Footer } from '@/components/layout';
import { Button, Card, CardContent, CardHeader, CardTitle, Badge, Skeleton } from '@/components/ui';
import { MessageSquare, FileText, CheckCircle2, Clock, Plus, ExternalLink, AlertCircle, RefreshCw, CalendarClock, Download, BarChart2, Building2 } from 'lucide-react';
import { format } from 'date-fns';
import { arSA } from 'date-fns/locale';
import { useLang } from '@/hooks/use-language';

export default function Dashboard() {
  const { user } = useAuth();
  const { lang, t } = useLang();
  
  const { data: subscription, isLoading: subLoading } = useGetMySubscription({
    query: { queryKey: getGetMySubscriptionQueryKey(), retry: false }
  });
  
  const { data: consultations, isLoading: consLoading } = useListMyConsultations();
  const { data: invoices, isLoading: invLoading } = useListMyInvoices();

  const getTaskTypeBadge = (taskType?: string | null) => {
    if (!taskType) return null;
    if (taskType === 'judicial') {
      return <Badge variant="secondary" className="gap-1 text-xs">🏛️ {t('قضائية', 'Judicial')}</Badge>;
    }
    return <Badge className="gap-1 text-xs bg-primary/10 text-primary border border-primary/20 hover:bg-primary/15">⚖️ {t('قانونية', 'Legal')}</Badge>;
  };

  const getStatusBadge = (status: string) => {
    switch(status) {
      case 'answered': return <Badge className="bg-green-500 hover:bg-green-600">{t('مجاب عليها', 'Answered')}</Badge>;
      case 'pending': return <Badge variant="secondary" className="bg-amber-500 text-white hover:bg-amber-600">{t('قيد المراجعة', 'Under review')}</Badge>;
      case 'closed': return <Badge variant="outline">{t('مغلقة', 'Closed')}</Badge>;
      default: return <Badge variant="outline">{status}</Badge>;
    }
  };

  const formatDate = (dateStr: string) => {
    try {
      return format(new Date(dateStr), 'dd MMMM yyyy', lang === 'ar' ? { locale: arSA } : undefined);
    } catch {
      return dateStr;
    }
  };

  // Progress calculations
  const total = subscription?.questionsAllowed || 0;
  const used = subscription?.questionsUsed || 0;
  const remaining = total - used;
  const progressPercent = total > 0 ? (used / total) * 100 : 0;
  const isUnlimited = total >= 9999;

  // Days remaining until subscription expiry
  const daysRemaining = React.useMemo(() => {
    if (!subscription?.endDate) return null;
    const end = new Date(subscription.endDate);
    const now = new Date();
    const diff = Math.ceil((end.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
    return diff;
  }, [subscription?.endDate]);
  const isExpiringSoon = daysRemaining !== null && daysRemaining <= 7 && daysRemaining >= 0;

  return (
    <div className="min-h-screen flex flex-col bg-muted/20" dir={lang === 'ar' ? 'rtl' : 'ltr'}>
      <Navbar />
      
      <main className="flex-1 container mx-auto px-4 py-8 max-w-6xl">
        <div className="flex flex-col md:flex-row justify-between items-start md:items-center mb-8 gap-4">
          <div>
            <h1 className="text-2xl font-bold text-primary">{t('لوحة التحكم', 'Dashboard')}</h1>
            <p className="text-muted-foreground mt-1">{t(`مرحباً ${user?.name}، إليك نظرة عامة على حسابك`, `Welcome ${user?.name}, here is an overview of your account`)}</p>
          </div>
          <div className="flex items-center gap-2">
            <Link href="/usage-log">
              <Button variant="outline" className="gap-2 text-muted-foreground">
                <BarChart2 className="w-4 h-4" /> {t('سجل الاستهلاك', 'Usage log')}
              </Button>
            </Link>
            <Link href="/organization">
              <Button variant="outline" className="gap-2 text-muted-foreground">
                <Building2 className="w-4 h-4" /> {t('المنشأة', 'Organization')}
              </Button>
            </Link>
            <Link href="/consultation">
              <Button className="gap-2 shadow-md">
                <Plus className="w-4 h-4" /> {t('ابدأ استشارة جديدة', 'Start a new consultation')}
              </Button>
            </Link>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          {/* Left Column: Subscription & Quick Actions */}
          <div className="space-y-6">
            <Card className="border-secondary/40 shadow-sm shadow-secondary/10 overflow-hidden">
              <div className="h-2 bg-secondary w-full"></div>
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-primary">
                  <CheckCircle2 className="w-5 h-5 text-secondary" /> 
                  {t('الباقة الحالية', 'Current plan')}
                </CardTitle>
              </CardHeader>
              <CardContent>
                {subLoading ? (
                  <div className="space-y-4">
                    <Skeleton className="h-6 w-1/2" />
                    <Skeleton className="h-24 w-full rounded-full" />
                    <Skeleton className="h-10 w-full" />
                  </div>
                ) : subscription && subscription.status === 'active' ? (
                  <div className="space-y-4">
                    {/* Package name + billing cycle badge */}
                    <div className="flex flex-col items-center gap-1.5">
                       <h3 className="text-lg font-bold text-center">{subscription.package?.nameAr || t('باقة غير معروفة', 'Unknown plan')}</h3>
                      {subscription.package?.billingPeriod && (
                        <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-secondary/15 text-secondary border border-secondary/30">
                           {subscription.package.billingPeriod === 'annual' ? t('سنوي', 'Annual') : t('شهري', 'Monthly')}
                        </span>
                      )}
                    </div>

                    {/* Expiry warning banner */}
                    {isExpiringSoon && (
                      <div className="flex items-center gap-2 p-3 rounded-lg bg-amber-50 border border-amber-200 text-amber-800 text-sm">
                        <CalendarClock className="w-4 h-4 shrink-0 text-amber-600" />
                        <span>
                          {daysRemaining === 0
                             ? t('ينتهي اشتراكك اليوم!', 'Your subscription ends today!')
                            : daysRemaining === 1
                             ? t('ينتهي اشتراكك غداً!', 'Your subscription ends tomorrow!')
                             : t(`ينتهي اشتراكك خلال ${daysRemaining} أيام`, `Your subscription ends in ${daysRemaining} days`)}
                        </span>
                      </div>
                    )}

                    {/* Consultations progress bar */}
                    <div className="space-y-2">
                      <div className="flex justify-between text-sm">
                         <span className="text-muted-foreground">{t('الاستشارات المستخدمة', 'Consultations used')}</span>
                        <span className="font-medium">
                          {isUnlimited ? (
                            <span className="flex items-center gap-1">{used} <span className="text-muted-foreground">/ ∞</span></span>
                          ) : (
                            <span>{used} / {total}</span>
                          )}
                        </span>
                      </div>
                      <div className="w-full h-2.5 bg-muted rounded-full overflow-hidden">
                        <div
                          className="h-full rounded-full transition-all duration-500"
                          style={{
                            width: isUnlimited ? '100%' : `${Math.min(progressPercent, 100)}%`,
                            backgroundColor: progressPercent >= 90 ? '#ef4444' : progressPercent >= 70 ? '#f59e0b' : 'hsl(var(--secondary))',
                          }}
                        />
                      </div>
                      {!isUnlimited && (
                         <p className="text-xs text-muted-foreground text-start">{t(`${remaining} استشارة متبقية`, `${remaining} consultations remaining`)}</p>
                      )}
                      {/* Low-quota warning banner — shown when ≤20% remain */}
                      {!isUnlimited && total > 0 && progressPercent >= 80 && (
                        <div className="flex items-start gap-2 p-3 rounded-lg bg-orange-50 border border-orange-200 text-orange-800 text-sm">
                          <AlertCircle className="w-4 h-4 shrink-0 text-orange-500 mt-0.5" />
                          <span>
                             {t('تبقّت لكِ ', 'Only ')}<strong>{remaining}</strong>{t(' استشارة فقط. ', ' consultations remain. ')}
                            <Link href="/pricing" className="underline font-semibold hover:text-orange-900">
                               {t('جدّدي باقتك', 'Renew your plan')}
                            </Link>{' '}
                             {t(' قبل النفاد.', ' before they run out.')}
                          </span>
                        </div>
                      )}
                    </div>

                    {/* Dates */}
                    <div className="grid grid-cols-2 gap-2 pt-2 border-t border-border">
                      <div className="text-center p-2 rounded-lg bg-muted/40">
                         <p className="text-xs text-muted-foreground mb-0.5">{t('تاريخ البدء', 'Start date')}</p>
                        <p className="text-sm font-medium">{formatDate(subscription.startDate)}</p>
                      </div>
                      {subscription.endDate && (
                        <div className={`text-center p-2 rounded-lg ${isExpiringSoon ? 'bg-amber-50 border border-amber-200' : 'bg-muted/40'}`}>
                          <p className="text-xs text-muted-foreground mb-0.5">
                            {subscription.package?.billingPeriod
                               ? t('التجديد القادم', 'Next renewal')
                               : t('تاريخ الانتهاء', 'End date')}
                          </p>
                          <p className={`text-sm font-medium ${isExpiringSoon ? 'text-amber-700' : ''}`}>{formatDate(subscription.endDate)}</p>
                          {daysRemaining !== null && daysRemaining > 0 && (
                             <p className="text-xs text-muted-foreground">{t(`${daysRemaining} يوم متبقي`, `${daysRemaining} days remaining`)}</p>
                          )}
                        </div>
                      )}
                    </div>

                    {isExpiringSoon ? (
                      <Link href="/pricing" className="block">
                        <Button className="w-full gap-2 bg-amber-600 hover:bg-amber-700 text-white">
                           <RefreshCw className="w-4 h-4" /> {t('جدّد اشتراكك', 'Renew your subscription')}
                        </Button>
                      </Link>
                    ) : (
                      <Link href="/pricing" className="block">
                         <Button variant="outline" className="w-full border-primary/20 hover:bg-primary/5">{t('ترقية الباقة', 'Upgrade plan')}</Button>
                      </Link>
                    )}
                  </div>
                ) : (
                  <div className="text-center py-6 space-y-4">
                    <div className="w-12 h-12 bg-muted rounded-full flex items-center justify-center mx-auto text-muted-foreground">
                      <AlertCircle className="w-6 h-6" />
                    </div>
                    <div>
                       <p className="font-semibold text-primary">{t('لا توجد باقة نشطة', 'No active plan')}</p>
                       <p className="text-sm text-muted-foreground mt-1">{t('اشترك في إحدى باقاتنا للبدء', 'Subscribe to one of our plans to get started')}</p>
                    </div>
                    <Link href="/pricing" className="block">
                       <Button className="w-full">{t('عرض الباقات', 'View plans')}</Button>
                    </Link>
                  </div>
                )}
              </CardContent>
            </Card>

            <Card className="border-blue-400/30 shadow-sm shadow-blue-400/5">
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-primary">
                  <FileText className="w-5 h-5 text-blue-500" /> {t('الفواتير الأخيرة', 'Recent invoices')}
                </CardTitle>
              </CardHeader>
              <CardContent>
                {invLoading ? (
                  <div className="space-y-3">
                    <Skeleton className="h-12 w-full" />
                    <Skeleton className="h-12 w-full" />
                  </div>
                ) : invoices && invoices.length > 0 ? (
                  <div className="space-y-3">
                    {invoices.slice(0, 3).map(inv => (
                      <div key={inv.id} className="flex items-center justify-between p-3 rounded-lg border border-border bg-card">
                        <div>
                           <p className="font-medium text-sm">{inv.packageNameAr || t('اشتراك', 'Subscription')}</p>
                          <p className="text-xs text-muted-foreground">{formatDate(inv.createdAt)}</p>
                        </div>
                         <div className="text-start flex flex-col items-end gap-1">
                           <p className="font-bold text-primary">{inv.totalAmount} <span className="text-xs font-normal">{t('ر.س', 'SAR')}</span></p>
                          <div className="flex items-center gap-2">
                            <Link href={`/invoices/${inv.id}`} className="text-xs text-secondary hover:underline flex items-center gap-1">
                               {t('عرض', 'View')} <ExternalLink className="w-3 h-3" />
                            </Link>
                            <a
                              href={`${import.meta.env.BASE_URL.replace(/\/$/, '')}/api/invoices/${inv.id}/pdf`}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="text-xs text-muted-foreground hover:text-primary flex items-center gap-1"
                            >
                              PDF <Download className="w-3 h-3" />
                            </a>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                   <p className="text-sm text-muted-foreground text-center py-4">{t('لا توجد فواتير سابقة', 'No previous invoices')}</p>
                )}
              </CardContent>
            </Card>
          </div>

          {/* Right Column: Consultations */}
          <div className="lg:col-span-2">
            <Card className="border-accent/30 shadow-sm shadow-accent/5 h-full">
              <CardHeader className="flex flex-row items-center justify-between pb-2 border-b border-accent/20 mb-4">
                <CardTitle className="flex items-center gap-2 text-primary">
                  <MessageSquare className="w-5 h-5 text-accent" /> {t('الاستشارات السابقة', 'Previous consultations')}
                </CardTitle>
              </CardHeader>
              <CardContent>
                {consLoading ? (
                  <div className="space-y-4">
                    {[1, 2, 3].map(i => (
                      <Skeleton key={i} className="h-24 w-full rounded-lg" />
                    ))}
                  </div>
                ) : consultations && consultations.length > 0 ? (
                  <div className="space-y-4">
                    {consultations.map(cons => (
                      <div key={cons.id} className="p-4 rounded-xl border border-border bg-card hover:border-secondary/30 transition-colors flex flex-col sm:flex-row gap-4 justify-between sm:items-center">
                        <div className="flex-1">
                          <div className="flex items-center gap-2 mb-2 flex-wrap">
                            {getStatusBadge(cons.status)}
                            {getTaskTypeBadge(cons.taskType)}
                            <span className="text-xs text-muted-foreground flex items-center gap-1">
                              <Clock className="w-3 h-3" /> {formatDate(cons.createdAt)}
                            </span>
                          </div>
                          <h4 className="font-bold text-primary mb-1">{cons.title}</h4>
                          {cons.areaAr && <p className="text-sm text-muted-foreground">{cons.areaAr}</p>}
                        </div>
                        <Link href={`/consultation/${cons.id}`}>
                          <Button variant="outline" className="w-full sm:w-auto gap-2">
                             {t('فتح المحادثة', 'Open conversation')} <ExternalLink className="w-4 h-4" />
                          </Button>
                        </Link>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="text-center py-16">
                    <div className="w-16 h-16 bg-muted rounded-full flex items-center justify-center mx-auto text-muted-foreground mb-4">
                      <MessageSquare className="w-8 h-8" />
                    </div>
                     <h3 className="text-lg font-bold text-primary mb-2">{t('لا توجد استشارات بعد', 'No consultations yet')}</h3>
                     <p className="text-muted-foreground mb-6">{t('ابدأ أول استشارة قانونية لك الآن واحصل على رد فوري.', 'Start your first legal consultation now and get an immediate response.')}</p>
                    <Link href="/consultation">
                      <Button className="gap-2">
                         <Plus className="w-4 h-4" /> {t('ابدأ استشارة جديدة', 'Start a new consultation')}
                      </Button>
                    </Link>
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
        </div>
      </main>

      <Footer />
    </div>
  );
}
