/**
 * مبادرات مجتمعية — صفحة عامة
 * بطاقات المبادرات مع روابط UTM وفتح في تبويب جديد
 */
import { useState, useEffect } from "react";
import { Navbar, Footer } from "@/components/layout";
import { setPageSEO } from "@/lib/seo";
import { Loader2, ExternalLink, Heart, AlertTriangle } from "lucide-react";
import { useLang } from "@/hooks/use-language";
import { FramedState } from "@/components/ui";

const API_BASE = import.meta.env.BASE_URL?.replace(/\/$/, "") ?? "";

interface Initiative {
  id: number;
  title: string;
  description: string | null;
  icon: string;
  url: string;
  displayOrder: number;
}

export default function InitiativesPage() {
  const { lang, t } = useLang();
  setPageSEO({
    title: t("مبادرات مجتمعية", "Community Initiatives"),
    description: t("مبادرات مجتمعية في المجال القانوني من RABAB LEGAL AI: التواصل العدلي، مبادرة وصل وغيرها.", "Community legal initiatives from RABAB LEGAL AI, including justice communication and Wasl."),
    canonical: "https://rabablegal.com/initiatives",
  });

  const [initiatives, setInitiatives] = useState<Initiative[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  useEffect(() => {
    fetch(`${API_BASE}/api/initiatives`, { cache: "no-store" })
      .then(r => r.json())
      .then(d => setInitiatives(d.initiatives ?? []))
      .catch(() => setError(true))
      .finally(() => setLoading(false));
  }, []);

  return (
    <div className="min-h-screen bg-background flex flex-col">
      <Navbar />

      {/* Hero */}
      <section className="bg-primary py-12 px-4" dir={lang === 'ar' ? 'rtl' : 'ltr'}>
        <div className="container mx-auto max-w-3xl text-center">
          <div className="w-14 h-14 rounded-2xl bg-white/10 flex items-center justify-center mx-auto mb-4">
            <Heart className="w-7 h-7 text-secondary" />
          </div>
          <h1 className="text-2xl md:text-3xl font-bold text-white mb-3">{t('مبادرات مجتمعية', 'Community Initiatives')}</h1>
          <p className="text-white/70 text-sm leading-relaxed max-w-xl mx-auto">
            {t('RABAB LEGAL AI تُطلق مبادرات مجتمعية في المجال القانوني لنشر الوعي القانوني وتمكين المجتمع من الوصول للخدمات العدلية.', 'RABAB LEGAL AI launches community initiatives to raise legal awareness and help people access justice services.')}
          </p>
        </div>
      </section>

      {/* Initiatives grid */}
      <section className="flex-1 py-12 px-4" dir={lang === 'ar' ? 'rtl' : 'ltr'}>
        <div className="container mx-auto max-w-4xl">
          {loading ? (
            <FramedState
              tone="loading"
              icon={<Loader2 className="h-5 w-5 animate-spin text-secondary" />}
              title={t('جارٍ التحميل...', 'Loading…')}
              className="min-h-52"
            />
          ) : error ? (
            <FramedState
              tone="error"
              icon={<AlertTriangle className="h-6 w-6" />}
              title={t('تعذر تحميل المبادرات حالياً.', 'Unable to load initiatives right now.')}
              description={t('يرجى المحاولة مرة أخرى لاحقاً.', 'Please try again later.')}
              className="min-h-52"
            />
          ) : initiatives.length === 0 ? (
            <FramedState
              icon={<Heart className="h-6 w-6 text-secondary/70" />}
              title={t('لا توجد مبادرات متاحة حالياً.', 'No initiatives are available right now.')}
              description={t('تابعونا قريباً.', 'Please check back soon.')}
              className="min-h-52"
            />
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
              {initiatives.map(init => (
                <a
                  key={init.id}
                  href={init.url !== "#" ? init.url : undefined}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="group relative bg-card border-2 border-secondary/60 rounded-2xl p-6 shadow-sm shadow-secondary/10 hover:border-secondary hover:shadow-lg hover:shadow-secondary/15 transition-all duration-300 flex flex-col gap-4"
                >
                  <div className="flex items-start gap-4">
                    <div className="w-14 h-14 rounded-2xl bg-primary/10 flex items-center justify-center text-2xl shrink-0 group-hover:bg-primary/20 transition-colors">
                      {init.icon}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <h3 className="font-bold text-foreground text-base">{init.title}</h3>
                        {init.url !== "#" && (
                          <ExternalLink className="w-3.5 h-3.5 text-primary/60 group-hover:text-primary transition-colors shrink-0" />
                        )}
                      </div>
                      {init.url === "#" && (
                         <span className="text-[11px] font-bold text-amber-600 bg-amber-50 px-2 py-0.5 rounded-full">{t('قريباً', 'Coming soon')}</span>
                      )}
                    </div>
                  </div>
                  {init.description && (
                    <p className="text-sm text-muted-foreground leading-relaxed">{init.description}</p>
                  )}
                  {init.url !== "#" && (
                    <div className="mt-auto">
                      <span className="inline-flex items-center gap-1.5 text-xs font-bold text-primary group-hover:underline">
                        <ExternalLink className="w-3.5 h-3.5" />
                         {t('افتح المبادرة', 'Open initiative')}
                      </span>
                    </div>
                  )}
                </a>
              ))}
            </div>
          )}
        </div>
      </section>

      <Footer />
    </div>
  );
}
