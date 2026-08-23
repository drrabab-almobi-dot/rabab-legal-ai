/**
 * مبادرات مجتمعية — صفحة عامة
 * بطاقات المبادرات مع روابط UTM وفتح في تبويب جديد
 */
import { useState, useEffect } from "react";
import { Navbar, Footer } from "@/components/layout";
import { setPageSEO } from "@/lib/seo";
import { Loader2, ExternalLink, Heart } from "lucide-react";

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
  setPageSEO({
    title: "مبادرات مجتمعية — RABAB LEGAL AI",
    description: "مبادرات مجتمعية في المجال القانوني من RABAB LEGAL AI: التواصل العدلي، مبادرة وصل وغيرها.",
    canonical: "https://rabablegal.com/initiatives",
  });

  const [initiatives, setInitiatives] = useState<Initiative[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch(`${API_BASE}/api/initiatives`)
      .then(r => r.json())
      .then(d => setInitiatives(d.initiatives ?? []))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  return (
    <div className="min-h-screen bg-background flex flex-col">
      <Navbar />

      {/* Hero */}
      <section className="bg-primary py-12 px-4" dir="rtl">
        <div className="container mx-auto max-w-3xl text-center">
          <div className="w-14 h-14 rounded-2xl bg-white/10 flex items-center justify-center mx-auto mb-4">
            <Heart className="w-7 h-7 text-secondary" />
          </div>
          <h1 className="text-2xl md:text-3xl font-bold text-white mb-3">مبادرات مجتمعية</h1>
          <p className="text-white/70 text-sm leading-relaxed max-w-xl mx-auto">
            RABAB LEGAL AI تُطلق مبادرات مجتمعية في المجال القانوني لنشر الوعي القانوني
            وتمكين المجتمع من الوصول للخدمات العدلية.
          </p>
        </div>
      </section>

      {/* Initiatives grid */}
      <section className="flex-1 py-12 px-4" dir="rtl">
        <div className="container mx-auto max-w-4xl">
          {loading ? (
            <div className="flex items-center justify-center py-20 gap-3 text-muted-foreground">
              <Loader2 className="w-5 h-5 animate-spin" />
              <span className="text-sm">جارٍ التحميل...</span>
            </div>
          ) : initiatives.length === 0 ? (
            <div className="text-center py-20 text-muted-foreground">
              <p className="text-sm">لا توجد مبادرات متاحة حالياً — تابعونا قريباً.</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
              {initiatives.map(init => (
                <a
                  key={init.id}
                  href={init.url !== "#" ? init.url : undefined}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="group relative bg-card border border-border/60 rounded-2xl p-6 hover:border-primary/60 hover:shadow-lg transition-all duration-300 flex flex-col gap-4"
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
                        <span className="text-[11px] font-bold text-amber-600 bg-amber-50 px-2 py-0.5 rounded-full">قريباً</span>
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
                        افتح المبادرة
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
