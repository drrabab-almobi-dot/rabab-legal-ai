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
import { useLang } from '@/hooks/use-language';
import { translateArabicText } from '@/lib/translations';

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
const SERVICE_LABELS_EN: Record<string, string> = {
  consultation: 'Legal Consultations',
  judicial: 'Judicial Consultations',
  commercial_arbitration: 'Commercial Arbitration & Mediation',
  pleadings: 'Pleadings',
  contracts: 'Contracts',
  intellectual_property: 'Intellectual Property',
  corporate_governance_compliance: 'Corporate Governance & Compliance',
  research: 'Smart Researcher',
};

const SERVICE_FRAME_STYLES = [
  { idle: 'border-secondary/70 hover:border-secondary hover:shadow-secondary/15', active: 'border-secondary bg-secondary/10', panel: 'border-secondary/60' },
  { idle: 'border-accent/70 hover:border-accent hover:shadow-accent/15', active: 'border-accent bg-accent/10', panel: 'border-accent/60' },
  { idle: 'border-blue-400/70 hover:border-blue-400 hover:shadow-blue-400/15', active: 'border-blue-400 bg-blue-400/10', panel: 'border-blue-400/60' },
  { idle: 'border-emerald-400/70 hover:border-emerald-400 hover:shadow-emerald-400/15', active: 'border-emerald-400 bg-emerald-400/10', panel: 'border-emerald-400/60' },
];

const API_BASE = import.meta.env.BASE_URL.replace(/\/$/, '');

const PLEADING_TYPES = [
  { id: 'lawsuit',         label: 'لائحة الدعوى', labelEn: 'Statement of Claim' },
  { id: 'response',        label: 'المذكرة الجوابية أو مذكرة الرد', labelEn: 'Defence or Response Memorandum' },
  { id: 'appeal',          label: 'الاعتراض بالاستئناف', labelEn: 'Appeal Objection' },
  { id: 'review_petition', label: 'الاعتراض بالتماس إعادة النظر', labelEn: 'Petition for Reconsideration' },
  { id: 'cassation',       label: 'النقض أمام المحكمة العليا', labelEn: 'Cassation before the Supreme Court' },
];

