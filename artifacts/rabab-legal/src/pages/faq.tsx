import React, { useState } from 'react';
import { setPageSEO } from '@/lib/seo';
import { Navbar, Footer } from '@/components/layout';
import { Card, CardContent } from '@/components/ui';
import { ChevronDown, ChevronUp, HelpCircle } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { Link } from 'wouter';

const categories = [
  {
    title: 'عن الخدمة',
    faqs: [
      { q: 'ما هي RABAB LEGAL AI؟', a: 'رباب محاميتك الرقمية هي منصة قانونية متخصصة تقدم معلومات قانونية أولية موثقة في أنظمة دول مجلس التعاون الخليجي الست، بإشراف المحامية والمحكم التجاري د. رباب أحمد المعبي.' },
      { q: 'ما الدول التي تغطيها المنصة؟', a: 'تغطي المنصة ست دول: المملكة العربية السعودية، الإمارات، الكويت، قطر، البحرين، وعُمان. كل دولة لها قاعدة تشريعية مستقلة ولا يتم خلط قوانين الدول.' },
      { q: 'هل المعلومات القانونية المقدمة ملزمة قانوناً؟', a: 'لا. المعلومات المقدمة لأغراض معرفية وإرشادية فقط، وليست استشارة قانونية ملزمة أو رأياً قانونياً رسمياً يُعتدّ به أمام المحاكم. للقضايا المعقدة ننصح بالتواصل المباشر مع محامٍ مختص.' },
      { q: 'ما الفرق بين هذه المنصة والمحامي التقليدي؟', a: 'المنصة تقدم معلومات قانونية أولية فورية وموثقة للباحثين والأفراد. بينما المحامي يتولى التمثيل الرسمي ورفع الدعاوى والمرافعة أمام المحاكم. يمكنك البدء هنا لفهم وضعك ثم استشارة محامٍ للإجراءات الرسمية.' },
    ],
  },
  {
    title: 'الاستخدام والحساب',
    faqs: [
      { q: 'كيف أبدأ استشارتي؟', a: 'سجّل حساباً جديداً، اختر باقة تناسب احتياجاتك، ثم ابدأ استشارة جديدة من لوحة التحكم. حدّد الدولة ونوع القضية، واطرح سؤالك ليُعالَج فورياً.' },
      { q: 'هل يمكنني استخدام المنصة دون تسجيل؟', a: 'يمكنك الاطلاع على معلومات عامة ومحتوى المنصة، لكن طرح الاستشارات يستلزم إنشاء حساب مجاني والاشتراك في إحدى الباقات.' },
      { q: 'هل يمكنني حذف حسابي وبياناتي؟', a: 'نعم. يحق لك في أي وقت طلب حذف حسابك وبياناتك كاملة من لوحة المستخدم. تُعالَج الطلبات خلال 30 يوماً وفق سياسة الاحتفاظ المعتمدة.' },
    ],
  },
  {
    title: 'الباقات والدفع',
    faqs: [
      { q: 'ما هي الباقات المتاحة؟', a: 'تبدأ بالتجريبية المجانية (3 استشارات)، ثم باقة الاستشارات بـ 149 ريالاً (7 استشارات)، والباقة الشهرية بـ 349 ريالاً (20 استشارة)، وباقة الأعمال بـ 699 ريالاً (100 استشارة قانونية للمنشآت).' },
      { q: 'متى يتم خصم الاستشارة من رصيدي؟', a: 'الخصم يتم فقط بعد تلقي إجابة ناجحة. لا خصم عند فتح الصفحة، ولا عند الكتابة، ولا عند فشل النظام، ولا مقابل أسئلة توضيحية ضمن الاستشارة ذاتها.' },
      { q: 'هل يمكنني الاعتراض على خصم استشارة؟', a: 'نعم. يمكنك تقديم اعتراض من لوحة المستخدم، وسيراجع الفريق الاعتراض ويُعيد الرصيد عند الإقرار بوجود خطأ.' },
      { q: 'ما طرق الدفع المتاحة؟', a: 'تدعم المنصة مدى، Visa، Mastercard، وApple Pay. جميع عمليات الدفع مشفرة وآمنة.' },
    ],
  },
  {
    title: 'السرية والأمان',
    faqs: [
      { q: 'هل استشاراتي سرية؟', a: 'نعم. نطبق تشفيراً كاملاً لجميع الاتصالات والبيانات. لا تُشارَك استشاراتك مع أي طرف ثالث، ولا تُستخدم لتدريب أي نموذج ذكاء اصطناعي.' },
      { q: 'هل يمكنني إخفاء أسماء الأطراف في قضيتي؟', a: 'نعم. عند وصف وقائع القضية يمكنك استبدال أسماء الأطراف بأحرف أو رموز (الطرف أ، الطرف ب) للحفاظ على الخصوصية.' },
      { q: 'ما مدة الاحتفاظ ببياناتي؟', a: 'تُحتفظ بالبيانات وفق سياسة الاحتفاظ المعتمدة. يمكنك مراجعة سياسة الخصوصية للاطلاع على التفاصيل الكاملة، أو طلب حذف بياناتك في أي وقت.' },
    ],
  },
];

