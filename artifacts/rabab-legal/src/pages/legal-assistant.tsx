/**
 * مركز الخدمات القانونية — 7 خدمات مستقلة
 * يتوسّع كل بطاقة في مكانها على الشاشات الكبيرة
 * وينقل إلى صفحة الخدمة على الجوال
 */
import React, { useState, useEffect } from 'react';
import { setPageSEO } from '@/lib/seo';
import { Link, useLocation } from 'wouter';
import { Navbar } from '@/components/layout';
import { useAuth } from '@/hooks/use-auth';
import { motion, AnimatePresence } from 'framer-motion';
import {
  MessageSquare, Gavel, FileSignature, FileText, Search,
  ChevronDown, ArrowLeft, Shield, CheckCircle2, Loader2, Mic, X, Landmark, Lightbulb,
} from 'lucide-react';
import { buildWhatsAppContactLink } from '@/lib/whatsapp-contact';

const SERVICE_LABELS: Record<string, string> = {
  consultation: 'الاستشارات القانونية',
  judicial: 'الاستشارات القضائية',
  commercial_arbitration: 'التحكيم التجاري والوساطة',
  pleadings: 'تحرير المذكرات',
  contracts: 'صياغة ومراجعة العقود',
  intellectual_property: 'الملكية الفكرية',
  corporate_governance_compliance: 'حوكمة وامتثال الشركات',
  research: 'الباحثة الذكية',
};

const API_BASE = import.meta.env.BASE_URL.replace(/\/$/, '');

const PLEADING_TYPES = [
  { id: 'lawsuit',         label: 'لائحة الدعوى' },
  { id: 'response',        label: 'المذكرة الجوابية أو مذكرة الرد' },
  { id: 'appeal',          label: 'الاعتراض بالاستئناف' },
  { id: 'review_petition', label: 'الاعتراض بالتماس إعادة النظر' },
  { id: 'cassation',       label: 'النقض أمام المحكمة العليا' },
];

const JUDICIAL_TRACKS = [
  { id: 'general',     label: 'المحاكم العامة' },
  { id: 'commercial',  label: 'المحاكم التجارية' },
  { id: 'labor',       label: 'المحاكم العمالية' },
  { id: 'admin',       label: 'ديوان المظالم' },
  { id: 'committee',   label: 'اللجان شبه القضائية' },
];

interface ServiceBranch { label: string; href: string; external?: boolean }

interface Service {
  id: string;
  icon: React.ReactNode;
  title: string;
  subtitle: string;
  desc: string;
  mainHref: string;
  branches: ServiceBranch[] | 'pleadings' | null;
}

