import React, { useState } from 'react';
import { setPageSEO } from '@/lib/seo';
import { Navbar, Footer } from '@/components/layout';
import { Card, CardContent } from '@/components/ui';
import { ChevronDown, ChevronUp, HelpCircle } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { Link } from 'wouter';
import { useLang } from '@/hooks/use-language';
import categories from '@/content/faq.json';

function FaqItem({ q, a }: { q: string; a: string }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="rounded-xl border border-secondary/30 bg-background/40 px-4 transition-colors hover:border-secondary/60">
      <button className="w-full flex items-center justify-between py-4 text-right gap-3 hover:text-primary transition-colors" onClick={() => setOpen(o => !o)} aria-expanded={open}>
        <span className="font-semibold text-sm leading-relaxed">{q}</span>
        {open ? <ChevronUp className="w-4 h-4 shrink-0 text-secondary" /> : <ChevronDown className="w-4 h-4 shrink-0 text-muted-foreground" />}
      </button>
      <AnimatePresence initial={false}>
        {open && (
          <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }} transition={{ duration: 0.25 }}>
            <p className="pb-4 text-muted-foreground text-sm leading-loose pr-2 border-r-2 border-primary/30">{a}</p>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

export default function FAQ() {
  const { lang, t } = useLang();
  setPageSEO({ title: t('الأسئلة الشائعة', 'Frequently Asked Questions'), description: t('إجابات حول RABAB LEGAL AI — كيف تعمل المنصة كمرجع في الأنظمة السعودية وما الفرق بين الاستشارة القانونية بالذكاء الاصطناعي والمحامي التقليدي.', 'Answers about RABAB LEGAL AI, how it works with Saudi laws, and how AI-assisted legal consultation differs from a traditional lawyer.'), canonical: 'https://rabablegal.com/faq' });
  return (
    <div className="min-h-screen flex flex-col font-sans" dir={lang === 'ar' ? 'rtl' : 'ltr'}>
      <Navbar />

      {/* Hero */}
      <section className="bg-primary py-20">
        <div className="container mx-auto px-4 text-center">
          <div className="w-14 h-14 rounded-full bg-secondary/20 border border-secondary/40 flex items-center justify-center mx-auto mb-5">
            <HelpCircle className="w-7 h-7 text-secondary" />
          </div>
          <h1 className="text-4xl font-bold text-white mb-3">{t('الأسئلة الشائعة', 'Frequently Asked Questions')}</h1>
          <p className="text-white/70 max-w-xl mx-auto">{t('إجابات لأكثر الأسئلة تكراراً حول المنصة وخدماتها', 'Answers to common questions about the platform and its services')}</p>
        </div>
      </section>

      <section className="py-16 bg-background">
        <div className="container mx-auto px-4 max-w-3xl">
          <div className="space-y-8">
            {categories.map((cat, i) => (
              <motion.div key={i} initial={{ opacity: 0, y: 20 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }} transition={{ delay: i * 0.1 }}>
                <h2 className="text-lg font-bold text-secondary mb-4 flex items-center gap-2">
                  <span className="w-1.5 h-6 rounded-full bg-secondary inline-block" />
                   {lang === 'ar' ? cat.title : cat.titleEn}
                </h2>
                <Card>
                  <CardContent className="p-6">
                     {cat.faqs.map((faq, j) => <FaqItem key={j} q={lang === 'ar' ? faq.q : faq.qEn} a={lang === 'ar' ? faq.a : faq.aEn} />)}
                  </CardContent>
                </Card>
              </motion.div>
            ))}
          </div>

          {/* CTA */}
          <div className="mt-12 text-center bg-primary/5 border-2 border-secondary/60 rounded-2xl p-8 shadow-sm shadow-secondary/10">
             <h3 className="text-xl font-bold text-secondary mb-2">{t('لم تجد إجابتك؟', 'Didn’t find your answer?')}</h3>
             <p className="text-foreground/80 mb-5">{t('تواصل معنا مباشرةً وسنرد في أقرب وقت', 'Contact us directly and we will respond as soon as possible')}</p>
            <div className="flex flex-col sm:flex-row gap-3 justify-center">
              <Link href="/contact">
                 <button className="bg-primary text-white px-6 py-3 rounded-lg font-medium hover:bg-primary/90 transition-colors">{t('تواصل معنا', 'Contact Us')}</button>
              </Link>
              <a href="https://wa.me/966504647649" target="_blank" rel="noopener">
                <button className="bg-green-600 text-white px-6 py-3 rounded-lg font-medium hover:bg-green-700 transition-colors flex items-center gap-2 justify-center">
                   <span>💬</span> {t('واتساب', 'WhatsApp')}
                </button>
              </a>
            </div>
          </div>
        </div>
      </section>

      <Footer />
    </div>
  );
}
