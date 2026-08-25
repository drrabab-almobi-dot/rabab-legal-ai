import React, { useState } from 'react';
import { setPageSEO } from '@/lib/seo';
import { Link, useLocation } from 'wouter';
import { useListPackages, Package } from '@workspace/api-client-react';
import { Navbar, Footer } from '@/components/layout';
import { Button, Card, CardContent, CardHeader, CardTitle, Badge, Skeleton } from '@/components/ui';
import { Check, Info, Building2, Star, Users, Zap, FileText, Phone, Shield, Search } from 'lucide-react';
import { useLang } from '@/hooks/use-language';
import { cn } from '@/lib/utils';
import { translateArabicText } from '@/lib/translations';

const HARDCODED_PACKAGES: Package[] = [
  {
    id: 1,
    nameAr: "تجربة مجانية",
    nameEn: "Free Trial",
    descriptionAr: "٣ تجارب مجانية — اخترها من أي خدمة",
    price: 0,
    questionsAllowed: 3,
    type: 'free',
    isActive: true,
    features: ["٣ تجارب من أي خدمة", "٧ أيام صلاحية", "توثيق برقم الجوال", "بلا بطاقة ائتمانية"],
    sortOrder: 1
  },
  {
    id: 2,
    nameAr: "باقة الاستشارات",
    nameEn: "Questions Pack",
    descriptionAr: "7 استشارات قانونية شهرياً",
    price: 149,
    questionsAllowed: 7,
    type: 'questions',
    isActive: true,
    features: ["7 استشارات شهرياً", "تحليل عقد واحد/شهر", "تصدير Word", "حفظ سجل الاستشارات", "مرجعية قانونية موثّقة"],
    sortOrder: 2
  },
  {
    id: 3,
    nameAr: "الاشتراك الشهري",
    nameEn: "Monthly Subscription",
    descriptionAr: "20 استشارة قانونية شهرياً",
    price: 349,
    questionsAllowed: 9999,
    type: 'monthly',
    isActive: true,
    isPopular: true,
    features: ["20 استشارة شهرياً", "تحليل 5 عقود/شهر", "تصدير Word", "استشارة هاتفية 15 دقيقة", "قاعدة المعرفة (قريباً)"],
    sortOrder: 3
  },
  {
    id: 4,
    nameAr: "باقة الأعمال",
    nameEn: "Business Package",
    descriptionAr: "100 استشارة قانونية للمنشآت",
    price: 699,
    questionsAllowed: 9999,
    type: 'business',
    isActive: true,
    features: ["100 استشارة شهرياً", "تحليل 10 عقود/شهر", "تصدير Word", "استشارة هاتفية 30 دقيقة", "قاعدة المعرفة (قريباً)"],
    sortOrder: 4
  }
];

const ICON_MAP: Record<string, React.ReactNode> = {
  free: <Zap className="w-6 h-6" />,
  questions: <FileText className="w-6 h-6" />,
  monthly: <Star className="w-6 h-6" />,
  business: <Building2 className="w-6 h-6" />,
};

const COLOR_MAP: Record<string, string> = {
  free: 'from-emerald-400 to-emerald-600',
  questions: 'from-secondary to-secondary/70',
  monthly: 'from-blue-500 to-blue-700',
  business: 'from-accent to-purple-700',
};

const BORDER_MAP: Record<string, string> = {
  free:      'border-2 border-emerald-400/80 shadow-[0_0_0_1px_rgba(52,211,153,0.35),0_0_24px_rgba(52,211,153,0.18)]',
  questions: 'border-2 border-secondary/80 shadow-[0_0_0_1px_hsl(191_100%_50%_/_0.35),0_0_24px_hsl(191_100%_50%_/_0.16)]',
  monthly:   'border-2 border-blue-400/80 shadow-[0_0_0_1px_rgba(96,165,250,0.35),0_0_24px_rgba(96,165,250,0.16)]',
  business:  'border-2 border-accent/80 shadow-[0_0_0_1px_hsl(263_87%_65%_/_0.35),0_0_24px_hsl(263_87%_65%_/_0.16)]',
};

// ── Comparison Table features ──────────────────────────────────────────────────
const COMPARE_FEATURES = [
  { feature: 'تجارب مجانية (٣ من أي خدمة)', free: true, q: false, monthly: false, business: false },
  { feature: 'عدد الاستشارات', free: '3', q: '7', monthly: '20/شهر', business: '100/شهر' },
  { feature: 'صياغة ومراجعة العقود', free: '3', q: '1/شهر', monthly: '5/شهر', business: '10/شهر' },
  { feature: 'رد فوري بالذكاء الاصطناعي', free: true, q: true, monthly: true, business: true },
  { feature: 'تصدير Word قابل للتحرير', free: false, q: true, monthly: true, business: true },
  { feature: 'تحليل العقود (رفع ملف)', free: false, q: false, monthly: true, business: true },
  { feature: 'بحث قاعدة المعرفة', free: false, q: false, monthly: true, business: true },
  { feature: 'صياغة خطابات قانونية', free: false, q: false, monthly: false, business: true },
  { feature: 'أولوية في الرد والدعم', free: false, q: false, monthly: false, business: true },
  { feature: 'استشارة هاتفية', free: false, q: false, monthly: '15 دقيقة/شهر', business: '30 دقيقة/شهر' },
  { feature: 'فاتورة ضريبية رسمية', free: false, q: true, monthly: true, business: true },
];

