import React, { useState, useEffect } from 'react';
import { setPageSEO } from '@/lib/seo';
import { Link, useLocation } from 'wouter';
import { Navbar, Footer } from '@/components/layout';
import { Button } from '@/components/ui';
import { Scale, CheckCircle2, ChevronDown, ChevronUp, MessageSquare, Shield, Clock, Phone, FileText, FileSignature, Handshake, Building, Gavel, Lightbulb, Briefcase, Landmark, Search, Loader2, Lock, PenLine, FileSearch, Bot, ArrowLeft, BookOpen, RefreshCw } from 'lucide-react';
import { motion, AnimatePresence, type Variants } from 'framer-motion';
import launchHeroImg from '@/assets/launch-hero.jpg';
import lawyerHeroImg from '@/assets/lawyer-hero.png';
import { buildWhatsAppContactLink } from '@/lib/whatsapp-contact';
import { SERVICE_CATALOG } from '@/lib/service-catalog';
import { useLang } from '@/hooks/use-language';
import { translateArabicText } from '@/lib/translations';

const API_BASE = import.meta.env.BASE_URL.replace(/\/$/, '');

const SERVICE_FRAME_STYLES = [
  { idle: 'border-secondary/70 hover:border-secondary hover:shadow-secondary/15', active: 'border-secondary bg-secondary/10', panel: 'border-secondary/60' },
  { idle: 'border-accent/70 hover:border-accent hover:shadow-accent/15', active: 'border-accent bg-accent/10', panel: 'border-accent/60' },
  { idle: 'border-blue-400/70 hover:border-blue-400 hover:shadow-blue-400/15', active: 'border-blue-400 bg-blue-400/10', panel: 'border-blue-400/60' },
  { idle: 'border-emerald-400/70 hover:border-emerald-400 hover:shadow-emerald-400/15', active: 'border-emerald-400 bg-emerald-400/10', panel: 'border-emerald-400/60' },
];

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
  const { lang, t } = useLang();
  const [activeFaq, setActiveFaq] = useState<number | null>(null);
  const [previewQuery, setPreviewQuery] = useState('');
  const [previewResults, setPreviewResults] = useState<PreviewResult[]>([]);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [previewSearched, setPreviewSearched] = useState(false);
  const [homeExpandedId, setHomeExpandedId] = useState<string | null>(null);
  const [serviceGridColumns, setServiceGridColumns] = useState(3);

  useEffect(() => {
    setPageSEO({
      title: t('استشارة قانونية بالذكاء الاصطناعي', 'AI-powered legal consultation'),
      description: t(
        'RABAB LEGAL AI — استشارة قانونية سعودية فورية ودقيقة مدعومة بالذكاء الاصطناعي. اطرح سؤالك في الأنظمة السعودية واحصل على إجابة موثّقة.',
        'RABAB LEGAL AI — instant, accurate Saudi legal guidance powered by AI. Ask about Saudi laws and receive a source-based answer.',
      ),
      canonical: 'https://rabablegal.com/',
    });
  }, [lang]);

  useEffect(() => {
    const desktopGrid = window.matchMedia('(min-width: 1536px)');
    const syncServiceGridColumns = () => setServiceGridColumns(desktopGrid.matches ? 4 : 3);
    syncServiceGridColumns();
    desktopGrid.addEventListener('change', syncServiceGridColumns);
    return () => desktopGrid.removeEventListener('change', syncServiceGridColumns);
  }, []);

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

  const serviceFrameStyles = [
    {
      card: "border-secondary/60 hover:border-secondary hover:shadow-secondary/10",
      icon: "border-2 border-secondary/80 bg-secondary/50 text-secondary group-hover:bg-secondary group-hover:text-primary",
    },
    {
      card: "border-accent/60 hover:border-accent hover:shadow-accent/10",
      icon: "border-2 border-accent/80 bg-accent/50 text-accent group-hover:bg-accent group-hover:text-primary",
    },
    {
      card: "border-blue-400/60 hover:border-blue-400 hover:shadow-blue-400/10",
      icon: "border-2 border-blue-400/80 bg-blue-400/50 text-blue-300 group-hover:bg-blue-400 group-hover:text-primary",
    },
    {
      card: "border-emerald-400/60 hover:border-emerald-400 hover:shadow-emerald-400/10",
      icon: "border-2 border-emerald-400/80 bg-emerald-400/50 text-emerald-300 group-hover:bg-emerald-400 group-hover:text-primary",
    },
  ];

  const faqs = [
    { q: "كيف أبدأ استشارتي القانونية؟", a: "سجلي حساباً، اختاري الخدمة الأقرب لاحتياجك، ثم أضيفي الوقائع والمستندات ذات الصلة. ابدئي بالمعلومات اللازمة فقط، ويمكن استكمال السياق خلال الحوار." },
    { q: "هل الاستشارات سرية؟", a: "راجعي سياسة الخصوصية وشروط الاستخدام قبل رفع أي مستند، وتجنبي إدراج بيانات لا تلزم لفهم المسألة. ولأي ملف شديد الحساسية، تواصلي مع المحامية لتحديد قناة مناسبة." },
    { q: "ما مدى دقة الإجابات المقدمة؟", a: "تُقدَّم الإجابات عبر منصة ذكاء اصطناعي متخصصة في المنظومة القانونية السعودية وتُعدّ توجيهاً أولياً لا رأياً قانونياً نهائياً. للقضايا التي تستوجب تعمقاً أكثر، تتيح المنصة إمكانية الرجوع مباشراً إلى المحامية د. رباب لاستكمال الاستشارة والحصول على الرأي القانوني المتخصص." },
    { q: "هل يمكنني استخدام رباب لصياغة العقود؟", a: "نعم، تتيح رباب خدمة متخصصة لصياغة العقود وفق الأنظمة السعودية ودول مجلس التعاون، مع إمكانية رفع ملف عقد موجود لمراجعته وتحسينه." },
    { q: "ما الفرق بين الاستشارة القانونية والاستشارة القضائية؟", a: "الاستشارة القانونية تجيب عن أسئلة قانونية عامة كالحقوق والالتزامات والعقود، أما الاستشارة القضائية فتُعنى بالقضايا المرفوعة أمام المحاكم وتحليل الأحكام والمرافعات وفق الأنظمة." },
    { q: "هل يمكنني رفع وثيقة أو عقد وتحليلها؟", a: "نعم، يمكنك رفع ملفات PDF أو Word أو صور مستندات وتحليلها مباشراً داخل المحادثة، وستستخرج رباب النص وتجيب عن أسئلتك استناداً إلى محتوى الوثيقة." },
    { q: "هل رباب متاحة على مدار الساعة؟", a: "يمكن الوصول إلى المنصة في أي وقت. أما الاستشارة المهنية المتخصصة أو متابعة المحامية فتخضع لقناة التواصل والترتيبات المعتمدة." },
    { q: "ما الأنظمة التي تستند إليها رباب؟", a: "تركّز المنصة على الأنظمة واللوائح السعودية ودول مجلس التعاون، مع توجيه المستخدم إلى المواد والمراجع ذات الصلة عند توفرها. تحققي دائماً من النص الرسمي الساري قبل اتخاذ قرار." },
    { q: "كيف تختلف رباب عن البحث في الإنترنت؟", a: "رباب لا تعرض نتائج بحث عامة، بل تحلل سؤالك وتجيب عليه مباشراً مستندةً إلى نصوص قانونية موثّقة، مع ذكر المصادر والمواد النظامية ذات الصلة." },
    { q: "هل يمكن الاستفادة من رباب للقضايا التجارية والشركات؟", a: "نعم، تغطي رباب الاستفسارات المتعلقة بتأسيس الشركات والعقود التجارية والنزاعات بين الشركاء وأحكام نظام الشركات ونظام الاستثمار، وتُعدّ أداةً فعّالة للمحامين ورجال الأعمال على حدٍّ سواء." },
  ];

  return (
    <div className="min-h-screen flex flex-col overflow-x-hidden font-sans">
      <Navbar />
      
      {/* Hero — contemporary legal editorial system */}
      <section className="relative overflow-hidden bg-[#071529] py-12 text-white sm:py-16 lg:py-20">
        <div className="legal-editorial-grid absolute inset-0 opacity-60" aria-hidden="true" />
        <div className="absolute inset-x-0 top-0 h-1 bg-[#D6A447]" aria-hidden="true" />
        <div className="container relative z-10 mx-auto px-5 sm:px-8 lg:px-12">
          <div className="grid items-center gap-10 lg:grid-cols-[minmax(0,1.25fr)_minmax(340px,0.75fr)] lg:gap-16">
            <motion.div initial="hidden" animate="visible" variants={staggerContainer} className="max-w-3xl text-center lg:text-right">
              <motion.p variants={fadeInUp} className="mb-5 text-[11px] font-extrabold tracking-[0.18em] text-[#D6A447]" dir="ltr">
                RABAB LEGAL AI · SAUDI ARABIA + GCC
              </motion.p>
              <motion.h1 variants={fadeInUp} className="text-balance text-4xl font-extrabold leading-[1.16] text-white sm:text-5xl lg:text-6xl">
                {t('مسار قانوني أوضح، من السؤال إلى القرار.', 'A clearer legal path, from question to decision.')}
              </motion.h1>
              <motion.p variants={fadeInUp} className="mx-auto mt-6 max-w-2xl text-base leading-8 text-white/75 sm:text-lg lg:mx-0">
                {t('منصة تساعدك على فهم المسألة القانونية، تنظيم مستندات القضية، صياغة المذكرات والعقود، والبحث في المصادر ذات الصلة ضمن سياق واحد قابل للمراجعة.', 'One reviewable workspace for legal questions, case files, pleadings, contracts, and source-led research.')}
              </motion.p>
              <motion.div variants={fadeInUp} className="mt-8 flex flex-col justify-center gap-3 sm:flex-row lg:justify-start">
                <Link href="/consultation">
                  <Button size="lg" className="h-12 w-full rounded-md bg-[#D6A447] px-6 font-bold text-[#071529] hover:bg-[#e2b65d] sm:w-auto">
                    {t('ابدأ الاستشارة', 'Start a consultation')}
                  </Button>
                </Link>
                <a href="https://smart-legal-researcher.s3t3-9306.chatgpt.site/" target="_blank" rel="noopener noreferrer">
                  <Button size="lg" variant="outline" className="h-12 w-full rounded-md border-white/35 bg-transparent px-6 font-bold text-white hover:bg-white/10 sm:w-auto">
                    {t('افتح الباحثة الذكية', 'Open smart researcher')}
                  </Button>
                </a>
              </motion.div>
              <motion.div variants={fadeInUp} className="mt-9 grid grid-cols-3 border-y border-white/15 text-right">
                {[
                  { number: '01', label: t('افهم موقفك', 'Understand') },
                  { number: '02', label: t('راجع الدليل', 'Review evidence') },
                  { number: '03', label: t('نظّم خطوتك', 'Plan next step') },
                ].map((item) => (
                  <div key={item.number} className="border-e border-white/15 px-3 py-4 last:border-e-0 sm:px-5">
                    <span className="block text-xs font-extrabold tracking-wider text-[#2BB9ED]" dir="ltr">{item.number}</span>
                    <span className="mt-1.5 block text-xs font-semibold leading-5 text-white/85 sm:text-sm">{item.label}</span>
                  </div>
                ))}
              </motion.div>
            </motion.div>
            <motion.figure initial={{ opacity: 0, y: 18 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.45, ease: 'easeOut' }} className="mx-auto w-full max-w-md lg:max-w-none">
              <div className="border border-white/20 bg-white/[0.03] p-3 sm:p-4">
                <img src={launchHeroImg} alt={t('RABAB LEGAL AI — الإطلاق التجريبي', 'RABAB LEGAL AI — Launch Preview')} className="aspect-square w-full object-cover" />
              </div>
              <figcaption className="legal-wordmark-rule mt-5 text-xs leading-6 text-white/60">
                {t('ذكاء قانوني دقيق وموثوق، مهيأ لعرض التحليل والمصدر والخطوة التالية بوضوح.', 'Precise, trusted legal intelligence designed around analysis, source, and next step.')}
              </figcaption>
            </motion.figure>
          </div>
        </div>
      </section>

      {/* Trust and reviewability */}
      <section id="why-rabab" className="legal-paper-surface legal-paper-grid border-b border-[#12335B]/15 bg-[#F6F2E9] py-14 text-[#071529] sm:py-16">
        <div className="container mx-auto px-5 sm:px-8 lg:px-12">
          <p className="mb-3 text-center text-xs font-extrabold tracking-[0.16em] text-[#2BB9ED]" dir="ltr">TRUST / REVIEW / CONTINUITY</p>
          <h2 className="mb-10 text-center text-3xl font-extrabold leading-tight sm:text-4xl md:text-5xl">
            {t('لماذا تختار رباب الرقمية؟', 'Why choose Rabab Digital?')}
          </h2>
          <div className="grid grid-cols-1 items-center gap-10 lg:grid-cols-2 lg:gap-16">
            <div>
              <p className="mb-8 max-w-2xl text-base leading-8 text-[#12335B] sm:text-lg">
                {t('تُبنى التجربة حول وضوح الوقائع والمصادر والخطوة التالية؛ لتظل المحادثة والمستندات مرتبة وسهلة المراجعة.', 'The experience is built around clear facts, sources, and next steps, so conversations and documents remain organised and reviewable.')}
              </p>
              <div className="border-y border-[#12335B]/15">
                {[
                  { number: '01', title: "سياق متصل", titleEn: "Connected context", desc: "رتّبي وقائع القضية والجلسات والمذكرات بحيث يستمر التسلسل بين المراحل.", descEn: "Organise the facts, hearings, and drafts so the record can continue across stages." },
                  { number: '02', title: "مصادر قابلة للتتبع", titleEn: "Traceable sources", desc: "راجعي المواد والمراجع المرتبطة بالتحليل قبل اعتماد أي مسودة أو خطوة.", descEn: "Review the materials and sources connected to the analysis before using a draft or next step." },
                  { number: '03', title: "خبرة بشرية عند الحاجة", titleEn: "Human expertise when needed", desc: "يمكن طلب التواصل مع المحامية د. رباب المعبي لاستكمال الاستشارة المتخصصة.", descEn: "Request contact with Lawyer Dr. Rabab Almoaibi for specialised follow-up when needed." },
                ].map((benefit, i) => (
                  <div key={i} className="grid grid-cols-[40px_1fr] gap-4 border-b border-[#12335B]/15 py-5 last:border-b-0">
                    <span className="text-sm font-extrabold tracking-[0.08em] text-[#2BB9ED]" dir="ltr">{benefit.number}</span>
                    <div>
                      <h4 className="text-base font-extrabold text-[#071529] sm:text-lg">{t(benefit.title, benefit.titleEn)}</h4>
                      <p className="mt-1.5 text-sm leading-7 text-[#12335B]">{t(benefit.desc, benefit.descEn)}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
            <div className="relative">
              <div className="absolute -inset-3 border border-[#D6A447]/40" aria-hidden="true" />
              <img src={lawyerHeroImg} alt={t('محامية رباب', 'Lawyer Rabab')} className="relative z-10 aspect-[4/3] w-full object-cover" />
            </div>
          </div>
        </div>
      </section>

      {/* Primary action */}
      <section className="legal-ink-surface bg-[#12335B] py-14">
        <div className="container mx-auto px-5 text-center sm:px-8">
          <motion.div initial="hidden" animate="visible" variants={fadeInUp}>
            <p className="mb-3 text-xs font-extrabold tracking-[0.16em] text-[#2BB9ED]" dir="ltr">BEGIN WITH CONTEXT</p>
            <h2 className="mb-4 text-2xl font-extrabold text-white md:text-3xl">
               {t('ابدأ باستشارة منظمة، ثم أضيفي التفاصيل عند الحاجة.', 'Start with a structured consultation, then add detail as needed.')}
            </h2>
            <p className="mx-auto mb-8 max-w-2xl text-sm leading-7 text-white/70">{t('يمكنك البدء بالسؤال، رفع المستند، أو الانتقال مباشرة إلى خدمة العقود والبحث القانوني.', 'Begin with a question, upload a document, or proceed directly to contracts and legal research.')}</p>
            <div className="flex flex-col justify-center gap-3 sm:flex-row">
              <Link href="/register">
                <Button size="lg" className="h-12 w-full rounded-md bg-[#D6A447] px-7 font-bold text-[#071529] hover:bg-[#e2b65d] sm:w-auto">
                   {t('ابدأ الاستشارة', 'Start Consultation')}
                </Button>
              </Link>
              <Link href="/pricing">
                <Button size="lg" variant="outline" className="h-12 w-full rounded-md border-white/35 px-7 font-bold text-white hover:bg-white/10 sm:w-auto">
                   {t('عرض الباقات', 'View Plans')}
                </Button>
              </Link>
            </div>
          </motion.div>
        </div>
      </section>

      {/* Primary services */}
      <section id="services" className="legal-paper-grid bg-[#F6F2E9] py-14 text-[#071529] sm:py-16" dir={lang === 'ar' ? 'rtl' : 'ltr'}>
        <div className="mx-auto w-full max-w-[1440px] px-5 sm:px-8 lg:px-12">
          <motion.div initial="hidden" whileInView="visible" viewport={{ once: true }} variants={fadeInUp} className="mb-10 grid gap-5 border-b border-[#12335B]/20 pb-8 lg:grid-cols-[1fr_auto] lg:items-end">
            <div className={lang === 'ar' ? 'text-right' : 'text-left'}>
              <p className="mb-3 text-xs font-extrabold tracking-[0.16em] text-[#12335B]" dir="ltr">SERVICES / 01–04</p>
              <h2 className="max-w-3xl text-3xl font-extrabold leading-tight text-[#071529] sm:text-4xl">{t('خدمات قانونية تبدأ بالسؤال وتنتهي بخطوة منظمة.', 'Legal services that move from question to an organised next step.')}</h2>
            </div>
            <p className="max-w-sm text-sm leading-7 text-[#12335B]">{t('اختاري المسار الأقرب لاحتياجك، ثم أضيفي الوقائع والمستندات بالقدر الذي يلزم لفهم السياق.', 'Choose the relevant path, then add the facts and documents needed to understand the context.')}</p>
          </motion.div>

          <div className="grid grid-cols-1 border-s border-t border-[#12335B]/20 sm:grid-cols-2 lg:grid-cols-4">
            {SERVICE_CATALOG.filter((service) => ['legal-consultation', 'judicial', 'contracts', 'research'].includes(service.id)).map((service, index) => {
              const ServiceIcon = service.icon;
              return (
                <motion.div key={service.id} initial={{ opacity: 0, y: 14 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }} transition={{ delay: index * 0.06 }}>
                  <Link href={`/services/${service.id}`} className="group block h-full border-b border-e border-[#12335B]/20 bg-[#F6F2E9]/90 p-6 transition-colors hover:bg-white sm:min-h-[270px]">
                    <div className="flex h-full flex-col">
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-extrabold tracking-[0.12em] text-[#2BB9ED]" dir="ltr">0{index + 1}</span>
                        <ServiceIcon className="h-5 w-5 text-[#12335B]" strokeWidth={1.7} />
                      </div>
                      <h3 className="mt-10 text-xl font-extrabold leading-snug text-[#071529]">{lang === 'ar' ? service.title : translateArabicText(service.title)}</h3>
                      <p className="mt-3 text-sm leading-7 text-[#12335B]">{lang === 'ar' ? service.description : translateArabicText(service.description)}</p>
                      <div className="mt-auto flex items-center justify-between border-t border-[#12335B]/15 pt-5 text-sm font-bold text-[#071529]">
                        <span>{t('استعراض الخدمة', 'Explore service')}</span>
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
          <h2 className="text-2xl md:text-3xl lg:text-4xl font-bold text-white mb-6">{t('خدمة قانونية فورية — ابدأ الآن', 'Instant Legal Service — Get Started')}</h2>
          <Link href="/register">
            <Button size="lg" className="bg-secondary text-primary hover:bg-secondary/90 text-lg px-10 h-14 shadow-xl font-bold">
              {t('أنشئ حسابك مجاناً', 'Create Your Free Account')}
            </Button>
          </Link>
        </div>
      </section>

      {/* How it works */}
      <section className="legal-paper-surface bg-[#F6F2E9] py-14 text-[#071529] sm:py-16">
        <div className="container mx-auto px-5 sm:px-8 lg:px-12">
          <div className="mb-10 grid gap-4 border-b border-[#12335B]/20 pb-7 md:grid-cols-[1fr_auto] md:items-end">
            <div>
              <p className="mb-3 text-xs font-extrabold tracking-[0.16em] text-[#2BB9ED]" dir="ltr">WORKFLOW / 01–03</p>
              <h2 className="text-3xl font-extrabold leading-tight md:text-4xl">{t('ثلاث مراحل لتحويل السؤال إلى مسار عملي.', 'Three stages to turn a question into a practical path.')}</h2>
            </div>
            <p className="max-w-sm text-sm leading-7 text-[#12335B]">{t('تظهر المعلومات اللازمة تدريجياً؛ لا تحتاجين إلى معرفة كل شيء قبل البدء.', 'The needed information appears gradually; you do not need to know everything before you begin.')}</p>
          </div>
          <div className="grid grid-cols-1 border-s border-t border-[#12335B]/20 md:grid-cols-3">
            {[
              { num: "01", title: "صِف المسألة", titleEn: "Describe the matter", desc: "ابدئي بالوقائع الأساسية، وحددي الدولة ونوع الخدمة، وأرفقي المستند إن كان مهماً للسياق.", descEn: "Start with the core facts, country, and service; attach a document when it matters to context." },
              { num: "02", title: "راجعي التحليل والمصدر", titleEn: "Review analysis and source", desc: "اقرئي التكييف والخطوات المقترحة، وراجعي المواد والمراجع التي تدعم النتيجة.", descEn: "Read the analysis and suggested steps, then review the cited materials and references." },
              { num: "03", title: "نظّمي الخطوة التالية", titleEn: "Organise the next step", desc: "احتفظي بالسياق، وحرري المسودة أو تابعي القضية أو تواصلي مع المحامية عند الحاجة.", descEn: "Keep the context, prepare the draft, follow the case, or contact the lawyer when needed." }
            ].map((step, i) => {
              return (
                <motion.div
                  key={i}
                  initial="hidden" whileInView="visible" viewport={{ once: true }} variants={fadeInUp}
                  className="border-b border-e border-[#12335B]/20 bg-[#F6F2E9]/90 p-6 text-right sm:min-h-[260px]"
                >
                  <span className="block text-sm font-extrabold tracking-[0.12em] text-[#2BB9ED]" dir="ltr">{step.num}</span>
                  <h3 className="mt-12 text-xl font-extrabold leading-snug">{t(step.title, step.titleEn)}</h3>
                  <p className="mt-3 text-sm leading-7 text-[#12335B]">{t(step.desc, step.descEn)}</p>
                </motion.div>
              );
            })}
          </div>
        </div>
      </section>

      {/* Smart legal researcher */}
      <section className="legal-ink-surface bg-[#071529] py-14 text-white sm:py-16">
        <div className="container mx-auto grid items-end gap-7 px-5 sm:px-8 lg:grid-cols-[1fr_auto] lg:px-12">
          <motion.div initial="hidden" whileInView="visible" viewport={{ once: true }} variants={fadeInUp} className="max-w-3xl">
            <p className="mb-3 text-xs font-extrabold tracking-[0.16em] text-[#2BB9ED]" dir="ltr">RESEARCH / SOURCE-LED</p>
            <h2 className="text-3xl font-extrabold leading-tight sm:text-4xl">{t('الباحثة الذكية: ابدئي بالمصدر، ثم ابني موقفك.', 'Smart researcher: start with the source, then build the position.')}</h2>
            <p className="mt-5 text-base leading-8 text-white/70">{t('ابحثي في السوابق القضائية والتعاميم والمدونات والقواعد والمبادئ، ثم استخدمي النتائج داخل الاستشارة أو ملف القضية.', 'Search precedents, circulars, legal codices, rules, and principles, then use the results in the consultation or case file.')}</p>
          </motion.div>
          <a href="https://smart-legal-researcher.s3t3-9306.chatgpt.site/" target="_blank" rel="noopener noreferrer">
            <Button size="lg" variant="outline" className="h-12 w-full rounded-md border-[#D6A447]/75 px-6 font-bold text-[#D6A447] hover:bg-[#D6A447] hover:text-[#071529] sm:w-auto">
              {t('زيارة أرشيف الباحثة الذكية', 'Visit smart researcher archive')}
            </Button>
          </a>
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
            ].map((svc, index) => (
              <motion.div key={svc.id} initial="hidden" whileInView="visible" viewport={{ once: true }} variants={fadeInUp} className="flex flex-col">
                <div
                  onClick={() => {
                    if (!svc.branches) {
                      window.location.href = svc.href;
                      return;
                    }
                    setHomeExpandedId(prev => prev === svc.id ? null : svc.id);
                  }}
                  className={`group border-2 rounded-2xl p-5 cursor-pointer transition-all select-none ${homeExpandedId === svc.id ? `${SERVICE_FRAME_STYLES[index % SERVICE_FRAME_STYLES.length].active} rounded-b-none border-b-0` : `${SERVICE_FRAME_STYLES[index % SERVICE_FRAME_STYLES.length].idle} bg-card hover:shadow-md`}`}
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
                    <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }} transition={{ duration: 0.18 }} className={`overflow-hidden border-2 border-t-0 rounded-b-2xl bg-card ${SERVICE_FRAME_STYLES[index % SERVICE_FRAME_STYLES.length].panel}`}>
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


      {/* Professional service standard */}
      <section className="legal-paper-surface bg-[#F6F2E9] py-14 text-[#071529] sm:py-16">
        <div className="container mx-auto px-5 sm:px-8 lg:px-12">
          <div className="mb-10 max-w-3xl">
            <p className="mb-3 text-xs font-extrabold tracking-[0.16em] text-[#2BB9ED]" dir="ltr">SERVICE STANDARD</p>
            <h2 className="text-3xl font-extrabold leading-tight sm:text-4xl">{t('خدمة قانونية تتعامل مع المعلومة بمسؤولية.', 'A legal service that treats information responsibly.')}</h2>
          </div>
          <div className="grid grid-cols-1 border-s border-t border-[#12335B]/20 md:grid-cols-3">
            {[
              { icon: FileSearch, title: 'السياق قبل الإجابة', titleEn: 'Context before answer', description: 'تُجمع الوقائع والمستندات ذات الصلة قبل الانتقال إلى تحليل أكثر تفصيلاً.', descriptionEn: 'Relevant facts and documents are gathered before moving to detailed analysis.' },
              { icon: BookOpen, title: 'المصدر جزء من النتيجة', titleEn: 'Source is part of the result', description: 'تظهر المواد والمراجع عند توفرها، ويمكنك الرجوع إلى الباحثة الذكية لتعميق البحث.', descriptionEn: 'Materials and references are shown when available, with the smart researcher available for deeper investigation.' },
              { icon: Shield, title: 'حدود مهنية واضحة', titleEn: 'Clear professional boundaries', description: 'المحتوى معرفي وغير ملزم، مع إتاحة التواصل مع المحامية عند الحاجة إلى استشارة متخصصة.', descriptionEn: 'Content is informational and non-binding, with lawyer contact available for specialised advice.' },
            ].map((principle) => {
              const PrincipleIcon = principle.icon;
              return (
                <div key={principle.title} className="border-b border-e border-[#12335B]/20 bg-[#F6F2E9]/90 p-6 sm:min-h-[235px]">
                  <PrincipleIcon className="h-5 w-5 text-[#12335B]" strokeWidth={1.7} />
                  <h3 className="mt-10 text-xl font-extrabold leading-snug">{t(principle.title, principle.titleEn)}</h3>
                  <p className="mt-3 text-sm leading-7 text-[#12335B]">{t(principle.description, principle.descriptionEn)}</p>
                </div>
              );
            })}
          </div>
        </div>
      </section>

      {/* FAQ */}
      <section className="legal-ink-surface bg-[#071529] py-14 text-white sm:py-16">
        <div className="container mx-auto max-w-4xl px-5 sm:px-8">
          <div className="mb-10 border-b border-white/15 pb-7 text-right">
            <p className="mb-3 text-xs font-extrabold tracking-[0.16em] text-[#2BB9ED]" dir="ltr">FAQ / CLARITY</p>
            <h2 className="text-3xl font-extrabold leading-tight sm:text-4xl">{t('أسئلة شائعة قبل أن تبدأي.', 'Frequently asked questions before you begin.')}</h2>
            <p className="mt-3 text-sm leading-7 text-white/70">{t('إجابات مختصرة توضح طريقة استخدام المنصة وحدود الخدمة.', 'Short answers about using the platform and the scope of the service.')}</p>
          </div>
          <div className="border-t border-white/15">
            {faqs.map((faq, i) => (
              <div key={i} className="overflow-hidden border-b border-white/15">
                <button 
                  className="flex min-h-14 w-full items-center justify-between gap-5 px-0 py-4 text-right text-sm font-bold text-white transition-colors hover:text-[#D6A447] sm:text-base"
                  onClick={() => setActiveFaq(activeFaq === i ? null : i)}
                >
                  {faq.q}
                  {activeFaq === i ? <ChevronUp className="h-5 w-5 shrink-0 text-[#D6A447]" /> : <ChevronDown className="h-5 w-5 shrink-0 text-[#D6A447]" />}
                </button>
                <AnimatePresence>
                  {activeFaq === i && (
                    <motion.div 
                      initial={{ height: 0, opacity: 0 }} 
                      animate={{ height: "auto", opacity: 1 }} 
                      exit={{ height: 0, opacity: 0 }}
                      className="overflow-hidden"
                    >
                      <div className="border-t border-white/10 pb-5 pt-4 text-sm leading-7 text-white/70">
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
