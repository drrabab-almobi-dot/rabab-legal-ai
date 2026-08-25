import React, { useState } from 'react';
import { setPageSEO } from '@/lib/seo';
import { Navbar, Footer } from '@/components/layout';
import { Card, CardContent } from '@/components/ui';
import { ChevronDown, ChevronUp, HelpCircle } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { Link } from 'wouter';
import { useLang } from '@/hooks/use-language';

const categories = [
  {
    title: 'عن الخدمة',
    titleEn: 'About the Service',
    faqs: [
      { q: 'ما هي RABAB LEGAL AI؟', qEn: 'What is RABAB LEGAL AI?', a: 'رباب محاميتك الرقمية هي منصة قانونية متخصصة تقدم معلومات قانونية أولية موثقة في أنظمة دول مجلس التعاون الخليجي الست، بإشراف المحامية والمحكم التجاري د. رباب أحمد المعبي.', aEn: 'Rabab, your digital lawyer, is a specialist legal platform providing documented introductory legal information across the laws of the six GCC countries, supervised by Lawyer and Commercial Arbitrator Dr. Rabab Ahmed Almoaibi.' },
      { q: 'ما الدول التي تغطيها المنصة؟', qEn: 'Which countries does the platform cover?', a: 'تغطي المنصة ست دول: المملكة العربية السعودية، الإمارات، الكويت، قطر، البحرين، وعُمان. كل دولة لها قاعدة تشريعية مستقلة ولا يتم خلط قوانين الدول.', aEn: 'The platform covers Saudi Arabia, the UAE, Kuwait, Qatar, Bahrain, and Oman. Each country has an independent legislative base, and the laws are never mixed.' },
      { q: 'هل المعلومات القانونية المقدمة ملزمة قانوناً؟', qEn: 'Is the legal information legally binding?', a: 'لا. المعلومات المقدمة لأغراض معرفية وإرشادية فقط، وليست استشارة قانونية ملزمة أو رأياً قانونياً رسمياً يُعتدّ به أمام المحاكم. للقضايا المعقدة ننصح بالتواصل المباشر مع محامٍ مختص.', aEn: 'No. Information is provided for education and guidance only; it is not binding legal advice or an official legal opinion accepted by courts. For complex matters, we recommend speaking directly with a qualified lawyer.' },
      { q: 'ما الفرق بين هذه المنصة والمحامي التقليدي؟', qEn: 'How is this different from a traditional lawyer?', a: 'المنصة تقدم معلومات قانونية أولية فورية وموثقة للباحثين والأفراد. بينما المحامي يتولى التمثيل الرسمي ورفع الدعاوى والمرافعة أمام المحاكم. يمكنك البدء هنا لفهم وضعك ثم استشارة محامٍ للإجراءات الرسمية.', aEn: 'The platform provides instant, documented introductory legal information for researchers and individuals. A lawyer undertakes formal representation, filing claims, and court advocacy. You can start here to understand your situation, then consult a lawyer for formal action.' },
    ],
  },
  {
    title: 'الاستخدام والحساب',
    titleEn: 'Use & Account',
    faqs: [
      { q: 'كيف أبدأ استشارتي؟', qEn: 'How do I start a consultation?', a: 'سجّل حساباً جديداً، اختر باقة تناسب احتياجاتك، ثم ابدأ استشارة جديدة من لوحة التحكم. حدّد الدولة ونوع القضية، واطرح سؤالك ليُعالَج فورياً.', aEn: 'Create an account, choose a plan that meets your needs, then start a consultation from the dashboard. Select the country and matter type, and submit your question for immediate processing.' },
      { q: 'هل يمكنني استخدام المنصة دون تسجيل؟', qEn: 'Can I use the platform without registering?', a: 'يمكنك الاطلاع على معلومات عامة ومحتوى المنصة، لكن طرح الاستشارات يستلزم إنشاء حساب مجاني والاشتراك في إحدى الباقات.', aEn: 'You can browse general information and platform content, but submitting consultations requires a free account and a plan.' },
      { q: 'هل يمكنني حذف حسابي وبياناتي؟', qEn: 'Can I delete my account and data?', a: 'نعم. يحق لك في أي وقت طلب حذف حسابك وبياناتك كاملة من لوحة المستخدم. تُعالَج الطلبات خلال 30 يوماً وفق سياسة الاحتفاظ المعتمدة.', aEn: 'Yes. You may request deletion of your account and data from the user dashboard at any time. Requests are processed within 30 days under the applicable retention policy.' },
    ],
  },
  {
    title: 'الباقات والدفع',
    titleEn: 'Plans & Payments',
    faqs: [
      { q: 'ما هي الباقات المتاحة؟', qEn: 'Which plans are available?', a: 'تبدأ بالتجريبية المجانية (3 استشارات)، ثم باقة الاستشارات بـ 149 ريالاً (7 استشارات)، والباقة الشهرية بـ 349 ريالاً (20 استشارة)، وباقة الأعمال بـ 699 ريالاً (100 استشارة قانونية للمنشآت).', aEn: 'Plans start with a free trial (3 consultations), then a SAR 149 questions pack (7 consultations), a SAR 349 monthly plan (20 consultations), and a SAR 699 business plan (100 legal consultations for organizations).' },
      { q: 'متى يتم خصم الاستشارة من رصيدي؟', qEn: 'When is a consultation deducted from my balance?', a: 'الخصم يتم فقط بعد تلقي إجابة ناجحة. لا خصم عند فتح الصفحة، ولا عند الكتابة، ولا عند فشل النظام، ولا مقابل أسئلة توضيحية ضمن الاستشارة ذاتها.', aEn: 'A use is deducted only after a successful answer. Nothing is deducted for opening the page, typing, a system failure, or clarification questions within the same consultation.' },
      { q: 'هل يمكنني الاعتراض على خصم استشارة؟', qEn: 'Can I dispute a consultation deduction?', a: 'نعم. يمكنك تقديم اعتراض من لوحة المستخدم، وسيراجع الفريق الاعتراض ويُعيد الرصيد عند الإقرار بوجود خطأ.', aEn: 'Yes. Submit a dispute from the user dashboard. The team will review it and restore the balance when an error is confirmed.' },
      { q: 'ما طرق الدفع المتاحة؟', qEn: 'Which payment methods are available?', a: 'تدعم المنصة مدى، Visa، Mastercard، وApple Pay. جميع عمليات الدفع مشفرة وآمنة.', aEn: 'The platform supports mada, Visa, Mastercard, and Apple Pay. All payments are encrypted and secure.' },
    ],
  },
  {
    title: 'السرية والأمان',
    titleEn: 'Confidentiality & Security',
    faqs: [
      { q: 'هل استشاراتي سرية؟', qEn: 'Are my consultations confidential?', a: 'نعم. نطبق تشفيراً كاملاً لجميع الاتصالات والبيانات. لا تُشارَك استشاراتك مع أي طرف ثالث، ولا تُستخدم لتدريب أي نموذج ذكاء اصطناعي.', aEn: 'Yes. We apply full encryption to all communications and data. Your consultations are not shared with third parties or used to train AI models.' },
      { q: 'هل يمكنني إخفاء أسماء الأطراف في قضيتي؟', qEn: 'Can I hide the names of parties in my case?', a: 'نعم. عند وصف وقائع القضية يمكنك استبدال أسماء الأطراف بأحرف أو رموز (الطرف أ، الطرف ب) للحفاظ على الخصوصية.', aEn: 'Yes. When describing a matter, you can replace party names with letters or symbols to protect privacy.' },
      { q: 'ما مدة الاحتفاظ ببياناتي؟', qEn: 'How long is my data retained?', a: 'تُحتفظ بالبيانات وفق سياسة الاحتفاظ المعتمدة. يمكنك مراجعة سياسة الخصوصية للاطلاع على التفاصيل الكاملة، أو طلب حذف بياناتك في أي وقت.', aEn: 'Data is retained under the applicable retention policy. You can review the Privacy Policy for full details or request deletion at any time.' },
    ],
  },
];

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
