import React, { useState, useEffect } from 'react';
import { setPageSEO } from '@/lib/seo';
import { Link, useLocation } from 'wouter';
import { Navbar, Footer } from '@/components/layout';
import { Button, Card, CardContent, CardHeader, CardTitle } from '@/components/ui';
import { Scale, CheckCircle2, Star, ChevronDown, ChevronUp, MessageSquare, Shield, Clock, Phone, FileText, FileSignature, Handshake, Building, Gavel, Lightbulb, Briefcase, Landmark, Search, Loader2, Lock, PenLine, FileSearch, Bot, ArrowLeft, BookOpen, RefreshCw } from 'lucide-react';
import { motion, AnimatePresence, type Variants } from 'framer-motion';
import launchHeroImg from '@/assets/launch-hero.png';
import lawyerHeroImg from '@/assets/lawyer-hero.png';
import { buildWhatsAppContactLink } from '@/lib/whatsapp-contact';
import { SERVICE_CATALOG } from '@/lib/service-catalog';

const API_BASE = import.meta.env.BASE_URL.replace(/\/$/, '');

const fadeInUp: Variants = {
  hidden: { opacity: 0, y: 40 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.6, ease: "easeOut" } }
};

const staggerContainer = {
  hidden: { opacity: 0 },
  visible: {
    opacity: 1,
    transition: {
      staggerChildren: 0.1
    }
  }
};

interface PreviewResult { excerpt: string; similarity: number; }

interface DigitalToolLink {
  label: string;
  detail: string;
  href: string;
  icon: React.ElementType;
  external?: boolean;
}

interface DigitalToolCategory {
  id: string;
  title: string;
  subtitle: string;
  icon: React.ElementType;
  items: DigitalToolLink[];
}

const REMAINING_DIGITAL_TOOL_CATEGORIES: DigitalToolCategory[] = [
  {
    id: 'intellectual-property',
    title: 'خدمات الملكية الفكرية',
    subtitle: 'تسجيل العلامات وحماية حقوق المؤلف',
    icon: Lightbulb,
    items: [
      { label: 'تسجيل وتجديد العلامات التجارية', detail: 'تسجيل العلامة وتجديدها وحمايتها', href: '/consultation?type=legal_opinion&ipType=trademark', icon: Lightbulb },
      { label: 'حقوق المؤلف والمصنفات', detail: 'حماية المصنفات والمحتوى', href: '/consultation?type=legal_opinion&ipType=copyright', icon: FileText },
      { label: 'براءات الاختراع', detail: 'تقييم الحماية وإجراءات التسجيل', href: '/consultation?type=legal_opinion&ipType=patent', icon: Gavel },
      { label: 'الرسوم والنماذج الصناعية', detail: 'حماية التصميم والشكل الصناعي', href: '/consultation?type=legal_opinion&ipType=industrial-design', icon: Briefcase },
      { label: 'الأسرار التجارية', detail: 'حماية المعلومات والمعرفة السرية', href: '/consultation?type=legal_opinion&ipType=trade-secret', icon: Shield },
      { label: 'الترخيص ونقل ملكية الحقوق', detail: 'تنظيم التراخيص واتفاقيات نقل الحقوق', href: '/consultation?type=legal_opinion&ipType=licensing-transfer', icon: FileSignature },
      { label: 'التعدي والمنازعات الفكرية', detail: 'تحليل التعدي وخيارات المعالجة', href: '/consultation?type=legal_opinion&ipType=infringement', icon: Gavel },
      { label: 'حماية الحقوق دولياً', detail: 'استشارات حماية الحقوق خارج المملكة', href: '/consultation?type=legal_opinion&ipType=international', icon: Landmark },
    ],
  },
  {
    id: 'corporate-governance-compliance',
    title: 'حوكمة وامتثال الشركات',
    subtitle: 'سياسات وضوابط وإدارة المخاطر',
    icon: Shield,
    items: [
      { label: 'تأسيس وإطار الحوكمة', detail: 'بناء إطار حوكمة واضح للشركة', href: '/consultation?type=legal_opinion&service=corporate-governance-compliance&governanceType=framework', icon: Shield },
      { label: 'سياسات ولوائح الشركات', detail: 'إعداد ومراجعة اللوائح والسياسات الداخلية', href: '/consultation?type=legal_opinion&service=corporate-governance-compliance&governanceType=policies', icon: FileText },
      { label: 'الامتثال النظامي والرقابي', detail: 'تقييم الالتزامات ومتطلبات الجهات الرقابية', href: '/consultation?type=legal_opinion&service=corporate-governance-compliance&governanceType=regulatory-compliance', icon: CheckCircle2 },
      { label: 'إدارة المخاطر القانونية', detail: 'رصد المخاطر ووضع ضوابط المعالجة', href: '/consultation?type=legal_opinion&service=corporate-governance-compliance&governanceType=legal-risk', icon: Gavel },
      { label: 'مجلس الإدارة واللجان', detail: 'تنظيم الصلاحيات والاجتماعات والقرارات', href: '/consultation?type=legal_opinion&service=corporate-governance-compliance&governanceType=board-committees', icon: Landmark },
      { label: 'تضارب المصالح والإفصاح', detail: 'ضوابط الإفصاح وتعارض المصالح', href: '/consultation?type=legal_opinion&service=corporate-governance-compliance&governanceType=conflicts-disclosure', icon: FileSignature },
      { label: 'هيكل الملكية وحقوق الشركاء', detail: 'تنظيم الملكية وحقوق الشركاء والمساهمين', href: '/consultation?type=legal_opinion&service=corporate-governance-compliance&governanceType=ownership-partners', icon: Landmark },
      { label: 'الصلاحيات والتفويض', detail: 'تحديد المسؤوليات وحدود التفويض', href: '/consultation?type=legal_opinion&service=corporate-governance-compliance&governanceType=delegation-authority', icon: FileSignature },
      { label: 'الأطراف ذات العلاقة', detail: 'ضوابط التعاملات مع الأطراف المرتبطة', href: '/consultation?type=legal_opinion&service=corporate-governance-compliance&governanceType=related-parties', icon: Handshake },
      { label: 'مكافحة الرشوة وغسل الأموال', detail: 'سياسات النزاهة ومكافحة الجرائم المالية', href: '/consultation?type=legal_opinion&service=corporate-governance-compliance&governanceType=anti-bribery-aml', icon: Shield },
      { label: 'حماية البيانات والخصوصية', detail: 'الامتثال لمتطلبات البيانات والخصوصية', href: '/consultation?type=legal_opinion&service=corporate-governance-compliance&governanceType=data-privacy', icon: Lock },
      { label: 'الإبلاغ عن المخالفات', detail: 'قنوات البلاغات وحماية المبلّغين', href: '/consultation?type=legal_opinion&service=corporate-governance-compliance&governanceType=whistleblowing', icon: MessageSquare },
      { label: 'المراجعة الداخلية والتحقيقات', detail: 'فحص المخالفات وإجراءات التحقيق الداخلي', href: '/consultation?type=legal_opinion&service=corporate-governance-compliance&governanceType=internal-investigations', icon: Search },
      { label: 'تقييم الامتثال وخطط المعالجة', detail: 'قياس مستوى الامتثال وإغلاق الملاحظات', href: '/consultation?type=legal_opinion&service=corporate-governance-compliance&governanceType=compliance-remediation', icon: CheckCircle2 },
    ],
  },
  {
    id: 'research',
    title: 'الباحثة الذكية',
    subtitle: 'بحث في المصادر والوثائق القانونية',
    icon: Search,
    items: [
      { label: 'السوابق القضائية', detail: 'بحث في الأحكام والمبادئ القضائية', href: '/legal-search?filter=judicial', icon: Gavel },
      { label: 'المدونات القانونية', detail: 'بحث في المدونات والأنظمة ذات الصلة', href: '/legal-search?filter=codex', icon: BookOpen },
      { label: 'التعاميم والقرارات', detail: 'الوصول إلى التعاميم والقرارات', href: '/legal-search?filter=circulars', icon: Search },
      { label: 'بحث في الكل', detail: 'بحث شامل في جميع المصادر', href: '/legal-search', icon: Search },
    ],
  },
  {
    id: 'pleadings',
    title: 'تحرير المذكرات والصحائف',
    subtitle: 'صياغة قانونية وفق النوع والمسار القضائي',
    icon: PenLine,
    items: [
      { label: 'لائحة الدعوى', detail: 'صياغة صحيفة دعوى متكاملة', href: '/legal-assistant?service=pleadings&memoType=lawsuit', icon: PenLine },
      { label: 'مذكرة جوابية', detail: 'رد قانوني منظم على الدعوى', href: '/legal-assistant?service=pleadings&memoType=response', icon: FileText },
      { label: 'الاعتراض بالاستئناف', detail: 'صياغة أسباب الاستئناف', href: '/legal-assistant?service=pleadings&memoType=appeal', icon: Gavel },
      { label: 'النقض أمام العليا', detail: 'تحرير مذكرة نقض قانونية', href: '/legal-assistant?service=pleadings&memoType=cassation', icon: Landmark },
    ],
  },
  {
    id: 'contracts',
    title: 'صياغة ومراجعة العقود',
    subtitle: 'إعداد العقود وتحليلها وكشف المخاطر',
    icon: FileText,
    items: [
      { label: 'صياغة عقد جديد', detail: 'مسودة قانونية تلائم احتياجك', href: '/contracts?tab=draft', icon: FileText },
      { label: 'مراجعة عقد', detail: 'فحص البنود وتقديم النصح', href: '/contracts?tab=review', icon: FileSignature },
      { label: 'تحليل المخاطر', detail: 'كشف البنود والمخاطر المحتملة', href: '/contracts?tab=analyze', icon: FileSearch },
      { label: 'استخراج البيانات', detail: 'تلخيص البيانات الجوهرية للعقد', href: '/contracts?tab=extract', icon: Search },
    ],
  },
];