const JUDICIAL_TRACKS = [
  { id: 'general',     label: 'المحاكم العامة', labelEn: 'General Courts' },
  { id: 'commercial',  label: 'المحاكم التجارية', labelEn: 'Commercial Courts' },
  { id: 'labor',       label: 'المحاكم العمالية', labelEn: 'Labour Courts' },
  { id: 'admin',       label: 'ديوان المظالم', labelEn: 'Board of Grievances' },
  { id: 'committee',   label: 'اللجان شبه القضائية', labelEn: 'Quasi-Judicial Committees' },
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
  const { lang, t } = useLang();
  setPageSEO({
    title: t('الخدمات القانونية', 'Legal Services'),
    description: t('خدمات قانونية مستقلة تشمل الاستشارة القضائية والتحكيم التجاري وتحرير المذكرات والعقود والبحث القانوني.', 'Independent legal services including judicial consultations, commercial arbitration, legal drafting, contracts, and legal research.'),
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
    <div className="min-h-screen bg-background flex flex-col" dir={lang === 'ar' ? 'rtl' : 'ltr'}>
      <Navbar />

      <section className="bg-primary py-12 px-3 sm:px-5 lg:px-7 text-white">
        <div className="w-full text-center">
          <div className="inline-flex items-center gap-2 mb-4 px-3 py-1.5 bg-white/10 rounded-full text-xs font-bold text-secondary">
            <Shield className="w-3.5 h-3.5" />
            {t('مدعوم بالذكاء الاصطناعي · وفق أنظمة المملكة', 'AI-powered · aligned with Saudi laws')}
          </div>
          <h1 className="text-3xl md:text-4xl font-bold mb-2">
            {isPleadingsOnly ? t('تحرير الصحائف والمذكرات', 'Pleadings & Memoranda') : t('الخدمات القانونية', 'Legal Services')}
          </h1>
          <p className="text-white/65 text-base leading-relaxed max-w-3xl mx-auto">
            {isPleadingsOnly
              ? t('اختر نوع المذكرة والمسار القضائي لبدء صياغة منظمة.', 'Choose a memorandum type and judicial path to begin organized drafting.')
              : t('اختر الخدمة المناسبة لاحتياجك القانوني', 'Choose the service that fits your legal needs')}
          </p>
        </div>
      </section>

      <section className="flex-1 py-10 px-3 sm:px-5 lg:px-7">
        <div className="w-full">
          {/* ── مودال تأكيد التوجيه ── */}
          {showConfirmModal && routingResult && (
            <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
               <div className="bg-card border-2 border-primary/50 rounded-2xl p-6 max-w-md w-full shadow-2xl shadow-primary/15" dir={lang === 'ar' ? 'rtl' : 'ltr'}>
                <div className="flex items-center justify-between mb-4">
                  <h3 className="text-base font-bold text-foreground">{t('تأكيد التوجيه', 'Confirm Routing')}</h3>
                  <button onClick={() => { setShowConfirmModal(false); setRoutingResult(null); }} className="p-1 rounded-lg hover:bg-muted text-muted-foreground">
                    <X className="w-4 h-4" />
                  </button>
                </div>
                <div className="space-y-3 mb-5">
                  <div className="bg-muted/50 rounded-xl p-3">
                    <p className="text-xs font-semibold text-muted-foreground mb-1">{t('الموضوع كما فُهم:', 'Matter as understood:')}</p>
                    <p className="text-sm text-foreground leading-relaxed">{routingResult.understanding}</p>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-muted-foreground">{t('الخدمة المقترحة:', 'Suggested service:')}</span>
                    <span className="text-sm font-bold text-primary">{lang === 'ar' ? SERVICE_LABELS[routingResult.service] ?? routingResult.service : SERVICE_LABELS_EN[routingResult.service] ?? translateArabicText(routingResult.service)}{routingResult.branch ? ` — ${translateArabicText(routingResult.branch)}` : ''}</span>
                  </div>
                </div>
                {routingResult.confidence === 'low' && routingResult.alternatives?.length > 0 && (
                  <div className="mb-4 p-3 bg-amber-50 border border-amber-200 rounded-xl">
                    <p className="text-xs text-amber-700 font-semibold mb-2">{t('يحتمل موضوعك أكثر من مسار. أيّهما أقرب؟', 'Your matter may fit more than one path. Which is closer?')}</p>
                    <div className="flex flex-col gap-1.5">
                      {routingResult.alternatives.map((alt: any, i: number) => (
                        <button key={i} onClick={() => handleConfirm(alt.service, alt.branch)}
                          className="text-right px-3 py-2 rounded-lg text-xs font-medium bg-white border border-amber-200 hover:border-amber-400 transition-colors">
                          {lang === 'ar' ? SERVICE_LABELS[alt.service] ?? alt.service : SERVICE_LABELS_EN[alt.service] ?? translateArabicText(alt.service)}{alt.branch ? ` — ${translateArabicText(alt.branch)}` : ''}
                        </button>
                      ))}
                    </div>
                  </div>
                )}
                <div className="flex gap-2">
                  <button onClick={() => handleConfirm(routingResult.service, routingResult.branch)}
                    className="flex-1 py-2.5 px-4 rounded-xl font-bold text-sm bg-primary text-primary-foreground hover:bg-primary/90 transition-colors">
                    {t('متابعة', 'Continue')}
                  </button>
                  <button onClick={() => { setShowConfirmModal(false); setRoutingResult(null); }}
                    className="flex-1 py-2.5 px-4 rounded-xl font-bold text-sm border border-primary/40 hover:border-primary hover:bg-primary/5 transition-colors">
                    {t('اختيار خدمة أخرى', 'Choose Another Service')}
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* ── «اعرض موضوعك» — مدخل التوجيه الذكي ── */}
          {!isPleadingsOnly && (
            <div className="mb-8">
              <div className="bg-card border-2 border-secondary/55 rounded-2xl p-5 shadow-sm shadow-secondary/10">
                <h2 className="text-lg font-bold text-foreground mb-1">{t('اعرض موضوعك', 'Describe Your Matter')}</h2>
                <p className="text-sm text-muted-foreground mb-3 leading-relaxed">
                  {t('اكتب موضوعك بلغتك — عقداً تريد مراجعته، أو نزاعاً قائماً، أو استفساراً نظامياً. نحدّد الخدمة المناسبة ونجهّز ملفك.', 'Describe your matter in your own words — a contract to review, an ongoing dispute, or a legal question. We will identify the right service and prepare your case.') }
                </p>
                <textarea
                  value={topicInput}
                  onChange={e => setTopicInput(e.target.value)}
                  onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey && topicInput.trim().length >= 10) { e.preventDefault(); handleTopicSubmit(); } }}
                  placeholder={t('مثال: لدينا عقد توريد مع مورّد خارجي ونرغب في مراجعته قبل التوقيع…', 'Example: We have a supply contract with an overseas vendor and would like it reviewed before signing…')}
                  rows={3}
                  className="w-full bg-transparent resize-none rounded-xl border-2 border-secondary/45 px-4 py-3 text-base focus:outline-none focus:ring-2 focus:ring-secondary/40 focus:border-secondary transition-all mb-3"
                  dir={lang === 'ar' ? 'rtl' : 'ltr'}
                />
                <div className="flex items-center justify-between">
                  <button disabled title="التسجيل الصوتي — قريباً"
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs text-muted-foreground/40 border border-border/30 cursor-not-allowed select-none">
                    <Mic className="w-3.5 h-3.5" />
                    <span>{t('صوت — قريباً', 'Voice — Coming Soon')}</span>
                  </button>
                  <button onClick={handleTopicSubmit}
                    disabled={topicInput.trim().length < 10 || isRouting}
                    className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-primary text-primary-foreground font-bold text-base hover:bg-primary/90 transition-colors disabled:opacity-40 disabled:cursor-not-allowed">
                    {isRouting && <Loader2 className="w-4 h-4 animate-spin" />}
                    {t('ابدأ', 'Start')}
                  </button>
                </div>
              </div>
            </div>
          )}

          {caseId && (
            <div className="mb-6 flex items-center gap-2 px-4 py-3 bg-primary/10 border border-primary/20 rounded-xl text-base font-medium text-primary">
              <CheckCircle2 className="w-4 h-4 shrink-0" />
               {t('مرتبطة بقضية مسجّلة — حدّد نوع المذكرة والمسار للمتابعة', 'Linked to a registered case — select the memorandum type and judicial path to continue')}
            </div>
          )}

          <div className={`w-full ${
            isPleadingsOnly ? 'grid grid-cols-1 gap-5' : 'grid grid-cols-1 sm:grid-cols-2 gap-5'
          }`}>
            {SERVICES
              .slice()
              .sort((a, b) => SERVICE_DISPLAY_ORDER.indexOf(a.id) - SERVICE_DISPLAY_ORDER.indexOf(b.id))
              .filter(svc => !isPleadingsOnly || svc.id === 'pleadings')
              .map((svc, index) => (
              <div key={svc.id} className="flex flex-col">
                {/* Card header */}
                <div
                  onClick={() => handleCardClick(svc)}
                   className={`group border-2 rounded-2xl p-5 cursor-pointer transition-all duration-200 select-none ${
                    expandedId === svc.id
                       ? `${SERVICE_FRAME_STYLES[index % SERVICE_FRAME_STYLES.length].active} rounded-b-none border-b-0`
                       : `${SERVICE_FRAME_STYLES[index % SERVICE_FRAME_STYLES.length].idle} bg-card hover:shadow-md`
                  }`}
                >
                  <div className="flex items-start gap-4">
                    <div className="w-12 h-12 rounded-xl bg-primary/10 flex items-center justify-center text-primary shrink-0 group-hover:bg-primary/20 transition-colors">
                      {svc.icon}
                    </div>
                    <div className="flex-1 min-w-0">
                       <h2 className="font-bold text-foreground text-lg">{lang === 'ar' ? svc.title : translateArabicText(svc.title)}</h2>
                       <p className="text-sm text-muted-foreground mt-0.5">{lang === 'ar' ? svc.subtitle : translateArabicText(svc.subtitle)}</p>
                       <p className="text-sm text-muted-foreground/80 mt-1.5 leading-relaxed hidden md:block">{lang === 'ar' ? svc.desc : translateArabicText(svc.desc)}</p>
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
                       className={`overflow-hidden border-2 border-t-0 rounded-b-2xl bg-card ${SERVICE_FRAME_STYLES[index % SERVICE_FRAME_STYLES.length].panel}`}
                    >
                      {svc.branches === 'pleadings' ? (
                        <div className="p-5 space-y-5">
                          {/* Step 1: نوع المذكرة */}
                          <div>
                            <p className="text-base font-bold text-primary-foreground mb-2 tracking-wide">{t('نوع المذكرة', 'Memorandum Type')}</p>
                            <div className="grid grid-cols-1 gap-1.5">
                              {PLEADING_TYPES.map(t => (
                                <button
                                  key={t.id}
                                  onClick={() => setMemoType(t.id)}
                                  className={`text-right px-4 py-2.5 rounded-lg text-base font-medium transition-colors ${
                                    memoType === t.id
                                      ? 'bg-primary text-primary-foreground'
                                      : 'bg-muted/40 text-foreground hover:bg-muted'
                                  }`}
                                >
                                   {lang === 'ar' ? t.label : t.labelEn}
                                </button>
                              ))}
                            </div>
                          </div>
                          {/* Step 2: المسار القضائي */}
                          <div>
                            <p className="text-base font-bold text-primary-foreground mb-2 tracking-wide">{t('المسار القضائي', 'Judicial Path')}</p>
                            <div className="grid grid-cols-1 gap-1.5">
                              {JUDICIAL_TRACKS.map(tr => (
                                <button
                                  key={tr.id}
                                  onClick={() => setTrack(tr.id)}
                                  className={`text-right px-4 py-2.5 rounded-lg text-base font-medium transition-colors ${
                                    track === tr.id
                                      ? 'bg-secondary text-primary'
                                      : 'bg-muted/40 text-foreground hover:bg-muted'
                                  }`}
                                >
                                   {lang === 'ar' ? tr.label : tr.labelEn}
                                </button>
                              ))}
                            </div>
                          </div>
                          <Link href={pleadingsHref ?? '#'}>
                            <button
                              disabled={!pleadingsHref}
                              className="w-full py-3 px-4 rounded-xl font-bold text-base transition-all disabled:opacity-40 disabled:cursor-not-allowed bg-primary text-primary-foreground hover:bg-primary/90"
                            >
                               {pleadingsHref ? t('ابدأ التحرير', 'Start Drafting') : t('حدّد النوع والمسار للمتابعة', 'Select a type and path to continue')}
                            </button>
                          </Link>
                        </div>
                      ) : (
                        <div className="p-4 flex flex-col gap-1.5">
                          {(svc.branches as ServiceBranch[]).map(branch => {
                            const content = (
                              <div className="flex items-center justify-between px-4 py-3 rounded-xl hover:bg-muted/50 transition-colors group/branch">
                                <span className="text-base font-medium text-foreground">{branch.label}</span>
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
