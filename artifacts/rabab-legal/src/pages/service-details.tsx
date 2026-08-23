import { useEffect } from 'react';
import { Link, useRoute } from 'wouter';
import { ArrowLeft, ArrowRight, CheckCircle2 } from 'lucide-react';
import { Navbar, Footer } from '@/components/layout';
import { setPageSEO } from '@/lib/seo';
import { getServiceById } from '@/lib/service-catalog';

export default function ServiceDetails() {
  const [, params] = useRoute('/services/:serviceId');
  const service = getServiceById(params?.serviceId === 'pleadings' ? 'judicial' : params?.serviceId);

  useEffect(() => {
    window.scrollTo(0, 0);
  }, [params?.serviceId]);

  if (!service) {
    setPageSEO({
      title: 'الخدمة غير موجودة — RABAB LEGAL AI',
      description: 'لم يتم العثور على الخدمة المطلوبة.',
    });

    return (
      <div className="min-h-screen bg-background flex flex-col" dir="rtl">
        <Navbar />
        <main className="flex-1 flex items-center justify-center px-4 py-20">
          <div className="max-w-lg w-full text-center rounded-3xl border border-border bg-card p-8 shadow-sm">
            <h1 className="text-2xl font-bold text-foreground mb-3">الخدمة غير موجودة</h1>
            <p className="text-muted-foreground leading-relaxed mb-6">ربما تغيّر رابط الخدمة أو لم يعد متاحاً.</p>
            <Link href="/#services" className="inline-flex items-center gap-2 rounded-xl bg-primary px-5 py-3 text-sm font-bold text-primary-foreground hover:bg-primary/90">
              <ArrowRight className="w-4 h-4" />
              العودة إلى الخدمات
            </Link>
          </div>
        </main>
        <Footer />
      </div>
    );
  }

  const ServiceIcon = service.icon;
  setPageSEO({
    title: `${service.title} — RABAB LEGAL AI`,
    description: service.description,
    canonical: `https://rabablegal.com/services/${service.id}`,
  });

  return (
    <div className="min-h-screen bg-background flex flex-col" dir="rtl">
      <Navbar />
      <main className="flex-1">
        <section className="bg-gradient-to-b from-primary to-[#0f1c3a] px-4 py-14 text-white">
          <div className="mx-auto max-w-6xl">
            <Link
              href="/#services"
              aria-label="الرجوع إلى كل الخدمات"
              className="inline-flex items-center gap-2 rounded-full border border-white/25 bg-white/10 px-4 py-2 text-sm font-bold text-white transition-colors hover:border-secondary hover:text-secondary"
            >
              <ArrowRight className="w-4 h-4 shrink-0" aria-hidden="true" />
              رجوع إلى كل الخدمات
            </Link>

            <div className="mt-8 flex flex-col items-start gap-5 sm:flex-row sm:items-center">
              <div className="flex h-16 w-16 shrink-0 items-center justify-center rounded-2xl border border-secondary/40 bg-secondary/15 text-secondary">
                <ServiceIcon className="h-8 w-8" />
              </div>
              <div>
                <p className="mb-2 text-sm font-bold text-secondary">خدماتنا القانونية</p>
                <h1 className="text-3xl font-black tracking-tight md:text-4xl">{service.title}</h1>
                <p className="mt-3 text-lg text-white/80">{service.summary}</p>
              </div>
            </div>
          </div>
        </section>

        <section className="px-4 py-12 md:py-16">
          <div className="mx-auto max-w-7xl">
            <div className="mb-9 max-w-3xl">
              <div className="mb-3 inline-flex items-center gap-2 rounded-full bg-primary/10 px-3 py-1.5 text-xs font-bold text-primary">
                <CheckCircle2 className="h-4 w-4" />
                اختر الفرع المناسب
              </div>
              <h2 className="text-2xl font-bold text-foreground md:text-3xl">فروع {service.title}</h2>
              <p className="mt-3 leading-relaxed text-muted-foreground">{service.description}</p>
            </div>

            <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
              {service.branches.map((branch) => {
                const BranchIcon = branch.icon;
                const content = (
                  <div className="group h-full rounded-2xl border border-border/70 bg-card p-5 text-right shadow-sm transition-all hover:-translate-y-0.5 hover:border-primary/50 hover:shadow-md">
                    <div className="flex items-start gap-3">
                      <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary transition-colors group-hover:bg-primary group-hover:text-primary-foreground">
                        <BranchIcon className="h-5 w-5" />
                      </div>
                      <div className="min-w-0 flex-1">
                        <h3 className="font-bold text-foreground">{branch.label}</h3>
                        <p className="mt-1.5 text-sm leading-relaxed text-muted-foreground">{branch.detail}</p>
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