const REMAINING_DIGITAL_TOOL_CATEGORY_ORDER = [
  'pleadings',
  'contracts',
  'intellectual-property',
  'corporate-governance-compliance',
  'research',
];

export default function Home() {
  setPageSEO({ title: 'استشارة قانونية بالذكاء الاصطناعي | RABAB LEGAL AI', description: 'RABAB LEGAL AI — استشارة قانونية سعودية فورية ودقيقة مدعومة بالذكاء الاصطناعي. اطرح سؤالك في الأنظمة السعودية واحصل على إجابة موثّقة.', canonical: 'https://rabablegal.com/' });
  const [activeFaq, setActiveFaq] = useState<number | null>(null);
  const [previewQuery, setPreviewQuery] = useState('');
  const [previewResults, setPreviewResults] = useState<PreviewResult[]>([]);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [previewSearched, setPreviewSearched] = useState(false);
  const [homeExpandedId, setHomeExpandedId] = useState<string | null>(null);

  const handlePreviewSearch = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!previewQuery.trim() || previewLoading) return;
    setPreviewLoading(true);
    setPreviewSearched(false);
    setPreviewResults([]);
    try {
      const res = await fetch(`${API_BASE}/api/knowledge/preview-search?q=${encodeURIComponent(previewQuery)}`);
      if (res.ok) {
        const data = await res.json();
        setPreviewResults(data.results ?? []);
      }
    } catch { /* silent */ }
    finally { setPreviewLoading(false); setPreviewSearched(true); }
  };

  const services = [
    { title: "نظام العمل", icon: <Shield className="w-8 h-8" /> },
    { title: "الأحوال الشخصية والتركات", icon: <Scale className="w-8 h-8" /> },
    { title: "العقود التجارية", icon: <FileText className="w-8 h-8" /> },
    { title: "النزاعات المدنية", icon: <MessageSquare className="w-8 h-8" /> },
    { title: "التأسيس التجاري والتراخيص", icon: <Building className="w-8 h-8" /> },
    { title: "القضايا الجزائية", icon: <Gavel className="w-8 h-8" /> },
    { title: "الملكية الفكرية", icon: <Lightbulb className="w-8 h-8" /> },
    { title: "خدمات الشركات والاستثمار", icon: <Briefcase className="w-8 h-8" /> },
    { title: "المصرفية والتمويلية", icon: <Landmark className="w-8 h-8" /> },
  ];

  const faqs = [
    { q: "كيف أبدأ استشارتي القانونية؟", a: "ببساطة سجل حساباً جديداً، اختر باقة تناسب احتياجك، واطرح سؤالك مباشرة عبر المنصة ليتم الرد عليه بشكل فوري." },
    { q: "هل الاستشارات سرية؟", a: "نعم، نحن نطبق أعلى معايير التشفير والسرية. لا يتم مشاركة بياناتك أو استشاراتك مع أي طرف ثالث تحت أي ظرف." },
    { q: "ما مدى دقة الإجابات المقدمة؟", a: "تُقدَّم الإجابات عبر منصة ذكاء اصطناعي متخصصة في المنظومة القانونية السعودية وتُعدّ توجيهاً أولياً لا رأياً قانونياً نهائياً. للقضايا التي تستوجب تعمقاً أكثر، تتيح المنصة إمكانية الرجوع مباشراً إلى المحامية د. رباب لاستكمال الاستشارة والحصول على الرأي القانوني المتخصص." },
    { q: "هل يمكنني استخدام رباب لصياغة العقود؟", a: "نعم، تتيح رباب خدمة متخصصة لصياغة العقود وفق الأنظمة السعودية ودول مجلس التعاون، مع إمكانية رفع ملف عقد موجود لمراجعته وتحسينه." },
    { q: "ما الفرق بين الاستشارة القانونية والاستشارة القضائية؟", a: "الاستشارة القانونية تجيب عن أسئلة قانونية عامة كالحقوق والالتزامات والعقود، أما الاستشارة القضائية فتُعنى بالقضايا المرفوعة أمام المحاكم وتحليل الأحكام والمرافعات وفق الأنظمة." },
    { q: "هل يمكنني رفع وثيقة أو عقد وتحليلها؟", a: "نعم، يمكنك رفع ملفات PDF أو Word أو صور مستندات وتحليلها مباشراً داخل المحادثة، وستستخرج رباب النص وتجيب عن أسئلتك استناداً إلى محتوى الوثيقة." },
    { q: "هل رباب متاحة على مدار الساعة؟", a: "نعم، الخدمة متاحة 24/7 طوال أيام السنة. يمكنك طرح استشارتك في أي وقت والحصول على رد فوري دون الحاجة لحجز موعد أو انتظار." },
    { q: "ما الأنظمة التي تستند إليها رباب؟", a: "تستند رباب إلى منظومة الأنظمة واللوائح السعودية ودول مجلس التعاون، مع تحديث دوري لمواكبة المستجدات التشريعية." },
    { q: "كيف تختلف رباب عن البحث في الإنترنت؟", a: "رباب لا تعرض نتائج بحث عامة، بل تحلل سؤالك وتجيب عليه مباشراً مستندةً إلى نصوص قانونية موثّقة، مع ذكر المصادر والمواد النظامية ذات الصلة." },
    { q: "هل يمكن الاستفادة من رباب للقضايا التجارية والشركات؟", a: "نعم، تغطي رباب الاستفسارات المتعلقة بتأسيس الشركات والعقود التجارية والنزاعات بين الشركاء وأحكام نظام الشركات ونظام الاستثمار، وتُعدّ أداةً فعّالة للمحامين ورجال الأعمال على حدٍّ سواء." },
  ];

  return (
    <div className="min-h-screen flex flex-col font-sans">
      <Navbar />
      
      {/* Hero Section */}
      <section className="relative overflow-hidden bg-primary pt-16 pb-0">
        <div className="absolute inset-0 opacity-10 bg-[url('https://images.unsplash.com/photo-1589829085413-56de8ae18c73?q=80&w=2000&auto=format&fit=crop')] bg-cover bg-center mix-blend-overlay"></div>
        <div className="absolute inset-0 bg-gradient-to-b from-primary/80 to-primary"></div>
        <div className="container mx-auto px-4 relative z-10">
          <div className="flex flex-col lg:flex-row items-center gap-12">
            <motion.div 
              className="flex-1 hidden lg:block"
              initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }} transition={{ duration: 0.8 }}
            >
              <div className="relative w-full max-w-md mx-auto rounded-2xl overflow-hidden border-4 border-secondary/30 shadow-2xl shadow-secondary/10">
                <img src={launchHeroImg} alt="RABAB LEGAL AI — الإطلاق التجريبي" className="object-cover w-full h-auto block" />
              </div>
            </motion.div>
            <motion.div 
              className="flex-1 text-center lg:text-right"
              initial="hidden" animate="visible" variants={staggerContainer}
            >
              <motion.span variants={fadeInUp} className="inline-block py-1 px-3 rounded-full mb-6 text-xs sm:text-sm font-semibold" style={{color:'hsl(47 100% 48%)', background:'hsl(191 100% 50% / 0.1)', border:'2px solid hsl(191 100% 50% / 0.7)'}}>
                رباب محاميتك الرقمية &mdash; RABAB LEGAL AI
              </motion.span>
              <motion.h1 variants={fadeInUp} className="text-xl sm:text-2xl md:text-3xl lg:text-4xl font-bold text-white mb-6 leading-snug">
                <span className="text-secondary">رباب</span> مستشارتك القانونية <span className="text-secondary">في</span> أي زمان ومكان
              </motion.h1>
              <motion.p variants={fadeInUp} className="text-sm md:text-base text-white mb-4 max-w-2xl mx-auto lg:mx-0 leading-relaxed">
                استشارات قانونية سريعة ودقيقة وفق الأنظمة السعودية، باستخدام أحدث تقنيات الذكاء الاصطناعي.
              </motion.p>
              <motion.div variants={fadeInUp} className="flex justify-center lg:justify-end mb-8">
                <a
                  href="#why-rabab"
                  onClick={e => { e.preventDefault(); document.getElementById('why-rabab')?.scrollIntoView({ behavior: 'smooth' }); }}
                  className="flex items-center gap-1.5 text-secondary/80 hover:text-secondary text-sm font-medium transition-colors"
                >
                  لماذا تختار رباب؟
                  <ChevronDown className="w-4 h-4 animate-bounce" />
                </a>
              </motion.div>
            </motion.div>
          </div>
        </div>
      </section>

      {/* Benefits */}
      <section id="why-rabab" className="pt-6 pb-6 bg-primary text-primary-foreground">
        <div className="container mx-auto px-4">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-16 items-center">
            <div>
              <h2 className="text-lg sm:text-lg md:text-xl lg:text-2xl font-bold mb-6">لماذا تختار <span className="text-secondary">رباب محاميتك الرقمية</span><span className="text-blue-400">؟</span></h2>
              <p className="text-lg text-white mb-8 leading-relaxed">
                نجمع بين خبرة المحامين العريقة والتكنولوجيا الحديثة لتقديم تجربة استشارية استثنائية.
              </p>
              <div className="space-y-6">
                {[
                  { title: "استجابة فورية", desc: "لا داعي للانتظار لحجز موعد، استشارتك جاهزة على مدار الساعة." },
                  { title: "دقة وموثوقية", desc: "مبنية على أحدث الأنظمة والقوانين المعمول بها في المملكة ودول مجلس التعاون." },
                  { title: "خصوصية تامة", desc: "تشفير كامل لبياناتك ومحادثاتك لضمان السرية المطلقة." },
                ].map((benefit, i) => (
                  <div key={i} className="flex gap-4">
                    <div className="mt-1"><CheckCircle2 className="w-6 h-6 text-secondary" /></div>
                    <div>
                      <h4 className="font-bold text-lg mb-1 text-secondary">{benefit.title}</h4>
                      <p className="text-white">{benefit.desc}</p>
                    </div>
                  </div>
                ))}
                {/* ── ميزة حصرية: خبرة بشرية عند الحاجة ── */}
                <div className="flex gap-4 border border-secondary/40 bg-secondary/5 rounded-xl px-4 py-3">
                  <div className="mt-1 shrink-0">
                    <svg xmlns="http://www.w3.org/2000/svg" className="w-6 h-6 text-secondary" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                    </svg>
                  </div>
                  <p className="text-white/90 text-sm leading-relaxed lg:whitespace-nowrap">
                    <span className="font-bold text-secondary">خبرة بشرية عند الحاجة</span>
                    <span className="mx-2 inline-flex align-middle text-[10px] font-bold bg-secondary text-primary px-2 py-0.5 rounded-full">ميزة حصرية</span>
                    — إمكانية الرجوع المباشر والتواصل مع المحامية <span className="text-secondary font-bold underline decoration-secondary/60 underline-offset-4">د. رباب أحمد المعبي</span> عند الحاجة والحصول على الرأي القانوني.
                  </p>
                </div>
              </div>
            </div>
            <div className="relative">
              <div className="absolute inset-0 bg-secondary blur-3xl opacity-20 rounded-full"></div>
              <img src={lawyerHeroImg} alt="محامية رباب" className="rounded-2xl relative z-10 border border-white/10" />
            </div>
          </div>
        </div>
      </section>

      {/* ── CTA التسجيل ── */}
      <section className="py-14 bg-gradient-to-b from-primary to-[#0a1628]">
        <div className="container mx-auto px-4 text-center">
          <motion.div initial="hidden" animate="visible" variants={fadeInUp}>
            <h2 className="text-2xl md:text-3xl font-bold text-white mb-8">
              ابدأ استشارتك القانونية الأولى مجاناً
            </h2>
            <div className="flex flex-col sm:flex-row gap-4 justify-center">
              <Link href="/register">
                <Button size="lg" className="bg-secondary text-primary font-bold hover:bg-secondary/90 text-lg px-10 h-14 shadow-xl shadow-secondary/30 w-full sm:w-auto">
                  ابدأ الاستشارة
                </Button>
              </Link>
              <Link href="/pricing">
                <Button size="lg" variant="outline" className="border-secondary/50 text-secondary font-bold hover:bg-secondary/10 text-lg px-10 h-14 w-full sm:w-auto">
                  عرض الباقات
                </Button>
              </Link>
            </div>
          </motion.div>
        </div>
      </section>

      {/* ── كتالوج الخدمات الرئيسية ── */}
      <section id="services" className="bg-gradient-to-b from-primary to-[#0f1c3a] py-12 md:py-16" dir="rtl">
        <div className="w-full max-w-[1600px] mx-auto px-4 sm:px-8 lg:px-12">
          <motion.div initial="hidden" whileInView="visible" viewport={{ once: true }} variants={fadeInUp} className="mx-auto mb-10 max-w-2xl text-center">
            <p className="mb-2 text-sm font-bold text-secondary">خدماتنا القانونية</p>
            <h2 className="text-3xl font-black text-white md:text-4xl">اختر الخدمة المناسبة لاحتياجك</h2>
            <p className="mt-3 text-white/70">اضغط على الخدمة لعرض شرحها وفروعها واختيار المسار المناسب.</p>
          </motion.div>

          <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-4">
            {SERVICE_CATALOG.map((service, index) => {
              const ServiceIcon = service.icon;
              return (
                <motion.div
                  key={service.id}
                  initial={{ opacity: 0, y: 20 }}
                  whileInView={{ opacity: 1, y: 0 }}
                  viewport={{ once: true }}
                  transition={{ delay: Math.min(index * 0.06, 0.35) }}
                >
                  <Link href={`/services/${service.id}`} className="group block h-full">
                    <div className="flex h-full min-h-52 flex-col rounded-2xl border-2 border-secondary/60 bg-white/5 p-6 text-right transition-all hover:-translate-y-1 hover:border-secondary hover:bg-white/10 hover:shadow-xl hover:shadow-secondary/10">
                      <div className="flex items-start gap-3">
                        <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl border border-secondary/40 bg-secondary/15 text-secondary transition-colors group-hover:bg-secondary group-hover:text-primary">
                          <ServiceIcon className="h-6 w-6" />
                        </div>
                        <div className="min-w-0">
                           <h3 className="whitespace-nowrap text-base font-bold leading-tight text-white">{service.title}</h3>
                          <p className="mt-1 text-sm leading-relaxed text-white/65">{service.summary}</p>
                        </div>
                      </div>
                      <div className="mt-auto flex items-center justify-between border-t border-white/15 pt-5 text-sm font-bold text-secondary">
                        <span>عرض الخدمة والفروع</span>
                        <ArrowLeft className="h-4 w-4 transition-transform group-hover:-translate-x-1" />
                      </div>
                    </div>
                  </Link>
                </motion.div>
              );
            })}
          </div>
        </div>
      </section>

      {/* العرض السابق للفروع داخل الصفحة — أُلغي لصالح صفحات الخدمات المستقلة */}
      <section className="hidden" aria-hidden="true">
        <div className="w-full max-w-[1600px] mx-auto px-4 sm:px-8 lg:px-12">

          {/* Header */}
          <motion.div initial="hidden" animate="visible" variants={fadeInUp} className="text-center mb-10">
            <h2 className="text-2xl md:text-3xl font-bold text-white mb-3">أدوات المحامية الرقمية</h2>
          </motion.div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6 lg:gap-8">
            <motion.section
              initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }}
              style={{ order: 1 }}
              className="bg-white/5 border-4 border-secondary/60 rounded-2xl p-6 lg:p-7"
              aria-labelledby="legal-consultations-heading"
            >
              <div className="flex items-center gap-3 pb-4 border-b border-white/15">
                <div className="w-12 h-12 rounded-xl bg-secondary/20 border border-secondary/40 flex items-center justify-center shrink-0">
                  <MessageSquare className="w-6 h-6 text-secondary" />
                </div>
                <div>
                  <h3 id="legal-consultations-heading" className="text-white font-bold text-lg leading-tight">الاستشارات القانونية</h3>
                  <p className="text-white/60 text-xs mt-0.5">رأي قانوني مستند إلى الأنظمة</p>
                </div>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-6">
                {[
                  { label: 'استشارة قانونية', detail: 'رأي قانوني موثّق', href: '/consultation', icon: MessageSquare },
                ].map(service => {
                  const Icon = service.icon;
                  return (
                    <Link key={service.label} href={service.href}>
                      <div className="h-full min-h-20 rounded-xl border border-white/15 bg-white/5 p-3 text-right transition-all hover:bg-white/10 hover:border-secondary/70">
                        <div className="flex items-center gap-2">
                          <Icon className="w-4 h-4 text-secondary shrink-0" />
                          <span className="text-sm font-bold text-white">{service.label}</span>
                        </div>
                        <p className="text-xs text-white/55 mt-1 pr-6">{service.detail}</p>
                      </div>
                    </Link>
                  );
                })}
              </div>
            </motion.section>

            <motion.section
              initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2 }}
              style={{ order: 2 }}
              className="bg-white/5 border-4 border-secondary/60 rounded-2xl p-6 lg:p-7"
              aria-labelledby="judicial-consultations-heading"
            >
              <div className="flex items-center gap-3 pb-4 border-b border-white/15">
                <div className="w-12 h-12 rounded-xl bg-secondary/20 border border-secondary/40 flex items-center justify-center shrink-0">
                  <Gavel className="w-6 h-6 text-secondary" />
                </div>
                <div>
                  <h3 id="judicial-consultations-heading" className="text-white font-bold text-lg leading-tight">الاستشارات القضائية</h3>
                  <p className="text-white/60 text-xs mt-0.5">خدمات القضايا والأحكام والمذكرات</p>
                </div>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-6">
                {[
                  { label: 'إدارة القضية', detail: 'تنظيم مراحل ومستندات القضية', href: '/consultation?type=case_management', icon: Briefcase },
                  { label: 'تحليل الأحكام', detail: 'دراسة الحكم وأسبابه', href: '/consultation?type=judgment_analysis', icon: Gavel },
                  { label: 'تحرير المذكرات', detail: 'صحائف ولوائح ومذكرات', href: '/legal-assistant?service=pleadings', icon: PenLine },
                  { label: 'الاعتراضات واللوائح', detail: 'استئناف ونقض والتماس', href: '/consultation?type=pleadings', icon: Landmark },
                ].map(service => {
                  const Icon = service.icon;
                  return (
                    <Link key={service.label} href={service.href}>
                      <div className="h-full min-h-20 rounded-xl border border-white/15 bg-white/5 p-3 text-right transition-all hover:bg-white/10 hover:border-secondary/70">
                        <div className="flex items-center gap-2">
                          <Icon className="w-4 h-4 text-secondary shrink-0" />
                          <span className="text-sm font-bold text-white">{service.label}</span>
                        </div>
                        <p className="text-xs text-white/55 mt-1 pr-6">{service.detail}</p>
                      </div>
                    </Link>
                  );
                })}
              </div>
            </motion.section>

            <motion.section
              initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.3 }}
              style={{ order: 7 }}
              className="bg-white/5 border-4 border-secondary/60 rounded-2xl p-6 lg:p-7"
              aria-labelledby="commercial-arbitration-heading"
            >
              <div className="flex items-center gap-3 pb-4 border-b border-white/15">
                <div className="w-12 h-12 rounded-xl bg-secondary/20 border border-secondary/40 flex items-center justify-center shrink-0">
                  <Landmark className="w-6 h-6 text-secondary" />
                </div>
                <div>
                  <h3 id="commercial-arbitration-heading" className="text-white font-bold text-lg leading-tight">التحكيم التجاري والوساطة</h3>
                  <p className="text-white/60 text-xs mt-0.5">إدارة التحكيم والوساطة والتسوية</p>
                </div>
              </div>
              <div className="grid grid-cols-1 gap-3 pt-6">
                {[
                  { label: 'إدارة جلسات التحكيم', detail: 'جدول الجلسة والإجراءات والمتابعة', href: '/consultation?type=arbitration_session_management', icon: Clock },
                  { label: 'تحرير محاضر التحكيم', detail: 'مسودة محضر دقيقة للمراجعة والاعتماد', href: '/consultation?type=arbitration_minutes', icon: FileText },
                  { label: 'تحليل أحكام التحكيم', detail: 'الأسباب والمنطوق ومسارات التنفيذ', href: '/consultation?type=arbitration_award_analysis', icon: Gavel },
                  { label: 'طلب الصلح', detail: 'حل ودي للنزاع بموافقة الأطراف', href: buildWhatsAppContactLink('السلام عليكم، أرغب في طلب خدمة الصلح ضمن التحكيم التجاري والوساطة.'), icon: Handshake, external: true },
                  { label: 'طلب الوساطة', detail: 'وساطة قانونية للوصول إلى تسوية', href: buildWhatsAppContactLink('السلام عليكم، أرغب في طلب خدمة الوساطة ضمن التحكيم التجاري والوساطة.'), icon: Handshake, external: true },
                ].map(service => {
                  const Icon = service.icon;
                  const content = (
                    <div className="h-full min-h-20 rounded-xl border border-white/15 bg-white/5 p-3 text-right transition-all hover:bg-white/10 hover:border-secondary/70">
                      <div className="flex items-center gap-2">
                        <Icon className="w-4 h-4 text-secondary shrink-0" />
                        <span className="text-sm font-bold text-white">{service.label}</span>
                      </div>
                      <p className="text-xs text-white/55 mt-1 pr-6">{service.detail}</p>
                    </div>
                  );
                  return service.external ? (
                    <a key={service.label} href={service.href} target="_blank" rel="noopener noreferrer">{content}</a>
                  ) : (
                    <Link key={service.label} href={service.href}>
                      {content}
                    </Link>
                  );
                })}
              </div>
            </motion.section>

            {REMAINING_DIGITAL_TOOL_CATEGORIES
              .slice()
              .sort((a, b) => REMAINING_DIGITAL_TOOL_CATEGORY_ORDER.indexOf(a.id) - REMAINING_DIGITAL_TOOL_CATEGORY_ORDER.indexOf(b.id))
              .map((category, index) => {
              const CategoryIcon = category.icon;
              return (
                <motion.section
                  key={category.id}
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.4 + (index * 0.1) }}
                  style={{ order: index + 3 + (category.id === 'research' ? 1 : 0) }}
                  className="bg-white/5 border-4 border-secondary/60 rounded-2xl p-6 lg:p-7"
                  aria-labelledby={`${category.id}-heading`}
                >
                  <div className="flex items-center gap-3 pb-4 border-b border-white/15">
                    <div className="w-12 h-12 rounded-xl bg-secondary/20 border border-secondary/40 flex items-center justify-center shrink-0">
                      <CategoryIcon className="w-6 h-6 text-secondary" />
                    </div>
                    <div>
                      <h3 id={`${category.id}-heading`} className="text-white font-bold text-lg leading-tight">{category.title}</h3>
                      <p className="text-white/60 text-xs mt-0.5">{category.subtitle}</p>
                    </div>
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-6">
                    {category.items.map(item => {
                      const ItemIcon = item.icon;
                      const content = (
                        <div className="h-full min-h-20 rounded-xl border border-white/15 bg-white/5 p-3 text-right transition-all hover:bg-white/10 hover:border-secondary/70">
                          <div className="flex items-center gap-2">
                            <ItemIcon className="w-4 h-4 text-secondary shrink-0" />
                            <span className="text-sm font-bold text-white">{item.label}</span>
                          </div>
                          <p className="text-xs text-white/55 mt-1 pr-6">{item.detail}</p>
                        </div>
                      );

                      return item.external ? (
                        <a key={item.label} href={item.href} target="_blank" rel="noopener noreferrer">{content}</a>
                      ) : (
                        <Link key={item.label} href={item.href}>{content}</Link>
                      );
                    })}
                  </div>
                </motion.section>
              );
            })}
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="py-12 bg-primary text-center">
        <div className="container mx-auto px-4">
          <h2 className="text-2xl md:text-3xl lg:text-4xl font-bold text-white mb-6">خدمة قانونية فورية — ابدأ الآن</h2>
          <Link href="/register">
            <Button size="lg" className="bg-secondary text-primary hover:bg-secondary/90 text-lg px-10 h-14 shadow-xl font-bold">
              أنشئ حسابك مجاناً
            </Button>
          </Link>
        </div>
      </section>

      {/* How it works */}
      <section className="py-12 bg-background">
        <div className="container mx-auto px-4">
          <div className="text-center mb-10">
            <h2 className="text-2xl md:text-3xl lg:text-4xl font-bold text-primary mb-4">كيف تعمل الخدمة؟</h2>
            <p className="text-muted-foreground text-lg max-w-2xl mx-auto">خطوات بسيطة للحصول على الرأي القانوني الذي تحتاجه</p>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
            {[
              { num: "01", title: "سجل حسابك", desc: "أنشئ حساباً جديداً في ثوانٍ معدودة وابدأ رحلتك معنا." },
              { num: "02", title: "اختر باقتك", desc: "حدد الباقة المناسبة لاحتياجاتك القانونية وأكمل الدفع بأمان." },
              { num: "03", title: "اطرح سؤالك", desc: "احصل على إجابة فورية ودقيقة مبنية على الأنظمة السعودية." }
            ].map((step, i) => (
              <motion.div 
                key={i} 
                initial="hidden" whileInView="visible" viewport={{ once: true }} variants={fadeInUp}
                className="bg-card p-8 rounded-2xl border-2 border-secondary text-center transition-colors shadow-sm shadow-secondary/20 relative group"
              >
                <div className="w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-6 text-2xl font-bold transition-colors" style={{background:'hsl(47 100% 48%)',color:'hsl(220 60% 7%)'}}>
                  {step.num}
                </div>
                <h3 className="text-xl font-bold mb-3 text-primary">{step.title}</h3>
                <p className="text-muted-foreground leading-relaxed">{step.desc}</p>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* ── قاعدة المعرفة القانونية — عنوان وسطر توضيحي فقط ── */}
      <section className="py-14 bg-primary border-t border-white/10">
        <div className="container mx-auto px-4">
          <motion.div
            initial="hidden" whileInView="visible" viewport={{ once: true }} variants={fadeInUp}
            className="text-center"
          >
            <h2 className="text-2xl md:text-3xl lg:text-4xl font-black text-white mb-3 tracking-tight">
              قاعدة معرفة قانونية <span className="text-secondary">متكاملة</span>
            </h2>
            <p className="text-white/55 text-base md:text-lg font-medium">
              محتوى قانوني موثّق يُغذّي كل استشارة
            </p>
          </motion.div>
        </div>
      </section>

      {/* ── خدماتنا — 7 خدمات مستقلة ── */}
      <section className="hidden" aria-hidden="true">
        <div className="container mx-auto px-4">
          <div className="mb-10">
            <h2 className="text-2xl md:text-3xl lg:text-4xl font-bold text-primary mb-2">خدماتنا</h2>
            <p className="text-muted-foreground text-base max-w-xl">اختر الخدمة المناسبة لاحتياجك القانوني</p>
          </div>

          {/* الخدمات السبع المعتمدة */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-5 mb-5">
            {[
              {
                id: 'legal_consultation', icon: <MessageSquare className="w-6 h-6" />,
                title: 'الاستشارات القانونية', sub: 'رأي قانوني مستند إلى الأنظمة',
                href: '/consultation', branches: null,
              },
              {
                id: 'judicial', icon: <Gavel className="w-6 h-6" />,
                title: 'الاستشارات القضائية', sub: 'إدارة القضايا وتحليل الأحكام',
                href: '/legal-assistant?service=judicial',
                branches: [
                  { label: 'إدارة القضية', href: '/consultation?type=case_management' },
                  { label: 'تحليل الأحكام القضائية', href: '/consultation?type=judgment_analysis' },
                ],
              },
              {
                id: 'pleadings', icon: <PenLine className="w-6 h-6" />,
                title: 'تحرير المذكرات والصحائف', sub: 'صياغة وفق النوع والمسار القضائي',
                href: '/legal-assistant?service=pleadings',
                branches: [
                  { label: 'لائحة الدعوى', href: '/legal-assistant?service=pleadings&memoType=lawsuit' },
                  { label: 'المذكرة الجوابية أو مذكرة الرد', href: '/legal-assistant?service=pleadings&memoType=response' },
                  { label: 'الاعتراض بالاستئناف', href: '/legal-assistant?service=pleadings&memoType=appeal' },
                  { label: 'الاعتراض بالتماس إعادة النظر', href: '/legal-assistant?service=pleadings&memoType=review_petition' },
                  { label: 'النقض أمام المحكمة العليا', href: '/legal-assistant?service=pleadings&memoType=cassation' },
                ],
              },
              {
                id: 'contracts', icon: <FileText className="w-6 h-6" />,
                title: 'صياغة ومراجعة العقود', sub: 'عقود نظامية لدول مجلس التعاون',
                href: '/contracts',
                branches: [
                  { label: 'صياغة عقد جديد', href: '/contracts?tab=draft' },
                  { label: 'تحليل عقد ودراسة المخاطر', href: '/contracts?tab=analyze' },
                  { label: 'مراجعة عقد وتقديم النصح', href: '/contracts?tab=review' },
                  { label: 'استخراج البيانات والتلخيص', href: '/contracts?tab=extract' },
                ],
              },
              {
                id: 'intellectual_property', icon: <Lightbulb className="w-6 h-6" />,
                title: 'خدمات الملكية الفكرية', sub: 'حماية الحقوق والابتكارات',
                href: '/legal-assistant?service=intellectual_property',
                branches: [
                  { label: 'تسجيل وتجديد العلامات التجارية', href: '/consultation?type=legal_opinion&ipType=trademark' },
                  { label: 'حقوق المؤلف والمصنفات', href: '/consultation?type=legal_opinion&ipType=copyright' },
                  { label: 'براءات الاختراع', href: '/consultation?type=legal_opinion&ipType=patent' },
                  { label: 'الرسوم والنماذج الصناعية', href: '/consultation?type=legal_opinion&ipType=industrial-design' },
                  { label: 'الأسرار التجارية', href: '/consultation?type=legal_opinion&ipType=trade-secret' },
                  { label: 'الترخيص ونقل ملكية الحقوق', href: '/consultation?type=legal_opinion&ipType=licensing-transfer' },
                  { label: 'التعدي والمنازعات الفكرية', href: '/consultation?type=legal_opinion&ipType=infringement' },
                  { label: 'حماية الحقوق دولياً', href: '/consultation?type=legal_opinion&ipType=international' },
                ],
              },
              {
                id: 'corporate_governance_compliance', icon: <Shield className="w-6 h-6" />,
                title: 'حوكمة وامتثال الشركات', sub: 'سياسات وضوابط وإدارة المخاطر',
                href: '/consultation?type=legal_opinion&service=corporate-governance-compliance&governanceType=framework',
                branches: [
                  { label: 'تأسيس وإطار الحوكمة', href: '/consultation?type=legal_opinion&service=corporate-governance-compliance&governanceType=framework' },
                  { label: 'سياسات ولوائح الشركات', href: '/consultation?type=legal_opinion&service=corporate-governance-compliance&governanceType=policies' },
                  { label: 'الامتثال النظامي والرقابي', href: '/consultation?type=legal_opinion&service=corporate-governance-compliance&governanceType=regulatory-compliance' },
                  { label: 'إدارة المخاطر القانونية', href: '/consultation?type=legal_opinion&service=corporate-governance-compliance&governanceType=legal-risk' },
                  { label: 'مجلس الإدارة واللجان', href: '/consultation?type=legal_opinion&service=corporate-governance-compliance&governanceType=board-committees' },
                  { label: 'تضارب المصالح والإفصاح', href: '/consultation?type=legal_opinion&service=corporate-governance-compliance&governanceType=conflicts-disclosure' },
                  { label: 'هيكل الملكية وحقوق الشركاء', href: '/consultation?type=legal_opinion&service=corporate-governance-compliance&governanceType=ownership-partners' },
                  { label: 'الصلاحيات والتفويض', href: '/consultation?type=legal_opinion&service=corporate-governance-compliance&governanceType=delegation-authority' },
                  { label: 'الأطراف ذات العلاقة', href: '/consultation?type=legal_opinion&service=corporate-governance-compliance&governanceType=related-parties' },
                  { label: 'مكافحة الرشوة وغسل الأموال', href: '/consultation?type=legal_opinion&service=corporate-governance-compliance&governanceType=anti-bribery-aml' },
                  { label: 'حماية البيانات والخصوصية', href: '/consultation?type=legal_opinion&service=corporate-governance-compliance&governanceType=data-privacy' },
                  { label: 'الإبلاغ عن المخالفات', href: '/consultation?type=legal_opinion&service=corporate-governance-compliance&governanceType=whistleblowing' },
                  { label: 'المراجعة الداخلية والتحقيقات', href: '/consultation?type=legal_opinion&service=corporate-governance-compliance&governanceType=internal-investigations' },
                  { label: 'تقييم الامتثال وخطط المعالجة', href: '/consultation?type=legal_opinion&service=corporate-governance-compliance&governanceType=compliance-remediation' },
                ],
              },
              {
                id: 'commercial_arbitration', icon: <Landmark className="w-6 h-6" />,
                title: 'التحكيم التجاري والوساطة', sub: 'إدارة التحكيم والوساطة والتسوية',
                href: '/legal-assistant?service=commercial_arbitration',
                branches: [
                  { label: 'إدارة جلسات التحكيم', href: '/consultation?type=arbitration_session_management' },
                  { label: 'تحرير محاضر التحكيم', href: '/consultation?type=arbitration_minutes' },
                  { label: 'تحليل أحكام التحكيم', href: '/consultation?type=arbitration_award_analysis' },
                  { label: 'الصلح', href: buildWhatsAppContactLink('السلام عليكم، أرغب في طلب خدمة الصلح ضمن التحكيم التجاري والوساطة.'), external: true },
                  { label: 'الوساطة', href: buildWhatsAppContactLink('السلام عليكم، أرغب في طلب خدمة الوساطة ضمن التحكيم التجاري والوساطة.'), external: true },
                ],
              },
              {
                id: 'research', icon: <Search className="w-6 h-6" />,
                title: 'الباحثة الذكية', sub: 'بحث في المصادر والوثائق القانونية',
                href: '/legal-search',
                branches: [
                  { label: 'السوابق القضائية', href: '/legal-search?filter=judicial' },
                  { label: 'المدونات القانونية', href: '/legal-search?filter=codex' },
                  { label: 'التعاميم', href: '/legal-search?filter=circulars' },
                  { label: 'القرارات', href: '/legal-search?filter=decisions' },
                  { label: 'بحث في الكل', href: '/legal-search' },
                ],
              },
            ].map(svc => (
              <motion.div key={svc.id} initial="hidden" whileInView="visible" viewport={{ once: true }} variants={fadeInUp} className="flex flex-col">
                <div
                  onClick={() => {
                    if (!svc.branches) {
                      window.location.href = svc.href;
                      return;
                    }
                    setHomeExpandedId(prev => prev === svc.id ? null : svc.id);
                  }}
                  className={`group border rounded-2xl p-5 cursor-pointer transition-all select-none ${homeExpandedId === svc.id ? 'border-primary/60 bg-primary/5 rounded-b-none border-b-0' : 'border-border/60 bg-card hover:border-primary/40 hover:shadow-md'}`}
                >
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center text-primary shrink-0">{svc.icon}</div>
                    <div className="flex-1 min-w-0">
                      <h3 className="font-bold text-foreground text-sm">{svc.title}</h3>
                      <p className="text-xs text-muted-foreground mt-0.5">{svc.sub}</p>
                    </div>
                    {svc.branches
                      ? <ChevronDown className={`w-4 h-4 text-muted-foreground shrink-0 transition-transform ${homeExpandedId === svc.id ? 'rotate-180' : ''}`} />
                      : <ArrowLeft className="w-4 h-4 text-muted-foreground shrink-0 rotate-180" />
                    }
                  </div>
                </div>
                <AnimatePresence>
                  {homeExpandedId === svc.id && svc.branches && (
                    <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }} transition={{ duration: 0.18 }} className="overflow-hidden border border-primary/40 border-t-0 rounded-b-2xl bg-card">
                      <div className="p-3 flex flex-col gap-1">
                        {svc.branches.map(b => {
                          const content = (
                            <div className="flex items-center justify-between px-3 py-2 rounded-lg hover:bg-muted/50 transition-colors">
                              <span className="text-xs font-medium text-foreground">{b.label}</span>
                              <ArrowLeft className="w-3 h-3 text-muted-foreground rotate-180" />
                            </div>
                          );
                          return b.external ? (
                            <a key={b.href} href={b.href} target="_blank" rel="noopener noreferrer">{content}</a>
                          ) : (
                            <Link key={b.href} href={b.href}>{content}</Link>
                          );
                        })}
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </motion.div>
            ))}
          </div>

        </div>
      </section>


      {/* Testimonials */}
      <section className="py-12 bg-background">
        <div className="container mx-auto px-4">
          <div className="text-center mb-10">
            <h2 className="text-2xl md:text-3xl lg:text-4xl font-bold text-primary mb-4">ماذا يقول عملاؤنا؟</h2>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
            {[
              { name: "أحمد س.", role: "رائد أعمال", text: "وفرت علي المنصة الكثير من الوقت والجهد في فهم عقود التأسيس قبل التوقيع عليها. خدمة ممتازة." },
              { name: "سارة م.", role: "موظفة", text: "استشارة دقيقة وواضحة جداً في قضية عمالية، ساعدتني في معرفة حقوقي كاملة." },
              { name: "عبدالله ع.", role: "مستثمر", text: "تجربة احترافية، الإجابات سريعة وتغطي الجوانب القانونية بشكل شامل وموثوق." }
            ].map((testimonial, i) => (
              <Card key={i} className="bg-muted/20 border-2 border-border">
                <CardContent className="p-8">
                  <div className="flex gap-1 mb-4 text-secondary">
                    {[...Array(5)].map((_, j) => <Star key={j} className="w-4 h-4 fill-current" />)}
                  </div>
                  <p className="text-muted-foreground mb-6 leading-relaxed italic">"{testimonial.text}"</p>
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center text-primary font-bold">
                      {testimonial.name.charAt(0)}
                    </div>
                    <div>
                      <p className="font-bold text-sm text-primary">{testimonial.name}</p>
                      <p className="text-xs text-muted-foreground">{testimonial.role}</p>
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      </section>

      {/* FAQ */}
      <section className="py-14 bg-primary">
        <div className="container mx-auto px-4 max-w-3xl">
          <div className="text-center mb-12">
            <h2 className="text-2xl md:text-3xl font-bold text-secondary mb-4">الأسئلة الشائعة</h2>
            <p className="text-primary-foreground/60 text-sm">إجابات على الأسئلة الأكثر شيوعاً</p>
          </div>
          <div className="space-y-3">
            {faqs.map((faq, i) => (
              <div key={i} className="border border-secondary/25 rounded-xl overflow-hidden" style={{background:'hsl(var(--primary) / 0.5)', backdropFilter:'blur(4px)'}}>
                <button 
                  className="w-full px-6 py-4 flex justify-between items-center text-right font-bold text-primary-foreground hover:bg-white/5 transition-colors"
                  onClick={() => setActiveFaq(activeFaq === i ? null : i)}
                >
                  {faq.q}
                  {activeFaq === i ? <ChevronUp className="w-5 h-5 text-secondary" /> : <ChevronDown className="w-5 h-5 text-secondary" />}
                </button>
                <AnimatePresence>
                  {activeFaq === i && (
                    <motion.div 
                      initial={{ height: 0, opacity: 0 }} 
                      animate={{ height: "auto", opacity: 1 }} 
                      exit={{ height: 0, opacity: 0 }}
                      className="overflow-hidden"
                    >
                      <div className="px-6 pb-5 pt-0 text-primary-foreground/80 leading-relaxed border-t border-secondary/20 mt-0 pt-4">
                        {faq.a}
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            ))}
          </div>
        </div>
      </section>

      <Footer />
      
    </div>
  );
}