const SERVICES: Service[] = [
  {
    id: 'legal_consultation',
    icon: <MessageSquare className="w-7 h-7" />,
    title: 'الاستشارات القانونية',
    subtitle: 'رأي قانوني مستند إلى الأنظمة',
    desc: 'تحليل قانوني متخصص في الأنظمة السعودية والخليجية — اعتراض، تكييف، تقييم قوة القضية، دراسة العقد، وغيرها.',
    mainHref: '/consultation',
    branches: null,
  },
  {
    id: 'judicial',
    icon: <Gavel className="w-7 h-7" />,
    title: 'الاستشارات القضائية',
    subtitle: 'إدارة القضايا وتحليل الأحكام',
    desc: 'تتبّع مراحل القضية وتنظيم مستنداتها، أو دراسة حكم قضائي وتحليل أسبابه ومبادئه.',
    mainHref: '/consultation?type=case_management',
    branches: [
      { label: 'إدارة القضية', href: '/consultation?type=case_management' },
      { label: 'تحليل الأحكام القضائية', href: '/consultation?type=judgment_analysis' },
    ],
  },
  {
    id: 'commercial_arbitration',
    icon: <Landmark className="w-7 h-7" />,
    title: 'التحكيم التجاري والوساطة',
    subtitle: 'إدارة التحكيم والوساطة والتسوية',
    desc: 'تنظيم جلسات التحكيم ومحاضرها وتحليل أحكامه، إلى جانب طلب الوساطة أو الصلح للوصول إلى تسوية مناسبة.',
    mainHref: '/consultation?type=arbitration_session_management',
    branches: [
      { label: 'إدارة جلسات التحكيم', href: '/consultation?type=arbitration_session_management' },
      { label: 'تحرير محاضر التحكيم', href: '/consultation?type=arbitration_minutes' },
      { label: 'تحليل أحكام التحكيم', href: '/consultation?type=arbitration_award_analysis' },
      { label: 'الصلح', href: buildWhatsAppContactLink('السلام عليكم، أرغب في طلب خدمة الصلح ضمن التسوية الودية.'), external: true },
      { label: 'الوساطة', href: buildWhatsAppContactLink('السلام عليكم، أرغب في طلب خدمة الوساطة ضمن التسوية الودية.'), external: true },
    ],
  },
  {
    id: 'intellectual_property',
    icon: <Lightbulb className="w-7 h-7" />,
    title: 'خدمات الملكية الفكرية',
    subtitle: 'تسجيل العلامات وحماية الحقوق والابتكارات',
    desc: 'خدمات استشارية متكاملة تشمل العلامات التجارية وحقوق المؤلف وبراءات الاختراع والتصاميم والأسرار التجارية والمنازعات.',
    mainHref: '/consultation?type=legal_opinion&ipType=trademark',
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
    id: 'corporate_governance_compliance',
    icon: <Shield className="w-7 h-7" />,
    title: 'حوكمة وامتثال الشركات',
    subtitle: 'سياسات وضوابط وإدارة المخاطر',
    desc: 'خدمة متكاملة لتقييم حوكمة الشركة، تنظيم السياسات والضوابط، وتحديد متطلبات الامتثال والمخاطر القانونية.',
    mainHref: '/consultation?type=legal_opinion&service=corporate-governance-compliance&governanceType=framework',
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
    id: 'research',
    icon: <Search className="w-7 h-7" />,
    title: 'الباحثة الذكية',
    subtitle: 'بحث قانوني في المصادر والوثائق',
    desc: 'بحث دلالي في السوابق القضائية والمدونات والتعاميم والقرارات من خلال خدمة واحدة.',
    mainHref: '/legal-search',
    branches: [
      { label: 'السوابق القضائية', href: '/legal-search?filter=judicial' },
      { label: 'المدونات القانونية', href: '/legal-search?filter=codex' },
      { label: 'التعاميم', href: '/legal-search?filter=circulars' },
      { label: 'القرارات', href: '/legal-search?filter=decisions' },
      { label: 'بحث في الكل', href: '/legal-search' },
    ],
  },
  {
    id: 'pleadings',
    icon: <FileSignature className="w-7 h-7" />,
    title: 'تحرير المذكرات والصحائف',
    subtitle: 'صياغة وفق النوع والمسار القضائي',
    desc: 'صياغة لوائح الدعوى والمذكرات الجوابية والاستئنافية والنقض — مع تحديد المسار القضائي قبل البدء.',
    mainHref: '/consultation?type=pleadings',
    branches: 'pleadings',
  },
  {
    id: 'contracts',
    icon: <FileText className="w-7 h-7" />,
    title: 'صياغة ومراجعة العقود',
    subtitle: 'عقود نظامية لدول مجلس التعاون',
    desc: 'صياغة عقود جديدة، تحليل العقود القائمة وكشف المخاطر، مراجعة البنود، أو استخراج البيانات الجوهرية.',
    mainHref: '/contracts',
    branches: [
      { label: 'صياغة عقد جديد', href: '/contracts?tab=draft' },
      { label: 'تحليل عقد ودراسة المخاطر', href: '/contracts?tab=analyze' },
      { label: 'مراجعة عقد وتقديم النصح', href: '/contracts?tab=review' },
      { label: 'استخراج البيانات والتلخيص', href: '/contracts?tab=extract' },
    ],
  },
];

