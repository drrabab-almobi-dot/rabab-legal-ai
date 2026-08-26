import { useEffect } from 'react';
import { Link, useRoute } from 'wouter';
import { ArrowLeft, ArrowRight, CheckCircle2 } from 'lucide-react';
import { Navbar, Footer } from '@/components/layout';
import { setPageSEO } from '@/lib/seo';
import { getServiceById } from '@/lib/service-catalog';
import { useLang } from '@/hooks/use-language';
import { translateArabicText } from '@/lib/translations';

const branchFrameStyles = [
  {
    card: 'border-primary-foreground/70 hover:border-primary-foreground hover:shadow-primary-foreground/15',
    icon: 'border-2 border-primary-foreground/80 bg-primary-foreground/20 text-primary-foreground group-hover:bg-primary-foreground group-hover:text-primary',
  },
  {
    card: 'border-primary-foreground/70 hover:border-primary-foreground hover:shadow-primary-foreground/15',
    icon: 'border-2 border-primary-foreground/80 bg-primary-foreground/20 text-primary-foreground group-hover:bg-primary-foreground group-hover:text-primary',
  },
  {
    card: 'border-primary-foreground/70 hover:border-primary-foreground hover:shadow-primary-foreground/15',
    icon: 'border-2 border-primary-foreground/80 bg-primary-foreground/20 text-primary-foreground group-hover:bg-primary-foreground group-hover:text-primary',
  },
  {
    card: 'border-primary-foreground/70 hover:border-primary-foreground hover:shadow-primary-foreground/15',
    icon: 'border-2 border-primary-foreground/80 bg-primary-foreground/20 text-primary-foreground group-hover:bg-primary-foreground group-hover:text-primary',
  },
];

export default function ServiceDetails() {
  const [, params] = useRoute('/services/:serviceId');
  const service = getServiceById(params?.serviceId === 'pleadings' ? 'judicial' : params?.serviceId);
  const { lang, t } = useLang();
  const localize = (value: string) => lang === 'ar' ? value : translateArabicText(value);

  useEffect(() => {
    window.scrollTo(0, 0);
  }, [params?.serviceId]);

  if (!service) {
    setPageSEO({
      title: t('الخدمة غير موجودة', 'Service not found'),
      description: 'لم يتم العثور على الخدمة المطلوبة.',
    });

    return (
      <div className="min-h-screen bg-background flex flex-col" dir={lang === 'ar' ? 'rtl' : 'ltr'}>
        <Navbar />
        <main className="flex-1 flex items-center justify-center px-4 py-20">
          <div className="max-w-lg w-full text-center rounded-3xl border-2 border-primary-foreground/75 bg-card p-8 shadow-md shadow-primary-foreground/15">
            <h1 className="text-2xl font-bold text-secondary mb-3">{t('الخدمة غير موجودة', 'Service not found')}</h1>
            <p className="text-muted-foreground leading-relaxed mb-6">{t('ربما تغيّر رابط الخدمة أو لم يعد متاحاً.', 'The service link may have changed or it is no longer available.')}</p>
            <Link href="/#services" className="inline-flex items-center gap-2 rounded-xl bg-primary px-5 py-3 text-sm font-bold text-primary-foreground hover:bg-primary/90">
              <ArrowRight className="w-4 h-4" />
              {t('العودة إلى الخدمات', 'Back to services')}
            </Link>
          </div>
        </main>
        <Footer />
      </div>
    );
  }

  const ServiceIcon = service.icon;
  setPageSEO({
    title: localize(service.title),
    description: service.description,
    canonical: `https://rabablegal.com/services/${service.id}`,
  });

  return (
    <div className="min-h-screen bg-background flex flex-col" dir={lang === 'ar' ? 'rtl' : 'ltr'}>
      <Navbar />
      <main className="flex-1">
        <section className="bg-gradient-to-b from-primary to-[#0f1c3a] px-3 sm:px-5 lg:px-7 py-14 text-white">
          <div className="w-full">
            <Link
              href="/#services"
              aria-label={t('الرجوع إلى كل الخدمات', 'Back to all services')}
              className="inline-flex items-center gap-2 rounded-full border border-white/25 bg-white/10 px-4 py-2 text-sm font-bold text-white transition-colors hover:border-secondary hover:text-secondary"
            >
              <ArrowRight className="w-4 h-4 shrink-0" aria-hidden="true" />
              {t('رجوع إلى كل الخدمات', 'Back to all services')}
            </Link>

            <div className="mt-8 flex flex-col items-start gap-5 sm:flex-row sm:items-center">
              <div className="flex h-16 w-16 shrink-0 items-center justify-center rounded-2xl border border-primary-foreground/50 bg-primary-foreground/15 text-primary-foreground">
                <ServiceIcon className="h-8 w-8" />
              </div>
              <div>
                <p className="mb-2 text-base font-bold text-secondary">{t('خدماتنا القانونية', 'Our Legal Services')}</p>
                <h1 className="text-4xl font-black tracking-tight md:text-5xl">{localize(service.title)}</h1>
                <p className="mt-3 text-xl text-white/80">{localize(service.summary)}</p>
              </div>
            </div>
          </div>
        </section>

        <section className="px-3 sm:px-5 lg:px-7 py-12 md:py-16">
          <div className="w-full">
            <div className="mb-9 max-w-4xl">
              <div className="mb-3 inline-flex items-center gap-2 rounded-full bg-primary/10 px-3 py-1.5 text-sm font-bold text-primary">
                <CheckCircle2 className="h-4 w-4" />
                {t('اختر الفرع المناسب', 'Choose the right branch')}
              </div>
              <h2 className="text-3xl font-bold text-secondary md:text-4xl">
                {lang === 'ar' ? `فروع ${service.title}` : `${localize(service.title)} branches`}
              </h2>
              <p className="mt-3 text-lg leading-relaxed text-muted-foreground">{localize(service.description)}</p>
            </div>

            <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
              {service.branches.map((branch, index) => {
                const BranchIcon = branch.icon;
                const frameStyle = branchFrameStyles[index % branchFrameStyles.length];
                const content = (
                    <div className={`group h-full rounded-2xl border-2 bg-card p-6 ${lang === 'ar' ? 'text-right' : 'text-left'} shadow-sm transition-all hover:-translate-y-0.5 hover:shadow-md ${frameStyle.card}`}>
                    <div className="flex items-start gap-3">
                      <div className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-xl transition-colors ${frameStyle.icon}`}>
                        <BranchIcon className="h-5 w-5" />
                      </div>
                      <div className="min-w-0 flex-1">
                        <h3 className="text-lg font-bold text-secondary">{localize(branch.label)}</h3>
                        <p className="mt-1.5 text-base leading-relaxed text-foreground/80">{localize(branch.detail)}</p>
                      </div>
                      <ArrowLeft className="mt-1 h-4 w-4 shrink-0 text-primary" />
                    </div>
                  </div>
                );

                return branch.external ? (
                  <a key={branch.id} href={branch.href} target="_blank" rel="noopener noreferrer" className="block h-full">
                    {content}
                  </a>
                ) : (
                  <Link key={branch.id} href={branch.href} className="block h-full">
                    {content}
                  </Link>
                );
              })}
            </div>
          </div>
        </section>
      </main>
      <Footer />
    </div>
  );
}