function FaqItem({ q, a }: { q: string; a: string }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="border-b border-border/50 last:border-0">
      <button className="w-full flex items-center justify-between py-4 text-right gap-3 hover:text-primary transition-colors" onClick={() => setOpen(o => !o)}>
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
  setPageSEO({ title: 'الأسئلة الشائعة | RABAB LEGAL AI', description: 'إجابات حول RABAB LEGAL AI — كيف تعمل المنصة كمرجع في الأنظمة السعودية وما الفرق بين الاستشارة القانونية بالذكاء الاصطناعي والمحامي التقليدي.', canonical: 'https://rabablegal.com/faq' });
  return (
    <div className="min-h-screen flex flex-col font-sans" dir="rtl">
      <Navbar />

      {/* Hero */}
      <section className="bg-primary py-20">
        <div className="container mx-auto px-4 text-center">
          <div className="w-14 h-14 rounded-full bg-secondary/20 border border-secondary/40 flex items-center justify-center mx-auto mb-5">
            <HelpCircle className="w-7 h-7 text-secondary" />
          </div>
          <h1 className="text-4xl font-bold text-white mb-3">الأسئلة الشائعة</h1>
          <p className="text-white/70 max-w-xl mx-auto">إجابات لأكثر الأسئلة تكراراً حول المنصة وخدماتها</p>
        </div>
      </section>

      <section className="py-16 bg-background">
        <div className="container mx-auto px-4 max-w-3xl">
          <div className="space-y-8">
            {categories.map((cat, i) => (
              <motion.div key={i} initial={{ opacity: 0, y: 20 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }} transition={{ delay: i * 0.1 }}>
                <h2 className="text-lg font-bold text-foreground mb-4 flex items-center gap-2">
                  <span className="w-1.5 h-6 rounded-full bg-secondary inline-block" />
                  {cat.title}
                </h2>
                <Card>
                  <CardContent className="p-6">
                    {cat.faqs.map((faq, j) => <FaqItem key={j} q={faq.q} a={faq.a} />)}
                  </CardContent>
                </Card>
              </motion.div>
            ))}
          </div>

          {/* CTA */}
          <div className="mt-12 text-center bg-primary/5 border border-primary/20 rounded-2xl p-8">
            <h3 className="text-xl font-bold text-foreground mb-2">لم تجد إجابتك؟</h3>
            <p className="text-muted-foreground mb-5">تواصل معنا مباشرةً وسنرد في أقرب وقت</p>
            <div className="flex flex-col sm:flex-row gap-3 justify-center">
              <Link href="/contact">
                <button className="bg-primary text-white px-6 py-3 rounded-lg font-medium hover:bg-primary/90 transition-colors">تواصل معنا</button>
              </Link>
              <a href="https://wa.me/966504647649" target="_blank" rel="noopener">
                <button className="bg-green-600 text-white px-6 py-3 rounded-lg font-medium hover:bg-green-700 transition-colors flex items-center gap-2 justify-center">
                  <span>💬</span> واتساب
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