const SERVICE_DISPLAY_ORDER = [
  'legal_consultation',
  'judicial',
  'pleadings',
  'contracts',
  'intellectual_property',
  'corporate_governance_compliance',
  'commercial_arbitration',
  'research',
];

export default function LegalAssistant() {
  setPageSEO({
    title: 'الخدمات القانونية — RABAB LEGAL AI',
    description: 'خدمات قانونية مستقلة تشمل الاستشارة القضائية والتحكيم التجاري وتحرير المذكرات والعقود والبحث القانوني.',
    canonical: 'https://rabablegal.com/legal-assistant',
  });

  const [location, setLocation] = useLocation();
  const { isAuthenticated } = useAuth();
  const searchParams = new URLSearchParams(typeof window !== 'undefined' ? window.location.search : '');
  const serviceParam = searchParams.get('service');
  const caseId = searchParams.get('caseId');
  const isPleadingsOnly = serviceParam === 'pleadings';

  const memoTypeParam = searchParams.get('memoType');
  const [expandedId, setExpandedId] = useState<string | null>(serviceParam ?? null);
  const [memoType,   setMemoType]   = useState<string | null>(memoTypeParam ?? null);
  const [track,      setTrack]      = useState<string | null>(null);

  // ── «اعرض موضوعك» — حقل التوجيه الذكي ──────────────────────────────────
  const [topicInput,       setTopicInput]       = useState('');
  const [isRouting,        setIsRouting]        = useState(false);
  const [routingResult,    setRoutingResult]    = useState<any | null>(null);
  const [showConfirmModal, setShowConfirmModal] = useState(false);

  const handleTopicSubmit = async () => {
    if (topicInput.trim().length < 10 || isRouting) return;
    if (!isAuthenticated) {
      setLocation(`/login?returnTo=${encodeURIComponent(window.location.pathname + window.location.search)}`);
      return;
    }
    setIsRouting(true);
    try {
      const res = await fetch(`${API_BASE}/api/topic/route`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ description: topicInput }),
      });
      if (!res.ok) throw new Error('routing failed');
      const data = await res.json();
      setRoutingResult(data);
      setShowConfirmModal(true);
    } catch {
      // عند الخطأ، وجّه للاستشارة العامة
      setRoutingResult({ service: 'consultation', branch: null, understanding: topicInput, confidence: 'low', alternatives: [], extractedFields: {} });
      setShowConfirmModal(true);
    } finally {
      setIsRouting(false);
    }
  };

  const handleConfirm = (service: string, branch: string | null) => {
    setShowConfirmModal(false);
    const params = new URLSearchParams({ description: topicInput });
    if (routingResult?.extractedFields) {
      Object.entries(routingResult.extractedFields).forEach(([k, v]) => params.set(`field_${k}`, String(v)));
    }
    const urls: Record<string, string> = {
      consultation: `/consultation?${params}`,
      judicial:     `/consultation?type=judicial&${params}`,
      pleadings:    `/legal-assistant?service=pleadings&${params}`,
      contracts:    `/contracts?tab=draft&${params}`,
      research:     `/legal-search?${params}`,
    };
    window.location.href = urls[service] ?? `/consultation?${params}`;
  };

  useEffect(() => {
    if (serviceParam) setExpandedId(serviceParam);
  }, [serviceParam]);

  // Reset pleadings state when a different card is expanded
  useEffect(() => {
    if (expandedId !== 'pleadings') { setMemoType(null); setTrack(null); }
  }, [expandedId]);

  const isMobile = typeof window !== 'undefined' && window.innerWidth < 768;

  const handleCardClick = (svc: Service) => {
    if (isMobile) {
      window.location.href = svc.mainHref;
      return;
    }
    if (!svc.branches) {
      window.location.href = svc.mainHref;
      return;
    }
    setExpandedId(prev => prev === svc.id ? null : svc.id);
  };

  const pleadingsHref = memoType && track
    ? `/consultation?type=pleadings&subtype=${memoType}&track=${track}${caseId ? `&caseId=${caseId}` : ''}`
    : null;

  return (
    <div className="min-h-screen bg-background flex flex-col" dir="rtl">
      <Navbar />

      <section className="bg-primary py-12 px-4 text-white">
        <div className="container mx-auto max-w-5xl text-center">
          <div className="inline-flex items-center gap-2 mb-4 px-3 py-1.5 bg-white/10 rounded-full text-xs font-bold text-secondary">
            <Shield className="w-3.5 h-3.5" />
            مدعوم بالذكاء الاصطناعي · وفق أنظمة المملكة
          </div>
          <h1 className="text-2xl md:text-3xl font-bold mb-2">
            {isPleadingsOnly ? 'تحرير الصحائف والمذكرات' : 'الخدمات القانونية'}
          </h1>
          <p className="text-white/65 text-sm leading-relaxed max-w-xl mx-auto">
            {isPleadingsOnly
              ? 'اختر نوع المذكرة والمسار القضائي لبدء صياغة منظمة.'
              : 'اختر الخدمة المناسبة لاحتياجك القانوني'}
          </p>
        </div>
      </section>

      <section className="flex-1 py-10 px-4">
        <div className="container mx-auto max-w-7xl">
          {/* ── مودال تأكيد التوجيه ── */}
          {showConfirmModal && routingResult && (
            <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
              <div className="bg-card border border-border rounded-2xl p-6 max-w-md w-full shadow-2xl" dir="rtl">
                <div className="flex items-center justify-between mb-4">
                  <h3 className="text-base font-bold text-foreground">تأكيد التوجيه</h3>
                  <button onClick={() => { setShowConfirmModal(false); setRoutingResult(null); }} className="p-1 rounded-lg hover:bg-muted text-muted-foreground">
                    <X className="w-4 h-4" />
                  </button>
                </div>
                <div className="space-y-3 mb-5">
                  <div className="bg-muted/50 rounded-xl p-3">
                    <p className="text-xs font-semibold text-muted-foreground mb-1">الموضوع كما فُهم:</p>
                    <p className="text-sm text-foreground leading-relaxed">{routingResult.understanding}</p>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-muted-foreground">الخدمة المقترحة:</span>
                    <span className="text-sm font-bold text-primary">{SERVICE_LABELS[routingResult.service] ?? routingResult.service}{routingResult.branch ? ` — ${routingResult.branch}` : ''}</span>
                  </div>
                </div>
                {routingResult.confidence === 'low' && routingResult.alternatives?.length > 0 && (
                  <div className="mb-4 p-3 bg-amber-50 border border-amber-200 rounded-xl">
                    <p className="text-xs text-amber-700 font-semibold mb-2">يحتمل موضوعك أكثر من مسار. أيّهما أقرب؟</p>
                    <div className="flex flex-col gap-1.5">
                      {routingResult.alternatives.map((alt: any, i: number) => (
                        <button key={i} onClick={() => handleConfirm(alt.service, alt.branch)}
                          className="text-right px-3 py-2 rounded-lg text-xs font-medium bg-white border border-amber-200 hover:border-amber-400 transition-colors">
                          {SERVICE_LABELS[alt.service] ?? alt.service}{alt.branch ? ` — ${alt.branch}` : ''}
                        </button>
                      ))}
                    </div>
                  </div>
                )}
                <div className="flex gap-2">
                  <button onClick={() => handleConfirm(routingResult.service, routingResult.branch)}
                    className="flex-1 py-2.5 px-4 rounded-xl font-bold text-sm bg-primary text-primary-foreground hover:bg-primary/90 transition-colors">
                    متابعة
                  </button>
                  <button onClick={() => { setShowConfirmModal(false); setRoutingResult(null); }}
                    className="flex-1 py-2.5 px-4 rounded-xl font-bold text-sm border border-border hover:bg-muted transition-colors">
                    اختيار خدمة أخرى
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* ── «اعرض موضوعك» — مدخل التوجيه الذكي ── */}
          {!isPleadingsOnly && (
            <div className="mb-8">
              <div className="bg-card border border-border/60 rounded-2xl p-5 shadow-sm">
                <h2 className="text-base font-bold text-foreground mb-1">اعرض موضوعك</h2>
                <p className="text-xs text-muted-foreground mb-3 leading-relaxed">
                  اكتب موضوعك بلغتك — عقداً تريد مراجعته، أو نزاعاً قائماً، أو استفساراً نظامياً. نحدّد الخدمة المناسبة ونجهّز ملفك.
                </p>
                <textarea
                  value={topicInput}
                  onChange={e => setTopicInput(e.target.value)}
                  onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey && topicInput.trim().length >= 10) { e.preventDefault(); handleTopicSubmit(); } }}
                  placeholder="مثال: لدينا عقد توريد مع مورّد خارجي ونرغب في مراجعته قبل التوقيع…"
                  rows={3}
                  className="w-full bg-transparent resize-none rounded-xl border border-border/50 px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-secondary/40 focus:border-secondary/40 transition-all mb-3"
                  dir="rtl"
                />
                <div className="flex items-center justify-between">
                  <button disabled title="التسجيل الصوتي — قريباً"
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs text-muted-foreground/40 border border-border/30 cursor-not-allowed select-none">
                    <Mic className="w-3.5 h-3.5" />
                    <span>صوت — قريباً</span>
                  </button>
                  <button onClick={handleTopicSubmit}
                    disabled={topicInput.trim().length < 10 || isRouting}
                    className="flex items-center gap-2 px-5 py-2 rounded-xl bg-primary text-primary-foreground font-bold text-sm hover:bg-primary/90 transition-colors disabled:opacity-40 disabled:cursor-not-allowed">
                    {isRouting && <Loader2 className="w-4 h-4 animate-spin" />}
                    ابدأ
                  </button>
                </div>
              </div>
            </div>
          )}

          {caseId && (
            <div className="mb-6 flex items-center gap-2 px-4 py-3 bg-primary/10 border border-primary/20 rounded-xl text-sm font-medium text-primary">
              <CheckCircle2 className="w-4 h-4 shrink-0" />
              مرتبطة بقضية مسجّلة — حدّد نوع المذكرة والمسار للمتابعة
            </div>
          )}

          <div className={`w-full max-w-7xl mx-auto ${
            isPleadingsOnly ? 'grid grid-cols-1 gap-5' : 'grid grid-cols-1 sm:grid-cols-2 gap-5'
          }`}>
            {SERVICES
              .slice()
              .sort((a, b) => SERVICE_DISPLAY_ORDER.indexOf(a.id) - SERVICE_DISPLAY_ORDER.indexOf(b.id))
              .filter(svc => !isPleadingsOnly || svc.id === 'pleadings')
              .map(svc => (
              <div key={svc.id} className="flex flex-col">
                {/* Card header */}
                <div
                  onClick={() => handleCardClick(svc)}
                  className={`group border rounded-2xl p-5 cursor-pointer transition-all duration-200 select-none ${
                    expandedId === svc.id
                      ? 'border-primary/60 bg-primary/5 rounded-b-none border-b-0'
                      : 'border-border/60 bg-card hover:border-primary/40 hover:shadow-md'
                  }`}
                >
                  <div className="flex items-start gap-4">
                    <div className="w-12 h-12 rounded-xl bg-primary/10 flex items-center justify-center text-primary shrink-0 group-hover:bg-primary/20 transition-colors">
                      {svc.icon}
                    </div>
                    <div className="flex-1 min-w-0">
                      <h2 className="font-bold text-foreground text-sm md:text-base">{svc.title}</h2>
                      <p className="text-xs text-muted-foreground mt-0.5">{svc.subtitle}</p>
                      <p className="text-xs text-muted-foreground/80 mt-1.5 leading-relaxed hidden md:block">{svc.desc}</p>
                    </div>
                    {svc.branches && (
                      <ChevronDown className={`w-4 h-4 text-muted-foreground shrink-0 mt-1 transition-transform ${expandedId === svc.id ? 'rotate-180' : ''}`} />
                    )}
                    {!svc.branches && (
                      <ArrowLeft className="w-4 h-4 text-muted-foreground shrink-0 mt-1 rotate-180" />
                    )}
                  </div>
                </div>

                {/* Expand panel */}
                <AnimatePresence>
                  {expandedId === svc.id && svc.branches && (
                    <motion.div
                      initial={{ height: 0, opacity: 0 }}
                      animate={{ height: 'auto', opacity: 1 }}
                      exit={{ height: 0, opacity: 0 }}
                      transition={{ duration: 0.2 }}
                      className="overflow-hidden border border-primary/40 border-t-0 rounded-b-2xl bg-card"
                    >
                      {svc.branches === 'pleadings' ? (
                        <div className="p-5 space-y-5">
                          {/* Step 1: نوع المذكرة */}
                          <div>
                            <p className="text-xs font-bold text-muted-foreground mb-2 uppercase tracking-wide">نوع المذكرة</p>
                            <div className="grid grid-cols-1 gap-1.5">
                              {PLEADING_TYPES.map(t => (
                                <button
                                  key={t.id}
                                  onClick={() => setMemoType(t.id)}
                                  className={`text-right px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
                                    memoType === t.id
                                      ? 'bg-primary text-primary-foreground'
                                      : 'bg-muted/40 text-foreground hover:bg-muted'
                                  }`}
                                >
                                  {t.label}
                                </button>
                              ))}
                            </div>
                          </div>
                          {/* Step 2: المسار القضائي */}
                          <div>
                            <p className="text-xs font-bold text-muted-foreground mb-2 uppercase tracking-wide">المسار القضائي</p>
                            <div className="grid grid-cols-1 gap-1.5">
                              {JUDICIAL_TRACKS.map(tr => (
                                <button
                                  key={tr.id}
                                  onClick={() => setTrack(tr.id)}
                                  className={`text-right px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
                                    track === tr.id
                                      ? 'bg-secondary text-primary'
                                      : 'bg-muted/40 text-foreground hover:bg-muted'
                                  }`}
                                >
                                  {tr.label}
                                </button>
                              ))}
                            </div>
                          </div>
                          <Link href={pleadingsHref ?? '#'}>
                            <button
                              disabled={!pleadingsHref}
                              className="w-full py-2.5 px-4 rounded-xl font-bold text-sm transition-all disabled:opacity-40 disabled:cursor-not-allowed bg-primary text-primary-foreground hover:bg-primary/90"
                            >
                              {pleadingsHref ? 'ابدأ التحرير' : 'حدّد النوع والمسار للمتابعة'}
                            </button>
                          </Link>
                        </div>
                      ) : (
                        <div className="p-4 flex flex-col gap-1.5">
                          {(svc.branches as ServiceBranch[]).map(branch => {
                            const content = (
                              <div className="flex items-center justify-between px-3 py-2.5 rounded-xl hover:bg-muted/50 transition-colors group/branch">
                                <span className="text-sm font-medium text-foreground">{branch.label}</span>
                                <ArrowLeft className="w-3.5 h-3.5 text-muted-foreground rotate-180 group-hover/branch:translate-x-[-3px] transition-transform" />
                              </div>
                            );
                            return branch.external ? (
                              <a key={branch.href} href={branch.href} target="_blank" rel="noopener noreferrer">{content}</a>
                            ) : (
                              <Link key={branch.href} href={branch.href}>{content}</Link>
                            );
                          })}
                        </div>
                      )}
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            ))}
          </div>
        </div>
      </section>

    </div>
  );
}
