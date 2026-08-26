import React, { useState, useRef, useEffect } from 'react';
import { LegalMarkdown } from '@/components/legal-markdown';
import { Navbar } from '@/components/layout';
import { Button } from '@/components/ui/button';
import { useToast } from '@/hooks/use-toast';
import { useAuth } from '@/hooks/use-auth';
import { Link, useLocation } from 'wouter';
import { usePaywall } from '@/components/paywall-screen';
import { QuotaBadge } from '@/components/quota-badge';
import {
  FileText, Upload, Search, ChevronDown, ChevronRight,
  Loader2, Copy, Download, CheckCircle2, AlertCircle,
  FileSearch, PenLine, Database, Lock, Send, Paperclip, X,
  Briefcase, Home, Store, ShoppingCart, Wrench, HardHat,
  Users, EyeOff, Award, Package, TriangleAlert, MessageSquare, AlertTriangle,
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { useGetMySubscription } from '@workspace/api-client-react';
import { exportContractWord as exportWordDocx } from '@/lib/export-word';
import { useLang } from '@/hooks/use-language';

const API_BASE = import.meta.env.BASE_URL.replace(/\/$/, '');

const OPTION_FRAME_STYLES = [
  { idle: 'border-secondary/70 hover:border-secondary', active: 'border-secondary bg-secondary/20 text-secondary ring-2 ring-secondary/25' },
  { idle: 'border-accent/70 hover:border-accent', active: 'border-accent bg-accent/20 text-accent ring-2 ring-accent/25' },
  { idle: 'border-blue-400/70 hover:border-blue-400', active: 'border-blue-400 bg-blue-400/20 text-blue-300 ring-2 ring-blue-400/25' },
  { idle: 'border-emerald-400/70 hover:border-emerald-400', active: 'border-emerald-400 bg-emerald-400/20 text-emerald-300 ring-2 ring-emerald-400/25' },
];

// ─── Contract type definitions ──────────────────────────────────────────────
const CONTRACT_ICONS: Record<string, React.ReactNode> = {
  employment:        <Briefcase className="w-6 h-6" />,
  // residential_lease / commercial_lease محذوفة — من اختصاص منصة إيجار
  sales:             <ShoppingCart className="w-6 h-6" />,
  services:          <Wrench className="w-6 h-6" />,
  construction:      <HardHat className="w-6 h-6" />,
  partnership:       <Users className="w-6 h-6" />,
  nda:               <EyeOff className="w-6 h-6" />,
  agency:            <Award className="w-6 h-6" />,
  // supply محذوف
};

interface ContractTypeInfo {
  key: string;
  label: string;
  fields: { key: string; label: string }[];
}

type Tab = 'draft' | 'analyze' | 'extract';

// ─── Helpers ─────────────────────────────────────────────────────────────────
function copyText(text: string) {
  navigator.clipboard.writeText(text).catch(() => {
    const el = document.createElement('textarea');
    el.value = text;
    document.body.appendChild(el);
    el.select();
    document.execCommand('copy');
    document.body.removeChild(el);
  });
}

function downloadTxt(text: string, filename: string) {
  const blob = new Blob([text], { type: 'text/plain;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

// ─── Main Page ────────────────────────────────────────────────────────────────
export default function ContractsPage() {
  const { lang, t } = useLang();
  const { isAuthenticated } = useAuth();
  const { toast } = useToast();
  const [, setLocation] = useLocation();

  // قراءة tab من URL params عند أول تحميل (من روابط الخدمات)
  const [activeTab, setActiveTab] = useState<Tab>(() => {
    const p = new URLSearchParams(typeof window !== 'undefined' ? window.location.search : '');
    const t = p.get('tab');
    if (t === 'analyze' || t === 'review') return 'analyze';
    if (t === 'extract') return 'extract';
    return 'draft';
  });
  const { shouldShowPaywall, quota } = usePaywall();

  // Access: authenticated + has remaining quota (trial or paid)
  const hasAccess = isAuthenticated && !shouldShowPaywall;

  return (
    <div className="min-h-screen flex flex-col overflow-x-hidden font-sans bg-background" dir={lang === 'ar' ? 'rtl' : 'ltr'}>
      <Navbar />

      {/* ── Header ── */}
      <section className="border-b border-primary-foreground/20 bg-background">
        <div className="w-full px-3 sm:px-5 lg:px-7 py-8 text-center">
          <motion.span
            initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }}
            className="inline-flex items-center gap-2 bg-secondary/10 border border-secondary/30 rounded-full px-4 py-1.5 text-xs font-bold text-secondary mb-4"
          >
            <FileText className="w-3.5 h-3.5" />
            {t('خدمات العقود الذكية', 'Smart Contract Services')}
          </motion.span>
          <motion.h1
            initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0, transition: { delay: 0.08 } }}
            className="text-3xl md:text-4xl font-bold text-primary-foreground mb-2"
          >
            {t('صياغة وتحليل العقود بالذكاء الاصطناعي', 'AI Contract Drafting & Analysis')}
          </motion.h1>
          <motion.p
            initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0, transition: { delay: 0.15 } }}
            className="text-muted-foreground max-w-4xl mx-auto text-xl leading-relaxed"
          >
            {t('أنشئ عقوداً قانونية محكمة وفق النظام السعودي أو أنظمة دول مجلس التعاون أو الإطار الدولي، أو حمّل عقداً لتحليله واستخراج بياناته الرئيسية', 'Create robust legal contracts under Saudi, GCC, or international frameworks, or upload a contract to analyze and extract its key details.')}
          </motion.p>
          {isAuthenticated && (
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1, transition: { delay: 0.25 } }}
              className="mt-4 flex justify-center">
              <QuotaBadge serviceType="contract_draft" compact />
            </motion.div>
          )}
        </div>
      </section>

      {/* ── Tabs ── */}
      <div className="sticky top-16 z-30 bg-card border-b border-secondary/30 shadow-sm">
        <div className="w-full px-3 sm:px-5 lg:px-7">
          <div className="flex min-w-0 gap-0 overflow-x-auto">
            {([
              { key: 'draft',   label: t('صياغة عقد جديد', 'Draft a New Contract'),    icon: <PenLine className="w-4 h-4" /> },
              { key: 'analyze', label: t('دراسة المخاطر والتوصيات', 'Risk Analysis & Recommendations'), icon: null },
              { key: 'extract', label: t('استخراج البيانات', 'Extract Data'),   icon: <Database className="w-4 h-4" /> },
            ] as { key: Tab; label: string; icon: React.ReactNode }[]).map(tab => (
              <button
                key={tab.key}
                onClick={() => setActiveTab(tab.key)}
                className={`flex items-center gap-2 px-5 py-4 text-base font-semibold border-b-2 transition-colors whitespace-nowrap ${
                  activeTab === tab.key
                    ? 'border-secondary text-secondary'
                    : 'border-transparent text-muted-foreground hover:text-foreground'
                }`}
              >
                {tab.icon}{tab.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* ── Tab Content ── */}
      <div className="min-w-0 flex-1">
        <AnimatePresence mode="wait">
          {activeTab === 'draft'   && <DraftTab   key="draft"   hasAccess={hasAccess} toast={toast} />}
          {activeTab === 'analyze' && <AnalyzeTab key="analyze" hasAccess={hasAccess} toast={toast} />}
          {activeTab === 'extract' && <ExtractTab key="extract" hasAccess={hasAccess} toast={toast} />}
        </AnimatePresence>
      </div>

    </div>
  );
}

// ─── Gate wrapper ─────────────────────────────────────────────────────────────
function GateWrap({ hasAccess, children, serviceLabel }: { hasAccess: boolean; children: React.ReactNode; serviceLabel?: string }) {
  const { lang, t } = useLang();
  const { shouldShowPaywall, quota } = usePaywall();
  const { isAuthenticated } = useAuth();
  if (hasAccess) return <>{children}</>;

  if (!isAuthenticated) {
    const returnTo = encodeURIComponent(window.location.pathname + window.location.search);
    return (
      <div className="relative min-h-[400px]" dir={lang === 'ar' ? 'rtl' : 'ltr'}>
        <div className="blur-sm pointer-events-none select-none opacity-50">{children}</div>
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-4 bg-background/80 backdrop-blur-sm rounded-xl px-4 text-center">
          <Lock className="w-10 h-10 text-secondary" />
          <p className="text-lg font-bold text-primary">{t('اطّلع على الخدمة ثم ابدأ تجربتك المجانية', 'Explore the service, then start your free trial')}</p>
          <p className="text-muted-foreground text-sm">{t('سجّل الدخول لاستخدام صياغة العقود أو تحليلها. ستحصل على 3 خدمات مجانية.', 'Sign in to draft or analyze contracts. You will receive 3 free services.')}</p>
          <Link href={`/login?returnTo=${returnTo}`}>
            <Button className="bg-secondary text-primary hover:bg-secondary/90 font-bold shadow-lg">
              {t('تسجيل الدخول للبدء', 'Sign in to begin')}
            </Button>
          </Link>
        </div>
      </div>
    );
  }

  // Trial exhausted → friendly upgrade screen (not blurred content)
  if (shouldShowPaywall) {
    return (
      <div className="flex flex-col items-center justify-center gap-6 py-20 text-center px-4" dir={lang === 'ar' ? 'rtl' : 'ltr'}>
        <div className="w-20 h-20 rounded-3xl bg-primary/10 border-2 border-primary/20 flex items-center justify-center">
          <Lock className="w-9 h-9 text-primary" />
        </div>
        <div>
          <h2 className="text-xl font-black text-primary mb-2">{t('انتهت خدماتك المجانية الثلاث', 'Your three free services have ended')}</h2>
          <p className="text-muted-foreground text-sm max-w-sm mx-auto">
            {serviceLabel ?? t('للمتابعة', 'To continue')}{t(' اشترك في إحدى الباقات — جودة الاشتراك مطابقة تماماً لما جربته', ', subscribe to a plan — the quality is exactly what you have experienced.')}
          </p>
        </div>
        <Link href="/pricing">
          <Button className="bg-primary text-primary-foreground hover:bg-primary/90 font-bold shadow-lg px-8">
            {t('عرض الباقات والأسعار', 'View plans and pricing')}
          </Button>
        </Link>
        <p className="text-xs text-muted-foreground">{t('🔒 مخرجات خدماتك السابقة محفوظة ومتاحة في استشاراتك', '🔒 Your previous service outputs are saved and available in your consultations.')}</p>
      </div>
    );
  }

  return (
    <div className="relative min-h-[400px]" dir={lang === 'ar' ? 'rtl' : 'ltr'}>
      <div className="blur-sm pointer-events-none select-none opacity-50">{children}</div>
      <div className="absolute inset-0 flex flex-col items-center justify-center gap-4 bg-background/80 backdrop-blur-sm rounded-xl">
        <Lock className="w-10 h-10 text-secondary" />
        <p className="text-lg font-bold text-primary">{t('هذه الخدمة للمشتركين فقط', 'This service is for subscribers only')}</p>
        <p className="text-muted-foreground text-sm">{t('سجّل حساباً للحصول على 3 خدمات مجانية', 'Create an account to get 3 free services')}</p>
        <Link href="/pricing">
          <Button className="bg-secondary text-primary hover:bg-secondary/90 font-bold shadow-lg">
            {t('عرض الباقات', 'View plans')}
          </Button>
        </Link>
      </div>
    </div>
  );
}

// ─── Tab 1: Draft (Conversational Chat) ───────────────────────────────────────
interface ChatMsg { role: 'user' | 'rabab'; text: string; isDraft?: boolean }
type ApiMsg = { role: 'user' | 'assistant'; content: string }

// ─── أنظمة التحكيم لكل دولة ─────────────────────────────────────────────────
type LocalizedLabel = { ar: string; en: string };

const ARBITRATION_SYSTEMS: Record<string, { code: string; label: LocalizedLabel }[]> = {
  sa:   [{ code: 'SCCA', label: { ar: 'هيئة التحكيم التجاري السعودية (SCCA)', en: 'Saudi Center for Commercial Arbitration (SCCA)' } }, { code: 'CRCICA', label: { ar: 'مركز القاهرة الإقليمي', en: 'Cairo Regional Centre for International Commercial Arbitration' } }, { code: 'ICC', label: { ar: 'غرفة التجارة الدولية (ICC)', en: 'International Chamber of Commerce (ICC)' } }],
  ae:   [{ code: 'DIAC', label: { ar: 'مركز دبي للتحكيم الدولي (DIAC)', en: 'Dubai International Arbitration Centre (DIAC)' } }, { code: 'ADCCAC', label: { ar: 'مركز أبوظبي للتوفيق والتحكيم', en: 'Abu Dhabi Commercial Conciliation and Arbitration Centre' } }, { code: 'DIFC-LCIA', label: { ar: 'مركز DIFC-LCIA', en: 'DIFC-LCIA Arbitration Centre' } }, { code: 'ICC', label: { ar: 'ICC', en: 'ICC' } }],
  kw:   [{ code: 'KAC', label: { ar: 'مركز الكويت للتحكيم', en: 'Kuwait Arbitration Center' } }, { code: 'GCC-CAC', label: { ar: 'مركز التحكيم التجاري الخليجي', en: 'GCC Commercial Arbitration Centre' } }, { code: 'ICC', label: { ar: 'ICC', en: 'ICC' } }],
  qa:   [{ code: 'QICCA', label: { ar: 'مركز قطر الدولي للتوفيق والتحكيم (QICCA)', en: 'Qatar International Center for Conciliation and Arbitration (QICCA)' } }, { code: 'QFC', label: { ar: 'مركز QFC لتسوية النزاعات', en: 'QFC Dispute Resolution Centre' } }, { code: 'ICC', label: { ar: 'ICC', en: 'ICC' } }],
  bh:   [{ code: 'GCC-CAC', label: { ar: 'مركز التحكيم التجاري الخليجي', en: 'GCC Commercial Arbitration Centre' } }, { code: 'BCDR-AAA', label: { ar: 'مركز التحكيم BCDR-AAA', en: 'BCDR-AAA International Arbitration Centre' } }, { code: 'ICC', label: { ar: 'ICC', en: 'ICC' } }],
  om:   [{ code: 'CACS', label: { ar: 'مركز تسوية النزاعات التجارية العُماني', en: 'Oman Commercial Arbitration Centre' } }, { code: 'ICC', label: { ar: 'ICC', en: 'ICC' } }],
  intl: [{ code: 'ICC', label: { ar: 'غرفة التجارة الدولية (ICC)', en: 'International Chamber of Commerce (ICC)' } }, { code: 'LCIA', label: { ar: 'محكمة التحكيم الدولي (LCIA)', en: 'London Court of International Arbitration (LCIA)' } }, { code: 'SIAC', label: { ar: 'مركز سنغافورة الدولي (SIAC)', en: 'Singapore International Arbitration Centre (SIAC)' } }, { code: 'UNCITRAL', label: { ar: 'UNCITRAL (تحكيم حر)', en: 'UNCITRAL (ad hoc arbitration)' } }],
};

// ─── بيانات الدول وأنواع العقود للعرض في الواجهة ─────────────────────────────
const ENFORCE_COUNTRIES = [
  { code: 'sa', flag: '🇸🇦', name: { ar: 'السعودية', en: 'Saudi Arabia' } },
  { code: 'ae', flag: '🇦🇪', name: { ar: 'الإمارات', en: 'United Arab Emirates' } },
  { code: 'kw', flag: '🇰🇼', name: { ar: 'الكويت', en: 'Kuwait' } },
  { code: 'qa', flag: '🇶🇦', name: { ar: 'قطر', en: 'Qatar' } },
  { code: 'bh', flag: '🇧🇭', name: { ar: 'البحرين', en: 'Bahrain' } },
  { code: 'om', flag: '🇴🇲', name: { ar: 'عُمان', en: 'Oman' } },
  { code: 'intl', flag: '🌍', name: { ar: 'دولي', en: 'International' } },
] as const;

const GCC_COUNTRY_CODES = ['ae', 'kw', 'qa', 'bh', 'om'];

const JURISDICTION_SCOPES = [
  { code: 'sa' as const, icon: '🇸🇦', label: { ar: 'النظام السعودي', en: 'Saudi law' } },
  { code: 'gcc' as const, icon: '🌐', label: { ar: 'دول مجلس التعاون', en: 'GCC countries' } },
  { code: 'intl' as const, icon: '🌍', label: { ar: 'عقود دولية', en: 'International contracts' } },
] as const;

const ENFORCE_CONTRACT_TYPES = [
  { code: 'sales',        label: 'بيع وشراء'       },
  { code: 'services',     label: 'خدمات'           },
  { code: 'construction', label: 'مقاولات وإنشاء'  },
  { code: 'partnership',  label: 'شراكة'           },
  { code: 'nda',          label: 'سرية معلومات'    },
  { code: 'agency',       label: 'وكالة تجارية'   },
  { code: 'other',        label: 'أخرى'            },
] as const;

interface DraftConfig {
  jurisdictionScope: 'sa' | 'gcc' | 'intl';
  country:           string;
  contractType:      string;
  amicableDays:      number;
  resolutionMethod:  'judiciary' | 'arbitration';
  arbitrationSystem: string;
  arbitratorCount:   1 | 3;
}

function DraftTab({ hasAccess, toast }: { hasAccess: boolean; toast: any }) {
  const { lang, t } = useLang();
  const [messages,    setMessages]    = useState<ChatMsg[]>([]);
  const [apiHistory,  setApiHistory]  = useState<ApiMsg[]>([]);   // sent to backend
  const [input,       setInput]       = useState('');
  const [loading,     setLoading]     = useState(false);
  const [copiedIdx,   setCopiedIdx]   = useState<number | null>(null);
  // usedLiveSearch for the most-recently-produced draft (restored on mount from DB)
  const [draftLiveSearch, setDraftLiveSearch] = useState(false);
  // ── إعدادات الصياغة ──────────────────────────────────────────────────────
  const [draftConfig, setDraftConfig] = useState<DraftConfig>({
    jurisdictionScope: 'sa',
    country:           'sa',
    contractType:      '',
    amicableDays:      30,
    resolutionMethod:  'judiciary',
    arbitrationSystem: 'SCCA',
    arbitratorCount:   1,
  });
  const [settingsOpen, setSettingsOpen] = useState(true); // collapsed after first msg
  const reservedSid   = useRef<number | undefined>(undefined);
  const clientSession = useRef(crypto.randomUUID?.() ?? Math.random().toString(36).slice(2));
  const bottomRef     = useRef<HTMLDivElement>(null);
  const [, setLocation] = useLocation();

  // On mount: load persisted badge state from the latest saved draft
  useEffect(() => {
    fetch(`${API_BASE}/api/contract/sessions/latest`, { credentials: 'include' })
      .then(r => r.ok ? r.json() : null)
      .then(data => {
        if (data?.draft?.usedLiveSearch) setDraftLiveSearch(true);
      })
      .catch(() => {});
  }, []);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, loading]);

  const handleCountryChange = (code: string) => {
    const systems = ARBITRATION_SYSTEMS[code] ?? ARBITRATION_SYSTEMS.sa;
    setDraftConfig(prev => ({
      ...prev,
      jurisdictionScope: code === 'sa' ? 'sa' : code === 'intl' ? 'intl' : 'gcc',
      country: code,
      arbitrationSystem: systems[0].code,
    }));
  };

  const handleJurisdictionScopeChange = (scope: DraftConfig['jurisdictionScope']) => {
    const country = scope === 'sa'
      ? 'sa'
      : scope === 'intl'
        ? 'intl'
        : GCC_COUNTRY_CODES.includes(draftConfig.country) ? draftConfig.country : 'ae';
    const systems = ARBITRATION_SYSTEMS[country] ?? ARBITRATION_SYSTEMS.sa;
    setDraftConfig(prev => ({
      ...prev,
      jurisdictionScope: scope,
      country,
      arbitrationSystem: systems[0].code,
    }));
  };

  const handleSend = async () => {
    const text = input.trim();
    if (!text || loading) return;

    const newApiHistory: ApiMsg[] = [...apiHistory, { role: 'user', content: text }];
    setMessages(prev => [...prev, { role: 'user', text }]);
    setApiHistory(newApiHistory);
    setInput('');
    setLoading(true);
    // collapse settings panel after first send
    if (messages.length === 0) setSettingsOpen(false);

    try {
      const res = await fetch(`${API_BASE}/api/contract/chat`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          messages: newApiHistory,
          clientSession: clientSession.current,
          reservedSessionId: reservedSid.current,
          draftConfig,
        }),
      });
      const data = await res.json();

      if (!res.ok) {
        const errMsg = data.code === 'TRIAL_EXHAUSTED' || data.code === 'QUOTA_EXHAUSTED'
          ? `🔒 ${t('انتهت خدماتك المجانية — اشترك للمتابعة.', 'Your free services have ended—subscribe to continue.')}`
          : `⚠️ ${data.error ?? t('حدث خطأ، يرجى المحاولة مجدداً', 'Something went wrong. Please try again.')}`;
        setMessages(prev => [...prev, { role: 'rabab', text: errMsg }]);
        if (data.needsUpgrade) setLocation('/pricing');
        return;
      }

      // Save returned sessionId for subsequent turns
      if (data.sessionId) reservedSid.current = data.sessionId;

      const reply = data.reply ?? '';
      const liveSrc = data.usedLiveSearch ?? false;
      setMessages(prev => [...prev, { role: 'rabab', text: reply, isDraft: !!data.isDraft }]);
      setApiHistory(prev => [...prev, { role: 'assistant', content: reply }]);

      // Rotate clientSession after successful contract production
      if (data.isDraft) {
        setDraftLiveSearch(liveSrc);
        // Auto-save to DB so badge survives reload
        const sid = reservedSid.current ?? data.sessionId;
        if (sid) {
          fetch(`${API_BASE}/api/contract/sessions/${sid}`, {
            method: 'PATCH',
            credentials: 'include',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ draftText: reply, usedLiveSearch: liveSrc }),
          }).catch(() => {});
        }
        clientSession.current = crypto.randomUUID?.() ?? Math.random().toString(36).slice(2);
        reservedSid.current = undefined;
      }
    } catch (err: any) {
      setMessages(prev => [...prev, { role: 'rabab', text: `⚠️ ${err.message}` }]);
    } finally {
      setLoading(false);
    }
  };

  const handleCopy = (text: string, idx: number) => {
    copyText(text);
    setCopiedIdx(idx);
    toast({ title: t('تم النسخ ✓', 'Copied ✓') });
    setTimeout(() => setCopiedIdx(null), 2000);
  };

  const isError = (t: string) => t.startsWith('🔒') || t.startsWith('⚠️');

  // ── رفع الملفات ──
  const [attachedFile, setAttachedFile] = useState<File | null>(null);

  const handleReset = () => {
    setMessages([]);
    setApiHistory([]);
    setInput('');
    setAttachedFile(null);
    setSettingsOpen(true);
    reservedSid.current = undefined;
  };
  const [extracting, setExtracting] = useState(false);
  const [fileCharInfo, setFileCharInfo] = useState<{ count: number; truncated: boolean } | null>(null);
  const [fileError, setFileError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // ── مراجعة النص المستخرج قبل التحليل ──
  const [extractReview, setExtractReview] = useState<{
    open: boolean;
    text: string;
    fileName: string;
    truncated: boolean;
    charCount: number;
  }>({ open: false, text: '', fileName: '', truncated: false, charCount: 0 });

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setAttachedFile(file);
    setFileCharInfo(null);
    setFileError(null);
    setExtracting(true);
    try {
      const formData = new FormData();
      formData.append('file', file);
      const res = await fetch(`${API_BASE}/api/contract/extract`, {
        method: 'POST', credentials: 'include', body: formData,
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        if (data.isScanned) {
          setFileError(data.hint || 'الملف مصوّر ضوئياً — لا يمكن قراءته تلقائياً.');
        } else {
          setFileError(data.error || t('فشل استخراج النص', 'Text extraction failed'));
        }
        setAttachedFile(null);
        return;
      }
      // عرض النص في drawer للمراجعة قبل التحليل
      setExtractReview({
        open: true,
        text: data.extractedText,
        fileName: file.name,
        truncated: !!data.wasTruncated,
        charCount: data.charCount ?? 0,
      });
    } catch (err: any) {
      setFileError(err.message || t('فشل استخراج النص', 'Text extraction failed'));
      setAttachedFile(null);
    } finally {
      setExtracting(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const confirmExtractedText = () => {
    const { text, fileName, truncated, charCount } = extractReview;
    const numberLocale = lang === 'ar' ? 'ar-SA' : 'en-US';
    const truncationNote = truncated
      ? `\n\n⚠️ ${t(
        `تنبيه: العقد طويل — تم تحليل أول ${(40000).toLocaleString(numberLocale)} حرف فقط من أصل ${charCount.toLocaleString(numberLocale)} حرف. قد تكون بنود في نهاية العقد غير محللة.`,
        `Notice: The contract is long—only the first ${(40000).toLocaleString(numberLocale)} characters out of ${charCount.toLocaleString(numberLocale)} were analyzed. Clauses at the end of the contract may not have been analyzed.`,
      )}`
      : '';
    setInput(prev => `📄 **${fileName}**\n\n${prev ? prev + '\n\n' : ''}${text}${truncationNote}`);
    setFileCharInfo({ count: charCount, truncated });
    setExtractReview({ open: false, text: '', fileName: '', truncated: false, charCount: 0 });
  };

  const cancelExtractedText = () => {
    setExtractReview({ open: false, text: '', fileName: '', truncated: false, charCount: 0 });
    setAttachedFile(null);
  };

  return (
    <>
    {/* ── مراجعة النص المستخرج قبل التحليل ── */}
    {extractReview.open && (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/50 backdrop-blur-sm p-4" dir={lang === 'ar' ? 'rtl' : 'ltr'}>
        <div className="w-full max-w-2xl bg-background rounded-2xl shadow-2xl border border-secondary/40 flex flex-col max-h-[85vh]">
          {/* Header */}
          <div className="flex items-center justify-between px-5 py-4 border-b border-secondary/20 shrink-0">
            <div className="flex items-center gap-2">
              <FileText className="w-4 h-4 text-primary" />
              <div>
                <p className="text-sm font-bold text-foreground">{t('مراجعة النص المستخرج', 'Review extracted text')}</p>
                <p className="text-xs text-muted-foreground truncate max-w-xs" dir="auto">{extractReview.fileName}</p>
              </div>
            </div>
            <button onClick={cancelExtractedText} className="p-1 rounded-lg hover:bg-muted transition-colors">
              <X className="w-4 h-4 text-muted-foreground" />
            </button>
          </div>
          {/* Instruction */}
          <div className="px-5 py-3 bg-blue-50 border-b border-blue-100 shrink-0">
            <p className="text-xs text-blue-700">
              {t('✏️ تحقق من دقة النص المستخرج وعدّله إن لزم — خاصةً في ملفات المسح الضوئي. عند تأكيده سيُرسل للتحليل.', '✏️ Check the extracted text and edit it if needed—especially for scanned files. Once confirmed, it will be sent for analysis.')}
            </p>
          </div>
          {/* Editable textarea */}
          <div className="flex-1 overflow-y-auto p-5 min-h-0">
            {extractReview.truncated && (
              <div className="mb-3 flex items-start gap-2 bg-amber-50 border border-amber-200 rounded-xl px-3 py-2 text-xs text-amber-800">
                <AlertTriangle className="w-3.5 h-3.5 shrink-0 mt-0.5" />
                <span>{t('العقد طويل — تم اقتصاص النص. يمكنك تعديله قبل الإرسال.', 'The contract is long—the text was truncated. You can edit it before sending.')}</span>
              </div>
            )}
            <textarea
              value={extractReview.text}
              onChange={e => setExtractReview(prev => ({ ...prev, text: e.target.value }))}
              className="w-full h-64 text-sm leading-relaxed bg-muted/30 border border-secondary/30 rounded-xl p-3 resize-none focus:outline-none focus:border-secondary transition-colors font-mono"
              dir="auto"
              placeholder={t('النص المستخرج...', 'Extracted text...')}
            />
          </div>
          {/* Actions */}
          <div className="flex items-center gap-3 px-5 py-4 border-t border-secondary/20 shrink-0">
            <button
              onClick={confirmExtractedText}
              className="flex-1 h-10 bg-primary text-primary-foreground rounded-xl font-bold text-sm hover:bg-primary/90 transition-colors flex items-center justify-center gap-2"
            >
              <CheckCircle2 className="w-4 h-4" />
              {t('تأكيد واستمرار', 'Confirm and continue')}
            </button>
            <button
              onClick={cancelExtractedText}
              className="h-10 px-5 border border-secondary/40 rounded-xl text-sm text-muted-foreground hover:bg-secondary/10 transition-colors"
            >
              {t('إلغاء', 'Cancel')}
            </button>
          </div>
        </div>
      </div>
    )}
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
      className="w-full px-3 sm:px-5 lg:px-7 py-6">
      <GateWrap hasAccess={hasAccess}>
        <div
          className="flex min-w-0 flex-col rounded-2xl border-2 border-secondary/60 bg-card overflow-hidden shadow-[0_0_30px_hsl(191_100%_50%_/_0.12)]"
          style={{
            // The expanded settings panel must be part of the page flow so the
            // input remains reachable on short screens. Once collapsed, keep
            // the compact chat viewport with its own scrollable messages area.
            height: settingsOpen ? 'auto' : '70vh',
            minHeight: 'min(520px, calc(100dvh - 190px))',
          }}
        >

          {/* ── رباب opening message (fixed at top) ── */}
          <div className="shrink-0 px-6 pt-5 pb-3 border-b border-primary-foreground/20 text-center relative" dir={lang === 'ar' ? 'rtl' : 'ltr'}>
            {messages.length > 0 && (
              <button
                onClick={handleReset}
                className="absolute right-3 top-3 flex items-center gap-1 text-xs text-muted-foreground hover:text-primary transition-colors px-2 py-1 rounded-lg hover:bg-primary/10"
              >
                <ChevronRight className="w-3.5 h-3.5" />
                <span>{t('رجوع', 'Back')}</span>
              </button>
            )}
            <div className="flex items-center justify-center gap-2 mb-1">
              <div className="w-9 h-9 rounded-full bg-secondary/20 border-2 border-secondary/40 flex items-center justify-center text-lg">⚖️</div>
              <span className="text-base font-bold text-secondary">{t('رباب · محاميتك الرقمية', 'Rabab · Your Digital Lawyer')}</span>
            </div>
            <p className="text-2xl font-bold text-primary-foreground">{t('مرحباً 👋 أنا رباب، استشارتك القانونية ومن ثمّ صياغة وثائقك.', 'Hello 👋 I’m Rabab, your legal consultant, here to draft your documents.')}</p>
            <p className="text-lg text-muted-foreground mt-1">{t('اطرح سؤالك القانوني أو صِف العقد المطلوب — وسأبدأ بالتحليل أو الصياغة حسب ما تحتاج.', 'Ask your legal question or describe the contract you need—I’ll begin the analysis or drafting as needed.')}</p>
          </div>

          {/* ── إعدادات الصياغة ── */}
          {(() => {
            const country     = ENFORCE_COUNTRIES.find(c => c.code === draftConfig.country)!;
            const arbSystems  = ARBITRATION_SYSTEMS[draftConfig.country] ?? ARBITRATION_SYSTEMS.sa;
            const selectedArb = arbSystems.find(s => s.code === draftConfig.arbitrationSystem);
            const jurisdictionScope = JURISDICTION_SCOPES.find(scope => scope.code === draftConfig.jurisdictionScope)!;
            const availableGccCountries = ENFORCE_COUNTRIES.filter(c => GCC_COUNTRY_CODES.includes(c.code));

            return (
              <div className="shrink-0 border-b border-secondary/30 bg-secondary/5" dir={lang === 'ar' ? 'rtl' : 'ltr'}>
                {/* ── شريط ملخّص دائم (قابل للنقر للتوسيع/الطيّ) ── */}
                <button
                  onClick={() => setSettingsOpen(o => !o)}
                  className="w-full flex flex-wrap items-center gap-3 px-5 py-3 text-base hover:bg-secondary/10 transition-colors"
                >
                  <span className="font-bold text-primary-foreground">{t('⚙ إعدادات الصياغة', '⚙ Drafting settings')}</span>
                  <span className="text-base text-muted-foreground">{t(jurisdictionScope.label.ar, jurisdictionScope.label.en)} · {country.flag} {t(country.name.ar, country.name.en)}</span>
                  {draftConfig.contractType && (
                      <span className="bg-secondary/15 text-secondary px-3 py-1 rounded-full text-sm">
                      {ENFORCE_CONTRACT_TYPES.find(t => t.code === draftConfig.contractType)?.label}
                    </span>
                  )}
                  <span className="bg-secondary/15 text-secondary px-3 py-1 rounded-full text-sm">
                    {draftConfig.resolutionMethod === 'judiciary' ? t('⚖️ قضاء رسمي', '⚖️ Court litigation') : `🔨 ${t('تحكيم', 'Arbitration')} · ${selectedArb?.code ?? ''}`}
                  </span>
                  <ChevronDown className={`w-3.5 h-3.5 text-muted-foreground mr-auto transition-transform ${settingsOpen ? 'rotate-180' : ''}`} />
                </button>

                {/* ── الإعدادات التفصيلية (منطوية/منبسطة) ── */}
                <AnimatePresence>
                  {settingsOpen && (
                    <motion.div
                      initial={{ height: 0, opacity: 0 }}
                      animate={{ height: 'auto', opacity: 1 }}
                      exit={{ height: 0, opacity: 0 }}
                      className="overflow-hidden"
                    >
                      <div className="px-5 sm:px-8 pb-6 space-y-6">

                        {/* نطاق النظام */}
                        <div>
                          <p className="text-base font-bold text-primary-foreground mb-1.5">{t('⚖️ نطاق النظام القانوني', '⚖️ Legal framework')}</p>
                          <div className="flex flex-wrap gap-2.5">
                            {JURISDICTION_SCOPES.map((scope, index) => (
                              <button key={scope.code} type="button"
                                onClick={() => handleJurisdictionScopeChange(scope.code)}
                                className={`flex items-center gap-1 px-3 py-1.5 rounded-full text-base font-semibold border transition-all ${
                                  draftConfig.jurisdictionScope === scope.code
                                    ? OPTION_FRAME_STYLES[index % OPTION_FRAME_STYLES.length].active
                                    : `${OPTION_FRAME_STYLES[index % OPTION_FRAME_STYLES.length].idle} text-muted-foreground`
                                }`}>
                                <span>{scope.icon}</span><span>{scope.code === 'sa' ? t('النظام السعودي', 'Saudi law') : scope.code === 'gcc' ? t('دول مجلس التعاون', 'GCC countries') : t('عقود دولية', 'International contracts')}</span>
                              </button>
                            ))}
                          </div>
                        </div>

                        {/* تظهر دول المجلس عند اختيار النطاق الخليجي فقط */}
                        {draftConfig.jurisdictionScope === 'gcc' ? (
                          <div>
                            <p className="text-base font-bold text-primary-foreground mb-1.5">{t('🌍 دولة مجلس التعاون', '🌍 GCC country')}</p>
                            <div className="flex flex-wrap gap-2.5">
                              {availableGccCountries.map((c, index) => (
                                <button key={c.code} type="button"
                                  onClick={() => handleCountryChange(c.code)}
                                  className={`flex items-center gap-1 px-3 py-1.5 rounded-full text-base font-semibold border transition-all ${
                                    draftConfig.country === c.code
                                      ? OPTION_FRAME_STYLES[index % OPTION_FRAME_STYLES.length].active
                                      : `${OPTION_FRAME_STYLES[index % OPTION_FRAME_STYLES.length].idle} text-muted-foreground`
                                  }`}>
                                  <span>{c.flag}</span><span>{t(c.name.ar, c.name.en)}</span>
                                </button>
                              ))}
                            </div>
                          </div>
                        ) : (
                          <div className="flex items-center gap-2 rounded-xl border border-secondary/30 bg-background/60 px-3 py-2.5 text-sm text-muted-foreground">
                            <span>{country.flag}</span>
                            <span>{draftConfig.jurisdictionScope === 'sa' ? t('سيُصاغ العقد وفق النظام السعودي.', 'The contract will be drafted under Saudi law.') : t('سيُصاغ العقد وفق الإطار الدولي للعقود.', 'The contract will be drafted under the international contract framework.')}</span>
                          </div>
                        )}

                        {/* نوع العقد */}
                        <div>
                          <p className="text-base font-bold text-primary-foreground mb-1.5">{t('📄 نوع العقد (اختياري — تساعد رباب على الصياغة الفورية)', '📄 Contract type (optional—helps Rabab draft immediately)')}</p>
                          <div className="flex flex-wrap gap-2.5">
                            {ENFORCE_CONTRACT_TYPES.map((contractType, index) => (
                              <button key={contractType.code} type="button"
                                onClick={() => setDraftConfig(p => ({ ...p, contractType: p.contractType === contractType.code ? '' : contractType.code }))}
                                className={`px-3 py-1.5 rounded-full text-base font-semibold border transition-all ${
                                  draftConfig.contractType === contractType.code
                                    ? OPTION_FRAME_STYLES[index % OPTION_FRAME_STYLES.length].active
                                    : `${OPTION_FRAME_STYLES[index % OPTION_FRAME_STYLES.length].idle} text-muted-foreground`
                                }`}>
                                {t(contractType.label, ({ sales: 'Sale & Purchase', services: 'Services', construction: 'Construction', partnership: 'Partnership', nda: 'Non-disclosure', agency: 'Commercial Agency', other: 'Other' } as Record<string, string>)[contractType.code])}
                              </button>
                            ))}
                          </div>
                        </div>

                        {/* مدة التسوية الودية */}
                        <div>
                          <p className="text-base font-bold text-primary-foreground mb-1.5">{t('🤝 مدة التسوية الودية قبل آلية النزاع', '🤝 Amicable settlement period before dispute resolution')}</p>
                          <div className="flex gap-2.5 flex-wrap">
                            {[15, 30, 60, 90].map((d, index) => (
                              <button key={d} type="button"
                                onClick={() => setDraftConfig(p => ({ ...p, amicableDays: d }))}
                                className={`px-3 py-1.5 rounded-full text-base font-semibold border transition-all ${
                                  draftConfig.amicableDays === d
                                    ? OPTION_FRAME_STYLES[index % OPTION_FRAME_STYLES.length].active
                                    : `${OPTION_FRAME_STYLES[index % OPTION_FRAME_STYLES.length].idle} text-muted-foreground`
                                }`}>
                                {d} {t('يوماً', 'days')}
                              </button>
                            ))}
                          </div>
                        </div>

                        {/* آلية النزاع — اختيار مختصر */}
                        <div className="flex flex-wrap items-center gap-3 rounded-xl border border-secondary/30 bg-background/60 px-4 py-3">
                          <span className="inline-flex items-center gap-1 text-base font-bold text-primary-foreground">
                            <span aria-hidden="true">⚖️</span>
                             {t('آلية النزاع', 'Dispute resolution')}
                          </span>
                          {[
                             { value: 'judiciary', label: t('قضاء', 'Court'), icon: '🏛' },
                             { value: 'arbitration', label: t('تحكيم', 'Arbitration'), icon: '🔨' },
                          ].map(option => (
                            <button
                              key={option.value}
                              type="button"
                              onClick={() => setDraftConfig(previous => ({ ...previous, resolutionMethod: option.value as DraftConfig['resolutionMethod'] }))}
                              className={`inline-flex items-center gap-1 rounded-lg border px-3 py-1.5 text-base font-bold transition-all ${
                                draftConfig.resolutionMethod === option.value
                                  ? 'border-secondary bg-secondary/20 text-secondary'
                                  : 'border-secondary/40 text-muted-foreground hover:border-secondary'
                              }`}
                            >
                              <span aria-hidden="true">{option.icon}</span>
                              {option.label}
                            </button>
                          ))}
                        </div>

                        <AnimatePresence>
                          {draftConfig.resolutionMethod === 'arbitration' && (
                            <motion.div
                              initial={{ opacity: 0, height: 0 }}
                              animate={{ opacity: 1, height: 'auto' }}
                              exit={{ opacity: 0, height: 0 }}
                              className="overflow-hidden grid grid-cols-1 gap-2 sm:grid-cols-2"
                            >
                              <div>
                                 <p className="mb-1 text-base font-bold text-primary-foreground">{t('مركز التحكيم', 'Arbitration center')}</p>
                                <div className="flex flex-wrap gap-2">
                                  {arbSystems.map(system => (
                                    <button
                                      key={system.code}
                                      type="button"
                                      onClick={() => setDraftConfig(previous => ({ ...previous, arbitrationSystem: system.code }))}
                                      className={`rounded-lg border px-3 py-1.5 text-base font-semibold transition-all ${
                                        draftConfig.arbitrationSystem === system.code
                                          ? 'border-secondary bg-secondary/20 text-secondary'
                                          : 'border-secondary/40 text-muted-foreground hover:border-secondary'
                                      }`}
                                    >
                                      {t(system.label.ar, system.label.en)}
                                    </button>
                                  ))}
                                </div>
                              </div>

                              <div>
                                 <p className="mb-1 text-base font-bold text-primary-foreground">{t('عدد المحكّمين', 'Number of arbitrators')}</p>
                                <div className="flex gap-1.5">
                                  {([1, 3] as const).map(count => (
                                    <button
                                      key={count}
                                      type="button"
                                      onClick={() => setDraftConfig(previous => ({ ...previous, arbitratorCount: count }))}
                                      className={`rounded-lg border px-3 py-1.5 text-base font-bold transition-all ${
                                        draftConfig.arbitratorCount === count
                                          ? 'border-secondary bg-secondary/20 text-secondary'
                                          : 'border-secondary/40 text-muted-foreground hover:border-secondary'
                                      }`}
                                    >
                                       {count === 1 ? t('محكّم واحد', 'One arbitrator') : t('ثلاثة محكّمين', 'Three arbitrators')}
                                    </button>
                                  ))}
                                </div>
                              </div>
                            </motion.div>
                          )}
                        </AnimatePresence>

                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            );
          })()}

          {/* ── Input bar (fixed at top) ── */}
          <input ref={fileInputRef} type="file" accept=".pdf,.txt,.docx" className="hidden" onChange={handleFileSelect} />
          <div className="shrink-0 border-b border-secondary/30 px-4 sm:px-6 py-4 bg-background/50 flex flex-col items-center">
            {/* خطأ ملف مصوّر */}
            {fileError && (
              <div className="flex items-start gap-2 mb-2 bg-destructive/10 border border-destructive/30 rounded-lg px-3 py-2.5 w-full" dir={lang === 'ar' ? 'rtl' : 'ltr'}>
                <AlertCircle className="w-4 h-4 text-destructive shrink-0 mt-0.5" />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold text-destructive">{t('تعذّر قراءة الملف', 'Unable to read file')}</p>
                  <p className="text-sm text-destructive/80 mt-0.5 leading-relaxed" dir="auto">{fileError}</p>
                </div>
                <button onClick={() => setFileError(null)} className="text-muted-foreground hover:text-destructive shrink-0">
                  <X className="w-3.5 h-3.5" />
                </button>
              </div>
            )}
            {/* مؤشر نجاح الاستخراج */}
            {attachedFile && !fileError && (
              <div className="flex items-center gap-2 mb-2 bg-primary/5 border border-primary/20 rounded-lg px-3 py-2 w-full">
                <FileText className="w-4 h-4 text-primary shrink-0" />
                <span className="text-sm text-primary flex-1 truncate" dir="auto">{attachedFile.name}</span>
                {extracting ? (
                  <Loader2 className="w-3.5 h-3.5 animate-spin text-muted-foreground" />
                ) : fileCharInfo ? (
                  <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded-full ${fileCharInfo.truncated ? 'bg-amber-500/20 text-amber-600' : 'bg-green-500/20 text-green-600'}`}>
                    {fileCharInfo.truncated
                      ? `⚠ ${(40000).toLocaleString(lang === 'ar' ? 'ar-SA' : 'en-US')} / ${fileCharInfo.count.toLocaleString(lang === 'ar' ? 'ar-SA' : 'en-US')} ${t('حرف', 'characters')}`
                      : `✓ ${fileCharInfo.count.toLocaleString(lang === 'ar' ? 'ar-SA' : 'en-US')} ${t('حرف', 'characters')}`}
                  </span>
                ) : null}
                <button onClick={() => { setAttachedFile(null); setInput(''); setFileCharInfo(null); }} className="text-muted-foreground hover:text-destructive">
                  <X className="w-3.5 h-3.5" />
                </button>
              </div>
            )}
            <div className="flex gap-2 items-end w-full">
              <div className="relative flex-1">
                <textarea
                  value={input}
                  onChange={e => setInput(e.target.value)}
                  onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSend(); } }}
                   placeholder={extracting ? t('جارٍ استخراج نص الملف...', 'Extracting file text...') : t('مثال: أريد عقد خدمات بين شركة تقنية وعميل بقيمة 120,000 ريال لمدة سنة…', 'Example: I need a services contract between a technology company and a client worth SAR 120,000 for one year…')}
                  rows={2}
                  disabled={loading}
                   className="w-full rounded-xl border-[3px] border-secondary/70 bg-transparent px-5 py-3 pb-9 text-lg focus:outline-none focus:ring-2 focus:ring-secondary/40 resize-none"
                   dir="auto"
                />
                <button
                  onClick={() => fileInputRef.current?.click()}
                  disabled={loading || extracting}
                  className="absolute bottom-2 left-2 flex items-center gap-1 px-3 py-1.5 rounded-lg text-sm text-muted-foreground hover:text-primary hover:bg-primary/10 transition-colors disabled:opacity-40"
                >
                  {extracting ? <Loader2 className="w-3.5 h-3.5 animate-spin text-primary" /> : <Paperclip className="w-3.5 h-3.5" />}
                   <span>{extracting ? t('جارٍ الاستخراج...', 'Extracting...') : t('إضافة مرفق', 'Attach file')}</span>
                </button>
              </div>
              <button
                onClick={handleSend}
                disabled={!input.trim() || loading}
                className="w-12 h-12 rounded-xl bg-secondary text-primary flex items-center justify-center hover:bg-secondary/90 disabled:opacity-40 transition-all shrink-0 shadow-md"
              >
                <Send className="w-4 h-4" />
              </button>
            </div>
            <p className="text-sm text-muted-foreground/60 mt-2 self-end">{t('Enter للإرسال · Shift+Enter لسطر جديد', 'Enter to send · Shift+Enter for a new line')}</p>
          </div>

          {/* ── Messages area ── */}
          <div className={`flex-1 overflow-y-auto ${settingsOpen ? 'min-h-[10rem]' : 'min-h-0'}`}>
          <div className="p-6 sm:p-8 space-y-6">

            {/* Chat history */}
            {messages.map((msg, i) =>
              msg.role === 'user' ? (
                /* ── رسالة المستخدم (يمين) ── */
                <div key={i} className="flex min-w-0 items-end justify-end gap-3">
                  <div className="flex min-w-0 max-w-[85%] flex-col items-end gap-1">
                     <span className="text-sm text-muted-foreground font-medium">{t('أنت', 'You')}</span>
                      <div className="min-w-0 break-words bg-primary/80 rounded-2xl rounded-bl-sm px-5 py-3 text-base text-white leading-relaxed" dir="auto">
                      {msg.text}
                    </div>
                  </div>
                  <div className="w-9 h-9 rounded-full bg-muted border border-secondary/30 flex items-center justify-center shrink-0 text-sm">👤</div>
                </div>
              ) : isError(msg.text) ? (
                /* ── رسالة خطأ / قفل ── */
                <div key={i} className="flex min-w-0 items-end gap-3">
                  <div className="w-9 h-9 rounded-full bg-secondary/20 border-2 border-secondary/40 flex items-center justify-center shrink-0 text-base">⚖️</div>
                  <div className="flex min-w-0 max-w-[85%] flex-col gap-1">
                     <span className="text-sm text-muted-foreground font-medium">Rabab</span>
                      <div className="min-w-0 break-words bg-secondary/10 border border-secondary/25 rounded-2xl rounded-br-sm px-5 py-3 text-base text-foreground" dir="auto">
                      {msg.text}
                    </div>
                  </div>
                </div>
              ) : (
                /* ── مسودة العقد (رباب) ── */
                <div key={i} className="flex items-start gap-3">
                  <div className="w-9 h-9 rounded-full bg-secondary/20 border-2 border-secondary/40 flex items-center justify-center shrink-0 mt-5 text-base">⚖️</div>
                  <div className="flex flex-col gap-1 flex-1 min-w-0">
                     <span className="text-sm text-muted-foreground font-medium">{t('رباب · محاميتك الرقمية', 'Rabab · Your Digital Lawyer')}</span>
                    <div className="border border-secondary/40 rounded-2xl overflow-hidden shadow-sm">
                      {/* toolbar */}
                      <div className="flex items-center justify-between px-4 py-2 bg-muted/50 border-b border-secondary/30">
                        <span className="text-sm font-semibold text-primary-foreground flex items-center gap-1.5">
                          <FileText className="w-3.5 h-3.5" /> {t('مسودة العقد', 'Contract draft')}
                          {draftLiveSearch && (
                            <span className="inline-flex items-center gap-1 bg-emerald-500/15 border border-emerald-500/30 text-emerald-600 dark:text-emerald-400 text-xs font-semibold px-2 py-0.5 rounded-full">
                              <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                               {t('مصادر حية', 'Live sources')}
                            </span>
                          )}
                        </span>
                        <div className="flex items-center gap-3">
                          <button
                            onClick={() => handleCopy(msg.text, i)}
                            className="flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground transition-colors"
                          >
                            {copiedIdx === i ? <CheckCircle2 className="w-3.5 h-3.5 text-green-500" /> : <Copy className="w-3.5 h-3.5" />}
                             {copiedIdx === i ? t('تم', 'Copied') : t('نسخ', 'Copy')}
                          </button>
                          <button
                            onClick={() => exportWordDocx({ text: msg.text, title: 'عقد' })}
                            className="flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground transition-colors"
                          >
                            <Download className="w-3.5 h-3.5" /> Word .docx
                          </button>
                          <span className="text-sm text-muted-foreground/50">{msg.text.split(/\s+/).length} كلمة</span>
                        </div>
                      </div>
                      {/* contract body */}
                      <div dir="auto">
                        <LegalMarkdown className="p-5" maxHeight="55vh">{msg.text}</LegalMarkdown>
                      </div>
                      <div className="px-4 py-2.5 bg-amber-950/30 border-t border-amber-900/30 flex gap-2 items-start">
                        <AlertCircle className="w-3.5 h-3.5 text-amber-400 shrink-0 mt-0.5" />
                         <p className="text-sm text-amber-300/80">{t('للاسترشاد فقط — يُنصح بمراجعة محامٍ مرخّص قبل التوقيع.', 'For guidance only—please consult a licensed lawyer before signing.')}</p>
                      </div>
                    </div>
                  </div>
                </div>
              )
            )}

            {/* Loading bubble */}
            {loading && (
              <div className="flex items-end gap-3">
                <div className="w-9 h-9 rounded-full bg-secondary/20 border-2 border-secondary/40 flex items-center justify-center shrink-0 text-base">⚖️</div>
                <div className="flex flex-col gap-1">
                   <span className="text-sm text-muted-foreground font-medium">Rabab</span>
                  <div className="bg-secondary/10 border border-secondary/25 rounded-2xl rounded-br-sm px-4 py-3 flex items-center gap-2 text-base text-muted-foreground">
                    <Loader2 className="w-4 h-4 animate-spin text-secondary" />
                     {t('جارٍ صياغة العقد وفق الأنظمة السعودية...', 'Drafting the contract under Saudi regulations...')}
                  </div>
                </div>
              </div>
            )}

            <div ref={bottomRef} />
          </div>
          </div>{/* closes overflow-y-auto */}

        </div>
      </GateWrap>
    </motion.div>
    </>
  );
}

// ─── Review mode definitions ──────────────────────────────────────────────────
const REVIEW_MODES = [
  {
    key: 'review',
    label: 'مراجعة قانونية شاملة',
    sublabel: '17 محوراً — البنود الغامضة والمتعارضة والناقصة والصياغة البديلة',
    icon: <FileSearch className="w-5 h-5" />,
    endpoint: '/api/contract/review',
    resultKey: 'review',
    loadingMsg: 'جارٍ المراجعة القانونية الشاملة بـ 17 محوراً...',
    doneMsg: 'اكتملت المراجعة الشاملة',
  },
  {
    key: 'enforce',
    label: 'تحليل المخاطر والتوصيات',
    sublabel: 'تحليل مخاطر البنود وتحديد ما يحتاج تعديلاً مع توصيات عملية',
    icon: <Scale className="w-5 h-5" />,
    endpoint: '/api/contract/enforce-check',
    resultKey: 'result',
    loadingMsg: 'جارٍ تحليل المخاطر والتوصيات وفق الإطار القانوني المحدد...',
    doneMsg: 'اكتمل تحليل المخاطر والتوصيات',
  },
  {
    key: 'final',
    label: 'مراجعة نهائية قبل التوقيع',
    sublabel: 'قائمة تحقق كاملة — صالح للتوقيع / يحتاج تعديلات / غير صالح',
    icon: <CheckCircle2 className="w-5 h-5" />,
    endpoint: '/api/contract/final-check',
    resultKey: 'result',
    loadingMsg: 'جارٍ المراجعة النهائية قبل التوقيع...',
    doneMsg: 'اكتملت المراجعة النهائية',
  },
] as const;
type ReviewModeKey = typeof REVIEW_MODES[number]['key'];

// ─── Scale icon for enforce mode ──────────────────────────────────────────────
function Scale({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M12 3v18M3 9l9-6 9 6M5 21h14M8 12H5l-2 4h6l-2-4zm13 0h-3l-2 4h6l-2-4z"/>
    </svg>
  );
}

// ─── Shared Feedback Chat Panel ───────────────────────────────────────────────
interface FeedbackMsg { role: 'user' | 'rabab'; text: string }
interface FeedbackChatProps {
  contractText: string;
  mode: string;
  priorResult: string;   // first assistant message (the original analysis / extracted JSON)
  toast: any;
}
function FeedbackChat({ contractText, mode, priorResult, toast }: FeedbackChatProps) {
  const { lang, t } = useLang();
  const [msgs,    setMsgs]    = useState<FeedbackMsg[]>([]);
  const [history, setHistory] = useState<Array<{ role: 'user' | 'assistant'; content: string }>>([
    { role: 'assistant', content: priorResult },
  ]);
  const [input,   setInput]   = useState('');
  const [loading, setLoading] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => { bottomRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [msgs, loading]);

  const handleSend = async () => {
    const text = input.trim();
    if (!text || loading) return;
    const newHistory = [...history, { role: 'user' as const, content: text }];
    setMsgs(prev => [...prev, { role: 'user', text }]);
    setHistory(newHistory);
    setInput('');
    setLoading(true);
    try {
      const res = await fetch(`${API_BASE}/api/contract/refine`, {
        method: 'POST', credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ contractText, mode, messages: newHistory }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? t('فشل التحديث', 'Update failed'));
      const reply = data.reply ?? '';
      setMsgs(prev => [...prev, { role: 'rabab', text: reply }]);
      setHistory(prev => [...prev, { role: 'assistant', content: reply }]);
    } catch (err: any) {
      toast({
        variant: 'destructive',
        title: t('فشل التحديث', 'Update failed'),
        description: err.message || t('حدث خطأ، يرجى المحاولة مجدداً', 'Something went wrong. Please try again.'),
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="mt-4 border border-secondary/30 rounded-2xl overflow-hidden" dir={lang === 'ar' ? 'rtl' : 'ltr'}>
      {/* Header */}
       <div className="px-4 py-3 bg-secondary/10 border-b border-secondary/20 flex items-center gap-2">
        <MessageSquare className="w-4 h-4 text-secondary shrink-0" />
         <span className="text-sm font-semibold text-secondary">{t('لديكِ ملاحظة؟ اطلبي تعديلاً أو توضيحاً', 'Have feedback? Request a change or clarification.')}</span>
      </div>

      {/* Messages */}
      {msgs.length > 0 && (
        <div className="p-4 space-y-3 max-h-[450px] overflow-y-auto bg-card">
          {msgs.map((msg, i) => (
            <div key={i} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'} gap-2`}>
              {msg.role === 'rabab' && (
                <div className="w-7 h-7 rounded-full bg-secondary/20 border-2 border-secondary/30 flex items-center justify-center shrink-0 mt-1 text-xs">⚖️</div>
              )}
              <div className={`max-w-[82%] rounded-2xl px-4 py-2.5 text-sm leading-relaxed ${
                msg.role === 'user'
                  ? 'bg-primary/80 text-white rounded-bl-sm'
                  : 'bg-muted border border-secondary/30 rounded-br-sm'
                }`} dir="auto">
                {msg.role === 'rabab'
                  ? <LegalMarkdown maxHeight="none">{msg.text}</LegalMarkdown>
                  : msg.text}
              </div>
              {msg.role === 'user' && (
                <div className="w-7 h-7 rounded-full bg-muted border border-secondary/30 flex items-center justify-center shrink-0 mt-1 text-xs">👤</div>
              )}
            </div>
          ))}
          {loading && (
            <div className="flex justify-start gap-2">
              <div className="w-7 h-7 rounded-full bg-secondary/20 border-2 border-secondary/30 flex items-center justify-center shrink-0 text-xs">⚖️</div>
              <div className="bg-muted border border-secondary/30 rounded-2xl rounded-br-sm px-4 py-2.5 flex items-center gap-2 text-sm text-muted-foreground">
                <Loader2 className="w-3.5 h-3.5 animate-spin text-secondary" />{t('جارٍ التحديث...', 'Updating...')}
              </div>
            </div>
          )}
          <div ref={bottomRef} />
        </div>
      )}

      {/* Input */}
      <div className="px-4 py-3 bg-background/60 border-t border-secondary/20 flex gap-2">
        <textarea
          value={input}
          onChange={e => setInput(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSend(); } }}
           placeholder={t('مثال: ركّزي على بنود الغرامات · اشرحي لي البند الثالث · صحّحي اسم الطرف الأول...', 'Example: Focus on penalty clauses · explain clause three · correct the first party’s name...')}
          rows={1}
          disabled={loading}
           className="flex-1 rounded-xl border border-secondary/30 bg-transparent px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-secondary/40 resize-none"
           dir="auto"
        />
        <button
          onClick={handleSend}
          disabled={!input.trim() || loading}
          className="w-9 h-9 rounded-xl bg-secondary text-primary flex items-center justify-center hover:bg-secondary/90 disabled:opacity-40 transition-all shrink-0 shadow-sm"
        >
          <Send className="w-3.5 h-3.5" />
        </button>
      </div>
    </div>
  );
}

// ─── Tab 2: Analyze ───────────────────────────────────────────────────────────
function AnalyzeTab({ hasAccess, toast }: { hasAccess: boolean; toast: any }) {
  const { lang, t } = useLang();
  const [file, setFile] = useState<File | null>(null);
  const [mode, setMode] = useState<ReviewModeKey>('review');
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState('');
  const [contractText, setContractText] = useState('');
  const [doneMsg, setDoneMsg] = useState('');
  const [usedLiveSearch, setUsedLiveSearch] = useState(false);
  const [showOverwriteConfirm, setShowOverwriteConfirm] = useState(false);
  // enforce-check specific
  const [enforceCountry,      setEnforceCountry]      = useState<string>('sa');
  const [enforceContractType, setEnforceContractType] = useState<string>('other');
  const fileRef = useRef<HTMLInputElement>(null);
  const clientSession = useRef(crypto.randomUUID?.() ?? Math.random().toString(36).slice(2));
  const [, setLocation] = useLocation();

  const selectedMode = REVIEW_MODES.find(m => m.key === mode)!;
  const selectedCountry = ENFORCE_COUNTRIES.find(c => c.code === enforceCountry)!;

  const handleAnalyze = async () => {
    if (!file) return;
    // If there's already a result, ask for confirmation before overwriting
    if (result && !showOverwriteConfirm) {
      setShowOverwriteConfirm(true);
      return;
    }
    setShowOverwriteConfirm(false);
    setLoading(true);
    setResult('');
    setContractText('');
    setUsedLiveSearch(false);
    try {
      const formData = new FormData();
      formData.append('file', file);
      formData.append('clientSession', clientSession.current);
      if (mode === 'enforce') {
        formData.append('country',      enforceCountry);
        formData.append('contractType', enforceContractType);
      }
      const res = await fetch(`${API_BASE}${selectedMode.endpoint}`, {
        method: 'POST', credentials: 'include', body: formData,
      });
      const data = await res.json();
      if (!res.ok) {
        if (data.code === 'TRIAL_EXHAUSTED') {
          toast({ variant: 'destructive', title: t('انتهت خدماتك المجانية', 'Your free services have ended'), description: t('اشترك للمتابعة', 'Subscribe to continue') });
          setLocation('/pricing');
          return;
        }
        throw new Error(data.error ?? t('فشل التحليل', 'Analysis failed'));
      }
      setResult(data[selectedMode.resultKey] ?? '');
      setContractText(data.contractText ?? '');
      setDoneMsg(selectedMode.doneMsg);
      setUsedLiveSearch(data.usedLiveSearch ?? false);
      // Rotate session after success
      clientSession.current = crypto.randomUUID?.() ?? Math.random().toString(36).slice(2);
    } catch (err: any) {
      toast({ variant: 'destructive', title: t('فشل التحليل', 'Analysis failed'), description: err.message });
    } finally {
      setLoading(false);
    }
  };

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
      className="w-full px-3 sm:px-5 lg:px-7 py-10">
      <GateWrap hasAccess={hasAccess}>

        {/* ── Welcome header ── */}
        <div className="text-center mb-6 pb-5 border-b-2 border-secondary/50" dir={lang === 'ar' ? 'rtl' : 'ltr'}>
          <div className="flex items-center justify-center gap-2 mb-2">
            <div className="w-9 h-9 rounded-full bg-secondary/20 border-2 border-secondary/40 flex items-center justify-center text-lg">⚖️</div>
           <span className="text-base font-bold text-secondary">{t('رباب · محاميتك الرقمية', 'Rabab · Your Digital Lawyer')}</span>
          </div>
           <p className="text-2xl font-bold text-secondary">{t('مرحباً 👋 أنا رباب، أساعدك في مراجعة عقودك وتحليل بنودها.', 'Hello 👋 I’m Rabab. I help you review your contracts and analyze their clauses.')}</p>
           <p className="text-lg text-foreground/80 mt-1">{t('ارفع ملف العقد واختر نوع المراجعة — مراجعة شاملة، تحليل المخاطر والتوصيات، أو مراجعة نهائية.', 'Upload a contract and choose a review type—comprehensive review, risk analysis and recommendations, or final review.')}</p>
        </div>

        {/* Mode selector */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-6">
          {REVIEW_MODES.map(m => (
            <button
              key={m.key}
              onClick={() => { setMode(m.key); setResult(''); setShowOverwriteConfirm(false); }}
              className={`flex flex-col gap-2 p-5 rounded-xl border-2 ${lang === 'ar' ? 'text-right' : 'text-left'} transition-all ${
                mode === m.key
                  ? 'border-secondary bg-secondary/10 shadow-[0_0_18px_hsl(191_100%_50%_/_0.08)]'
                  : 'border-blue-400/70 hover:border-secondary/70 bg-card/40'
              }`}
            >
              <div className={`${mode === m.key ? 'text-secondary' : 'text-muted-foreground'}`}>
                {m.icon}
              </div>
              <p className={`text-base font-bold leading-snug ${mode === m.key ? 'text-secondary' : 'text-foreground'}`}>
                {m.label}
              </p>
              <p className="text-base text-muted-foreground leading-relaxed">{m.sublabel}</p>
            </button>
          ))}
        </div>

        {/* Upload zone */}
        <div
          onClick={() => fileRef.current?.click()}
          className={`border-2 border-dashed rounded-2xl p-10 text-center cursor-pointer transition-colors ${
            file ? 'border-secondary bg-secondary/5' : 'border-blue-400/70 hover:border-secondary hover:bg-muted/20'
          }`}
        >
          <input ref={fileRef} type="file" accept=".pdf,.docx,.txt" className="hidden"
            onChange={e => { setFile(e.target.files?.[0] ?? null); setResult(''); setShowOverwriteConfirm(false); }} />
          <Upload className={`w-9 h-9 mx-auto mb-2 ${file ? 'text-secondary' : 'text-muted-foreground/40'}`} />
          {file ? (
            <div>
              <p className="font-semibold text-primary text-base" dir="auto">{file.name}</p>
              <p className="text-sm text-muted-foreground mt-1">{(file.size / 1024).toFixed(0)} KB</p>
            </div>
          ) : (
            <div>
               <p className="text-base font-medium text-secondary">{t('اضغط لرفع ملف العقد', 'Click to upload a contract file')}</p>
               <p className="text-sm text-foreground/75 mt-1">{t('PDF · DOCX · TXT — حتى 20MB', 'PDF · DOCX · TXT — up to 20MB')}</p>
            </div>
          )}
        </div>

        {/* ── Enforce-check: country + contract type selectors ── */}
        <AnimatePresence>
          {mode === 'enforce' && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: 'auto' }}
              exit={{ opacity: 0, height: 0 }}
              className="overflow-hidden"
            >
              <div className="mt-5 space-y-6 border-2 border-secondary/65 rounded-2xl p-5 sm:p-6 bg-secondary/5" dir={lang === 'ar' ? 'rtl' : 'ltr'}>
                <p className="text-base font-bold text-secondary flex items-center gap-1.5">
                  <span className="text-base">⚖️</span>
                  {t('خصّصي نطاق التحليل — الدولة ونوع العقد', 'Customize the analysis scope—country and contract type')}
                </p>

                {/* Country selector */}
                <div>
                  <p className="text-base font-semibold text-secondary mb-3">{t('الدولة / الولاية القضائية', 'Country / jurisdiction')}</p>
                  <div className="flex flex-wrap gap-2.5">
                    {ENFORCE_COUNTRIES.map(c => (
                      <button
                        key={c.code}
                        type="button"
                        onClick={() => setEnforceCountry(c.code)}
                        className={`flex items-center gap-1.5 px-3 py-2 rounded-full text-sm font-semibold border-2 transition-all ${
                          enforceCountry === c.code
                            ? 'border-secondary bg-secondary/20 text-secondary'
                            : 'border-blue-400/60 hover:border-secondary text-foreground/80'
                        }`}
                      >
                        <span>{c.flag}</span>
                        <span>{t(c.name.ar, c.name.en)}</span>
                      </button>
                    ))}
                  </div>
                </div>

                {/* Contract type selector */}
                <div>
                  <p className="text-base font-semibold text-secondary mb-3">{t('نوع العقد', 'Contract type')}</p>
                  <div className="flex flex-wrap gap-2.5">
                    {ENFORCE_CONTRACT_TYPES.map(t => (
                      <button
                        key={t.code}
                        type="button"
                        onClick={() => setEnforceContractType(t.code)}
                        className={`px-3 py-2 rounded-full text-sm font-semibold border-2 transition-all ${
                          enforceContractType === t.code
                            ? 'border-secondary bg-secondary/20 text-secondary'
                            : 'border-emerald-400/60 hover:border-secondary text-foreground/80'
                        }`}
                      >
                        {t.label}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {file && (
          <Button onClick={handleAnalyze} disabled={loading}
            className="mt-4 w-full bg-secondary text-primary hover:bg-secondary/90 font-bold h-12 text-base">
            {loading
              ? <><Loader2 className="w-4 h-4 animate-spin ml-2" />
                  {mode === 'enforce'
                    ? t(
                      `جارٍ تحليل المخاطر والتوصيات في ${selectedCountry ? selectedCountry.name.ar : ''}...`,
                      `Analyzing risks and recommendations in ${selectedCountry ? selectedCountry.name.en : ''}...`,
                    )
                    : selectedMode.loadingMsg}</>
              : <><FileSearch className="w-4 h-4 ml-2" />
                  {mode === 'enforce'
                    ? t(
                      `تحليل المخاطر والتوصيات — ${selectedCountry?.flag ?? ''} ${selectedCountry ? selectedCountry.name.ar : ''}`,
                      `Risk Analysis & Recommendations — ${selectedCountry?.flag ?? ''} ${selectedCountry ? selectedCountry.name.en : ''}`,
                    )
                    : selectedMode.label}</>}
          </Button>
        )}

        {/* ── Overwrite confirmation dialog ── */}
        {showOverwriteConfirm && (
          <div className="mt-4 flex items-start gap-3 bg-amber-50 border border-amber-300 rounded-xl px-4 py-4" dir={lang === 'ar' ? 'rtl' : 'ltr'}>
            <TriangleAlert className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold text-amber-900">{t('ستُفقد نتيجة المراجعة الحالية — هل تريدين المتابعة؟', 'The current review result will be lost—do you want to continue?')}</p>
              <p className="text-xs text-amber-700 mt-0.5">{t('إعادة التحليل ستحل محل النتيجة الحالية نهائياً.', 'Running the analysis again will permanently replace the current result.')}</p>
              <div className="flex items-center gap-2 mt-3">
                <button
                  type="button"
                  onClick={handleAnalyze}
                  className="text-xs px-3.5 py-1.5 bg-amber-600 text-white rounded-lg font-semibold hover:bg-amber-700 transition-colors"
                >
                  {t('متابعة', 'Continue')}
                </button>
                <button
                  type="button"
                  onClick={() => setShowOverwriteConfirm(false)}
                  className="text-xs px-3.5 py-1.5 border border-amber-300 text-amber-800 rounded-lg hover:bg-amber-100 transition-colors"
                >
                  {t('إلغاء', 'Cancel')}
                </button>
              </div>
            </div>
          </div>
        )}

        {loading && (
          <div className="mt-6 rounded-2xl border border-secondary/30 bg-card p-10 flex flex-col items-center gap-3">
            <Loader2 className="w-8 h-8 animate-spin text-secondary" />
            <p className="text-muted-foreground text-sm text-center">{selectedMode.loadingMsg}</p>
               <p className="text-sm text-muted-foreground">{t('قد يستغرق حتى 60 ثانية للعقود الطويلة', 'This may take up to 60 seconds for long contracts.')}</p>
          </div>
        )}

        {result && (
          <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="mt-6 space-y-3">
            <div className="flex items-center gap-2 flex-wrap">
              <CheckCircle2 className="w-5 h-5 text-green-500 shrink-0" />
              <span className="font-semibold text-primary text-sm">{doneMsg}</span>
              {usedLiveSearch && (
                <span className="inline-flex items-center gap-1 bg-emerald-500/15 border border-emerald-500/30 text-emerald-600 dark:text-emerald-400 text-xs font-semibold px-2 py-0.5 rounded-full">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                   {t('مصادر حية', 'Live sources')}
                </span>
              )}
              <div className="mr-auto flex gap-2">
                <Button size="sm" variant="outline" className="gap-1.5"
                  onClick={() => { copyText(result); toast({ title: 'تم النسخ ✓' }); }}>
                   <Copy className="w-3.5 h-3.5" />{t('نسخ', 'Copy')}
                </Button>
                <Button size="sm" variant="outline" className="gap-1.5"
                  onClick={() => downloadTxt(result, `${selectedMode.label} — ${file?.name ?? 'عقد'}.txt`)}>
                   <Download className="w-3.5 h-3.5" />{t('تحميل', 'Download')}
                </Button>
              </div>
            </div>
            <div className="bg-card border border-secondary/40 rounded-2xl overflow-hidden shadow-sm">
              <div dir="auto">
                <LegalMarkdown className="p-6" maxHeight="600px">{result}</LegalMarkdown>
              </div>
              <div className="px-4 py-2.5 bg-amber-950/30 border-t border-amber-900/30 flex gap-2 items-start">
                <AlertCircle className="w-3.5 h-3.5 text-amber-400 shrink-0 mt-0.5" />
                 <p className="text-xs text-amber-300/80">{t('للاسترشاد فقط — يُنصح بمراجعة محامٍ مرخّص والتحقق من المصدر الرسمي.', 'For guidance only—please consult a licensed lawyer and verify the official source.')}</p>
              </div>
            </div>

            {/* ── Feedback Chat ── */}
            {contractText && (
              <FeedbackChat
                key={result}
                contractText={contractText}
                mode={mode}
                priorResult={result}
                toast={toast}
              />
            )}
          </motion.div>
        )}
      </GateWrap>
    </motion.div>
  );
}

// ─── Tab 3: Extract Data ──────────────────────────────────────────────────────
function ExtractTab({ hasAccess, toast }: { hasAccess: boolean; toast: any }) {
  const { lang, t } = useLang();
  const [file, setFile] = useState<File | null>(null);
  const [extracting, setExtracting] = useState(false);
  const [data, setData] = useState<any>(null);
  const [contractText, setContractText] = useState('');
  const [filename, setFilename] = useState('');
  const [usedLiveSearch, setUsedLiveSearch] = useState(false);
  const [showOverwriteConfirm, setShowOverwriteConfirm] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const handleExtract = async () => {
    if (!file) return;
    // If there's already extracted data, ask for confirmation before overwriting
    if (data && !showOverwriteConfirm) {
      setShowOverwriteConfirm(true);
      return;
    }
    setShowOverwriteConfirm(false);
    setExtracting(true);
    setData(null);
    setContractText('');
    setUsedLiveSearch(false);
    try {
      const formData = new FormData();
      formData.append('file', file);
      const res = await fetch(`${API_BASE}/api/contract/extract-data`, { method: 'POST', credentials: 'include', body: formData });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error);
      setData(json.data);
      setContractText(json.contractText ?? '');
      setFilename(json.filename);
      setUsedLiveSearch(json.usedLiveSearch ?? false);
    } catch (err: any) {
      toast({ variant: 'destructive', title: t('فشل استخراج البيانات', 'Data extraction failed'), description: err.message });
    } finally {
      setExtracting(false);
    }
  };

  const DataRow = ({ label, value }: { label: string; value: any }) => {
    if (!value || (Array.isArray(value) && value.length === 0)) return null;
    return (
      <div className="grid grid-cols-1 gap-2 py-3 border-b border-secondary/20 last:border-0 sm:grid-cols-3 sm:gap-4">
        <span className="text-sm font-bold text-muted-foreground col-span-1">{label}</span>
        <div className="min-w-0 break-words sm:col-span-2 text-base text-foreground" dir="auto">
          {Array.isArray(value) ? (
            <ul className="space-y-1">{value.map((v: string, i: number) => <li key={i} className="flex gap-2"><ChevronRight className="w-4 h-4 text-secondary shrink-0 mt-0.5" />{v}</li>)}</ul>
          ) : (
            <span>{value}</span>
          )}
        </div>
      </div>
    );
  };

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
      className="w-full px-3 sm:px-5 lg:px-7 py-10">
      <GateWrap hasAccess={hasAccess}>

        {/* ── Welcome header ── */}
        <div className="text-center mb-6 pb-5 border-b border-secondary/20" dir={lang === 'ar' ? 'rtl' : 'ltr'}>
          <div className="flex items-center justify-center gap-2 mb-2">
            <div className="w-9 h-9 rounded-full bg-secondary/20 border-2 border-secondary/40 flex items-center justify-center text-lg">⚖️</div>
            <span className="text-base font-bold text-secondary">{t('رباب · محاميتك الرقمية', 'Rabab · Your Digital Lawyer')}</span>
          </div>
          <p className="text-2xl font-bold text-primary-foreground">{t('مرحباً 👋 أنا رباب، أساعدك في استخراج البيانات المنظّمة من عقودك تلقائياً.', 'Hello 👋 I’m Rabab. I help you automatically extract structured data from your contracts.')}</p>
          <p className="text-lg text-muted-foreground mt-1">{t('ارفع ملف العقد لاستخراج الأطراف، التواريخ، القيمة، الالتزامات، وبنود الغرامات.', 'Upload a contract to extract parties, dates, value, obligations, and penalty clauses.')}</p>
        </div>

        <div
          onClick={() => fileRef.current?.click()}
          className={`border-2 border-dashed rounded-2xl p-12 text-center cursor-pointer transition-colors ${
            file ? 'border-secondary bg-secondary/5 shadow-sm shadow-secondary/15' : 'border-blue-400/65 hover:border-secondary hover:bg-secondary/5 hover:shadow-sm hover:shadow-secondary/10'
          }`}
        >
          <input ref={fileRef} type="file" accept=".pdf,.docx,.txt" className="hidden"
            onChange={e => { setFile(e.target.files?.[0] ?? null); setData(null); setShowOverwriteConfirm(false); }} />
          <Database className={`w-10 h-10 mx-auto mb-3 ${file ? 'text-secondary' : 'text-muted-foreground/40'}`} />
          {file ? (
            <div>
              <p className="font-semibold text-primary text-base" dir="auto">{file.name}</p>
              <p className="text-sm text-muted-foreground mt-1">{(file.size / 1024).toFixed(0)} KB</p>
            </div>
          ) : (
            <div>
              <p className="text-base font-medium text-muted-foreground">{t('اضغط لرفع ملف العقد', 'Click to upload a contract file')}</p>
              <p className="text-sm text-muted-foreground mt-1">{t('PDF · DOCX · TXT — حتى 20MB', 'PDF · DOCX · TXT — up to 20MB')}</p>
            </div>
          )}
        </div>

        {file && (
          <Button onClick={handleExtract} disabled={extracting}
            className="mt-4 w-full bg-secondary text-primary hover:bg-secondary/90 font-bold h-12 text-base">
            {extracting ? <><Loader2 className="w-4 h-4 animate-spin ml-2" />{t('جارٍ الاستخراج...', 'Extracting...')}</> : <><Database className="w-4 h-4 ml-2" />{t('استخرج البيانات', 'Extract data')}</>}
          </Button>
        )}

        {/* ── Overwrite confirmation dialog ── */}
        {showOverwriteConfirm && (
          <div className="mt-4 flex items-start gap-3 bg-amber-50 border border-amber-300 rounded-xl px-4 py-4" dir={lang === 'ar' ? 'rtl' : 'ltr'}>
            <TriangleAlert className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold text-amber-900">{t('ستُفقد البيانات المستخرجة الحالية — هل تريدين المتابعة؟', 'The current extracted data will be lost—do you want to continue?')}</p>
              <p className="text-xs text-amber-700 mt-0.5">{t('إعادة الاستخراج ستحل محل النتائج الحالية نهائياً.', 'Running extraction again will permanently replace the current results.')}</p>
              <div className="flex items-center gap-2 mt-3">
                <button
                  type="button"
                  onClick={handleExtract}
                  className="text-xs px-3.5 py-1.5 bg-amber-600 text-white rounded-lg font-semibold hover:bg-amber-700 transition-colors"
                >
                  {t('متابعة', 'Continue')}
                </button>
                <button
                  type="button"
                  onClick={() => setShowOverwriteConfirm(false)}
                  className="text-xs px-3.5 py-1.5 border border-amber-300 text-amber-800 rounded-lg hover:bg-amber-100 transition-colors"
                >
                  {t('إلغاء', 'Cancel')}
                </button>
              </div>
            </div>
          </div>
        )}

        {extracting && (
          <div className="mt-6 rounded-2xl border border-secondary/30 bg-card p-10 flex flex-col items-center gap-3">
            <Loader2 className="w-8 h-8 animate-spin text-secondary" />
            <p className="text-muted-foreground text-sm">{t('جارٍ قراءة العقد واستخراج البيانات المنظّمة...', 'Reading the contract and extracting structured data...')}</p>
          </div>
        )}

        {data && (
          <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="mt-6 space-y-4">
            <div className="flex items-center gap-2 flex-wrap">
              <CheckCircle2 className="w-5 h-5 text-green-500 shrink-0" />
              <span className="font-semibold text-primary text-sm">{t('تم استخراج البيانات من:', 'Data extracted from:')} <bdi>{filename}</bdi></span>
              {usedLiveSearch && (
                <span className="inline-flex items-center gap-1 bg-emerald-500/15 border border-emerald-500/30 text-emerald-600 dark:text-emerald-400 text-xs font-semibold px-2 py-0.5 rounded-full">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                  {t('مصادر حية', 'Live sources')}
                </span>
              )}
              <Button size="sm" variant="outline" className="mr-auto gap-1.5"
                onClick={() => { copyText(JSON.stringify(data, null, 2)); toast({ title: t('تم نسخ البيانات JSON ✓', 'JSON data copied ✓') }); }}>
                <Copy className="w-3.5 h-3.5" />{t('نسخ JSON', 'Copy JSON')}
              </Button>
            </div>

            {/* Summary card */}
            {data.summary && (
              <div className="bg-secondary/10 border border-secondary/30 rounded-xl p-4">
                <p className="text-xs font-bold text-secondary mb-1">{t('ملخص', 'Summary')}</p>
                <p className="text-sm text-foreground leading-relaxed" dir="auto">{data.summary}</p>
              </div>
            )}

            <div className="bg-card border border-secondary/40 rounded-2xl overflow-hidden shadow-sm">
              <div className="p-5 divide-y divide-secondary/20">
                <DataRow label={t('نوع العقد', 'Contract type')} value={data.contractType} />
                <DataRow label={t('الأطراف', 'Parties')} value={data.parties?.map((p: any) => `${p.name} — ${p.role}`)} />
                <DataRow label={t('تاريخ النفاذ', 'Effective date')} value={data.effectiveDate} />
                <DataRow label={t('تاريخ الانتهاء', 'Expiry date')} value={data.expiryDate} />
                <DataRow label={t('القيمة الإجمالية', 'Total value')} value={data.totalValue ? `${data.totalValue} ${data.currency ?? ''}` : null} />
                <DataRow label={t('الالتزامات الرئيسية', 'Key obligations')} value={data.keyObligations} />
                <DataRow label={t('بنود الغرامات', 'Penalty clauses')} value={data.penaltyClauses} />
                <DataRow label={t('شروط التجديد', 'Renewal terms')} value={data.renewalTerms} />
                <DataRow label={t('القانون الحاكم', 'Governing law')} value={data.governingLaw} />
              </div>
              <div className="px-4 py-2.5 bg-amber-950/30 border-t border-amber-900/30 flex gap-2 items-start">
                <AlertCircle className="w-3.5 h-3.5 text-amber-400 shrink-0 mt-0.5" />
                <p className="text-xs text-amber-300/80">{t('للاسترشاد فقط — يُنصح بمراجعة محامٍ مرخّص والتحقق من المصدر الرسمي.', 'For guidance only—please consult a licensed lawyer and verify the official source.')}</p>
              </div>
            </div>

            {/* ── Feedback Chat ── */}
            {contractText && (
              <FeedbackChat
                key={JSON.stringify(data)}
                contractText={contractText}
                mode="extract"
                priorResult={JSON.stringify(data, null, 2)}
                toast={toast}
              />
            )}
          </motion.div>
        )}
      </GateWrap>
    </motion.div>
  );
}
