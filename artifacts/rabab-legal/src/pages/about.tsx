import React from 'react';
import { setPageSEO } from '@/lib/seo';
import { Navbar, Footer } from '@/components/layout';
import { Card, CardContent } from '@/components/ui';
import { Scale, Shield, Award, Globe, Users, BookOpen, Phone, Mail } from 'lucide-react';
import { motion, type Variants } from 'framer-motion';
import { useLang } from '@/hooks/use-language';
import { translateArabicText } from '@/lib/translations';

const fadeInUp: Variants = {
  hidden: { opacity: 0, y: 30 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.6, ease: 'easeOut' } },
};

const values = [
  { icon: Shield, title: 'الموثوقية', text: 'نستند إلى النصوص القانونية الرسمية الصادرة عن الجهات الحكومية ووزارات العدل في دول مجلس التعاون الخليجي.', textEn: 'We rely on official legal texts issued by government authorities and ministries of justice across the GCC.' },
  { icon: BookOpen, title: 'الدقة العلمية', text: 'نُميّز دائماً بين النص النظامي واللائحة والقرار والحكم والمبدأ القضائي، ونمنع منعاً باتاً اختراع أي معلومة قانونية.', textEn: 'We distinguish legal texts, regulations, decisions, judgments, and judicial principles, and never invent legal information.' },
  { icon: Globe, title: 'التغطية', text: 'نغطي جميع الأنظمة في المملكة ودول مجلس التعاون الخليجي', textEn: 'We cover laws and regulations in Saudi Arabia and the GCC.' },
  { icon: Users, title: 'الخدمة المتخصصة', text: 'خدمة مصممة للأفراد، المنشآت، المحامين والباحثين القانونيين الذين يحتاجون إلى تحليل نظامي دقيق وموثق.', textEn: 'A service designed for individuals, organizations, lawyers, and legal researchers who need precise, documented legal analysis.' },
  { icon: Award, title: 'الإشراف المهني', text: 'كل خدمة تُقدَّم تحت إشراف مهني مباشر من المحامية والمحكم التجاري\nد. رباب أحمد المعبي.', textEn: 'Every service is provided under the direct professional supervision of Lawyer and Commercial Arbitrator Dr. Rabab Ahmed Almoaibi.' },
  { icon: Scale, title: 'الشفافية', text: 'تقديم الخدمات الاستشارية بصدق ووضوح وتقديم الرأي القانوني المتوافق مع مستحدثات الأنظمة.', textEn: 'We provide consultation services honestly and clearly, with guidance that reflects the latest legal developments.' },
];