function FeatureCell({ val }: { val: boolean | string }) {
  if (val === false) return <span className="text-white/40 text-lg">—</span>;
  if (val === true) return <Check className="w-5 h-5 text-green-600 mx-auto" />;
  return <span className="text-xs font-medium text-foreground">{val}</span>;
}

export default function Pricing() {
  setPageSEO({ title: 'الأسعار والباقات | RABAB LEGAL AI', description: 'باقات RABAB LEGAL AI للاستشارة القانونية السعودية — تشمل صياغة العقود السعودية ومراجعة العقود القانونية للأفراد والشركات.', canonical: 'https://rabablegal.com/pricing' });
  const [, setLocation] = useLocation();
  const { lang, t } = useLang();
  const [showCompare, setShowCompare] = useState(false);
  const { data: apiPackages, isLoading, isError } = useListPackages();

  const packages = (apiPackages && apiPackages.length > 0)
    ? apiPackages.sort((a, b) => (a.sortOrder || 0) - (b.sortOrder || 0))
    : HARDCODED_PACKAGES;

  const handleSelectPackage = (pkgId: number) => setLocation(`/payment?packageId=${pkgId}`);

  return (
    <div className="min-h-screen flex flex-col" dir={lang === 'ar' ? 'rtl' : 'ltr'}>
      <Navbar />

      <main className="flex-1 bg-muted/20 pb-24">
        {/* Header */}
        <section className="bg-primary text-primary-foreground py-20 px-4 text-center">
          <h1 className="text-2xl sm:text-3xl md:text-4xl lg:text-5xl font-bold mb-6">
            {t('باقات مرنة تناسب احتياجاتك', 'Flexible Plans for Every Need')}
          </h1>
          <p className="text-lg text-white max-w-2xl mx-auto leading-relaxed">
            {t(
              'استثمر في حمايتك القانونية. اختر الباقة التي تلبي متطلباتك الشخصية أو التجارية.',
              'Invest in your legal protection. Choose the plan that fits your personal or business needs.'
            )}
          </p>
        </section>

        {/* Pricing Cards */}
        <section className="container mx-auto px-4 -mt-10">
          {isLoading && !isError ? (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
              {[1, 2, 3, 4].map(i => (
                <Card key={i} className="h-auto min-h-[200px]">
                  <CardHeader><Skeleton className="h-8 w-3/4 mx-auto" /><Skeleton className="h-4 w-1/2 mx-auto mt-2" /></CardHeader>
                  <CardContent><Skeleton className="h-16 w-1/2 mx-auto mt-4" /><div className="mt-8 space-y-3"><Skeleton className="h-4 w-full" /><Skeleton className="h-4 w-full" /></div></CardContent>
                </Card>
              ))}
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 max-w-7xl mx-auto pt-5">
              {packages.map((pkg) => (
                <Card
                  key={pkg.id}
                  className={cn(
                    "relative flex flex-col transition-transform hover:-translate-y-2 duration-300 overflow-visible",
                    BORDER_MAP[pkg.type] || BORDER_MAP['questions']
                  )}
                >
                  {pkg.isPopular && (
                    <div className="absolute top-0 left-1/2 -translate-x-1/2 -translate-y-1/2 z-10 bg-secondary text-primary px-4 py-1 rounded-full text-sm font-bold shadow-sm whitespace-nowrap flex items-center gap-1">
                      <Star className="w-3.5 h-3.5 fill-primary" />
                      {t('الأكثر طلباً', 'Most Popular')}
                    </div>
                  )}

                  {/* Color gradient top */}
                  <div className={cn("h-1.5 rounded-t-xl bg-gradient-to-l", COLOR_MAP[pkg.type] || 'from-primary to-primary/80')} />

                  <CardHeader className="text-center pt-7 pb-4">
                    <div className={cn("w-12 h-12 rounded-xl bg-gradient-to-br flex items-center justify-center text-white mx-auto mb-3 shadow", COLOR_MAP[pkg.type] || 'from-primary to-primary/80')}>
                      {ICON_MAP[pkg.type]}
                    </div>
                    <CardTitle className="text-xl font-bold text-white mb-1">
                      {lang === 'ar' ? pkg.nameAr : (pkg.nameEn || translateArabicText(pkg.nameAr))}
                    </CardTitle>
                    <p className="text-sm text-white h-8 leading-relaxed">
                      {lang === 'ar' ? pkg.descriptionAr : translateArabicText(pkg.descriptionAr ?? '')}
                    </p>
                  </CardHeader>

                  <CardContent className="flex-1 flex flex-col">
                    <div className="text-center mb-6">
                      {pkg.price === 0 ? (
                        <span className="text-4xl font-bold" style={{color:'hsl(47 100% 48%)'}}>{t('مجاني', 'Free')}</span>
                      ) : (
                        <>
                          <span className="text-5xl font-bold" style={{color:'hsl(47 100% 48%)'}}>{pkg.price}</span>
                          <span className="text-white mr-1 ml-1">{t('ريال', 'SAR')}</span>
                          
                        </>
                      )}
                    </div>

                    <ul className="space-y-2.5 mb-6 flex-1">
                      {pkg.features.map((feature, i) => (
                        <li key={i} className="flex items-center gap-2">
                          <Check className="w-3.5 h-3.5 text-green-600 shrink-0" />
                          <span className="text-sm text-white">{lang === 'ar' ? feature : translateArabicText(feature)}</span>
                        </li>
                      ))}
                    </ul>

                    <Button
                      onClick={() => handleSelectPackage(pkg.id)}
                      className="w-full h-12 font-bold text-base bg-secondary text-primary hover:bg-secondary/90"
                      variant="default"
                    >
                      {pkg.type === 'free' ? t('ابدأ مجاناً', 'Start Free') : t('اشترك الآن', 'Subscribe')}
                    </Button>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}

          {/* Compare Toggle */}
          <div className="text-center mt-10">
            <button
              onClick={() => setShowCompare(!showCompare)}
              className="inline-flex items-center gap-2 text-sm text-secondary hover:underline font-medium"
            >
              {showCompare ? t('إخفاء جدول المقارنة ↑', 'Hide comparison ↑') : t('مقارنة الباقات بالتفصيل ↓', 'Compare plans in detail ↓')}
            </button>
          </div>

          {/* Comparison Table */}
          {showCompare && (
            <div className="mt-8 max-w-5xl mx-auto overflow-x-auto rounded-2xl border-2 border-secondary/55 bg-card p-2 shadow-sm shadow-secondary/10">
              <table className="w-full min-w-[680px] text-sm border-collapse">
                <thead>
                  <tr className="bg-primary text-primary-foreground">
                    <th className="px-4 py-3 text-right font-bold">{t('الميزة', 'Feature')}</th>
                    {['مجاني', 'استشارات', 'شهري', 'أعمال'].map(n => (
                      <th key={n} className="px-4 py-3 text-center font-bold">{lang === 'ar' ? n : translateArabicText(n)}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {COMPARE_FEATURES.map((row, i) => (
                    <tr key={i} className={i % 2 === 0 ? 'bg-background' : 'bg-muted/30'}>
                      <td className="px-4 py-2.5 text-white">{lang === 'ar' ? row.feature : translateArabicText(row.feature)}</td>
                      <td className="px-4 py-2.5 text-center"><FeatureCell val={row.free} /></td>
                      <td className="px-4 py-2.5 text-center"><FeatureCell val={row.q} /></td>
                      <td className="px-4 py-2.5 text-center"><FeatureCell val={row.monthly} /></td>
                      <td className="px-4 py-2.5 text-center"><FeatureCell val={row.business} /></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {/* Enterprise CTA */}
          <div className="mt-12 max-w-4xl mx-auto">
            <div className="bg-gradient-to-l from-accent/10 via-primary/10 to-secondary/10 border-2 border-accent/60 rounded-2xl p-8 flex flex-col md:flex-row items-center gap-6 shadow-[0_0_0_1px_hsl(263_87%_65%_/_0.2),0_0_28px_hsl(263_87%_65%_/_0.12)]">
              <div className="w-16 h-16 bg-accent/15 border border-accent/50 rounded-2xl flex items-center justify-center text-accent shrink-0">
                <Building2 className="w-8 h-8" />
              </div>
              <div className="flex-1 text-center md:text-right">
                <h3 className="text-xl font-bold text-foreground mb-2">
                  {t('باقة المؤسسات أو الشركات', 'Enterprise Plan')}
                </h3>
                <p className="text-base text-white leading-relaxed">
                  {t(
                    'حلول قانونية مخصصة للمؤسسات الكبرى، ودعم مباشر في أوقات العمل الرسمية.',
                    'Custom legal solutions for large enterprises: team management, multiple accounts, dedicated API, SLA, and 24/7 support.'
                  )}
                </p>
              </div>
              <div className="shrink-0">
                <Link href="/contact">
                  <Button size="lg" className="font-bold gap-2 bg-secondary text-primary hover:bg-secondary/90 shadow-lg shadow-secondary/20">
                    <Phone className="w-4 h-4" />
                    {t('تواصل معنا', 'Contact Us')}
                  </Button>
                </Link>
              </div>
            </div>
          </div>

          {/* Note */}
        </section>
      </main>

      <Footer />
    </div>
  );
}