export default function About() {
  const { lang, t } = useLang();
  setPageSEO({
    title: t('من نحن', 'About Us'),
    description: t(
      'RABAB LEGAL AI منصة استشارات قانونية أونلاين متخصصة في الأنظمة السعودية — تعرّف على رؤيتنا في تقديم خدمة قانونية رقمية موثوقة.',
      'RABAB LEGAL AI is an online legal consultation platform specializing in Saudi laws. Learn about our vision for reliable digital legal services.',
    ),
    canonical: 'https://rabablegal.com/about',
  });
  return (
    <div className="min-h-screen flex flex-col font-sans" dir={lang === 'ar' ? 'rtl' : 'ltr'}>
      <Navbar />

      {/* Hero */}
      <section className="relative bg-primary py-12 overflow-hidden">
        <div className="absolute inset-0 opacity-10 bg-[url('https://images.unsplash.com/photo-1589829085413-56de8ae18c73?q=80&w=2000')] bg-cover bg-center" />
        <div className="absolute inset-0 bg-gradient-to-b from-primary/80 to-primary" />
        <div className="container mx-auto px-4 relative z-10 text-center">
          <motion.div initial="hidden" animate="visible" variants={fadeInUp} className="flex flex-col items-center gap-4">
            <div className="w-16 h-16 rounded-full bg-secondary/20 border border-secondary/40 flex items-center justify-center">
              <Scale className="w-8 h-8" style={{color:'hsl(47 100% 48%)'}} />
            </div>
            <h1 className="text-4xl md:text-5xl font-bold text-white">{t('من نحن', 'About Us')}</h1>
            <p className="text-xl text-white/80 max-w-2xl mx-auto leading-relaxed">
              {t('منصة رقمية قانونية متخصصة بإشراف مهني مباشر من المحامية والمحكم التجاري', 'A specialized digital legal platform under the direct professional supervision of a lawyer and commercial arbitrator')}
              <br />
              <strong className="text-secondary">{t('د. رباب أحمد المعبي', 'Dr. Rabab Ahmed Almoaibi')}</strong>
            </p>
          </motion.div>
        </div>
      </section>

      {/* Mission */}
      <section className="py-12 bg-background">
        <div className="container mx-auto px-4 max-w-4xl">

          {/* رسالتنا — بطاقة داكنة */}
          <motion.div initial="hidden" whileInView="visible" viewport={{ once: true }} variants={fadeInUp} className="mb-16">
            <div className="bg-primary border-2 border-secondary/65 rounded-2xl p-8 md:p-10 text-center shadow-lg shadow-secondary/15">
              <h2 className="text-3xl font-bold text-secondary mb-6">{t('رسالتنا', 'Our Mission')}</h2>
              <p className="text-lg leading-loose text-white">
                {t(
                  'تأسست RABAB LEGAL AI — رباب محاميتك الرقمية لتقديم معلومات قانونية دقيقة وواضحة، تساعد الأفراد والمنشآت على معرفة حقوقهم والتزاماتهم وفق الأنظمة النافذة في المملكة العربية السعودية ودول مجلس التعاون الخليجي. وانطلاقًا من أهمية إتاحة المعرفة القانونية للجميع، طوّرنا منصة تجمع بين قدرات الذكاء الاصطناعي والخبرة القانونية البشرية المتخصصة، لتقديم تجربة قانونية رقمية سهلة واحترافية.',
                  'RABAB LEGAL AI was created to provide clear, accurate legal information that helps people and organizations understand their rights and obligations under Saudi and GCC laws. We combine AI capabilities with specialist human legal expertise to create an accessible, professional digital legal experience.',
                )}
              </p>
            </div>
          </motion.div>

          {/* Values */}
          <motion.div initial="hidden" whileInView="visible" viewport={{ once: true }} variants={fadeInUp}>
            <h2 className="text-3xl font-bold text-secondary text-center mb-10">{t('قيمنا ومبادئنا', 'Our Values & Principles')}</h2>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {values.map((v, i) => (
                <div key={i} className="bg-primary border-2 border-secondary/55 rounded-xl p-5 flex flex-col items-center justify-center text-center hover:border-secondary hover:shadow-secondary/15 transition-all shadow-sm shadow-secondary/10">
                  <div className="w-12 h-12 rounded-xl bg-secondary/15 border border-secondary/25 flex items-center justify-center mb-4">
                    <v.icon className="w-6 h-6 text-secondary" />
                  </div>
                  <h3 className="font-bold text-primary-foreground mb-3 text-base">{lang === 'ar' ? v.title : translateArabicText(v.title)}</h3>
                  <p className="text-sm text-white leading-loose" style={{whiteSpace:'pre-line'}}>{lang === 'ar' ? v.text : v.textEn}</p>
                </div>
              ))}
            </div>
          </motion.div>

          {/* Supervisor Profile */}
          <motion.div initial="hidden" whileInView="visible" viewport={{ once: true }} variants={fadeInUp} className="mt-16">
            <div className="bg-primary border-2 border-secondary/65 rounded-2xl p-8 shadow-lg shadow-secondary/15">
              <div className="flex flex-col md:flex-row-reverse items-center gap-8">
                <div className="w-28 h-28 rounded-full border-4 flex items-center justify-center shrink-0" style={{background:'hsl(var(--secondary) / 0.15)', borderColor:'hsl(var(--secondary) / 0.5)'}}>
                  <Scale className="w-12 h-12 text-secondary" />
                </div>
                <div className={`flex-1 min-w-0 text-center ${lang === 'ar' ? 'md:text-right' : 'md:text-left'}`}>
                  <p className="text-sm text-secondary font-semibold mb-1">{t('المشرف العام', 'General Supervisor')}</p>
                  <h3 className="text-2xl font-bold mb-2 text-secondary">{t('د. رباب أحمد المعبي', 'Dr. Rabab Ahmed Almoaibi')}</h3>
                  <p className="text-primary-foreground/70 font-medium mb-3">{t('محامية ومحكم تجاري معتمد', 'Lawyer and Certified Commercial Arbitrator')}</p>
                  <p className="text-white leading-relaxed">
                    {t('خبيرة قانونية متخصصة في الأنظمة السعودية والخليجية، وتحكيم المنازعات التجارية. وتُشرف مباشرةً على جودة المحتوى القانوني المقدَّم عبر المنصة وتضمن دقته واتساقه مع التشريعات النافذة.', 'A legal expert in Saudi and GCC laws and commercial dispute arbitration. She directly oversees the quality, accuracy, and legal consistency of content provided through the platform.')}
                  </p>
                  <div className="flex flex-row flex-wrap gap-x-4 gap-y-2 mt-4 text-sm justify-center md:justify-end">
                    <span className="flex items-center gap-1 text-primary-foreground/80">
                      <Phone className="w-4 h-4 shrink-0 text-secondary" />
                      +966504647649
                    </span>
                    <span className="flex items-center gap-1 text-primary-foreground/80">
                      <Phone className="w-4 h-4 shrink-0 text-secondary" />
                      +966570773999
                    </span>
                    <a href="mailto:info@rabablegal.com" className="flex items-center gap-1 hover:underline text-primary-foreground/80">
                      info@rabablegal.com
                      <Mail className="w-4 h-4 shrink-0 text-secondary" />
                    </a>
                    <span className="flex items-center gap-1 text-primary-foreground/80">
                      @rabab_almoobi
                      <span className="text-secondary font-bold">𝕏</span>
                    </span>
                  </div>
                </div>
              </div>
            </div>
          </motion.div>

        </div>
      </section>

      <Footer />
    </div>
  );
}
