import React, { useState, useCallback, useEffect, useRef } from 'react';
import { LegalMarkdown } from '@/components/legal-markdown';
import { LegalCodexBrowser } from '@/components/LegalCodexBrowser';
import { setPageSEO } from '@/lib/seo';
import { Link, useLocation } from 'wouter';
import { Navbar, Footer } from '@/components/layout';
import {
  Search, BookOpen, Loader2, FileText, X, Scale, Bell,
  Lock, ScrollText, FileSignature, MessageSquare, ExternalLink,
  Copy, Check, Send, Gavel, ChevronDown, ChevronUp, ShieldCheck, AlertTriangle, GitCompare, FileEdit, BookMarked, ArrowRight,
  Calendar, Map, Clock, Layers, BookMarked as BookMarkedIcon, TriangleAlert, FileDown, Eye, Download,
} from 'lucide-react';
import { useAuth } from '@/hooks/use-auth';
import { useGetMySubscription } from '@workspace/api-client-react';
import { exportMemoWord, exportMemoPdf } from '@/lib/export-word';
import { useLang } from '@/hooks/use-language';
import { cn } from '@/lib/utils';

const API_BASE = import.meta.env.BASE_URL.replace(/\/$/, '');

function localizedAuthError(message: string, t: (ar: string, en: string) => string): string {
  const normalized = message.trim().toLowerCase();
  const unauthorized = new Set([
    'unauthorized',
    'unauthorised',
    'unauthorized access',
    'authentication required',
    'auth_required',
    'authentication_required',
    '401',
    'غير مصرح',
    'غير مصرح به',
    'غير مخول',
    'يلزم تسجيل الدخول',
  ]);
  const forbidden = new Set([
    'forbidden',
    'access denied',
    'permission denied',
    'forbidden_access',
    '403',
    'ممنوع',
    'الوصول مرفوض',
    'لا تملك صلاحية الوصول',
    'ليس لديك صلاحية الوصول',
  ]);

  if (unauthorized.has(normalized)) {
    return t('يرجى تسجيل الدخول للوصول إلى هذه الخدمة.', 'Please sign in to access this service.');
  }
  if (forbidden.has(normalized)) {
    return t('ليس لديك صلاحية الوصول إلى هذه الخدمة.', 'You do not have permission to access this service.');
  }
  return message;
}

// ── Citation types ────────────────────────────────────────────────────────────
interface CaseMetadata {
  caseNumber?: string | null;
  rulingNumber?: string | null;
  hijriDate?: string | null;
  gregorianDate?: string | null;
  court?: string | null;
  litigationStage?: string | null;
  disputeSubject?: string | null;
  deedNumber?: string | null;
  confidence?: Record<string, 'high' | 'medium' | 'low'>;
}

interface SearchResult {
  documentName: string;
  documentId?: number | null;
  content: string;
  similarity: number;
  pageStart?: number | null;
  pageEnd?: number | null;
  caseMetadata?: CaseMetadata | null;
  /** Phase-1: true when this chunk was retrieved by literal match (circular/article number or exact phrase) */
  literalMatch?: boolean;
  /** Phase-1: legal references extracted from this chunk for auto-linking */
  extractedRefs?: string[];
}

// ── Citation card component ───────────────────────────────────────────────────
function CitationCard({ result }: { result: SearchResult }) {
  const [copied, setCopied] = useState(false);
  const { t } = useLang();
  const m = result.caseMetadata;
  const hasPage = result.pageStart != null;
  const hasMeta = m && (m.court || m.caseNumber || m.rulingNumber || m.hijriDate || m.gregorianDate);

  if (!hasMeta && !hasPage) return null;

  const parts: string[] = [];
  if (m?.court)           parts.push(m.court);
  if (m?.litigationStage) parts.push(m.litigationStage);
  if (m?.caseNumber)      parts.push(`قضية رقم: ${m.caseNumber}`);
  if (m?.rulingNumber)    parts.push(`حكم رقم: ${m.rulingNumber}`);
  if (m?.hijriDate || m?.gregorianDate) {
    const dates = [m?.hijriDate && `${m.hijriDate}هـ`, m?.gregorianDate && `${m.gregorianDate}م`].filter(Boolean);
    parts.push(`بتاريخ: ${dates.join(' / ')}`);
  }
  parts.push(`المصدر: ${result.documentName}`);
  if (hasPage) parts.push(`ص${result.pageStart}`);
  const citationText = parts.join('، ');

  const copyCitation = () => {
    navigator.clipboard.writeText(citationText).catch(() => {});
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const openAtPage = () => {
    const url = `${API_BASE}/api/documents/${result.documentId}/view#page=${result.pageStart}`;
    window.open(url, '_blank', 'noopener');
  };

  return (
    <div className="mt-3 pt-3 border-t border-secondary/30 space-y-2">
      {/* Metadata badges */}
      <div className="flex flex-wrap gap-x-3 gap-y-1">
        {m?.court           && <span className="text-xs text-muted-foreground">🏛 {m.court}</span>}
        {m?.litigationStage && <span className="text-xs text-muted-foreground">⚖️ {m.litigationStage}</span>}
        {m?.caseNumber      && <span className="text-xs text-muted-foreground">📋 ق: {m.caseNumber}</span>}
        {m?.rulingNumber    && <span className="text-xs text-muted-foreground">📄 ح: {m.rulingNumber}</span>}
        {(m?.hijriDate || m?.gregorianDate) && (
          <span className="text-xs text-muted-foreground">
            📅 {[m?.hijriDate && `${m.hijriDate}هـ`, m?.gregorianDate && `${m.gregorianDate}م`].filter(Boolean).join(' / ')}
          </span>
        )}
        {hasPage && (
          <span className="text-xs font-bold text-primary">
            📄 ص{result.pageStart}{result.pageEnd !== result.pageStart ? `–${result.pageEnd}` : ''}
          </span>
        )}
      </div>
      {/* Actions */}
      <div className="flex items-center gap-2 flex-wrap">
        <button
          onClick={copyCitation}
          className="flex items-center gap-1 text-xs px-2.5 py-1 rounded-lg bg-primary/10 text-primary hover:bg-primary/20 transition-colors"
        >
          {copied ? <><Check className="w-3 h-3" />{t('تم النسخ', 'Copied')}</> : <><Copy className="w-3 h-3" />{t('نسخ الاستشهاد', 'Copy citation')}</>}
        </button>
        {hasPage && result.documentId && (
          <button
            onClick={openAtPage}
            className="flex items-center gap-1 text-xs px-2.5 py-1 rounded-lg border border-secondary/30 text-muted-foreground hover:bg-secondary/5 hover:text-secondary transition-colors"
          >
            <ExternalLink className="w-3 h-3" />{t('فتح عند ص', 'Open at p.')} {result.pageStart}
          </button>
        )}
      </div>
    </div>
  );
}

type SearchTab = 'judicial' | 'circular' | 'regulation' | 'contract' | 'consult' | 'research' | 'codex';

interface TabMeta {
  id: SearchTab;
  labelAr: string;
  labelEn: string;
  icon: React.ReactNode;
  placeholder: string;
  description: { ar: string; en: string };
  category?: string;
  actionOnly?: boolean;
}

const TABS: TabMeta[] = [
  {
    id: 'research',
    labelAr: 'باحث ذكي',
    labelEn: 'Smart Research',
    icon: <Gavel className="w-4 h-4" />,
    placeholder: '',
    description: { ar: 'تقرير قانوني عملي: تلخيص + نقاط القوة + الخيارات + مذكرة', en: 'Practical legal report: summary, strengths, options, and memo' },
    actionOnly: true,
  },
  {
    id: 'circular',
    labelAr: 'تعاميم وزارة العدل',
    labelEn: 'Ministry Circulars',
    icon: <Bell className="w-4 h-4" />,
    placeholder: '',
    description: { ar: 'تعاميم رسمية من منصة وزارة العدل — نصوص رقمية سليمة', en: 'Official Ministry of Justice circulars with reliable digital text' },
    actionOnly: true,
  },
  {
    id: 'codex',
    labelAr: 'المدونات القضائية',
    labelEn: 'Judicial Collections',
    icon: <BookOpen className="w-4 h-4" />,
    placeholder: '',
    description: { ar: 'بحث في قضايا وأحكام المدونات القضائية الرسمية — عارض الصفحات الأصلية', en: 'Search official judicial cases and rulings, with original page viewer' },
    actionOnly: true,
  },
  {
    id: 'regulation',
    labelAr: 'باحث نظامي',
    labelEn: 'Regulatory Research',
    icon: <Scale className="w-4 h-4" />,
    placeholder: '',
    description: { ar: 'بحث في الأنظمة واللوائح والتعاميم', en: 'Search laws, regulations, and circulars' },
    actionOnly: true,
  },
  {
    id: 'contract',
    labelAr: 'صياغة عقد',
    labelEn: 'Draft a Contract',
    icon: <FileSignature className="w-4 h-4" />,
    placeholder: '',
    description: { ar: 'صف العقد الذي تحتاجه والذكاء الاصطناعي يصيغه', en: 'Describe the contract you need and AI will draft it' },
    actionOnly: true,
  },
  {
    id: 'consult',
    labelAr: 'استشارة',
    labelEn: 'Consultation',
    icon: <MessageSquare className="w-4 h-4" />,
    placeholder: '',
    description: { ar: 'احصل على استشارة قانونية مخصصة', en: 'Get a tailored legal consultation' },
    actionOnly: true,
  },
];

function sanitizeText(text: string): string {
  return text
    .replace(/[\uFFFD\uFFFE\uFFFF\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, '')
    .replace(/[^\u0600-\u06FF\u0750-\u077F\uFB50-\uFDFF\uFE70-\uFEFF\w\s\d.,،؛:؟!()[\]«»\-\/\u0020-\u007E]+/g, ' ')
    .replace(/\s{3,}/g, '  ')
    .trim();
}

/** Trim content to max 500 chars at sentence boundary */
function trimContent(text: string, max = 500): string {
  if (text.length <= max) return text;
  const cut = text.slice(0, max);
  const lastPeriod = Math.max(cut.lastIndexOf('،'), cut.lastIndexOf('.'), cut.lastIndexOf('\n'));
  return (lastPeriod > max * 0.6 ? cut.slice(0, lastPeriod + 1) : cut).trim() + '...';
}

// ── Smart source badge ────────────────────────────────────────────────────────
function SourceBadge({ tabId, content }: { tabId: SearchTab; content: string }) {
  // Try to extract case number and date from judicial content
  const caseMatch = content.match(/(\d{4,})[\/\-](\d{1,4})/);
  const yearMatch = content.match(/1[34]\d{2}هـ|20\d{2}م/);

  if (tabId === 'regulation') {
    return (
      <a
        href="https://laws.boe.gov.sa"
        target="_blank"
        rel="noopener noreferrer"
        className="inline-flex items-center gap-1 text-xs text-blue-600 hover:underline"
      >
        <ExternalLink className="w-3 h-3" />
        هيئة الخبراء بمجلس الوزراء
      </a>
    );
  }

  if (tabId === 'judicial') {
    const query = [
      caseMatch ? `قضية ${caseMatch[0]}` : '',
      yearMatch ? yearMatch[0] : '',
    ].filter(Boolean).join(' ');
    const url = query
      ? `https://www.moj.gov.sa/ar/OpenData/Pages/JudicialDecisions.aspx?q=${encodeURIComponent(query)}`
      : 'https://www.moj.gov.sa/ar/OpenData/Pages/JudicialDecisions.aspx';
    return (
      <a
        href={url}
        target="_blank"
        rel="noopener noreferrer"
        className="inline-flex items-center gap-1 text-xs text-blue-600 hover:underline"
      >
        <ExternalLink className="w-3 h-3" />
        {caseMatch ? `وزارة العدل — قضية ${caseMatch[0]}` : 'وزارة العدل'}
      </a>
    );
  }

  return null;
}

// ── MOJ Official Circulars (منصة التعاميم الرسمية لوزارة العدل) ───────────────

interface MojCircular {
  id: number;
  tameemId: number;
  tameemNo: string;
  hdate: string;
  hdateYear: string;
  subject: string;
  bodyText: string;
  status: string;
  sourceUrl: string;
  hasImage: boolean;
  createdAt: string;
}

interface StructuredSummary {
  title?: string;
  type?: string;
  number?: string;
  date_hijri?: string;
  date_gregorian?: string;
  issuer?: string;
  basis?: string;
  purpose?: string;
  opening_para?: string;
  highlights?: Array<{ title: string; detail: string }>;
  objectives?: string[] | null;
  status?: string;
  addressees?: string | null;
  relation_note?: string | null;
}

interface MojCircularDetail extends MojCircular {
  relatedTameemIds: number[];
  updatedAt: string;
  fetchedAt: string;
  structuredSummary?: StructuredSummary;
}

function mojStatusBadge(status: string, t: (ar: string, en: string) => string) {
  const s = (status || '').trim();
  if (s === 'نافذ') return <span className="px-2 py-0.5 rounded-full text-xs font-bold bg-green-100 text-green-700" dir="auto">✓ {s}</span>;
  if (s === 'معدل') return <span className="px-2 py-0.5 rounded-full text-xs font-bold bg-amber-100 text-amber-700" dir="auto">⚠ {s}</span>;
  if (s === 'ملغى') return <span className="px-2 py-0.5 rounded-full text-xs font-bold bg-red-100 text-red-700" dir="auto">✕ {s}</span>;
  return <span className="px-2 py-0.5 rounded-full text-xs font-bold bg-muted text-muted-foreground" dir="auto">{s || t('غير محدد', 'Unspecified')}</span>;
}

function MojCircularBrowser() {
  const { isAuthenticated } = useAuth();
  const { lang, t } = useLang();

  // List state
  const [circulars, setCirculars] = useState<MojCircular[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [pages, setPages] = useState(1);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  // Filters
  const [query, setQuery] = useState('');
  const [yearFilter, setYearFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [years, setYears] = useState<string[]>([]);

  // Detail state
  const [detail, setDetail] = useState<MojCircularDetail | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailError, setDetailError] = useState('');
  const [textExpanded, setTextExpanded] = useState(false);
  const [copied, setCopied] = useState(false);
  const [imgError, setImgError] = useState(false);

  const fetchList = async (pg = 1, q = query, year = yearFilter, status = statusFilter) => {
    setLoading(true);
    setError('');
    try {
      const params = new URLSearchParams({ page: String(pg), limit: '50' });
      if (q.trim()) params.set('q', q.trim());
      if (year) params.set('year', year);
      if (status) params.set('status', status);
      const r = await fetch(`${API_BASE}/api/knowledge/moj-circulars?${params}`, { credentials: 'include' });
      if (!r.ok) throw new Error((await r.json().catch(() => ({}))).error || 'فشل التحميل');
      const data = await r.json();
      setCirculars(data.circulars ?? []);
      setTotal(data.total ?? 0);
      setPage(data.page ?? 1);
      setPages(data.pages ?? 1);
    } catch (e: any) { setError(e.message); }
    finally { setLoading(false); }
  };

  const fetchYears = async () => {
    try {
      const r = await fetch(`${API_BASE}/api/knowledge/moj-circulars-years`, { credentials: 'include' });
      if (r.ok) { const d = await r.json(); setYears(d.years ?? []); }
    } catch { /* silent */ }
  };

  const fetchedRef = useRef(false);
  useEffect(() => {
    if (!isAuthenticated || fetchedRef.current) return;
    fetchedRef.current = true;
    fetchList(1);
    fetchYears();
  }, [isAuthenticated]);

  const openDetail = async (c: MojCircular) => {
    setDetail(null);
    setDetailError('');
    setTextExpanded(false);
    setImgError(false);
    setCopied(false);
    setDetailLoading(true);
    try {
      const r = await fetch(`${API_BASE}/api/knowledge/moj-circulars/${c.tameemId}`, { credentials: 'include' });
      if (!r.ok) throw new Error((await r.json().catch(() => ({}))).error || 'فشل التحميل');
      const data = await r.json();
      setDetail(data.circular ?? null);
    } catch (e: any) { setDetailError(e.message); }
    finally { setDetailLoading(false); }
  };

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    setPage(1);
    fetchList(1, query, yearFilter, statusFilter);
  };

  const copyCitation = () => {
    if (!detail) return;
    const citation = `تعميم وزارة العدل رقم ${detail.tameemNo || detail.tameemId}، بتاريخ ${detail.hdate}هـ، بشأن: ${detail.subject}، المصدر: ${detail.sourceUrl}`;
    navigator.clipboard.writeText(citation).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  };

  // ── Detail View ──────────────────────────────────────────────────────────────
  if (detailLoading) {
    return (
      <div className="flex items-center justify-center py-20 gap-3 text-muted-foreground">
        <Loader2 className="w-6 h-6 animate-spin" />
        <span className="text-sm">{t('جارٍ تحميل التعميم...', 'Loading circular...')}</span>
      </div>
    );
  }

  if (detail) {
    const imageUrl = `${API_BASE}/api/knowledge/moj-circulars/${detail.tameemId}/image`;
    return (
      <div className="space-y-4" dir={lang === 'ar' ? 'rtl' : 'ltr'}>
        <button
          onClick={() => { setDetail(null); setDetailError(''); }}
          className="flex items-center gap-2 text-sm text-primary hover:underline font-medium"
        >
          <ArrowRight className="w-4 h-4" />
          {t('العودة إلى قائمة التعاميم', 'Back to circulars')}
        </button>

        {detailError && (
          <div className="p-3 bg-destructive/10 border border-destructive/30 rounded-xl text-sm text-destructive">{localizedAuthError(detailError, t)}</div>
        )}

        {/* Header */}
        <div className="bg-card border-2 border-blue-400/70 rounded-2xl overflow-hidden shadow-sm shadow-blue-400/10">
          <div className="flex flex-wrap items-center gap-2 px-5 py-3 bg-muted/30 border-b border-blue-400/30">
            <span className="inline-flex items-center gap-1 text-xs font-bold text-blue-700 bg-blue-50 border border-blue-100 rounded-lg px-2 py-1">
              🌐 {t('وزارة العدل', 'Ministry of Justice')}
            </span>
            <span className="flex-1 text-sm font-bold text-secondary" dir="auto">{detail.subject}</span>
            {mojStatusBadge(detail.status, t)}
          </div>

          {/* Meta */}
          <div className="flex flex-wrap gap-4 px-5 py-3 text-xs text-muted-foreground border-b border-secondary/20">
            {detail.tameemNo && (
              <span className="flex items-center gap-1">
              <span className="font-semibold text-secondary">{t('رقم التعميم:', 'Circular number:')}</span> <span dir="auto">{detail.tameemNo}</span>
              </span>
            )}
            {detail.hdate && (
              <span className="flex items-center gap-1">
                <Calendar className="w-3 h-3" />
                <span className="font-semibold text-secondary">{t('التاريخ الهجري:', 'Hijri date:')}</span> <span dir="auto">{detail.hdate}</span>
              </span>
            )}
            <span className="flex items-center gap-1">
              <span className="font-semibold text-secondary">{t('الجهة المصدرة:', 'Issuing authority:')}</span> <span dir="auto">{t('وزارة العدل', 'Ministry of Justice')}</span>
            </span>
            <span className="flex items-center gap-1">
              <span className="font-semibold text-secondary">{t('الرقم التسلسلي:', 'Serial number:')}</span> <span dir="auto">{detail.tameemId}</span>
            </span>
          </div>

          {/* ── الملخص الهيكلي + الوثيقة الأصلية: تخطيط عمودين ── */}
          <div className="flex flex-col md:flex-row gap-0 divide-y md:divide-y-0 md:divide-x md:divide-x-reverse border-b border-secondary/20">

            {/* عمود الملخص الهيكلي (الأوسع) */}
            <div className="flex-1 px-5 py-4 space-y-4 min-w-0">
              {detail.structuredSummary && Object.keys(detail.structuredSummary).length > 0 ? (
                <StructuredSummaryBlock
                  summary={detail.structuredSummary}
                  hasDocument={detail.hasImage}
                  onOpenDocument={detail.hasImage ? () => window.open(imageUrl, '_blank') : undefined}
                />
              ) : (
                /* Fallback: raw body text while GPT is generating */
                detail.bodyText && (
                  <div className="space-y-2">
                    <p className="text-xs font-bold text-primary">{t('نص التعميم', 'Circular text')}</p>
                    <div
                      className={cn('text-sm leading-relaxed text-foreground/85 bg-muted/20 rounded-xl p-3 whitespace-pre-wrap font-sans', !textExpanded && 'max-h-48 overflow-hidden relative')}
                      dir="auto"
                    >
                      {detail.bodyText}
                      {!textExpanded && detail.bodyText.length > 400 && (
                        <div className="absolute bottom-0 inset-x-0 h-10 bg-gradient-to-t from-card to-transparent" />
                      )}
                    </div>
                    {detail.bodyText.length > 400 && (
                      <button onClick={() => setTextExpanded(p => !p)} className="mt-1 text-xs text-primary hover:underline">
                        {textExpanded ? t('▲ طيّ النص', '▲ Collapse text') : t('▼ عرض النص كاملاً', '▼ Show full text')}
                      </button>
                    )}
                    <p className="text-xs text-muted-foreground">{t('⏳ جارٍ تحليل الوثيقة وبناء الملخص الهيكلي — سيظهر عند فتح التعميم مرة أخرى.', '⏳ The document is being analyzed and its structured summary will appear when you reopen this circular.')}</p>
                  </div>
                )
              )}
            </div>

            {/* عمود صورة الوثيقة الأصلية */}
            <div className="md:w-64 lg:w-80 shrink-0 px-4 py-4">
              <p className="text-xs font-bold text-primary mb-2">{t('الوثيقة الأصلية', 'Original document')}</p>
              {detail.hasImage && !imgError ? (
                <div className="space-y-2">
                    <div className="relative rounded-xl overflow-hidden border-2 border-secondary/45 bg-muted/20">
                    <img
                      src={imageUrl}
                      alt={`${t('تعميم', 'Circular')} ${detail.tameemNo || detail.tameemId}`}
                      className="w-full object-contain"
                      onError={() => setImgError(true)}
                    />
                  </div>
                  <div className="flex gap-2 flex-wrap">
                    <a href={imageUrl} target="_blank" rel="noopener noreferrer"
                      className="inline-flex items-center gap-1 text-xs text-blue-600 hover:underline">
                      <Eye className="w-3 h-3" /> {t('بالحجم الكامل', 'Full size')}
                    </a>
                    <a href={imageUrl} download={`تعميم-${detail.tameemId}.jpg`}
                      className="inline-flex items-center gap-1 text-xs text-blue-600 hover:underline">
                      <FileDown className="w-3 h-3" /> {t('تحميل', 'Download')}
                    </a>
                  </div>
                </div>
              ) : (
                <div className="flex flex-col gap-2 p-3 bg-amber-50 border border-amber-100 rounded-xl">
                  <p className="text-xs text-amber-800">
                    <span className="font-bold">⚠️ {t('الصورة الأصلية غير متاحة', 'The original image is unavailable')}</span> — {t('النص مأخوذ مباشرةً من منصة التعاميم الرسمية.', 'The text is taken directly from the official circulars platform.')}
                  </p>
                  <a href={detail.sourceUrl} target="_blank" rel="noopener noreferrer"
                    className="inline-flex items-center gap-1 text-xs text-blue-600 hover:underline self-start">
                    <ExternalLink className="w-3 h-3" />
                    {t('فتح في منصة وزارة العدل', 'Open on the Ministry of Justice platform')}
                  </a>
                </div>
              )}
            </div>
          </div>

          {/* Citation card */}
          <div className="mx-5 mb-5 p-4 bg-muted/30 border border-secondary/30 rounded-2xl space-y-2">
            <p className="text-xs font-bold text-foreground mb-2">📋 {t('بطاقة الاستشهاد', 'Citation card')}</p>
            <div className="text-xs text-muted-foreground space-y-1">
              {detail.tameemNo && <p><span className="font-semibold text-foreground">{t('رقم التعميم:', 'Circular number:')}</span> <span dir="auto">{detail.tameemNo}</span></p>}
              <p><span className="font-semibold text-foreground">{t('التاريخ الهجري:', 'Hijri date:')}</span> <span dir="auto">{detail.hdate || t('غير محدد', 'Unspecified')}</span></p>
              <p><span className="font-semibold text-foreground">{t('الجهة المصدرة:', 'Issuing authority:')}</span> {t('وزارة العدل', 'Ministry of Justice')}</p>
              <p><span className="font-semibold text-foreground">{t('الموضوع:', 'Subject:')}</span> <span dir="auto">{detail.subject}</span></p>
              <p><span className="font-semibold text-foreground">{t('الرقم التسلسلي:', 'Serial number:')}</span> <span dir="auto">{detail.tameemId}</span></p>
              <p>
                <span className="font-semibold text-foreground">{t('المصدر الرسمي:', 'Official source:')} </span>
                <a href={detail.sourceUrl} target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:underline break-all" dir="auto">{detail.sourceUrl}</a>
              </p>
              <p><span className="font-semibold text-foreground">{t('تاريخ آخر تحقق:', 'Last verified:')}</span> <span dir="auto">{new Date(detail.fetchedAt).toLocaleDateString(lang === 'ar' ? 'ar-SA' : 'en-US', { year: 'numeric', month: 'long', day: 'numeric' })}</span></p>
            </div>
            <div className="flex gap-2 mt-3">
              <button
                onClick={copyCitation}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-primary text-primary-foreground rounded-xl text-xs font-bold hover:bg-primary/90 transition-colors"
              >
                {copied ? <Check className="w-3 h-3" /> : <Copy className="w-3 h-3" />}
                {copied ? t('تم النسخ!', 'Copied!') : t('نسخ الاستشهاد', 'Copy citation')}
              </button>
                <a
                  href={detail.sourceUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 border border-secondary/40 rounded-xl text-xs font-medium hover:bg-secondary/10 hover:text-secondary transition-colors"
                >
                <ExternalLink className="w-3 h-3" />
                {t('فتح المصدر الرسمي', 'Open official source')}
              </a>
            </div>
          </div>

          {/* Related circulars */}
          {detail.relatedTameemIds?.length > 0 && (
            <div className="px-5 pb-4">
              <p className="text-xs font-bold text-foreground mb-1.5">{t('التعاميم ذات الصلة', 'Related circulars')}</p>
              <div className="flex flex-wrap gap-1.5">
                {detail.relatedTameemIds.map(tid => (
                  <button
                    key={tid}
                    onClick={() => { setDetail(null); openDetail({ tameemId: tid } as any); }}
                    className="px-2.5 py-1 bg-blue-50 border border-blue-100 text-blue-700 rounded-lg text-xs hover:bg-blue-100 transition-colors"
                  >
                    {t('تعميم', 'Circular')} #{tid}
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    );
  }

  // ── List View ────────────────────────────────────────────────────────────────
  return (
    <div className="space-y-4" dir={lang === 'ar' ? 'rtl' : 'ltr'}>
      {/* Search form */}
      <form onSubmit={handleSearch} className="space-y-2">
        <div className="flex flex-col gap-2 sm:flex-row">
          <input
            value={query}
            onChange={e => setQuery(e.target.value)}
            placeholder={t('ابحث في التعاميم... رقم التعميم أو الموضوع أو النص', 'Search circulars by number, subject, or text')}
            className="min-w-0 flex-1 h-11 rounded-2xl border-2 border-secondary/40 bg-background px-4 text-sm focus:outline-none focus:border-secondary transition-colors shadow-sm"
            disabled={loading}
          />
          <button
            type="submit"
            disabled={loading}
            className="h-11 w-full px-4 bg-primary text-primary-foreground rounded-2xl font-bold text-sm hover:bg-primary/90 disabled:opacity-50 flex items-center justify-center gap-2 sm:w-auto"
          >
            {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Search className="w-4 h-4" />}
            {t('بحث', 'Search')}
          </button>
        </div>
        <div className="flex gap-2">
          <select
            value={yearFilter}
            onChange={e => { setYearFilter(e.target.value); setPage(1); fetchList(1, query, e.target.value, statusFilter); }}
            className="flex-1 h-9 rounded-xl border border-secondary/40 bg-background px-3 text-sm focus:outline-none focus:border-secondary"
          >
            <option value="">{t('كل السنوات الهجرية', 'All Hijri years')}</option>
            {years.map(y => <option key={y} value={y}>{y}{t('هـ', ' AH')}</option>)}
          </select>
          <select
            value={statusFilter}
            onChange={e => { setStatusFilter(e.target.value); setPage(1); fetchList(1, query, yearFilter, e.target.value); }}
            className="flex-1 h-9 rounded-xl border border-secondary/40 bg-background px-3 text-sm focus:outline-none focus:border-secondary"
          >
            <option value="">{t('كل الحالات', 'All statuses')}</option>
            <option value="نافذ">{t('نافذ', 'Active')}</option>
            <option value="معدل">{t('معدل', 'Amended')}</option>
            <option value="ملغى">{t('ملغى', 'Repealed')}</option>
            <option value="غير محدد">{t('غير محدد', 'Unspecified')}</option>
          </select>
        </div>
      </form>

      {error && <div className="p-3 bg-destructive/10 border border-destructive/30 rounded-xl text-sm text-destructive">{localizedAuthError(error, t)}</div>}

      {/* Header */}
      <div className="flex items-center gap-2">
        <Bell className="w-4 h-4 text-primary" />
        <h3 className="text-sm font-bold text-foreground">{t('تعاميم وزارة العدل الرسمية', 'Official Ministry of Justice Circulars')}</h3>
        {total > 0 && <span className="text-xs text-muted-foreground bg-muted px-2 py-0.5 rounded-full">{total} {t('تعميم', 'circulars')}</span>}
        <span className="text-xs text-muted-foreground bg-blue-50 border border-blue-100 text-blue-600 px-2 py-0.5 rounded-full">🌐 {t('منصة وزارة العدل الرسمية', 'Official Ministry of Justice platform')}</span>
        <Link href="/legal-search" className="flex items-center gap-1 text-xs text-primary bg-primary/10 hover:bg-primary/20 border border-primary/20 px-2 py-0.5 rounded-full transition-colors mr-auto">
          <ExternalLink className="w-3 h-3" />{t('الباحث الذكي', 'Smart Research')}
        </Link>
      </div>

      {loading && (
        <div className="flex items-center justify-center py-12 gap-3 text-muted-foreground">
          <Loader2 className="w-5 h-5 animate-spin" />
          <span className="text-sm">{t('جارٍ تحميل التعاميم...', 'Loading circulars...')}</span>
        </div>
      )}

      {!loading && circulars.length === 0 && (
        <div className="text-center py-14 text-muted-foreground">
          <div className="w-16 h-16 bg-muted rounded-2xl flex items-center justify-center mx-auto mb-4">
            <Bell className="w-8 h-8 text-muted-foreground" />
          </div>
          <p className="text-sm font-medium mb-1">{t('لم يُجلب أي تعميم بعد', 'No circulars have been fetched yet')}</p>
          <p className="text-xs">{t('انتظري حتى يُنشَّط الجلب من المصدر الرسمي أو تواصلي مع الإدارة', 'Wait for official-source fetching to be enabled, or contact the administrator.')}</p>
        </div>
      )}

      {circulars.length > 0 && (
        <div className="space-y-2">
          {circulars.map(c => (
            <button
              key={c.tameemId}
              onClick={() => openDetail(c)}
              className="w-full text-start bg-card border border-secondary/30 rounded-xl px-4 py-3.5 hover:border-secondary/60 hover:bg-secondary/5 transition-all shadow-sm group"
            >
              <div className="flex items-start gap-3">
                <div className="w-9 h-9 rounded-xl bg-blue-100 flex items-center justify-center shrink-0 mt-0.5">
                  <Bell className="w-4 h-4 text-blue-600" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap mb-0.5">
                    <p className="text-sm font-semibold text-foreground leading-snug" dir="auto">{c.subject}</p>
            {mojStatusBadge(c.status, t)}
                  </div>
                  <div className="flex items-center gap-2 flex-wrap text-xs text-muted-foreground">
                    {c.tameemNo && <span className="font-medium text-foreground/70">{t('رقم', 'No.')} <span dir="auto">{c.tameemNo}</span></span>}
                    {c.hdate && <span className="flex items-center gap-0.5" dir="auto"><Calendar className="w-3 h-3" />{c.hdate}{t('هـ', ' AH')}</span>}
                    {c.hasImage && <span className="text-green-600">📎 {t('صورة أصلية متاحة', 'Original image available')}</span>}
                  </div>
                  {c.bodyText && (
                    <p className="text-xs text-muted-foreground mt-1 line-clamp-2 leading-relaxed" dir="auto">{c.bodyText}</p>
                  )}
                </div>
                <ExternalLink className="w-4 h-4 text-muted-foreground group-hover:text-primary transition-colors shrink-0 mt-1" />
              </div>
            </button>
          ))}
        </div>
      )}

      {/* Pagination */}
      {pages > 1 && (
        <div className="flex items-center justify-center gap-3 pt-2">
          <button
            onClick={() => { const p = page - 1; setPage(p); fetchList(p); }}
            disabled={page <= 1 || loading}
            className="px-3 py-1.5 border border-secondary/40 rounded-xl text-sm disabled:opacity-40 hover:bg-secondary/10"
          >
            {t('السابق', 'Previous')}
          </button>
          <span className="text-sm text-muted-foreground">{t('صفحة', 'Page')} {page} {t('من', 'of')} {pages}</span>
          <button
            onClick={() => { const p = page + 1; setPage(p); fetchList(p); }}
            disabled={page >= pages || loading}
            className="px-3 py-1.5 border border-secondary/40 rounded-xl text-sm disabled:opacity-40 hover:bg-secondary/10"
          >
            {t('التالي', 'Next')}
          </button>
        </div>
      )}

      {/* Official source notice */}
      <p className="text-xs text-muted-foreground text-center pb-1">
        {t('المصدر:', 'Source:')}{' '}
        <a href="https://portaleservices.moj.gov.sa/TameemPortal/TameemList.aspx" target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:underline">
          {t('منصة التعاميم الرسمية — بوابة خدمات وزارة العدل', 'Official Circulars Platform — Ministry of Justice Services Portal')}
        </a>
        {' '}· {t('نصوص رقمية سليمة (لا مشكلة في القراءة)', 'Reliable digital text (no reading issues)')}
      </p>
    </div>
  );
}

// ── Circular search agent ─────────────────────────────────────────────────────
interface CircularResult {
  issuer: string;
  number: string;
  date: string;
  status: string;
  addressees?: string;
  text: string;
  summary: string;
  practical_effect: string;
  url?: string;
  relation_note?: string;
  // New template fields (v2 GPT output)
  title?: string;
  type?: string;
  date_hijri?: string;
  date_gregorian?: string;
  basis?: string;
  purpose?: string;
  opening_para?: string;
  highlights?: Array<{ title: string; detail: string }>;
  objectives?: string[] | null;
}

interface CircularListItem {
  id: number;
  filename: string;
  createdAt: string;
  totalChunks: number;
  sourceUrl?: string | null;
}

function statusBadge(status: string) {
  if (!status) return null;
  const s = status.trim();
  if (s === 'نافذ') return <span className="px-2 py-0.5 rounded-full text-xs font-bold bg-green-100 text-green-700">✓ نافذ</span>;
  if (s === 'معدل') return <span className="px-2 py-0.5 rounded-full text-xs font-bold bg-amber-100 text-amber-700">⚠ معدل</span>;
  if (s === 'ملغى') return <span className="px-2 py-0.5 rounded-full text-xs font-bold bg-red-100 text-red-700">✕ ملغى</span>;
  return <span className="px-2 py-0.5 rounded-full text-xs font-bold bg-muted text-muted-foreground">{s}</span>;
}

// ── القالب الإلزامي للملخص ────────────────────────────────────────────────────
function StructuredSummaryBlock({
  summary,
  onOpenDocument,
  hasDocument,
}: {
  summary: StructuredSummary;
  onOpenDocument?: () => void;
  hasDocument?: boolean;
}) {
  const { t } = useLang();
  return (
    <div className="space-y-4 text-sm" dir="auto">
      {/* عنوان قصير */}
      {summary.title && (
        <h3 className="text-base font-bold text-foreground leading-snug">{summary.title}</h3>
      )}

      {/* فقرة افتتاحية */}
      {summary.opening_para && (
        <p className="text-sm leading-relaxed text-foreground/85 border-r-2 border-primary/50 pr-3">
          {summary.opening_para}
        </p>
      )}

      {/* أبرز ما جاء في الوثيقة */}
      {summary.highlights && summary.highlights.length > 0 && (
        <div className="space-y-2.5">
          <p className="text-xs font-bold text-foreground">{t('أبرز ما جاء في الوثيقة', 'Document highlights')}</p>
          <ul className="space-y-3">
            {summary.highlights.map((h, i) => (
              <li key={i} className="flex gap-2.5">
                <span className="mt-1.5 w-1.5 h-1.5 rounded-full bg-primary shrink-0" />
                <div className="text-sm leading-relaxed">
                  <span className="font-bold text-foreground">{h.title}:</span>{' '}
                  <span className="text-foreground/85">{h.detail}</span>
                </div>
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* أهداف القرار — فقط إذا وردت صراحةً */}
      {summary.objectives && summary.objectives.length > 0 && (
        <div className="space-y-2">
          <p className="text-xs font-bold text-foreground">{t('أهداف القرار', 'Decision objectives')}</p>
          <ul className="space-y-2">
            {summary.objectives.map((obj, i) => (
              <li key={i} className="flex gap-2.5">
                <span className="mt-1.5 w-1.5 h-1.5 rounded-full bg-amber-500 shrink-0" />
                <span className="text-sm text-foreground/85 leading-relaxed">{obj}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* جملة ختامية وزر الوثيقة */}
      <div className="pt-3 border-t border-secondary/20 space-y-2.5">
        <p className="text-xs text-muted-foreground leading-relaxed">
          ⚠️ {t('الملخص أعلاه مُولَّد مساعداً للقراءة من نص الوثيقة الرسمية حصراً. المعتمد هو نص الوثيقة الأصلية. يُرجى الاطلاع على تفاصيل المواد ونطاق السريان في الوثيقة المرفقة.', 'The summary above is generated only to assist reading the official document text. The original document text is authoritative; review its provisions and scope in the attached document.')}
        </p>
        {onOpenDocument && hasDocument && (
          <button
            onClick={onOpenDocument}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-primary text-primary-foreground rounded-xl text-xs font-bold hover:bg-primary/90 transition-colors"
          >
            <Eye className="w-3 h-3" />
            {t('فتح الوثيقة الأصلية', 'Open original document')}
          </button>
        )}
      </div>
    </div>
  );
}

/** Renders a fully-structured circular card (shared between browse and search views) */
function CircularCard({ c, i, expandedText, onToggleExpand }: {
  c: CircularResult;
  i: number;
  expandedText: Record<number, boolean>;
  onToggleExpand: (i: number) => void;
}) {
  const { t } = useLang();
  return (
    <div className="bg-card border-2 border-secondary/55 rounded-2xl overflow-hidden shadow-sm shadow-secondary/10">
      {/* Header */}
      <div className="flex flex-wrap items-center gap-2 px-5 py-3 bg-muted/30 border-b border-secondary/45">
        <span className="text-sm font-bold text-primary flex-1" dir="auto">{c.issuer || t('جهة غير محددة', 'Unspecified authority')}</span>
        {statusBadge(c.status)}
      </div>

      {/* Meta */}
      <div className="flex flex-wrap gap-4 px-5 py-3 text-xs text-muted-foreground border-b border-secondary/35">
        {c.number && c.number !== 'غير محدد' && (
          <span className="flex items-center gap-1">
            <span className="font-semibold text-foreground">{t('رقم التعميم:', 'Circular number:')}</span> <span dir="auto">{c.number}</span>
          </span>
        )}
        {c.date && c.date !== 'غير محدد' && (
          <span className="flex items-center gap-1">
            <span className="font-semibold text-foreground">{t('التاريخ:', 'Date:')}</span> <span dir="auto">{c.date}</span>
          </span>
        )}
        {c.addressees && c.addressees !== 'غير محدد' && (
          <span className="flex items-center gap-1">
            <span className="font-semibold text-foreground">{t('المخاطَبون:', 'Addressees:')}</span> <span dir="auto">{c.addressees}</span>
          </span>
        )}
      </div>

      <div className="px-5 py-4">
        {/* القالب الهيكلي الجديد عند توفّر highlights */}
        {c.highlights && c.highlights.length > 0 ? (
          <StructuredSummaryBlock
            summary={c as StructuredSummary}
            hasDocument={false}
          />
        ) : (
          /* Fallback للبيانات القديمة المخزّنة */
          <div className="space-y-4">
            {c.text && (
              <div>
                <p className="text-xs font-bold text-primary mb-1.5">{t('نص التعميم', 'Circular text')}</p>
                <div className={cn('text-sm leading-relaxed text-foreground/85 bg-muted/20 rounded-xl p-3', !expandedText[i] && 'max-h-32 overflow-hidden relative')} dir="auto">
                  <div className="whitespace-pre-wrap font-sans">{c.text}</div>
                  {!expandedText[i] && c.text.length > 300 && (
                    <div className="absolute bottom-0 inset-x-0 h-10 bg-gradient-to-t from-card to-transparent" />
                  )}
                </div>
                {c.text.length > 300 && (
                  <button onClick={() => onToggleExpand(i)} className="mt-1 text-xs text-primary hover:underline">
                    {expandedText[i] ? t('▲ طيّ النص', '▲ Collapse text') : t('▼ عرض النص كاملاً', '▼ Show full text')}
                  </button>
                )}
              </div>
            )}
            {c.summary && (
              <div>
                <p className="text-xs font-bold text-amber-700 mb-1">{t('الملخص', 'Summary')}</p>
                <p className="text-sm leading-relaxed text-foreground/85">{c.summary}</p>
              </div>
            )}
            {c.practical_effect && (
              <div>
                <p className="text-xs font-bold text-green-700 mb-1">{t('الأثر العملي', 'Practical effect')}</p>
                <p className="text-sm leading-relaxed text-foreground/85">{c.practical_effect}</p>
              </div>
            )}
            {c.relation_note && c.relation_note !== 'غير محدد' && (
              <div className="px-3 py-2 bg-blue-50 border border-blue-100 rounded-lg text-xs text-blue-800">
                ℹ️ {c.relation_note}
              </div>
            )}
            {c.url && (
              <a href={c.url} target="_blank" rel="noopener noreferrer"
                className="inline-flex items-center gap-1 text-xs text-blue-600 hover:underline">
                <ExternalLink className="w-3 h-3" />
                {t('الرابط الرسمي', 'Official link')}
              </a>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

function CircularAgent() {
  const { isAuthenticated } = useAuth();
  const { lang, t } = useLang();
  const [, setLocation] = useLocation();

  // ── Browse state ──
  const [browseList, setBrowseList] = useState<CircularListItem[]>([]);
  const [browseLoading, setBrowseLoading] = useState(false);
  const [browseError, setBrowseError] = useState('');

  // ── Detail (single circular) state ──
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [detail, setDetail] = useState<CircularResult | null>(null);
  const [detailFilename, setDetailFilename] = useState('');
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailError, setDetailError] = useState('');
  const [expandedDetail, setExpandedDetail] = useState<Record<number, boolean>>({});

  // ── Search state ──
  const [topic, setTopic] = useState('');
  const [searchResults, setSearchResults] = useState<CircularResult[]>([]);
  const [searchMessage, setSearchMessage] = useState('');
  const [searchLoading, setSearchLoading] = useState(false);
  const [searched, setSearched] = useState(false);
  const [searchError, setSearchError] = useState('');
  const [searchFallback, setSearchFallback] = useState(false);
  const [expandedSearch, setExpandedSearch] = useState<Record<number, boolean>>({});

  const [upgradeRequired, setUpgradeRequired] = useState(false);

  // Load browse list on mount
  const fetchedRef = useRef(false);
  useEffect(() => {
    if (!isAuthenticated || fetchedRef.current) return;
    fetchedRef.current = true;
    setBrowseLoading(true);
    fetch(`${API_BASE}/api/knowledge/circulars`, { credentials: 'include' })
      .then(async r => {
        if (!r.ok) {
          const err = await r.json().catch(() => ({}));
          if (err.code === 'UPGRADE_REQUIRED') { setUpgradeRequired(true); return; }
          throw new Error(err.error || 'فشل التحميل');
        }
        const data = await r.json();
        setBrowseList(data.circulars ?? []);
      })
      .catch(e => setBrowseError(e.message))
      .finally(() => setBrowseLoading(false));
  }, [isAuthenticated]);

  const openDetail = async (item: CircularListItem) => {
    setSelectedId(item.id);
    setDetail(null);
    setDetailFilename(item.filename);
    setDetailError('');
    setExpandedDetail({});
    setDetailLoading(true);
    try {
      const r = await fetch(`${API_BASE}/api/knowledge/circulars/${item.id}`, { credentials: 'include' });
      if (!r.ok) {
        const err = await r.json().catch(() => ({}));
        throw new Error(err.error || 'فشل التحميل');
      }
      const data = await r.json();
      setDetail(data.circular ?? null);
    } catch (e: any) {
      setDetailError(e.message);
    } finally {
      setDetailLoading(false);
    }
  };

  const closeDetail = () => {
    setSelectedId(null);
    setDetail(null);
    setDetailError('');
  };

  const handleSearch = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!topic.trim() || searchLoading) return;
    if (!isAuthenticated) { setLocation(`/login?returnTo=${encodeURIComponent(window.location.pathname + window.location.search)}`); return; }
    setSearchLoading(true);
    setSearchError('');
    setUpgradeRequired(false);
    setSearched(false);
    setSearchResults([]);
    setSearchMessage('');
    setSearchFallback(false);
    setSelectedId(null);
    setDetail(null);
    try {
      const res = await fetch(`${API_BASE}/api/knowledge/search-circular`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ topic }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        if (err.code === 'UPGRADE_REQUIRED') { setUpgradeRequired(true); return; }
        throw new Error(err.error || 'فشل البحث');
      }
      const data = await res.json();
      setSearchResults(data.circulars ?? []);
      setSearchFallback(!!data.fallback);
      setSearchMessage(data.message ?? '');
      setSearched(true);
    } catch (err: any) {
      setSearchError(err.message);
    } finally {
      setSearchLoading(false);
    }
  };

  // ── Detail view ──
  if (selectedId !== null) {
    return (
      <div className="space-y-4" dir={lang === 'ar' ? 'rtl' : 'ltr'}>
        <button
          onClick={closeDetail}
          className="flex items-center gap-2 text-sm text-primary hover:underline font-medium"
        >
          <ArrowRight className="w-4 h-4" />
          {t('العودة إلى قائمة التعاميم', 'Back to circulars')}
        </button>

        {detailLoading && (
          <div className="flex items-center justify-center py-16 text-muted-foreground gap-3">
            <Loader2 className="w-6 h-6 animate-spin" />
            <span className="text-sm">{t('جارٍ تحليل التعميم...', 'Analyzing circular...')}</span>
          </div>
        )}

        {detailError && (
          <div className="p-3 bg-destructive/10 border border-destructive/30 rounded-xl text-sm text-destructive">{localizedAuthError(detailError, t)}</div>
        )}

        {detail && !detailLoading && (
          <>
            <CircularCard c={detail} i={0} expandedText={expandedDetail} onToggleExpand={i => setExpandedDetail(p => ({ ...p, [i]: !p[i] }))} />
            <p className="text-xs text-muted-foreground text-center pb-2">
              ⚠️ النتائج مستخرجة من قاعدة المعرفة — يُنصح بالتحقق من المصدر الرسمي
            </p>
          </>
        )}
      </div>
    );
  }

  // ── Search results view ──
  if (searched) {
    return (
      <div className="space-y-5">
        {/* Search form */}
        <form onSubmit={handleSearch} className="flex flex-col gap-2 sm:flex-row">
          <input
            value={topic}
            onChange={e => setTopic(e.target.value)}
            placeholder={t('أدخل موضوع التعميم... مثال: إجازة الأمومة، الحضور والانصراف، العمل عن بُعد', 'Enter a circular topic... e.g., maternity leave, attendance, remote work')}
            className="min-w-0 flex-1 h-12 rounded-2xl border-2 border-secondary/55 bg-background px-4 text-sm focus:outline-none focus:border-secondary focus:ring-2 focus:ring-secondary/15 transition-colors shadow-sm"
            disabled={searchLoading}
          />
          <button type="submit" disabled={!topic.trim() || searchLoading}
            className="h-12 w-full px-5 bg-primary text-primary-foreground rounded-2xl font-bold text-sm hover:bg-primary/90 disabled:opacity-50 flex items-center justify-center gap-2 whitespace-nowrap sm:w-auto">
            {searchLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Search className="w-4 h-4" />}
            {searchLoading ? t('جارٍ البحث...', 'Searching...') : t('ابحث', 'Search')}
          </button>
        </form>

        <button onClick={() => { setSearched(false); setSearchResults([]); setTopic(''); }}
          className="flex items-center gap-2 text-sm text-primary hover:underline font-medium">
          <ArrowRight className="w-4 h-4" />
          {t('العودة إلى قائمة التعاميم', 'Back to circulars')}
        </button>

        {searchFallback && (
          <div className="px-4 py-2.5 bg-amber-50 border border-amber-200 rounded-xl text-xs text-amber-800 flex items-center gap-2">
            <span>⚡</span>
            <span>لم نجد تعاميم في تصنيف التعاميم — النتائج مستخرجة من كافة مصادر قاعدة المعرفة</span>
          </div>
        )}

        {searchResults.length === 0 && searchMessage && (
          <div className="py-10 text-center text-muted-foreground">
            <Bell className="w-10 h-10 mx-auto mb-3 opacity-30" />
            <p className="text-sm">{searchMessage}</p>
          </div>
        )}

        {searchResults.length > 0 && (
          <div className="space-y-4">
            <p className="text-xs text-muted-foreground text-center">{searchResults.length} {t('تعاميم ذات صلة', 'related circulars')}</p>
            {searchResults.map((c, i) => (
              <CircularCard key={i} c={c} i={i} expandedText={expandedSearch}
                onToggleExpand={i => setExpandedSearch(p => ({ ...p, [i]: !p[i] }))} />
            ))}
            <p className="text-xs text-muted-foreground text-center pb-2">
              ⚠️ النتائج مستخرجة من قاعدة المعرفة — يُنصح بالتحقق من المصدر الرسمي
            </p>
          </div>
        )}
      </div>
    );
  }

  // ── Main view: browse index + search form ──
  return (
    <div className="space-y-5">
      {/* Search form */}
      <form onSubmit={handleSearch} className="flex flex-col gap-2 sm:flex-row">
        <input
          value={topic}
          onChange={e => setTopic(e.target.value)}
          placeholder={t('أدخل موضوع التعميم... مثال: إجازة الأمومة، الحضور والانصراف، العمل عن بُعد', 'Enter a circular topic... e.g., maternity leave, attendance, remote work')}
          className="min-w-0 flex-1 h-12 rounded-2xl border-2 border-secondary/40 bg-background px-4 text-sm focus:outline-none focus:border-secondary transition-colors shadow-sm"
          disabled={searchLoading}
        />
        <button type="submit" disabled={!topic.trim() || searchLoading}
          className="h-12 w-full px-5 bg-primary text-primary-foreground rounded-2xl font-bold text-sm hover:bg-primary/90 disabled:opacity-50 flex items-center justify-center gap-2 whitespace-nowrap sm:w-auto">
          {searchLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Search className="w-4 h-4" />}
          {searchLoading ? t('جارٍ البحث...', 'Searching...') : t('بحث بموضوع', 'Search by topic')}
        </button>
      </form>

      {searchError && <div className="p-3 bg-destructive/10 border border-destructive/30 rounded-xl text-sm text-destructive">{searchError}</div>}

      {/* Browse index — free for all authenticated users */}
      <div>
        <div className="flex items-center gap-2 mb-3">
          <Bell className="w-4 h-4 text-primary" />
          <h3 className="text-sm font-bold text-foreground">{t('التعاميم المفهرسة', 'Indexed circulars')}</h3>
          {browseList.length > 0 && (
            <span className="text-xs text-muted-foreground bg-muted px-2 py-0.5 rounded-full">{browseList.length}</span>
          )}
          <Link href="/legal-search" className="flex items-center gap-1 text-xs text-primary bg-primary/10 hover:bg-primary/20 border border-primary/20 px-2 py-0.5 rounded-full transition-colors mr-auto">
            <ExternalLink className="w-3 h-3" />{t('الباحث الذكي', 'Smart Research')}
          </Link>
        </div>

        {browseLoading && (
          <div className="flex items-center justify-center py-10 text-muted-foreground gap-3">
            <Loader2 className="w-5 h-5 animate-spin" />
            <span className="text-sm">{t('جارٍ تحميل التعاميم...', 'Loading circulars...')}</span>
          </div>
        )}

        {browseError && (
          <div className="p-3 bg-destructive/10 border border-destructive/30 rounded-xl text-sm text-destructive">{browseError}</div>
        )}

        {!browseLoading && !browseError && browseList.length === 0 && (
          <div className="text-center py-12 text-muted-foreground">
            <div className="w-16 h-16 bg-muted rounded-2xl flex items-center justify-center mx-auto mb-4">
              <Bell className="w-8 h-8 text-muted-foreground" />
            </div>
            <p className="text-sm font-medium mb-1">{t('لا توجد تعاميم مفهرسة بعد', 'No circulars have been indexed yet')}</p>
            <p className="text-xs">{t('استخدم البحث أو انتظر حتى يُضاف محتوى من المسؤول', 'Use search or wait for an administrator to add content.')}</p>
          </div>
        )}

        {browseList.length > 0 && (
          <div className="space-y-2">
            {browseList.map(item => (
              <button
                key={item.id}
                onClick={() => openDetail(item)}
                className="w-full text-start bg-card border border-secondary/30 rounded-xl px-4 py-3.5 hover:border-secondary/60 hover:bg-secondary/5 transition-all shadow-sm flex items-center gap-3 group"
              >
                <div className="w-9 h-9 rounded-xl bg-amber-100 flex items-center justify-center shrink-0">
                  {(item as any).sourceUrl ? '🌐' : <Bell className="w-4 h-4 text-amber-600" />}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold text-foreground truncate" dir="auto">{item.filename}</p>
                  <p className="text-xs text-muted-foreground mt-0.5 flex items-center gap-1.5">
                    {new Date(item.createdAt).toLocaleDateString(lang === 'ar' ? 'ar-SA' : 'en-US', { year: 'numeric', month: 'short', day: 'numeric' })}
                    {item.totalChunks > 0 && <> · {item.totalChunks} {t('جزء', 'sections')}</>}
                    {(item as any).sourceUrl && (
                      <span className="inline-flex items-center gap-0.5 bg-blue-50 text-blue-600 border border-blue-100 rounded px-1.5 py-0.5 text-[10px] font-medium">
                        🌐 {t('وزارة العدل', 'Ministry of Justice')}
                      </span>
                    )}
                  </p>
                </div>
                <FileText className="w-4 h-4 text-muted-foreground group-hover:text-primary transition-colors shrink-0" />
              </button>
            ))}
          </div>
        )}

        {/* Upgrade prompt for AI-powered search */}
        {upgradeRequired && (
          <div className="mt-4 p-4 bg-primary/5 border border-primary/20 rounded-2xl text-center">
            <Lock className="w-6 h-6 text-primary mx-auto mb-1.5" />
            <p className="font-bold text-primary text-sm mb-1">{t('البحث الذكي للمشتركين', 'Smart search for subscribers')}</p>
            <p className="text-muted-foreground text-xs mb-3">{t('تصفح التعاميم أعلاه مجاناً، أو اشترك للبحث بالموضوع', 'Browse circulars above for free, or subscribe to search by topic.')}</p>
            <Link href="/pricing">
              <button className="px-4 py-1.5 bg-primary text-primary-foreground rounded-xl font-bold text-sm hover:bg-primary/90">{t('ترقية الباقة', 'Upgrade plan')}</button>
            </Link>
          </div>
        )}
      </div>
    </div>
  );
}

// ── Regulatory Researcher ─────────────────────────────────────────────────────

type DocStatus = 'نافذ' | 'ملغى' | 'معدّل' | 'غير محدد';
type AuditStatus = 'موثقة وصالحة للاستخدام' | 'صحيحة مع نقص محدود' | 'تحتاج إعادة تحقق' | 'غير صالحة للاعتماد';

interface RegSource { title: string; url: string; content: string; fetchedAt: string; score?: number; }
interface RegArticle { articleNumber: string; articleText: string; law: string; relevance: string; verified: boolean; sourceUrl?: string; }
interface LegMapItem { type: string; name: string; issuingDecree?: string; date?: string; status: DocStatus; relation: string; verified: boolean; sourceUrl?: string; }
interface Amend { date: string; decree: string; description: string; publishDate?: string; effectiveDate?: string; articles?: string; verified: boolean; }
interface RegulatoryResult {
  fetchedAt: string; query: string; synonymsUsed: string[]; searchTermsUsed: string[];
  legalClassification: string; legalQuestion: string; keywords: string[];
  mainLaw: { name: string; issuingDecree?: string; publishDate?: string; effectiveDate?: string; status: DocStatus; issuingAuthority?: string; sourceUrl?: string; verified: boolean } | null;
  legislativeMap: LegMapItem[]; amendments: Amend[];
  applicableArticles: RegArticle[];
  temporalApplicability?: { applicableVersion: string; reason: string; transitionalNote?: string };
  conditions: string[]; exceptions: string[];
  applicationAnalysis: string; conflicts: string[]; conclusion: string; pendingIssues: string[];
  sources: RegSource[];
  auditStatus: AuditStatus; auditNotes: string[];
}

function AuditBadge({ status, notes }: { status: AuditStatus; notes: string[] }) {
  const [open, setOpen] = useState(false);
  const { t } = useLang();
  const cfg: Record<AuditStatus, { bg: string; text: string; icon: string }> = {
    'موثقة وصالحة للاستخدام': { bg: 'bg-green-50 border-green-300 text-green-800',  text: 'text-green-800',  icon: '✓' },
    'صحيحة مع نقص محدود':     { bg: 'bg-amber-50 border-amber-300 text-amber-800',   text: 'text-amber-800',  icon: '⚡' },
    'تحتاج إعادة تحقق':       { bg: 'bg-orange-50 border-orange-300 text-orange-800', text: 'text-orange-800', icon: '⚠' },
    'غير صالحة للاعتماد':      { bg: 'bg-red-50 border-red-300 text-red-800',         text: 'text-red-800',    icon: '✕' },
  };
  const c = cfg[status] ?? cfg['تحتاج إعادة تحقق'];
  return (
    <div className={cn('border rounded-xl px-3 py-2', c.bg)}>
      <button onClick={() => setOpen(v => !v)} className="flex items-center gap-2 w-full text-start">
        <span className="font-bold text-sm">{c.icon} {t('تدقيق النتيجة:', 'Result audit:')} <span dir="auto">{status}</span></span>
        {notes.length > 0 && <span className="text-xs opacity-70">{open ? '▲' : '▼'}</span>}
      </button>
      {open && notes.length > 0 && (
        <ul className="mt-2 space-y-1">
          {notes.map((n, i) => <li key={i} className="text-xs opacity-80" dir="auto">• {n}</li>)}
        </ul>
      )}
    </div>
  );
}

function StatusPill({ status }: { status: DocStatus }) {
  const { t } = useLang();
  if (status === 'نافذ')   return <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-green-100 text-green-700">✓ {t('نافذ', 'In force')}</span>;
  if (status === 'ملغى')   return <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-red-100 text-red-700">✕ {t('ملغى', 'Repealed')}</span>;
  if (status === 'معدّل')  return <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-100 text-amber-700">⚡ {t('معدّل', 'Amended')}</span>;
  return <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-muted text-muted-foreground" dir="auto">{status}</span>;
}

function VerifiedBadge({ verified }: { verified: boolean }) {
  const { t } = useLang();
  return verified
    ? <span className="text-[10px] font-bold bg-green-100 text-green-700 border border-green-200 px-1.5 py-0.5 rounded-full">✓ {t('محقق من مصدر رسمي', 'Verified from an official source')}</span>
    : <span className="text-[10px] font-bold bg-amber-100 text-amber-700 border border-amber-200 px-1.5 py-0.5 rounded-full">⚠ {t('غير متحقق منه', 'Unverified')}</span>;
}

const DOC_TYPE_COLORS: Record<string, string> = {
  'نظام': 'bg-blue-100 text-blue-800',
  'لائحة تنفيذية': 'bg-indigo-100 text-indigo-800',
  'قرار وزاري': 'bg-purple-100 text-purple-800',
  'تعميم': 'bg-amber-100 text-amber-800',
  'ضوابط': 'bg-teal-100 text-teal-800',
  'دليل إرشادي': 'bg-muted text-muted-foreground border border-secondary/30',
  'أمر ملكي': 'bg-red-100 text-red-800',
  'نموذج معتمد': 'bg-cyan-100 text-cyan-800',
};

const SEARCH_TYPES = [
  { id: 'comprehensive',   label: 'بحث شامل',                icon: '🔍', desc: 'تكييف + خريطة تشريعية + مواد + تعديلات' },
  { id: 'legislative-map', label: 'الخريطة التشريعية',       icon: '🗺️', desc: 'هيكل النظام ومستنداته المكملة بالكامل' },
  { id: 'temporal',        label: 'النص الواجب التطبيق زمنياً', icon: '📅', desc: 'أدخل تواريخ الواقعة لتحديد النسخة المطبّقة' },
  { id: 'article-lookup',  label: 'مادة محددة',              icon: '📋', desc: 'ابحث عن نص مادة بعينها بالرقم أو الموضوع' },
  { id: 'definition',      label: 'تعريف مصطلح',             icon: '📖', desc: 'التعريف النظامي في كل قانون عرّفه' },
];

function SectionHeader({ icon, title, count }: { icon: React.ReactNode; title: string; count?: number }) {
  return (
    <div className="flex items-center gap-2 px-4 py-2.5 bg-primary/5 border-b border-secondary/30">
      {icon}
      <span className="text-sm font-bold text-primary">{title}</span>
      {count !== undefined && <span className="text-xs text-muted-foreground bg-muted px-2 py-0.5 rounded-full">{count}</span>}
    </div>
  );
}

function RegulatoryResearcher() {
  const { isAuthenticated } = useAuth();
  const { lang, t } = useLang();
  const [, setLocation] = useLocation();

  const [query, setQuery] = useState('');
  const [searchType, setSearchType] = useState('comprehensive');
  const [relationDate, setRelationDate] = useState('');
  const [incidentDate, setIncidentDate] = useState('');
  const [claimDate, setClaimDate] = useState('');

  const [result, setResult] = useState<RegulatoryResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [upgradeRequired, setUpgradeRequired] = useState(false);
  const [loadingStep, setLoadingStep] = useState(0);
  const [livePhase, setLivePhase] = useState<'searching' | 'generating' | null>(null);
  const [expandedArticles, setExpandedArticles] = useState<Record<number, boolean>>({});
  const loadingTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const esRef = useRef<EventSource | null>(null);

  const LOADING_STEPS = [
    t('جارٍ توسيع الاستعلام بالمرادفات القانونية...', 'Expanding the query with legal synonyms...'),
    t('جارٍ البحث في بوابة هيئة الخبراء (laws.boe.gov.sa)...', 'Searching the Bureau of Experts portal (laws.boe.gov.sa)...'),
    t('جارٍ البحث في اللوائح التنفيذية والتعديلات...', 'Searching implementing regulations and amendments...'),
    t('جارٍ البحث في التعاميم والقرارات الوزارية...', 'Searching circulars and ministerial decisions...'),
    t('جارٍ استخراج الخريطة التشريعية والتحقق من المواد...', 'Building the legislative map and verifying provisions...'),
  ];

  const handleSearch = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!query.trim() || loading) return;
    if (!isAuthenticated) { setLocation(`/login?returnTo=${encodeURIComponent(window.location.pathname + window.location.search)}`); return; }

    const requestId = crypto.randomUUID();

    // Open SSE connection before POSTing so we catch the first phase event
    const es = new EventSource(`${API_BASE}/api/knowledge/research-status/${requestId}`, { withCredentials: true });
    esRef.current = es;
    es.onmessage = (ev) => {
      try {
        const data = JSON.parse(ev.data);
        if (data.phase === 'done') { setLivePhase(null); es.close(); }
        else if (data.phase === 'searching' || data.phase === 'generating') setLivePhase(data.phase);
      } catch { /* ignore */ }
    };
    es.onerror = () => { setLivePhase(null); es.close(); };

    setLoading(true); setError(''); setUpgradeRequired(false); setResult(null);
    setLoadingStep(0); setExpandedArticles({}); setLivePhase(null);
    loadingTimerRef.current = setInterval(() => {
      setLoadingStep(s => Math.min(s + 1, LOADING_STEPS.length - 1));
    }, 3200);

    try {
      const res = await fetch(`${API_BASE}/api/knowledge/regulatory-research`, {
        method: 'POST', credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query, searchType, relationDate, incidentDate, claimDate, requestId }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        if (err.code === 'UPGRADE_REQUIRED') { setUpgradeRequired(true); return; }
        throw new Error(err.error || 'فشل البحث');
      }
      setResult(await res.json());
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
      setLivePhase(null);
      esRef.current?.close(); esRef.current = null;
      if (loadingTimerRef.current) clearInterval(loadingTimerRef.current);
    }
  };

  return (
    <div className="space-y-5" dir={lang === 'ar' ? 'rtl' : 'ltr'}>

      {/* ── Header ── */}
      <div className="bg-gradient-to-r from-blue-50 to-indigo-50 border border-blue-200 rounded-2xl p-4">
        <p className="font-bold text-blue-900 text-sm mb-2">⚖️ {t('الباحث النظامي المحترف', 'Professional Regulatory Researcher')}</p>
        <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-xs text-blue-800/70">
          <span>🗺️ {t('خريطة تشريعية متكاملة', 'Complete legislative map')}</span>
          <span>📜 {t('مواد بنصوصها + التحقق منها', 'Provisions with text and verification')}</span>
          <span>🔄 {t('تتبع التعديلات والمراسيم', 'Amendment and decree tracking')}</span>
          <span>📅 {t('النص الواجب التطبيق زمنياً', 'Temporally applicable text')}</span>
          <span>🔍 {t('توسيع بالمرادفات القانونية', 'Legal synonym expansion')}</span>
          <span>✓ {t('قواعد جلب إلزامية محدّثة', 'Updated mandatory retrieval rules')}</span>
        </div>
      </div>

      {/* ── Search type selector ── */}
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
        {SEARCH_TYPES.map(st => (
          <button
            key={st.id}
            onClick={() => setSearchType(st.id)}
            className={cn(
              'text-start px-3 py-2.5 rounded-xl border text-xs transition-all',
              searchType === st.id
                ? 'bg-primary text-primary-foreground border-primary shadow-sm'
                : 'border-secondary/40 hover:border-secondary hover:bg-secondary/5'
            )}
          >
            <div className="font-bold mb-0.5">{st.icon} {t(st.label, st.label === 'بحث شامل' ? 'Comprehensive search' : st.label === 'الخريطة التشريعية' ? 'Legislative map' : st.label === 'النص الواجب التطبيق زمنياً' ? 'Temporal applicability' : st.label === 'مادة محددة' ? 'Specific provision' : 'Term definition')}</div>
            <div className={cn('text-[10px] leading-tight', searchType === st.id ? 'opacity-80' : 'text-muted-foreground')}>
              {t(st.desc, st.id === 'comprehensive' ? 'Classification, map, provisions, and amendments' : st.id === 'legislative-map' ? 'The law structure and all complementary documents' : st.id === 'temporal' ? 'Enter incident dates to identify the applicable version' : st.id === 'article-lookup' ? 'Find a provision by its number or subject' : 'The statutory definition in every law that defines it')}
            </div>
          </button>
        ))}
      </div>

      {/* ── Form ── */}
      <form onSubmit={handleSearch} className="space-y-3">
        <textarea
          value={query} onChange={e => setQuery(e.target.value)}
          rows={3} disabled={loading}
          placeholder={
            searchType === 'article-lookup'  ? t('مثال: المادة 77 نظام العمل — أو: شروط انتهاء عقد العمل في نظام العمل', 'Example: Article 77 of the Labour Law — or conditions for ending an employment contract') :
            searchType === 'definition'      ? t('مثال: تعريف "المنشأة" في الأنظمة السعودية — أو: ما المقصود بالعامل؟', 'Example: definition of “establishment” in Saudi laws — or what is meant by worker?') :
            searchType === 'temporal'        ? t('مثال: نظام الشركات — أدخل التواريخ أدناه لتحديد النسخة المطبّقة', 'Example: Companies Law — enter dates below to identify the applicable version') :
            searchType === 'legislative-map' ? t('مثال: نظام العمل — أو: نظام مكافحة الغش التجاري', 'Example: Labour Law — or Anti-Commercial Fraud Law') :
            t('مثال: نظام الإيجار التمويلي — أو: شروط الفسخ في نظام التأمين', 'Example: Finance Lease Law — or termination conditions in insurance law')
          }
          className="w-full border-2 border-secondary/60 rounded-2xl px-4 py-3 text-sm outline-none focus:outline-none focus:ring-0 focus:border-secondary transition-colors resize-none bg-background"
        />

        {/* Date inputs for temporal applicability */}
        {searchType === 'temporal' && (
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 p-3 bg-amber-50 border border-amber-200 rounded-xl">
            <div>
              <label className="text-xs font-semibold text-amber-800 mb-1 block">{t('تاريخ نشوء العلاقة', 'Relationship start date')}</label>
              <input type="text" value={relationDate} onChange={e => setRelationDate(e.target.value)}
                placeholder={t('مثال: 1443/05/01 هـ', 'Example: 1443/05/01 AH')}
                className="w-full text-xs px-3 py-2 rounded-lg border border-amber-200 bg-white focus:outline-none focus:border-amber-400" />
            </div>
            <div>
              <label className="text-xs font-semibold text-amber-800 mb-1 block">{t('تاريخ الواقعة', 'Incident date')}</label>
              <input type="text" value={incidentDate} onChange={e => setIncidentDate(e.target.value)}
                placeholder={t('مثال: 1444/08/15 هـ', 'Example: 1444/08/15 AH')}
                className="w-full text-xs px-3 py-2 rounded-lg border border-amber-200 bg-white focus:outline-none focus:border-amber-400" />
            </div>
            <div>
              <label className="text-xs font-semibold text-amber-800 mb-1 block">{t('تاريخ المطالبة', 'Claim date')}</label>
              <input type="text" value={claimDate} onChange={e => setClaimDate(e.target.value)}
                placeholder={t('مثال: 1445/01/10 هـ', 'Example: 1445/01/10 AH')}
                className="w-full text-xs px-3 py-2 rounded-lg border border-amber-200 bg-white focus:outline-none focus:border-amber-400" />
            </div>
          </div>
        )}

        <button type="submit" disabled={!query.trim() || loading}
          className="w-full h-12 bg-primary text-primary-foreground rounded-xl font-bold text-sm hover:bg-primary/90 disabled:opacity-50 flex items-center justify-center gap-2">
          {loading
            ? <><Loader2 className="w-4 h-4 animate-spin" /><span className="text-xs">{LOADING_STEPS[loadingStep]}</span></>
            : <><Search className="w-4 h-4" />{t('ابدأ البحث النظامي', 'Start regulatory research')}</>}
        </button>
      </form>

      {/* ── Live search indicator ── */}
      {loading && livePhase === 'searching' && (
        <div className="flex items-center gap-2 px-4 py-2.5 bg-blue-50 border border-blue-200 rounded-xl shadow-sm">
          <span className="text-lg leading-none animate-pulse">🌐</span>
          <span className="text-xs font-semibold text-blue-700">{t('جارٍ البحث في الإنترنت…', 'Searching the web…')}</span>
          <div className="flex items-center gap-1 mr-1">
            {[0, 1, 2].map(i => (
              <div key={i} className="w-1.5 h-1.5 rounded-full bg-blue-400 animate-bounce"
                style={{ animationDelay: `${i * 0.15}s` }} />
            ))}
          </div>
        </div>
      )}

      {/* ── Upgrade ── */}
      {upgradeRequired && (
        <div className="p-5 bg-primary/5 border-2 border-primary/30 rounded-2xl text-center">
          <Lock className="w-8 h-8 text-primary mx-auto mb-2" />
          <p className="font-bold text-primary mb-1">{t('خدمة مدفوعة', 'Paid service')}</p>
          <p className="text-muted-foreground text-xs mb-3">{t('الباحث النظامي المحترف متاح للمشتركين فقط', 'Professional Regulatory Research is available to subscribers only')}</p>
          <Link href="/pricing"><button className="px-5 py-2 bg-primary text-primary-foreground rounded-xl font-bold text-sm hover:bg-primary/90">{t('ترقية الباقة', 'Upgrade plan')}</button></Link>
        </div>
      )}

      {/* ── Error ── */}
      {error && <div className="p-3 bg-destructive/10 border border-destructive/30 rounded-xl text-sm text-destructive">{localizedAuthError(error, t)}</div>}

      {/* ══════════ RESULTS ══════════ */}
      {result && (
        <div className="space-y-4">

          {/* Disclaimer */}
          <div className="flex items-start gap-2 bg-amber-50 border border-amber-200 rounded-xl px-3 py-2.5">
            <AlertTriangle className="w-3.5 h-3.5 text-amber-500 shrink-0 mt-0.5" />
            <p className="text-[11px] text-amber-800 leading-snug">{t('النتائج استُخلصت من مصادر رسمية مجلوبة بتاريخ', 'Results were extracted from official sources retrieved on')} {new Date(result.fetchedAt).toLocaleDateString(lang === 'ar' ? 'ar-SA' : 'en-US')} — {t('للاستئناس لا للاعتماد وحده. تحقق من laws.boe.gov.sa قبل الاستشهاد.', 'for guidance only, not sole reliance. Verify laws.boe.gov.sa before citing.')}</p>
          </div>

          {/* Audit badge */}
          <AuditBadge status={result.auditStatus} notes={result.auditNotes} />

          {/* Keywords + synonyms */}
          {(result.keywords?.length > 0 || result.synonymsUsed?.length > 0) && (
            <div className="flex flex-wrap gap-1.5">
              {result.keywords?.map((k, i) => (
                <span key={i} className="px-2 py-0.5 text-xs bg-primary/10 text-primary rounded-full">{k}</span>
              ))}
              {result.synonymsUsed?.slice(0, 6).map((s, i) => (
                <span key={i} className="px-2 py-0.5 text-xs bg-muted text-muted-foreground rounded-full border border-secondary/30">↔ {s}</span>
              ))}
            </div>
          )}

          {/* Legal classification + question */}
          {(result.legalClassification || result.legalQuestion) && (
            <div className="bg-card border border-secondary/40 rounded-2xl overflow-hidden shadow-sm">
              <SectionHeader icon={<Scale className="w-4 h-4 text-primary" />} title={t('التكييف القانوني والسؤال النظامي', 'Legal classification and question')} />
              <div className="p-4 space-y-3">
                {result.legalClassification && (
                  <div>
                    <p className="text-xs font-bold text-muted-foreground mb-1">{t('التكييف القانوني', 'Legal classification')}</p>
                    <p className="text-sm leading-relaxed" dir="auto">{result.legalClassification}</p>
                  </div>
                )}
                {result.legalQuestion && (
                  <div>
                    <p className="text-xs font-bold text-muted-foreground mb-1">{t('السؤال النظامي الدقيق', 'Precise legal question')}</p>
                    <p className="text-sm leading-relaxed text-primary/90 font-medium" dir="auto">{result.legalQuestion}</p>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Main law */}
          {result.mainLaw && result.mainLaw.name && result.mainLaw.name !== 'غير محدد' && (
            <div className="bg-card border-2 border-primary/20 rounded-2xl overflow-hidden shadow-sm">
              <SectionHeader icon={<ScrollText className="w-4 h-4 text-primary" />} title={t('النظام الرئيسي', 'Main law')} />
              <div className="p-4">
                <div className="flex flex-wrap items-center gap-2 mb-3">
                  <span className="text-base font-bold text-foreground" dir="auto">{result.mainLaw.name}</span>
                  <StatusPill status={result.mainLaw.status} />
                  <VerifiedBadge verified={result.mainLaw.verified} />
                </div>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
                  {result.mainLaw.issuingDecree && result.mainLaw.issuingDecree !== 'غير محدد' && (
                    <div className="bg-muted/40 rounded-lg px-3 py-2">
                      <p className="font-semibold text-muted-foreground mb-0.5">{t('أداة الإصدار', 'Issuing instrument')}</p>
                      <p className="text-foreground font-medium" dir="auto">{result.mainLaw.issuingDecree}</p>
                    </div>
                  )}
                  {result.mainLaw.publishDate && result.mainLaw.publishDate !== 'غير محدد' && (
                    <div className="bg-muted/40 rounded-lg px-3 py-2">
                      <p className="font-semibold text-muted-foreground mb-0.5">{t('تاريخ النشر (أم القرى)', 'Publication date (Umm Al-Qura)')}</p>
                      <p className="text-foreground font-medium" dir="auto">{result.mainLaw.publishDate}</p>
                    </div>
                  )}
                  {result.mainLaw.effectiveDate && result.mainLaw.effectiveDate !== 'غير محدد' && (
                    <div className="bg-muted/40 rounded-lg px-3 py-2">
                      <p className="font-semibold text-muted-foreground mb-0.5">{t('تاريخ النفاذ', 'Effective date')}</p>
                      <p className="text-foreground font-medium" dir="auto">{result.mainLaw.effectiveDate}</p>
                    </div>
                  )}
                  {result.mainLaw.issuingAuthority && result.mainLaw.issuingAuthority !== 'غير محدد' && (
                    <div className="bg-muted/40 rounded-lg px-3 py-2">
                      <p className="font-semibold text-muted-foreground mb-0.5">{t('جهة الإصدار', 'Issuing authority')}</p>
                      <p className="text-foreground font-medium" dir="auto">{result.mainLaw.issuingAuthority}</p>
                    </div>
                  )}
                </div>
                {result.mainLaw.sourceUrl && (
                  <a href={result.mainLaw.sourceUrl} target="_blank" rel="noopener noreferrer"
                    className="mt-3 inline-flex items-center gap-1 text-xs text-blue-600 hover:underline">
                    <ExternalLink className="w-3 h-3" />{t('المصدر الرسمي', 'Official source')}
                  </a>
                )}
              </div>
            </div>
          )}

          {/* Legislative map */}
          {result.legislativeMap?.length > 0 && (
            <div className="bg-card border border-secondary/40 rounded-2xl overflow-hidden shadow-sm">
              <SectionHeader icon={<Layers className="w-4 h-4 text-primary" />} title={t('الخريطة التشريعية', 'Legislative map')} count={result.legislativeMap.length} />
              <div className="divide-y divide-border/40">
                {result.legislativeMap.map((item, i) => (
                  <div key={i} className="px-4 py-3 flex flex-wrap items-start gap-2">
                    <span className={cn('px-2 py-0.5 rounded-full text-[10px] font-bold shrink-0', DOC_TYPE_COLORS[item.type] ?? 'bg-muted text-muted-foreground')}>
                      <span dir="auto">{item.type}</span>
                    </span>
                    <div className="flex-1 min-w-0">
                      <div className="flex flex-wrap items-center gap-2 mb-0.5">
                        <span className="text-sm font-semibold text-foreground" dir="auto">{item.name}</span>
                        <StatusPill status={item.status} />
                        {!item.verified && <span className="text-[10px] text-amber-700 bg-amber-50 border border-amber-100 rounded px-1">⚠ غير متحقق</span>}
                      </div>
                        <p className="text-xs text-muted-foreground leading-relaxed" dir="auto">{item.relation}</p>
                      <div className="flex flex-wrap gap-3 mt-1 text-xs text-muted-foreground/80">
                        {item.issuingDecree && item.issuingDecree !== 'غير محدد' && <span dir="auto">📄 {item.issuingDecree}</span>}
                        {item.date && item.date !== 'غير محدد' && <span dir="auto">📅 {item.date}</span>}
                        {item.sourceUrl && (
                          <a href={item.sourceUrl} target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:underline flex items-center gap-0.5">
                            <ExternalLink className="w-2.5 h-2.5" />{t('رابط', 'Link')}
                          </a>
                        )}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Amendments timeline */}
          {result.amendments?.length > 0 && (
            <div className="bg-card border border-secondary/40 rounded-2xl overflow-hidden shadow-sm">
              <SectionHeader icon={<Clock className="w-4 h-4 text-primary" />} title={t('تتبع التعديلات', 'Amendment tracking')} count={result.amendments.length} />
              <div className="relative p-4">
                <div className="absolute right-6 top-4 bottom-4 w-0.5 bg-border/60" />
                <div className="space-y-4">
                  {result.amendments.map((a, i) => (
                    <div key={i} className="flex gap-4 relative">
                      <div className="w-5 h-5 rounded-full bg-primary/20 border-2 border-primary/40 flex items-center justify-center shrink-0 mt-0.5 relative z-10">
                        <span className="text-[8px] font-bold text-primary">{i + 1}</span>
                      </div>
                      <div className="flex-1 bg-muted/20 border border-secondary/20 rounded-xl px-4 py-3">
                        <div className="flex flex-wrap items-center gap-2 mb-2">
                          {a.date && a.date !== 'غير محدد' && (
                            <span className="text-xs font-bold text-primary bg-primary/10 px-2 py-0.5 rounded-lg" dir="auto">{a.date}</span>
                          )}
                          {a.decree && a.decree !== 'غير محدد' && (
                            <span className="text-xs text-muted-foreground" dir="auto">{a.decree}</span>
                          )}
                          {!a.verified && <span className="text-[10px] text-amber-700 bg-amber-50 border border-amber-100 rounded px-1">⚠ غير متحقق</span>}
                        </div>
                        <p className="text-sm text-foreground/90 leading-relaxed mb-1.5" dir="auto">{a.description}</p>
                        <div className="flex flex-wrap gap-3 text-xs text-muted-foreground/70">
                          {a.articles && a.articles !== 'غير محدد' && <span>{t('المواد:', 'Provisions:')} <span dir="auto">{a.articles}</span></span>}
                          {a.publishDate && a.publishDate !== 'غير محدد' && <span>{t('نُشر:', 'Published:')} <span dir="auto">{a.publishDate}</span></span>}
                          {a.effectiveDate && a.effectiveDate !== 'غير محدد' && <span>{t('نفذ:', 'Effective:')} <span dir="auto">{a.effectiveDate}</span></span>}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* Applicable articles */}
          {result.applicableArticles?.length > 0 && (
            <div className="bg-card border border-secondary/40 rounded-2xl overflow-hidden shadow-sm">
              <SectionHeader icon={<BookOpen className="w-4 h-4 text-primary" />} title={t('المواد المنطبقة بنصوصها', 'Applicable provisions, verbatim')} count={result.applicableArticles.length} />
              <div className="divide-y divide-border/40">
                {result.applicableArticles.map((art, i) => {
                  const expanded = expandedArticles[i] ?? false;
                  const isLong = art.articleText?.length > 250;
                  return (
                    <div key={i} className={cn('px-4 py-4', !art.verified && 'bg-amber-50/30')}>
                      <div className="flex flex-wrap items-center gap-2 mb-2">
                        <span className="text-xs font-bold bg-primary/10 text-primary px-2 py-0.5 rounded-lg">{t('مادة', 'Article')} <span dir="auto">{art.articleNumber}</span></span>
                        <span className="text-xs font-semibold text-foreground/80" dir="auto">{art.law}</span>
                        <VerifiedBadge verified={art.verified} />
                      </div>
                      {art.articleText && (
                        <div className={cn('text-xs leading-relaxed bg-muted/30 rounded-xl px-3 py-2.5 mb-2 font-mono-arabic border-r-2',
                          art.verified ? 'border-primary/40' : 'border-amber-400',
                          !expanded && isLong && 'max-h-20 overflow-hidden relative')} dir="auto">
                          {art.verified ? `"${art.articleText}"` : art.articleText}
                          {!expanded && isLong && (
                            <div className="absolute bottom-0 inset-x-0 h-8 bg-gradient-to-t from-muted/20 to-transparent" />
                          )}
                        </div>
                      )}
                      {isLong && (
                        <button onClick={() => setExpandedArticles(p => ({ ...p, [i]: !p[i] }))}
                          className="text-xs text-primary hover:underline mb-1.5">
                          {expanded ? t('▲ طيّ', '▲ Collapse') : t('▼ عرض كامل', '▼ Show full text')}
                        </button>
                      )}
                      {!art.verified && (
                        <p className="text-[10px] text-amber-700 bg-amber-50 border border-amber-100 rounded px-2 py-1 mb-1.5">
                          ⚠️ {t('لم يُعثر على هذا النص في المصادر المُجلبة — تحقق من:', 'This text was not found in retrieved sources — verify at:')}{' '}
                          <a href={art.sourceUrl ?? 'https://laws.boe.gov.sa'} target="_blank" rel="noopener noreferrer" className="underline font-semibold">laws.boe.gov.sa</a>
                        </p>
                      )}
                      {art.relevance && (
                          <p className="text-xs text-muted-foreground"><span className="font-semibold text-foreground/70">{t('وجه الانطباق:', 'Applicability:')} </span><span dir="auto">{art.relevance}</span></p>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Temporal applicability */}
          {result.temporalApplicability && (
            <div className="bg-amber-50 border border-amber-200 rounded-2xl overflow-hidden">
              <SectionHeader icon={<Calendar className="w-4 h-4 text-amber-700" />} title={t('النص الواجب التطبيق زمنياً', 'Temporally applicable text')} />
              <div className="p-4 space-y-2">
                <div className="bg-white/80 border border-amber-100 rounded-xl px-3 py-2">
                  <p className="text-xs font-bold text-amber-800 mb-1">{t('النسخة المطبّقة', 'Applicable version')}</p>
                  <p className="text-sm font-semibold" dir="auto">{result.temporalApplicability.applicableVersion}</p>
                </div>
                <p className="text-xs text-amber-800 leading-relaxed" dir="auto">{result.temporalApplicability.reason}</p>
                {result.temporalApplicability.transitionalNote && (
                  <div className="bg-blue-50 border border-blue-100 rounded-lg px-3 py-2 text-xs text-blue-800">
                    📌 {t('أحكام انتقالية:', 'Transitional provisions:')} <span dir="auto">{result.temporalApplicability.transitionalNote}</span>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Conditions + exceptions */}
          {(result.conditions?.length > 0 || result.exceptions?.length > 0) && (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {result.conditions?.length > 0 && (
                <div className="bg-card border border-secondary/40 rounded-2xl overflow-hidden shadow-sm">
                  <SectionHeader icon={<ShieldCheck className="w-4 h-4 text-green-600" />} title={t('شروط التطبيق', 'Conditions for application')} />
                  <ul className="p-4 space-y-2">
                    {result.conditions.map((c, i) => (
                      <li key={i} className="flex items-start gap-2 text-xs">
                        <span className="text-green-600 font-bold mt-0.5 shrink-0">✓</span><span dir="auto">{c}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
              {result.exceptions?.length > 0 && (
                <div className="bg-card border border-secondary/40 rounded-2xl overflow-hidden shadow-sm">
                  <SectionHeader icon={<AlertTriangle className="w-4 h-4 text-amber-600" />} title={t('الاستثناءات', 'Exceptions')} />
                  <ul className="p-4 space-y-2">
                    {result.exceptions.map((ex, i) => (
                      <li key={i} className="flex items-start gap-2 text-xs">
                        <span className="text-amber-600 font-bold mt-0.5 shrink-0">⚡</span><span dir="auto">{ex}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          )}

          {/* Application analysis + conclusion */}
          {(result.applicationAnalysis || result.conclusion) && (
            <div className="bg-card border border-secondary/40 rounded-2xl overflow-hidden shadow-sm">
              <SectionHeader icon={<Gavel className="w-4 h-4 text-primary" />} title={t('وجه الانطباق والخلاصة النظامية', 'Application and legal conclusion')} />
              <div className="p-4 space-y-3">
                {result.applicationAnalysis && (
                  <div>
                    <p className="text-xs font-bold text-muted-foreground mb-1">{t('وجه الانطباق على الواقعة', 'Application to the facts')}</p>
                    <p className="text-sm leading-relaxed" dir="auto">{result.applicationAnalysis}</p>
                  </div>
                )}
                {result.conclusion && (
                  <div className="bg-primary/5 border-r-4 border-primary/40 rounded-r-xl px-4 py-3">
                    <p className="text-xs font-bold text-primary mb-1">{t('الخلاصة النظامية', 'Legal conclusion')}</p>
                    <p className="text-sm leading-relaxed font-medium" dir="auto">{result.conclusion}</p>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Conflicts */}
          {result.conflicts?.filter(Boolean).length > 0 && (
            <div className="bg-red-50 border border-red-200 rounded-2xl overflow-hidden">
              <SectionHeader icon={<TriangleAlert className="w-4 h-4 text-red-600" />} title={t('التعارضات النظامية المحتملة', 'Potential legal conflicts')} />
              <ul className="p-4 space-y-2">
                {result.conflicts.map((c, i) => (
                  <li key={i} className="flex items-start gap-2 text-xs text-red-900">
                    <span className="text-red-600 font-bold shrink-0 mt-0.5">⚠</span><span dir="auto">{c}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* Pending issues */}
          {result.pendingIssues?.filter(Boolean).length > 0 && (
            <div className="bg-blue-50 border border-blue-200 rounded-2xl overflow-hidden">
              <SectionHeader icon={<Search className="w-4 h-4 text-blue-700" />} title={t('مسائل تحتاج بحثاً إضافياً', 'Issues requiring further research')} />
              <ul className="p-4 space-y-2">
                {result.pendingIssues.map((p, i) => (
                  <li key={i} className="flex items-start gap-2 text-xs text-blue-900">
                    <span className="text-blue-600 font-bold shrink-0 mt-0.5">→</span><span dir="auto">{p}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* Sources */}
          {result.sources?.length > 0 && (
            <div className="bg-card border border-secondary/40 rounded-2xl overflow-hidden shadow-sm">
              <SectionHeader icon={<BookMarked className="w-4 h-4 text-primary" />} title={t('المصادر الرسمية المُجلبة', 'Retrieved official sources')} count={result.sources.length} />
              <div className="p-4 space-y-2">
                {result.sources.map((s, i) => (
                  <div key={i} className="flex items-start gap-2 text-xs border border-secondary/20 rounded-lg px-3 py-2.5 bg-muted/20">
                    <div className="flex-1 min-w-0">
                      <a href={s.url} target="_blank" rel="noopener noreferrer"
                        className="font-semibold text-primary hover:underline flex items-center gap-1 truncate">
                        <ExternalLink className="w-3 h-3 shrink-0" /><span dir="auto">{s.title || s.url}</span>
                      </a>
                      {s.content && (
                        <p className="text-muted-foreground mt-0.5 leading-relaxed line-clamp-2" dir="auto">{s.content}</p>
                      )}
                    </div>
                    <span className="shrink-0 text-[10px] text-muted-foreground/60 whitespace-nowrap">
                      {new Date(s.fetchedAt).toLocaleDateString(lang === 'ar' ? 'ar-SA' : 'en-US')}
                    </span>
                  </div>
                ))}
                <p className="text-[10px] text-muted-foreground pt-1">
                  📅 {t('تاريخ آخر تحقق:', 'Last verified:')} {new Date(result.fetchedAt).toLocaleString(lang === 'ar' ? 'ar-SA' : 'en-US')}
                </p>
              </div>
            </div>
          )}

        </div>
      )}
    </div>
  );
}

// ── Contract drafter ──────────────────────────────────────────────────────────
const CONTRACT_DRAFT_KEY = 'rabab_contract_draft_v1';

interface SavedContractDraft {
  description: string;
  draft: string;
  editedDraft: string;
  savedAt: string;
}

function ContractDrafter() {
  const { isAuthenticated } = useAuth();
  const { t } = useLang();
  const [, setLocation] = useLocation();
  const [description, setDescription] = useState('');
  const [draft, setDraft] = useState('');
  const [editedDraft, setEditedDraft] = useState('');
  const [isEditing, setIsEditing] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [upgradeRequired, setUpgradeRequired] = useState(false);
  const [copied, setCopied] = useState(false);
  const [exportingPdf, setExportingPdf] = useState(false);
  const [showOverwriteConfirm, setShowOverwriteConfirm] = useState(false);

  // saved-draft banner (sourced from DB when logged in, else localStorage)
  const [savedDraft, setSavedDraft] = useState<SavedContractDraft | null>(null);
  const [showResumeBanner, setShowResumeBanner] = useState(false);

  // ── Helper: persist to DB (fire-and-forget, best-effort) ────────────────────
  const syncToDb = useCallback((payload: { description: string; draft: string; editedDraft: string }) => {
    if (!isAuthenticated) return;
    fetch(`${API_BASE}/api/knowledge/contract-draft`, {
      method: 'PUT',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    }).catch(() => {});
  }, [isAuthenticated]);

  const deleteFromDb = useCallback(() => {
    if (!isAuthenticated) return;
    fetch(`${API_BASE}/api/knowledge/contract-draft`, {
      method: 'DELETE',
      credentials: 'include',
    }).catch(() => {});
  }, [isAuthenticated]);

  // ── On mount: load saved draft — DB first for logged-in users, else localStorage ──
  useEffect(() => {
    if (isAuthenticated) {
      fetch(`${API_BASE}/api/knowledge/contract-draft`, { credentials: 'include' })
        .then(r => r.ok ? r.json() : null)
        .then(data => {
          const d = data?.draft;
          if (d && (d.draft || d.editedDraft)) {
            setSavedDraft({
              description: d.description ?? '',
              draft: d.draft ?? '',
              editedDraft: d.editedDraft ?? '',
              savedAt: d.updatedAt ?? new Date().toISOString(),
            });
            setShowResumeBanner(true);
          } else {
            // Fall back to localStorage in case user just logged in
            try {
              const raw = localStorage.getItem(CONTRACT_DRAFT_KEY);
              if (raw) {
                const parsed: SavedContractDraft = JSON.parse(raw);
                if (parsed.draft || parsed.editedDraft) {
                  setSavedDraft(parsed);
                  setShowResumeBanner(true);
                }
              }
            } catch { /* ignore */ }
          }
        })
        .catch(() => {
          // Network error — fall back to localStorage
          try {
            const raw = localStorage.getItem(CONTRACT_DRAFT_KEY);
            if (raw) {
              const parsed: SavedContractDraft = JSON.parse(raw);
              if (parsed.draft || parsed.editedDraft) {
                setSavedDraft(parsed);
                setShowResumeBanner(true);
              }
            }
          } catch { /* ignore */ }
        });
    } else {
      try {
        const raw = localStorage.getItem(CONTRACT_DRAFT_KEY);
        if (raw) {
          const parsed: SavedContractDraft = JSON.parse(raw);
          if (parsed.draft || parsed.editedDraft) {
            setSavedDraft(parsed);
            setShowResumeBanner(true);
          }
        }
      } catch { /* ignore */ }
    }
  }, [isAuthenticated]);

  // ── Persist draft whenever it changes ────────────────────────────────────────
  useEffect(() => {
    if (!draft && !editedDraft) return;
    const payload: SavedContractDraft = {
      description,
      draft,
      editedDraft,
      savedAt: new Date().toISOString(),
    };
    // Always keep localStorage as fast local layer
    try { localStorage.setItem(CONTRACT_DRAFT_KEY, JSON.stringify(payload)); } catch { /* quota */ }
    // Sync to DB for logged-in users
    syncToDb({ description, draft, editedDraft });
  }, [draft, editedDraft, description]);

  const resumeSavedDraft = () => {
    if (!savedDraft) return;
    setDescription(savedDraft.description);
    setDraft(savedDraft.draft);
    setEditedDraft(savedDraft.editedDraft);
    setShowResumeBanner(false);
    setSavedDraft(null);
  };

  const clearSavedDraft = () => {
    localStorage.removeItem(CONTRACT_DRAFT_KEY);
    deleteFromDb();
    setShowResumeBanner(false);
    setSavedDraft(null);
  };

  const startFresh = () => {
    localStorage.removeItem(CONTRACT_DRAFT_KEY);
    deleteFromDb();
    setDescription('');
    setDraft('');
    setEditedDraft('');
    setIsEditing(false);
    setError('');
    setUpgradeRequired(false);
    setSavedDraft(null);
    setShowResumeBanner(false);
  };

  const handleDraft = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!description.trim() || loading) return;
    if (!isAuthenticated) { setLocation(`/login?returnTo=${encodeURIComponent(window.location.pathname + window.location.search)}`); return; }
    // If there are unsaved edits, ask for confirmation before overwriting
    const hasUnsavedEdits = !!draft && editedDraft !== draft;
    if (hasUnsavedEdits && !showOverwriteConfirm) {
      setShowOverwriteConfirm(true);
      return;
    }
    setShowOverwriteConfirm(false);
    setLoading(true);
    setError('');
    setUpgradeRequired(false);
    setDraft('');
    setEditedDraft('');
    setIsEditing(false);
    // Clear any old saved draft so we don't offer to resume the old one
    localStorage.removeItem(CONTRACT_DRAFT_KEY);
    deleteFromDb();
    try {
      const res = await fetch(`${API_BASE}/api/knowledge/draft-contract`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ description }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        if (err.code === 'UPGRADE_REQUIRED') { setUpgradeRequired(true); return; }
        throw new Error(err.error || 'فشل توليد العقد');
      }
      const data = await res.json();
      const newDraft = data.draft ?? '';
      setDraft(newDraft);
      setEditedDraft(newDraft);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const activeDraft = editedDraft || draft;

  const copyDraft = () => {
    navigator.clipboard.writeText(activeDraft).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  };

  const saveEdits = () => {
    setIsEditing(false);
  };

  const exportPdf = () => {
    setExportingPdf(true);
    try {
      const win = window.open('', '_blank');
      if (!win) { setExportingPdf(false); return; }
      const escaped = activeDraft
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;');
      // The print document is intentionally Arabic-native because the generated legal
      // draft is exported as an Arabic legal document, independently of the app UI.
      win.document.write(`<!DOCTYPE html>
<html dir="rtl" lang="ar">
<head>
  <meta charset="UTF-8"/>
  <title>مسودة العقد — RABAB LEGAL AI</title>
  <style>
    @import url('https://fonts.googleapis.com/css2?family=Noto+Naskh+Arabic:wght@400;700&display=swap');
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body { font-family: 'Noto Naskh Arabic', 'Arial', sans-serif; direction: rtl; font-size: 13pt; line-height: 2; color: #1a1a1a; padding: 40px 50px; background: #fff; }
    header { border-bottom: 2px solid #1a1a2e; padding-bottom: 12px; margin-bottom: 24px; }
    header h1 { font-size: 16pt; font-weight: bold; }
    header p { font-size: 10pt; color: #555; margin-top: 4px; }
    pre { white-space: pre-wrap; font-family: inherit; font-size: 12pt; line-height: 2; }
    footer { margin-top: 32px; padding-top: 10px; border-top: 1px solid #ccc; font-size: 9pt; color: #888; text-align: center; }
    @media print { body { padding: 20px; } }
  </style>
</head>
<body>
  <header>
    <h1>مسودة العقد</h1>
    <p>RABAB LEGAL AI — ${new Date().toLocaleDateString('ar-SA')}</p>
  </header>
  <pre>${escaped}</pre>
  <footer>هذه المسودة لأغراض المراجعة فقط — يُنصح بمراجعة محامٍ مرخّص قبل الاستخدام الرسمي.</footer>
  <script>window.onload = function(){ window.print(); };<\/script>
</body>
</html>`);
      win.document.close();
    } finally {
      setExportingPdf(false);
    }
  };

  return (
    <div className="space-y-5">
      <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 text-sm text-amber-900">
        <p className="font-bold mb-1">📝 {t('كيف يعمل؟', 'How does it work?')}</p>
        <p>{t('صف العقد الذي تحتاجه (نوعه، الأطراف، الغرض، أي شروط خاصة) والذكاء الاصطناعي يصيغ مسودة قانونية جاهزة للمراجعة.', 'Describe the contract you need (type, parties, purpose, and special terms) and AI will draft a legal document ready for review.')}</p>
      </div>

      {/* ── Resume-draft banner ── */}
      {showResumeBanner && savedDraft && (
        <div className="flex items-start gap-3 bg-blue-50 border border-blue-200 rounded-xl px-4 py-3">
          <BookMarked className="w-5 h-5 text-blue-600 shrink-0 mt-0.5" />
          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold text-blue-900">{t('لديكِ مسودة محفوظة', 'You have a saved draft')}</p>
            <p className="text-xs text-blue-700 mt-0.5 truncate">
              {savedDraft.description ? `"${savedDraft.description.slice(0, 60)}${savedDraft.description.length > 60 ? '...' : ''}"` : t('مسودة عقد سابقة', 'Previous contract draft')}
              {savedDraft.savedAt && (
                <span className="mr-1 text-blue-500">
                  — {new Date(savedDraft.savedAt).toLocaleDateString('ar-SA', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
                </span>
              )}
            </p>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <button
              onClick={resumeSavedDraft}
              className="text-xs px-3 py-1.5 bg-blue-600 text-white rounded-lg font-semibold hover:bg-blue-700 transition-colors"
            >
              استئناف المسودة
            </button>
            <button
              onClick={clearSavedDraft}
              className="text-xs px-2.5 py-1.5 border border-blue-200 text-blue-600 rounded-lg hover:bg-blue-100 transition-colors"
            >
              تجاهل
            </button>
          </div>
        </div>
      )}

      {upgradeRequired && (
        <div className="p-5 bg-primary/5 border-2 border-primary/30 rounded-2xl text-center">
          <Lock className="w-8 h-8 text-primary mx-auto mb-2" />
          <p className="font-bold text-primary mb-1">{t('خدمة مدفوعة', 'Paid Service')}</p>
          <p className="text-muted-foreground text-xs mb-3">{t('صياغة العقود متاحة للمشتركين فقط', 'Contract drafting is available to subscribers only')}</p>
          <Link href="/pricing">
            <button className="px-5 py-2 bg-primary text-primary-foreground rounded-xl font-bold text-sm hover:bg-primary/90">
              ترقية الباقة
            </button>
          </Link>
        </div>
      )}

      {error && (
        <div className="p-3 bg-destructive/10 border border-destructive/30 rounded-xl text-sm text-destructive">{localizedAuthError(error, t)}</div>
      )}

      {/* ── Overwrite confirmation dialog ── */}
      {showOverwriteConfirm && (
        <div className="flex items-start gap-3 bg-amber-50 border border-amber-300 rounded-xl px-4 py-4">
          <TriangleAlert className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold text-amber-900">{t('لديكِ تعديلات — هل تريدين الاستمرار وفقد التعديلات؟', 'You have edits — do you want to continue and lose them?')}</p>
            <p className="text-xs text-amber-700 mt-0.5">{t('المسودة الحالية بها تعديلات غير محفوظة. صياغة عقد جديد ستحل محلها نهائياً.', 'The current draft has unsaved changes. Drafting a new contract will permanently replace it.')}</p>
            <div className="flex items-center gap-2 mt-3">
              <button
                type="button"
                onClick={() => {
                  // Proceed: submit the form programmatically
                  const fakeEvent = { preventDefault: () => {} } as React.FormEvent;
                  handleDraft(fakeEvent);
                }}
                className="text-xs px-3.5 py-1.5 bg-amber-600 text-white rounded-lg font-semibold hover:bg-amber-700 transition-colors"
              >
                صِغ من جديد
              </button>
              <button
                type="button"
                onClick={() => setShowOverwriteConfirm(false)}
                className="text-xs px-3.5 py-1.5 border border-amber-300 text-amber-800 rounded-lg hover:bg-amber-100 transition-colors"
              >
                إلغاء
              </button>
            </div>
          </div>
        </div>
      )}

      <form onSubmit={handleDraft} className="space-y-3">
        <textarea
          value={description}
          onChange={e => setDescription(e.target.value)}
          rows={4}
          placeholder="مثال: عقد خدمات بين شركة ومستشار لمدة سنة، يتضمن سرية معلومات وغرامة تأخير..."
          className="w-full border-2 border-secondary/60 rounded-2xl px-4 py-3 text-sm outline-none focus:outline-none focus:ring-0 focus:border-secondary transition-colors resize-none bg-background"
          disabled={loading}
        />
        <button
          type="submit"
          disabled={!description.trim() || loading}
          className="w-full h-12 bg-primary text-primary-foreground rounded-xl font-bold text-sm hover:bg-primary/90 disabled:opacity-50 flex items-center justify-center gap-2"
        >
          {loading
            ? <><Loader2 className="w-4 h-4 animate-spin" /> {t('جارٍ الصياغة...', 'Drafting...')}</>
            : <><Send className="w-4 h-4" /> {t('صِغ العقد', 'Draft Contract')}</>}
        </button>
      </form>

      {draft && (
        <div className="border border-secondary/40 rounded-2xl overflow-hidden shadow-sm">
          {/* Toolbar */}
          <div className="flex items-center justify-between px-4 py-2 bg-muted/50 border-b border-secondary/30 gap-2 flex-wrap">
            <span className="text-xs font-semibold text-primary">{t('مسودة العقد', 'Contract Draft')}</span>
            <div className="flex items-center gap-2">
              {/* Edit / Save toggle */}
              {!isEditing ? (
                <button
                  onClick={() => setIsEditing(true)}
                  className="flex items-center gap-1 text-xs px-2.5 py-1 rounded-lg bg-secondary/60 text-foreground hover:bg-secondary transition-colors"
                >
                  <FileEdit className="w-3.5 h-3.5" />
                  تعديل
                </button>
              ) : (
                <button
                  onClick={saveEdits}
                  className="flex items-center gap-1 text-xs px-2.5 py-1 rounded-lg bg-green-100 text-green-700 hover:bg-green-200 transition-colors font-semibold"
                >
                  <Check className="w-3.5 h-3.5" />
                  حفظ التعديلات
                </button>
              )}
              {/* Copy */}
              <button
                onClick={copyDraft}
                className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors"
              >
                {copied ? <Check className="w-3.5 h-3.5 text-green-600" /> : <Copy className="w-3.5 h-3.5" />}
                {copied ? t('تم النسخ', 'Copied') : t('نسخ', 'Copy')}
              </button>
              {/* PDF export */}
              <button
                onClick={exportPdf}
                disabled={exportingPdf}
                className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors disabled:opacity-50"
              >
                <FileDown className="w-3.5 h-3.5" />
                PDF
              </button>
              {/* Start fresh */}
              <button
                onClick={startFresh}
                className="flex items-center gap-1 text-xs text-destructive/70 hover:text-destructive transition-colors"
                title="مسح المسودة والبدء من جديد"
              >
                <X className="w-3.5 h-3.5" />
                بدء من جديد
              </button>
            </div>
          </div>

          {/* Body — read-only <pre> or editable <textarea> */}
          {isEditing ? (
            <textarea
              value={editedDraft}
              onChange={e => setEditedDraft(e.target.value)}
              className="w-full text-sm leading-relaxed p-5 font-sans text-foreground/90 bg-background border-none outline-none focus:ring-0 resize-y min-h-[40vh]"
              dir="auto"
              spellCheck={false}
            />
          ) : (
            <LegalMarkdown className="p-5" maxHeight="60vh">{activeDraft}</LegalMarkdown>
          )}

          <div className="px-4 py-3 bg-amber-50 border-t border-amber-100">
            <p className="text-xs text-amber-800">هذه الإجابة لا تعتبر ملزمة ويُنصح بمراجعة محامٍ مرخّص قبل الاستخدام الرسمي.</p>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Legal Research Report ─────────────────────────────────────────────────────
interface LegalOption {
  title: string; description: string; recommendation: string;
  pros?: string; cons?: string;
}
interface LegalReference { title: string; excerpt: string; source_type?: string; }
interface LegalArticle  { law: string; article: string; text: string; relevance: string; verified?: boolean; foundIn?: 'kb' | 'web'; }
interface ProcedureStep { step: number; action: string; authority: string; note?: string; }
interface KeyDeadline   { event: string; duration: string; source?: string; }

interface LegalReport {
  summary: string;
  articles: LegalArticle[];
  strengths: string[];
  weaknesses: string[];
  options: LegalOption[];
  procedure_steps: ProcedureStep[];
  key_deadlines: KeyDeadline[];
  memo: string;
  hasCitations?: boolean;
  citableCount?: number;
  references: LegalReference[];
  disclaimer?: string;
  sources_used?: { kb: number; web: number };
  verification?: {
    confidence: 'high' | 'medium' | 'low';
    verifiedArticles: number;
    totalArticles: number;
    sufficientSources: boolean;
    blockedCount: number;
    sources: Array<{ name: string; similarity: number; verified: boolean; snippet: string; sourceType: 'kb' | 'web'; url?: string }>;
    auditTs: string;
  };
}

function RecommendationBadge({ rec }: { rec: string }) {
  const r = rec?.trim();
  if (r === 'نافذ' || r === 'مناسب') return <span className="px-2 py-0.5 rounded-full text-xs font-bold bg-green-100 text-green-700">✓ {r}</span>;
  if (r === 'محدود') return <span className="px-2 py-0.5 rounded-full text-xs font-bold bg-amber-100 text-amber-700">⚡ {r}</span>;
  if (r === 'غير مناسب') return <span className="px-2 py-0.5 rounded-full text-xs font-bold bg-red-100 text-red-700">✕ {r}</span>;
  return r ? <span className="px-2 py-0.5 rounded-full text-xs font-bold bg-muted text-muted-foreground">{r}</span> : null;
}

/** Build a plain-text copy of the full report for clipboard */
function buildFullReportText(report: LegalReport, question: string): string {
  const lines: string[] = [];
  lines.push('══════════════════════════════════════════');
  lines.push('التقرير القانوني — RABAB LEGAL AI');
  lines.push(`الموضوع: ${question}`);
  lines.push(`التاريخ: ${new Date().toLocaleDateString('ar-SA')}`);
  lines.push('══════════════════════════════════════════\n');

  if (report.summary) {
    lines.push('أولاً: الملخص القانوني');
    lines.push('─────────────────────');
    lines.push(report.summary + '\n');
  }

  if (report.articles?.length) {
    lines.push('ثانياً: المواد النظامية ذات الصلة');
    lines.push('─────────────────────────────────');
    report.articles.forEach(a => {
      lines.push(`• المادة (${a.article}) — ${a.law}`);
      if (a.text) lines.push(`  "${a.text}"`);
      if (a.relevance) lines.push(`  الصلة: ${a.relevance}`);
    });
    lines.push('');
  }

  if (report.strengths?.length || report.weaknesses?.length) {
    lines.push('ثالثاً: تقييم الموقف القانوني');
    lines.push('──────────────────────────────');
    if (report.strengths?.length) {
      lines.push('نقاط القوة:');
      report.strengths.forEach(s => lines.push(`  ✓ ${s}`));
    }
    if (report.weaknesses?.length) {
      lines.push('نقاط الضعف:');
      report.weaknesses.forEach(w => lines.push(`  ⚠ ${w}`));
    }
    lines.push('');
  }

  if (report.options?.length) {
    lines.push('رابعاً: الخيارات القانونية المتاحة');
    lines.push('────────────────────────────────────');
    report.options.forEach((opt, i) => {
      lines.push(`خيار ${i + 1}: ${opt.title} [${opt.recommendation}]`);
      lines.push(`  ${opt.description}`);
      if (opt.pros) lines.push(`  المزايا: ${opt.pros}`);
      if (opt.cons) lines.push(`  المحاذير: ${opt.cons}`);
    });
    lines.push('');
  }

  if (report.procedure_steps?.length) {
    lines.push('خامساً: خطوات الإجراء');
    lines.push('─────────────────────');
    report.procedure_steps.forEach(s => {
      lines.push(`  ${s.step}. ${s.action} — ${s.authority}`);
      if (s.note) lines.push(`     ملاحظة: ${s.note}`);
    });
    lines.push('');
  }

  if (report.key_deadlines?.length) {
    lines.push('سادساً: المهل والمواعيد القانونية');
    lines.push('────────────────────────────────────');
    report.key_deadlines.forEach(d => {
      lines.push(`  • ${d.event}: ${d.duration}${d.source ? ` (${d.source})` : ''}`);
    });
    lines.push('');
  }

  if (report.memo) {
    lines.push('سابعاً: المذكرة القانونية');
    lines.push('──────────────────────────');
    lines.push(report.memo + '\n');
  }

  if (report.references?.length) {
    lines.push('المراجع والمصادر');
    lines.push('─────────────────');
    report.references.forEach(r => {
      lines.push(`• ${r.title}`);
      if (r.excerpt) lines.push(`  "${r.excerpt}"`);
    });
    lines.push('');
  }

  lines.push('══════════════════════════════════════════');
  lines.push(report.disclaimer || 'هذا التقرير لأغراض البحث والتوعية القانونية — يُنصح بمراجعة محامٍ مرخّص.');
  return lines.join('\n');
}

function LegalResearcher() {
  const { lang, t } = useLang();
  const { isAuthenticated } = useAuth();
  const [, setLocation] = useLocation();
  const [question, setQuestion] = useState('');
  const [report, setReport] = useState<LegalReport | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [upgradeRequired, setUpgradeRequired] = useState(false);
  const [copiedMemo, setCopiedMemo] = useState(false);
  const [copiedFull, setCopiedFull] = useState(false);
  const [memoExpanded, setMemoExpanded] = useState(false);
  const [exportingPdf, setExportingPdf] = useState(false);
  const [exportingFullPdf, setExportingFullPdf] = useState(false);
  const [exportingWord, setExportingWord] = useState(false);
  const [previewingPdf, setPreviewingPdf] = useState(false);
  const [previewingFullPdf, setPreviewingFullPdf] = useState(false);
  const [previewOpen, setPreviewOpen] = useState(false);
  const [previewUrl, setPreviewUrl] = useState('');
  const [loadingStep, setLoadingStep] = useState(0);
  const [livePhase, setLivePhase] = useState<'searching' | 'generating' | null>(null);
  const loadingTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const esRef = useRef<EventSource | null>(null);
  const { data: sub } = useGetMySubscription();
  const canExport = sub != null && sub.package?.type !== 'free';

  const handleExportMemoWord = async () => {
    if (!report?.memo) return;
    setExportingWord(true);
    try {
      await exportMemoWord({
        memoText: report.memo,
        title: question.slice(0, 60) || 'المذكرة القانونية',
        weaknesses: report.weaknesses ?? [],
        hasCitations: report.hasCitations,
      });
    } finally {
      setExportingWord(false);
    }
  };

  const LOADING_STEPS = [
    t('جارٍ قراءة قاعدة المعرفة...', 'Reading the knowledge base...'),
    t('جارٍ البحث في المصادر الرسمية...', 'Searching official sources...'),
    t('جارٍ استخراج المواد النظامية...', 'Extracting legal provisions...'),
    t('جارٍ إعداد التقرير القانوني...', 'Preparing the legal report...'),
  ];

  const handleResearch = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!question.trim() || loading) return;
    if (!isAuthenticated) { setLocation(`/login?returnTo=${encodeURIComponent(window.location.pathname + window.location.search)}`); return; }

    const requestId = crypto.randomUUID();

    // Open SSE connection before POSTing so we catch the first phase event
    const es = new EventSource(`${API_BASE}/api/knowledge/research-status/${requestId}`, { withCredentials: true });
    esRef.current = es;
    es.onmessage = (ev) => {
      try {
        const data = JSON.parse(ev.data);
        if (data.phase === 'done') { setLivePhase(null); es.close(); }
        else if (data.phase === 'searching' || data.phase === 'generating') setLivePhase(data.phase);
      } catch { /* ignore */ }
    };
    es.onerror = () => { setLivePhase(null); es.close(); };

    setLoading(true); setError(''); setUpgradeRequired(false); setReport(null);
    setLoadingStep(0); setLivePhase(null);
    loadingTimerRef.current = setInterval(() => {
      setLoadingStep(s => Math.min(s + 1, LOADING_STEPS.length - 1));
    }, 3500);
    try {
      const res = await fetch(`${API_BASE}/api/knowledge/legal-research`, {
        method: 'POST', credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ question, requestId }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        if (err.code === 'UPGRADE_REQUIRED') { setUpgradeRequired(true); return; }
        throw new Error(err.error || 'فشل إعداد البحث');
      }
      setReport(await res.json());
      setMemoExpanded(true); // auto-expand so embedded citations are visible
    } catch (err: any) { setError(err.message); }
    finally {
      setLoading(false);
      setLivePhase(null);
      esRef.current?.close(); esRef.current = null;
      if (loadingTimerRef.current) clearInterval(loadingTimerRef.current);
    }
  };

  const copyMemo = () => {
    if (!report?.memo) return;
    // Block export when no citable references are available
    if (report.hasCitations === false) return;
    navigator.clipboard.writeText(report.memo).then(() => { setCopiedMemo(true); setTimeout(() => setCopiedMemo(false), 2000); });
  };

  const copyFullReport = () => {
    if (!report) return;
    // Block full-report export when memo has no citable citations
    if (report.hasCitations === false) return;
    navigator.clipboard.writeText(buildFullReportText(report, question)).then(() => {
      setCopiedFull(true); setTimeout(() => setCopiedFull(false), 2500);
    });
  };

  /** Generate a text-based (selectable/searchable) PDF with all report sections and trigger direct download */
  const doExportPdf = async (mode: 'memo' | 'full' = 'memo') => {
    if (!report?.memo) throw new Error('لا توجد مذكرة جاهزة للتصدير.');
    const today = new Date().toLocaleDateString('ar-SA', { year: 'numeric', month: 'long', day: 'numeric' });
    const dateStr = new Date().toISOString().slice(0, 10);
    const isUnverified = report.hasCitations === false;

    // Dynamic import keeps the heavy library out of the initial bundle
    const { pdf, Document, Page, Text, View, Font, StyleSheet } =
      await import('@react-pdf/renderer');

    // Register Amiri — font files are bundled locally in /public/fonts/ so export
    // works offline and is never blocked by CDN outages.
    const fontBase = `${window.location.origin}${import.meta.env.BASE_URL}fonts`;
    Font.register({
      family: 'Amiri',
      fonts: [
        {
          src: `${fontBase}/amiri-arabic-400-normal.woff2`,
          fontWeight: 400,
        },
        {
          src: `${fontBase}/amiri-arabic-700-normal.woff2`,
          fontWeight: 700,
        },
      ],
    });

    // Disable automatic hyphenation so Arabic words are never broken mid-word
    Font.registerHyphenationCallback(w => [w]);

    const S = StyleSheet.create({
      page: {
        fontFamily: 'Amiri',
        fontSize: 12,
        lineHeight: 1.85,
        paddingTop: 40,
        paddingBottom: 48,
        paddingHorizontal: 48,
        backgroundColor: '#ffffff',
      },
      header: {
        flexDirection: 'row-reverse',
        justifyContent: 'space-between',
        alignItems: 'flex-start',
        borderBottomWidth: 3,
        borderBottomColor: '#7c3a00',
        paddingBottom: 12,
        marginBottom: 20,
      },
      brandBlock: { alignItems: 'flex-end' },
      brandName: { fontSize: 18, fontWeight: 700, color: '#7c3a00' },
      brandSub:  { fontSize: 10, color: '#888888', marginTop: 2 },
      metaBlock: { alignItems: 'flex-start' },
      metaText:  { fontSize: 10, color: '#555555' },
      subjectBox: {
        backgroundColor: '#fef9f0',
        borderRightWidth: 4,
        borderRightColor: '#c47a0a',
        padding: 10,
        borderRadius: 4,
        marginBottom: 18,
      },
      subjectText: { fontSize: 12, fontWeight: 700, color: '#1a1a1a', textAlign: 'right' },
      section: { marginBottom: 22 },
      sectionHeader: {
        flexDirection: 'row-reverse',
        justifyContent: 'space-between',
        alignItems: 'baseline',
        borderBottomWidth: 1,
        borderBottomColor: '#e0c080',
        paddingBottom: 4,
        marginBottom: 10,
      },
      sectionHeading: { fontSize: 13, fontWeight: 700, color: '#7c3a00' },
      bodyText: { fontSize: 12, lineHeight: 1.9, color: '#1a1a1a', textAlign: 'right' },
      /* Articles */
      articleItem: { marginBottom: 12 },
      articleBadge: { fontSize: 10, fontWeight: 700, color: '#7c3a00', marginBottom: 2 },
      articleTextBlock: {
        fontSize: 11,
        color: '#333333',
        backgroundColor: '#fafafa',
        borderRightWidth: 3,
        borderRightColor: '#c47a0a',
        padding: 6,
        marginTop: 4,
        borderRadius: 2,
        textAlign: 'right',
      },
      articleRelevance: { fontSize: 10, color: '#666666', marginTop: 3, textAlign: 'right' },
      /* Strengths / Weaknesses */
      swRow: { flexDirection: 'row-reverse', gap: 10, marginBottom: 4 },
      swBlock: { flex: 1, padding: 8, borderRadius: 4 },
      swHeading: { fontSize: 11, fontWeight: 700, marginBottom: 4 },
      swItem: { fontSize: 11, marginBottom: 3, textAlign: 'right' },
      /* Options */
      optionCard: {
        marginBottom: 10,
        padding: 10,
        backgroundColor: '#fafaf8',
        borderWidth: 1,
        borderColor: '#e5e5e5',
        borderRadius: 4,
      },
      optionTitle: { fontSize: 12, fontWeight: 700, color: '#1a1a1a', textAlign: 'right', marginBottom: 4 },
      optionDesc:  { fontSize: 11, color: '#444444', textAlign: 'right', marginBottom: 4 },
      optionNote:  { fontSize: 10, color: '#555555', textAlign: 'right' },
      /* Steps */
      stepItem: { flexDirection: 'row-reverse', marginBottom: 8, gap: 8 },
      stepNum:  { fontSize: 11, fontWeight: 700, color: '#7c3a00', minWidth: 18 },
      stepText: { flex: 1 },
      stepAction:    { fontSize: 12, fontWeight: 700, color: '#1a1a1a', textAlign: 'right' },
      stepAuthority: { fontSize: 10, color: '#7c3a00', textAlign: 'right', marginTop: 1 },
      stepNote:      { fontSize: 10, color: '#666666', textAlign: 'right', marginTop: 2 },
      /* Deadlines */
      deadlineItem: {
        flexDirection: 'row-reverse',
        justifyContent: 'space-between',
        marginBottom: 6,
        padding: '4 8',
        backgroundColor: '#fffbea',
        borderRadius: 3,
      },
      deadlineEvent:    { fontSize: 11, fontWeight: 700, color: '#92400e' },
      deadlineDuration: { fontSize: 11, color: '#b45309' },
      deadlineSource:   { fontSize: 10, color: '#b45309' },
      /* Memo */
      refCountText: { fontSize: 11, fontWeight: 700 },
      memoText: { fontSize: 12, lineHeight: 1.9, color: '#1a1a1a', textAlign: 'right' },
      /* References */
      refItem:   { marginBottom: 8 },
      refTitle:  { fontSize: 11, fontWeight: 700, color: '#1a1a1a', textAlign: 'right' },
      refExcerpt:{ fontSize: 10, color: '#555555', marginTop: 2, textAlign: 'right' },
      /* Disclaimer */
      disclaimer: {
        marginTop: 20,
        padding: 10,
        backgroundColor: '#fffbea',
        borderWidth: 1,
        borderColor: '#ffe08a',
        borderRadius: 4,
      },
      disclaimerText: { fontSize: 10, color: '#7a5f00', textAlign: 'right' },
      /* Watermark */
      watermark: {
        position: 'absolute',
        top: '38%',
        left: -30,
        right: -30,
        textAlign: 'center',
        fontSize: 32,
        color: 'rgba(180,0,0,0.10)',
        fontWeight: 700,
        transform: 'rotate(-40deg)',
      },
    });

    const refCount = report.references?.length ?? 0;

    const docElement = (
      <Document title={`RABAB LEGAL — ${question}`} author="RABAB LEGAL AI">
        <Page size="A4" style={S.page}>
          {/* Per-page diagonal watermark for unverified exports */}
          {isUnverified && (
            <Text style={S.watermark} fixed>
              {mode === 'full' ? 'تقرير غير موثّق — للاسترشاد فقط' : 'مذكرة غير موثّقة — للاسترشاد فقط'}
            </Text>
          )}

          {/* ── Header ── */}
          <View style={S.header} fixed>
            <View style={S.brandBlock}>
              <Text style={S.brandName}>RABAB LEGAL</Text>
              <Text style={S.brandSub}>محاميتك الرقمية</Text>
            </View>
            <View style={S.metaBlock}>
              <Text style={S.metaText}>التاريخ: {today}</Text>
              <Text style={S.metaText}>مُعدّ بواسطة الذكاء الاصطناعي</Text>
            </View>
          </View>

          {/* ── Subject ── */}
          <View style={S.subjectBox}>
            <Text style={S.subjectText}>الموضوع: {question}</Text>
          </View>

          {/* ── 1. Summary ── */}
          <View style={S.section}>
            <View style={S.sectionHeader}>
              <Text style={S.sectionHeading}>أولاً: الملخص القانوني</Text>
            </View>
            {report.summary ? (
              <Text style={S.bodyText}>{report.summary}</Text>
            ) : (
              <Text style={[S.bodyText, { color: '#888888', fontStyle: 'italic' }]}>لا توجد بيانات متاحة</Text>
            )}
          </View>

          {/* ── 2. Articles ── */}
          <View style={S.section}>
            <View style={S.sectionHeader}>
              <Text style={S.sectionHeading}>ثانياً: المواد النظامية ذات الصلة</Text>
            </View>
            {report.articles?.length > 0 ? report.articles.map((a, i) => (
              <View key={i} style={S.articleItem}>
                <Text style={S.articleBadge}>
                  المادة ({a.article}) — {a.law}
                </Text>
                {a.text ? (
                  <Text style={S.articleTextBlock}>«{a.text}»</Text>
                ) : null}
                {a.relevance ? (
                  <Text style={S.articleRelevance}>وجه الصلة: {a.relevance}</Text>
                ) : null}
              </View>
            )) : (
              <Text style={[S.bodyText, { color: '#888888', fontStyle: 'italic' }]}>لا توجد بيانات متاحة</Text>
            )}
          </View>

          {/* ── 3. Strengths & Weaknesses ── */}
          <View style={S.section}>
            <View style={S.sectionHeader}>
              <Text style={S.sectionHeading}>ثالثاً: تقييم الموقف القانوني</Text>
            </View>
            {(report.strengths?.length > 0 || report.weaknesses?.length > 0) ? (
              <View style={S.swRow}>
                <View style={[S.swBlock, { backgroundColor: '#f0fdf4', borderWidth: 1, borderColor: '#bbf7d0' }]}>
                  <Text style={[S.swHeading, { color: '#166534' }]}>نقاط القوة</Text>
                  {report.strengths?.length > 0 ? report.strengths.map((s, i) => (
                    <Text key={i} style={[S.swItem, { color: '#166534' }]}>✓ {s}</Text>
                  )) : (
                    <Text style={[S.swItem, { color: '#888888', fontStyle: 'italic' }]}>لا توجد بيانات متاحة</Text>
                  )}
                </View>
                <View style={[S.swBlock, { backgroundColor: '#fff1f2', borderWidth: 1, borderColor: '#fecdd3' }]}>
                  <Text style={[S.swHeading, { color: '#991b1b' }]}>نقاط الضعف</Text>
                  {report.weaknesses?.length > 0 ? report.weaknesses.map((w, i) => (
                    <Text key={i} style={[S.swItem, { color: '#991b1b' }]}>⚠ {w}</Text>
                  )) : (
                    <Text style={[S.swItem, { color: '#888888', fontStyle: 'italic' }]}>لا توجد بيانات متاحة</Text>
                  )}
                </View>
              </View>
            ) : (
              <Text style={[S.bodyText, { color: '#888888', fontStyle: 'italic' }]}>لا توجد بيانات متاحة</Text>
            )}
          </View>

          {/* ── 4. Options ── */}
          <View style={S.section}>
            <View style={S.sectionHeader}>
              <Text style={S.sectionHeading}>رابعاً: الخيارات القانونية المتاحة</Text>
            </View>
            {report.options?.length > 0 ? report.options.map((opt, i) => (
              <View key={i} style={S.optionCard}>
                <Text style={S.optionTitle}>{i + 1}. {opt.title}  [{opt.recommendation}]</Text>
                <Text style={S.optionDesc}>{opt.description}</Text>
                {opt.pros ? <Text style={[S.optionNote, { color: '#166534' }]}>+ {opt.pros}</Text> : null}
                {opt.cons ? <Text style={[S.optionNote, { color: '#991b1b' }]}>− {opt.cons}</Text> : null}
              </View>
            )) : (
              <Text style={[S.bodyText, { color: '#888888', fontStyle: 'italic' }]}>لا توجد بيانات متاحة</Text>
            )}
          </View>

          {/* ── 5. Procedure Steps ── */}
          <View style={S.section}>
            <View style={S.sectionHeader}>
              <Text style={S.sectionHeading}>خامساً: خطوات الإجراء</Text>
            </View>
            {report.procedure_steps?.length > 0 ? report.procedure_steps.map((s, i) => (
              <View key={i} style={S.stepItem}>
                <Text style={S.stepNum}>{s.step}.</Text>
                <View style={S.stepText}>
                  <Text style={S.stepAction}>{s.action}</Text>
                  <Text style={S.stepAuthority}>{s.authority}</Text>
                  {s.note ? <Text style={S.stepNote}>{s.note}</Text> : null}
                </View>
              </View>
            )) : (
              <Text style={[S.bodyText, { color: '#888888', fontStyle: 'italic' }]}>لا توجد بيانات متاحة</Text>
            )}
          </View>

          {/* ── 6. Key Deadlines ── */}
          <View style={S.section}>
            <View style={S.sectionHeader}>
              <Text style={S.sectionHeading}>سادساً: المهل والمواعيد القانونية</Text>
            </View>
            {report.key_deadlines?.length > 0 ? report.key_deadlines.map((d, i) => (
              <View key={i} style={S.deadlineItem}>
                <Text style={S.deadlineEvent}>{d.event}</Text>
                <Text style={S.deadlineDuration}>{d.duration}</Text>
                {d.source ? <Text style={S.deadlineSource}>{d.source}</Text> : null}
              </View>
            )) : (
              <Text style={[S.bodyText, { color: '#888888', fontStyle: 'italic' }]}>لا توجد بيانات متاحة</Text>
            )}
          </View>

          {/* ── 7. Memo ── */}
          <View style={S.section}>
            <View style={S.sectionHeader}>
              <Text style={S.sectionHeading}>سابعاً: المذكرة القانونية</Text>
              <Text style={[S.refCountText, { color: refCount > 0 ? '#16a34a' : '#dc2626' }]}>
                عدد المراجع الموثّقة: {refCount}
              </Text>
            </View>
            <Text style={S.memoText}>{report.memo}</Text>
          </View>

          {/* ── 8. References ── */}
          <View style={S.section}>
            <View style={S.sectionHeader}>
              <Text style={S.sectionHeading}>المراجع والمصادر</Text>
            </View>
            {refCount > 0 ? report.references.map((r, i) => (
              <View key={i} style={S.refItem}>
                <Text style={S.refTitle}>{r.title}</Text>
                {r.excerpt ? (
                  <Text style={S.refExcerpt}>«{r.excerpt}»</Text>
                ) : null}
              </View>
            )) : (
              <Text style={[S.bodyText, { color: '#888888', fontStyle: 'italic' }]}>لا توجد بيانات متاحة</Text>
            )}
          </View>

          {/* ── Disclaimer ── */}
          <View style={S.disclaimer}>
            <Text style={S.disclaimerText}>
              {report.disclaimer ||
                'هذا التقرير لأغراض البحث والتوعية القانونية — يُنصح بمراجعة محامٍ مرخّص والتحقق من المصادر الرسمية قبل الاستخدام الرسمي.'}
            </Text>
          </View>
        </Page>
      </Document>
    );

    const blob = await pdf(docElement).toBlob();
    return URL.createObjectURL(blob);
  };

  const handleExportPdf = async () => {
    if (!report?.memo) return;
    if (report.hasCitations === false) {
      const confirmed = window.confirm(
        'تنبيه: هذه المذكرة غير موثّقة بمصادر معتمدة.\n\nسيتم تصدير الملف مع علامة مائية واضحة: "مذكرة غير موثّقة — للاسترشاد فقط"\n\nهل تريد المتابعة؟'
      );
      if (!confirmed) return;
    }
    const dateStr = new Date().toISOString().slice(0, 10);
    setExportingPdf(true);
    try {
      const url = await doExportPdf('memo');
      const a = document.createElement('a');
      a.href = url;
      a.download = `rabab-legal-memo-${dateStr}.pdf`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } finally {
      setExportingPdf(false);
    }
  };

  const handleExportFullReportPdf = async () => {
    if (!report?.memo) return;
    if (report.hasCitations === false) {
      const confirmed = window.confirm(
        'تنبيه: هذا التقرير غير موثّق بمصادر معتمدة.\n\nسيتم تصدير الملف مع علامة مائية واضحة: "تقرير غير موثّق — للاسترشاد فقط"\n\nهل تريد المتابعة؟'
      );
      if (!confirmed) return;
    }
    const dateStr = new Date().toISOString().slice(0, 10);
    setExportingFullPdf(true);
    try {
      const url = await doExportPdf('full');
      const a = document.createElement('a');
      a.href = url;
      a.download = `rabab-legal-full-report-${dateStr}.pdf`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } finally {
      setExportingFullPdf(false);
    }
  };

  const handlePreviewPdf = async () => {
    if (!report?.memo) return;
    setPreviewingPdf(true);
    try {
      const url = await doExportPdf('memo');
      setPreviewUrl(url);
      setPreviewOpen(true);
    } finally {
      setPreviewingPdf(false);
    }
  };

  const handlePreviewFullReportPdf = async () => {
    if (!report?.memo) return;
    setPreviewingFullPdf(true);
    try {
      const url = await doExportPdf('full');
      setPreviewUrl(url);
      setPreviewOpen(true);
    } finally {
      setPreviewingFullPdf(false);
    }
  };

  const closePreview = () => {
    setPreviewOpen(false);
    if (previewUrl) {
      URL.revokeObjectURL(previewUrl);
      setPreviewUrl('');
    }
  };

  return (
    <div className="space-y-5" dir={lang === 'ar' ? 'rtl' : 'ltr'}>
      {/* Header banner */}
      <div className="bg-gradient-to-r from-primary/8 to-amber-50 border border-primary/20 rounded-2xl p-4">
        <p className="font-bold text-primary text-sm mb-2">⚖️ {t('الباحثة القانونية العملية', 'Practical Legal Researcher')}</p>
        <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-xs text-foreground/70">
          <span>📋 {t('مواد نظامية بنصوصها الحرفية', 'Legal provisions quoted verbatim')}</span>
          <span>🔍 {t('بحث في المصادر الرسمية مباشرة', 'Research directly across official sources')}</span>
          <span>⚡ {t('تقييم نقاط القوة والضعف', 'Assessment of strengths and weaknesses')}</span>
          <span>🗂 {t('مقارنة الخيارات وخطوات الإجراء', 'Comparison of options and procedural steps')}</span>
          <span>📅 {t('المهل والمواعيد القانونية', 'Legal deadlines and time limits')}</span>
          <span>📝 {t('مذكرة قانونية جاهزة للنسخ', 'Legal memorandum ready to copy')}</span>
        </div>
      </div>

      {upgradeRequired && (
        <div className="p-5 bg-primary/5 border-2 border-primary/30 rounded-2xl text-center">
          <Lock className="w-8 h-8 text-primary mx-auto mb-2" />
          <p className="font-bold text-primary mb-1">{t('خدمة مدفوعة', 'Paid service')}</p>
          <p className="text-muted-foreground text-xs mb-3">{t('البحث القانوني الشامل متاح للمشتركين فقط', 'Comprehensive legal research is available to subscribers only')}</p>
          <Link href="/pricing"><button className="px-5 py-2 bg-primary text-primary-foreground rounded-xl font-bold text-sm hover:bg-primary/90">{t('ترقية الباقة', 'Upgrade plan')}</button></Link>
        </div>
      )}
      {error && <div className="p-3 bg-destructive/10 border border-destructive/30 rounded-xl text-sm text-destructive">{localizedAuthError(error, t)}</div>}

      <form onSubmit={handleResearch} className="space-y-3">
        <textarea
          value={question} onChange={e => setQuestion(e.target.value)}
          rows={4} disabled={loading}
          placeholder={t('صِف وضعك بدقة — مثال: أنا موظف صدر بحقي فصل تعسفي بعد 7 سنوات خدمة دون إنذار مسبق، ما خياراتي أمام المحكمة العمالية؟', 'Describe your situation precisely — for example: I was dismissed unfairly after seven years without prior notice. What options do I have before the Labour Court?')}
          className="w-full border-2 border-secondary/60 rounded-2xl px-4 py-3 text-sm outline-none focus:outline-none focus:ring-0 focus:border-secondary transition-colors resize-none bg-background"
        />
        <button
          type="submit" disabled={!question.trim() || loading}
          className="w-full h-12 bg-primary text-primary-foreground rounded-xl font-bold text-sm hover:bg-primary/90 disabled:opacity-50 flex items-center justify-center gap-2"
        >
          {loading
            ? <><Loader2 className="w-4 h-4 animate-spin" />{LOADING_STEPS[loadingStep]}</>
            : <><Gavel className="w-4 h-4" />{t('ابدأ البحث القانوني', 'Start Legal Research')}</>}
        </button>
      </form>

      {/* ── Live search indicator ── */}
      {loading && livePhase === 'searching' && (
        <div className="flex items-center gap-2 px-4 py-2.5 bg-blue-50 border border-blue-200 rounded-xl shadow-sm">
          <span className="text-lg leading-none animate-pulse">🌐</span>
          <span className="text-xs font-semibold text-blue-700">{t('جارٍ البحث في الإنترنت…', 'Searching the web…')}</span>
          <div className="flex items-center gap-1 mr-1">
            {[0, 1, 2].map(i => (
              <div key={i} className="w-1.5 h-1.5 rounded-full bg-blue-400 animate-bounce"
                style={{ animationDelay: `${i * 0.15}s` }} />
            ))}
          </div>
        </div>
      )}

      {/* Report */}
      {report && (
        <div className="space-y-4">

          {/* AI Disclaimer for report */}
          <div className="flex items-start gap-2 bg-amber-50 border border-amber-200 rounded-xl px-3 py-2.5">
            <AlertTriangle className="w-3.5 h-3.5 text-amber-500 shrink-0 mt-0.5" />
            <p className="text-[11px] text-amber-800 leading-snug">{t('هذه إجابة صادرة عن الذكاء الاصطناعي، وهي للاسترشاد ولا تُعد رأياً قانونياً ملزماً، ولا تغني عن مراجعة المحامية المختصة والتحقق من المصدر الرسمي.', 'This AI-generated answer is for guidance only, is not binding legal advice, and does not replace consulting a qualified lawyer and verifying the official source.')}</p>
          </div>

          {/* Top actions bar */}
          <div className="flex items-center justify-between">
            <span className="text-xs text-muted-foreground">
              {report.sources_used && (
                <>{t('بُني التقرير من', 'Report built from')} {report.sources_used.kb} {t('مرجع داخلي', 'internal sources')}{report.sources_used.web > 0 ? ` + ${report.sources_used.web} ${t('مصدر ويب', 'web sources')}` : ''}</>
              )}
            </span>
            <div className="flex items-center gap-2">
              <button
                onClick={copyFullReport}
                disabled={report.hasCitations === false}
                title={report.hasCitations === false ? t('لا يمكن نسخ التقرير بدون استشهادات موثّقة', 'Cannot copy a report without verified citations') : undefined}
                className={cn(
                  "flex items-center gap-1.5 text-xs border border-secondary/40 rounded-lg px-3 py-1.5 transition-colors",
                  report.hasCitations === false
                    ? "opacity-40 cursor-not-allowed"
                    : "hover:bg-muted/50"
                )}
              >
                {copiedFull ? <><Check className="w-3.5 h-3.5 text-green-600" />{t('تم نسخ التقرير', 'Report copied')}</> : <><Copy className="w-3.5 h-3.5" />{t('نسخ التقرير كاملاً', 'Copy full report')}</>}
              </button>
              <button
                onClick={handlePreviewFullReportPdf}
                disabled={previewingFullPdf}
                title={t('معاينة التقرير قبل التنزيل', 'Preview report before download')}
                className="flex items-center gap-1.5 text-xs border border-secondary/40 rounded-lg px-3 py-1.5 transition-colors hover:bg-secondary/10 disabled:opacity-40 disabled:cursor-not-allowed"
              >
                {previewingFullPdf
                  ? <><Loader2 className="w-3.5 h-3.5 animate-spin" />{t('جارٍ التحضير...', 'Preparing...')}</>
                  : <><Eye className="w-3.5 h-3.5" />{t('معاينة PDF', 'Preview PDF')}</>
                }
              </button>
              <button
                onClick={handleExportFullReportPdf}
                disabled={exportingFullPdf}
                title={report.hasCitations === false ? t('تصدير التقرير الكامل مع علامة مائية تحذيرية', 'Export full report with warning watermark') : t('تنزيل التقرير الكامل PDF', 'Download full report PDF')}
                className={cn(
                  "flex items-center gap-1.5 text-xs border rounded-lg px-3 py-1.5 font-semibold transition-colors",
                  exportingFullPdf
                    ? "opacity-40 cursor-not-allowed border-secondary/20 bg-muted text-muted-foreground"
                    : report.hasCitations === false
                      ? "border-amber-300 bg-amber-100 text-amber-800 hover:bg-amber-200"
                      : "border-secondary/40 bg-secondary/10 text-secondary hover:bg-secondary/20"
                )}
              >
                {exportingFullPdf
                  ? <><Loader2 className="w-3.5 h-3.5 animate-spin" />{t('جارٍ التنزيل...', 'Downloading...')}</>
                  : report.hasCitations === false
                    ? <><AlertTriangle className="w-3.5 h-3.5" />{t('تنزيل التقرير مع تحذير', 'Download report with warning')}</>
                    : <><FileDown className="w-3.5 h-3.5" />{t('تنزيل التقرير PDF', 'Download report PDF')}</>
                }
              </button>
            </div>
          </div>

          {/* Summary */}
          <div className="bg-card border border-secondary/40 rounded-2xl p-5 shadow-sm">
            <div className="flex items-center gap-2 mb-3 text-primary font-bold text-sm"><BookOpen className="w-4 h-4" />{t('الملخص التنفيذي', 'Executive summary')}</div>
            <p className="text-sm leading-relaxed text-foreground/90" dir="auto">{report.summary}</p>
          </div>

          {/* Articles table */}
          {report.articles?.length > 0 && (
            <div className="bg-card border border-secondary/40 rounded-2xl overflow-hidden shadow-sm">
              <div className="flex items-center gap-2 px-5 py-3 bg-primary/5 border-b border-secondary/30">
                <ScrollText className="w-4 h-4 text-primary" />
                <span className="text-sm font-bold text-primary">{t('المواد النظامية ذات الصلة', 'Related legal provisions')}</span>
                <span className="text-xs text-muted-foreground bg-muted px-2 py-0.5 rounded-full">{report.articles.length} {t('مادة', 'provisions')}</span>
              </div>
              <div className="divide-y divide-border/40">
                {report.articles.map((a, i) => (
                  <div key={i} className={cn("px-5 py-4", a.verified === false && "bg-amber-50/40")}>
                    <div className="flex items-baseline gap-2 mb-1.5 flex-wrap">
                      <span className="text-xs font-bold bg-primary/10 text-primary px-2 py-0.5 rounded-lg">{t('المادة', 'Article')} <span dir="auto">{a.article}</span></span>
                      <span className="text-xs font-semibold text-foreground" dir="auto">{a.law}</span>
                      {a.verified === true && (
                        <span className="text-[10px] font-bold bg-green-100 text-green-700 border border-green-200 px-1.5 py-0.5 rounded-full">
                          ✓ {a.foundIn === 'web' ? t('موثق من الويب', 'Verified from web') : t('موثق من قاعدة المعرفة', 'Verified from knowledge base')}
                        </span>
                      )}
                      {a.verified === false && (
                        <span className="text-[10px] font-bold bg-amber-100 text-amber-700 border border-amber-200 px-1.5 py-0.5 rounded-full">
                          ⚠ {t('يحتاج تحقق', 'Needs verification')}
                        </span>
                      )}
                    </div>
                    {a.text && (
                      <p className={cn(
                        "text-xs leading-relaxed text-foreground/80 bg-muted/30 rounded-xl p-3 mb-2 font-mono-arabic border-r-2 pr-3",
                        a.verified === false ? "border-amber-400" : "border-primary/30"
                      )} dir="auto">
                        "{a.text}"
                      </p>
                    )}
                    {a.verified === false && (
                      <p className="text-[10px] text-amber-700 bg-amber-50 border border-amber-100 rounded-lg px-2 py-1 mb-1.5">
                        ⚠️ {t('لم يُعثر على هذه المادة في مصادر قاعدة المعرفة — يُرجى التحقق من المصدر الرسمي:', 'This provision was not found in knowledge-base sources — please verify the official source:')}{' '}
                        <a href="https://laws.boe.gov.sa" target="_blank" rel="noopener noreferrer" className="underline font-semibold">laws.boe.gov.sa</a>
                      </p>
                    )}
                    {a.relevance && (
                      <p className="text-xs text-muted-foreground"><span className="font-semibold text-foreground/70">{t('وجه الصلة:', 'Relevance:')}</span> <span dir="auto">{a.relevance}</span></p>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Strengths & Weaknesses */}
          {(report.strengths.length > 0 || report.weaknesses.length > 0) && (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {report.strengths.length > 0 && (
                <div className="bg-green-50 border border-green-200 rounded-2xl p-4">
                  <div className="flex items-center gap-1.5 mb-3 text-green-800 font-bold text-sm"><ShieldCheck className="w-4 h-4" />{t('نقاط القوة', 'Strengths')}</div>
                  <ul className="space-y-2">
                    {report.strengths.map((s, i) => (
                      <li key={i} className="flex items-start gap-2 text-xs text-green-900">
                        <span className="mt-0.5 text-green-600 font-bold shrink-0">✓</span><span dir="auto">{s}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
              {report.weaknesses.length > 0 && (
                <div className="bg-red-50 border border-red-200 rounded-2xl p-4">
                  <div className="flex items-center gap-1.5 mb-3 text-red-800 font-bold text-sm"><AlertTriangle className="w-4 h-4" />{t('نقاط الضعف', 'Weaknesses')}</div>
                  <ul className="space-y-2">
                    {report.weaknesses.map((w, i) => (
                      <li key={i} className="flex items-start gap-2 text-xs text-red-900">
                        <span className="mt-0.5 text-red-600 font-bold shrink-0">⚠</span><span dir="auto">{w}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          )}

          {/* Options */}
          {report.options.length > 0 && (
            <div className="bg-card border border-secondary/40 rounded-2xl p-5 shadow-sm">
              <div className="flex items-center gap-2 mb-4 text-primary font-bold text-sm"><GitCompare className="w-4 h-4" />{t('الخيارات القانونية المتاحة', 'Available legal options')}</div>
              <div className="space-y-3">
                {report.options.map((opt, i) => (
                  <div key={i} className="border border-secondary/20 rounded-xl p-4 bg-muted/20">
                    <div className="flex items-center gap-2 mb-2 flex-wrap">
                      <span className="text-xs font-bold text-primary bg-primary/10 px-2 py-0.5 rounded-lg">{t('خيار', 'Option')} {i + 1}</span>
                      <span className="text-sm font-bold flex-1" dir="auto">{opt.title}</span>
                      <RecommendationBadge rec={opt.recommendation} />
                    </div>
                    <p className="text-xs text-foreground/80 leading-relaxed mb-2" dir="auto">{opt.description}</p>
                    {(opt.pros || opt.cons) && (
                      <div className="grid grid-cols-2 gap-2 mt-2">
                        {opt.pros && <div className="text-xs bg-green-50 border border-green-100 rounded-lg p-2"><span className="font-bold text-green-700">+ </span><span className="text-green-900">{opt.pros}</span></div>}
                        {opt.cons && <div className="text-xs bg-red-50 border border-red-100 rounded-lg p-2"><span className="font-bold text-red-700">− </span><span className="text-red-900">{opt.cons}</span></div>}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Procedure steps */}
          {report.procedure_steps?.length > 0 && (
            <div className="bg-card border border-secondary/40 rounded-2xl p-5 shadow-sm">
              <div className="flex items-center gap-2 mb-4 text-primary font-bold text-sm">
                <ArrowRight className="w-4 h-4" />{t('خطوات الإجراء', 'Procedure steps')}
              </div>
              <ol className="space-y-3">
                {report.procedure_steps.map((s, i) => (
                  <li key={i} className="flex gap-3">
                    <span className="w-6 h-6 rounded-full bg-primary text-primary-foreground text-xs font-bold flex items-center justify-center shrink-0 mt-0.5">{s.step}</span>
                    <div className="flex-1">
                      <p className="text-sm font-semibold text-foreground" dir="auto">{s.action}</p>
                      <p className="text-xs text-primary/80 font-medium" dir="auto">{s.authority}</p>
                      {s.note && <p className="text-xs text-muted-foreground mt-0.5 bg-muted/40 rounded-lg px-2 py-1" dir="auto">{s.note}</p>}
                    </div>
                  </li>
                ))}
              </ol>
            </div>
          )}

          {/* Key deadlines */}
          {report.key_deadlines?.length > 0 && (
            <div className="bg-amber-50 border border-amber-200 rounded-2xl p-5">
              <div className="flex items-center gap-2 mb-3 text-amber-800 font-bold text-sm">
                <span>📅</span>{t('المهل والمواعيد القانونية', 'Legal deadlines and time limits')}
              </div>
              <div className="space-y-2">
                {report.key_deadlines.map((d, i) => (
                  <div key={i} className="flex items-start gap-3 bg-white/60 border border-amber-100 rounded-xl px-4 py-2.5">
                    <div className="flex-1">
                      <span className="text-xs font-bold text-amber-900" dir="auto">{d.event}</span>
                      <span className="text-xs text-amber-700 mr-2" dir="auto">← {d.duration}</span>
                    </div>
                      {d.source && <span className="text-xs text-amber-600 shrink-0" dir="auto">{d.source}</span>}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Legal Memo */}
          {report.memo && (
            <div className="border border-secondary/40 rounded-2xl overflow-hidden shadow-sm">
              <div className="flex items-center justify-between px-4 py-2.5 bg-muted/50 border-b border-secondary/30">
                <div className="flex items-center gap-2 text-sm font-bold text-primary">
                  <FileEdit className="w-4 h-4" />{t('المذكرة القانونية', 'Legal memorandum')}
                  {report.citableCount != null && report.citableCount > 0 && (
                    <span className="text-[10px] font-bold bg-green-100 text-green-700 border border-green-200 px-1.5 py-0.5 rounded-full">
                      {report.citableCount} {t('مرجع موثّق', 'verified references')}
                    </span>
                  )}
                  {report.hasCitations === false && (
                    <span className="text-[10px] font-bold bg-red-100 text-red-700 border border-red-200 px-1.5 py-0.5 rounded-full">
                      ⚠ {t('بدون استشهادات', 'No citations')}
                    </span>
                  )}
                </div>
                <div className="flex items-center gap-2">
                  <button onClick={() => setMemoExpanded(v => !v)} className="text-xs text-muted-foreground hover:text-foreground flex items-center gap-1">
                    {memoExpanded ? <><ChevronUp className="w-3.5 h-3.5" />{t('طيّ', 'Collapse')}</> : <><ChevronDown className="w-3.5 h-3.5" />{t('توسيع', 'Expand')}</>}
                  </button>
                  <button
                    onClick={copyMemo}
                    disabled={report.hasCitations === false}
                    title={report.hasCitations === false ? t('لا يمكن نسخ المذكرة بدون استشهادات موثّقة', 'Cannot copy a memorandum without verified citations') : undefined}
                    className={cn(
                      "flex items-center gap-1 text-xs",
                      report.hasCitations === false
                        ? "opacity-40 cursor-not-allowed text-muted-foreground"
                        : "text-muted-foreground hover:text-foreground"
                    )}
                  >
                    {copiedMemo ? <><Check className="w-3.5 h-3.5 text-green-600" />{t('تم النسخ', 'Copied')}</> : <><Copy className="w-3.5 h-3.5" />{t('نسخ', 'Copy')}</>}
                  </button>
                  {/* ── Word Export (primary) ── */}
                  {canExport ? (
                    <button
                      onClick={handleExportMemoWord}
                      disabled={exportingWord}
                      title={t('تنزيل المذكرة Word — مع ملف ملاحظات المحامي منفصلاً', 'Download memorandum Word file with separate lawyer notes')}
                      className="flex items-center gap-1 text-xs px-2 py-1 rounded-lg font-semibold transition-colors bg-secondary/90 text-primary hover:bg-secondary disabled:opacity-40 disabled:cursor-not-allowed"
                    >
                      {exportingWord
                        ? <><Loader2 className="w-3.5 h-3.5 animate-spin" />{t('جارٍ التصدير...', 'Exporting...')}</>
                        : <><Download className="w-3.5 h-3.5" />Word .docx</>
                      }
                    </button>
                  ) : (
                    <a
                      href="/pricing"
                      className="flex items-center gap-1 text-xs px-2 py-1 rounded-lg font-semibold bg-secondary/20 text-secondary hover:bg-secondary/30 transition-colors"
                    >
                      <Download className="w-3.5 h-3.5" />{t('اشترك للتصدير', 'Subscribe to export')}
                    </a>
                  )}
                  <button
                    onClick={handlePreviewPdf}
                    disabled={previewingPdf}
                      title={t('معاينة المذكرة قبل التنزيل', 'Preview memorandum before download')}
                    className="flex items-center gap-1 text-xs px-2 py-1 rounded-lg font-semibold transition-colors bg-muted/60 text-foreground hover:bg-muted disabled:opacity-40 disabled:cursor-not-allowed"
                  >
                    {previewingPdf
                        ? <><Loader2 className="w-3.5 h-3.5 animate-spin" />{t('جارٍ التحضير...', 'Preparing...')}</>
                        : <><Eye className="w-3.5 h-3.5" />{t('معاينة PDF', 'Preview PDF')}</>
                    }
                  </button>
                  {canExport && (
                    <button
                      onClick={handleExportPdf}
                      disabled={exportingPdf}
                      title={report.hasCitations === false ? t('تصدير مع علامة مائية تحذيرية', 'Export with warning watermark') : t('تنزيل المذكرة PDF', 'Download memorandum PDF')}
                      className={cn(
                        "flex items-center gap-1 text-xs px-2 py-1 rounded-lg font-semibold transition-colors",
                        exportingPdf
                          ? "opacity-40 cursor-not-allowed bg-muted text-muted-foreground"
                          : report.hasCitations === false
                            ? "bg-amber-100 text-amber-800 hover:bg-amber-200 border border-amber-300"
                            : "bg-primary/10 text-primary hover:bg-primary/20"
                      )}
                    >
                      {exportingPdf
                        ? <><Loader2 className="w-3.5 h-3.5 animate-spin" />{t('جارٍ التنزيل...', 'Downloading...')}</>
                        : report.hasCitations === false
                          ? <><AlertTriangle className="w-3.5 h-3.5" />{t('تنزيل مع تحذير', 'Download with warning')}</>
                          : <><FileDown className="w-3.5 h-3.5" />{t('تنزيل PDF', 'Download PDF')}</>
                      }
                    </button>
                  )}
                </div>
              </div>

              {/* No-citations warning banner */}
              {report.hasCitations === false && (
                <div className="flex items-start gap-2 px-4 py-3 bg-amber-50 border-b border-amber-200">
                  <AlertTriangle className="w-4 h-4 text-amber-700 shrink-0 mt-0.5" />
                  <p className="text-xs text-amber-900 leading-relaxed">
                    <span className="font-bold">{t('تنبيه: لم تُوثَّق مصادر الاستشهاد لهذه المذكرة', 'Warning: citation sources for this memorandum were not verified')}</span> — {t('يمكن تصدير الملف مع علامة مائية تحذيرية واضحة:', 'The file can be exported with a clear warning watermark:')} <span className="font-semibold">"{t('مذكرة غير موثّقة — للاسترشاد فقط', 'Unverified memorandum — for guidance only')}"</span>. {t('يُنصح بمراجعة محامٍ مرخّص أو إعادة البحث بمعلومات أكثر تفصيلاً.', 'Consult a licensed lawyer or repeat the research with more detailed information.')}
                  </p>
                </div>
              )}

              <div dir="auto"><LegalMarkdown className="p-5 transition-all" maxHeight={memoExpanded ? undefined : '15rem'}>{report.memo}</LegalMarkdown></div>
              {!memoExpanded && <div className="h-8 bg-gradient-to-t from-card to-transparent -mt-8 relative pointer-events-none" />}
              <div className="px-4 py-3 bg-amber-50 border-t border-amber-100">
                <p className="text-xs text-amber-800">{t('هذه إجابة صادرة عن الذكاء الاصطناعي، وهي للاسترشاد ولا تُعد رأياً قانونياً ملزماً، ولا تغني عن مراجعة المحامية المختصة والتحقق من المصدر الرسمي.', 'This AI-generated answer is for guidance only, is not binding legal advice, and does not replace consulting a qualified lawyer and verifying the official source.')}</p>
              </div>
            </div>
          )}

          {/* References */}
          {report.references.length > 0 && (
            <div className="bg-card border border-secondary/40 rounded-2xl p-5 shadow-sm">
              <div className="flex items-center gap-2 mb-4 text-primary font-bold text-sm"><BookMarked className="w-4 h-4" />{t('المراجع والمصادر', 'References and sources')}</div>
              <div className="space-y-3">
                {report.references.map((ref, i) => (
                  <div key={i} className="flex items-start gap-2 border-r-2 border-primary/30 pr-3">
                    <div className="flex-1">
                      <p className="text-xs font-bold text-primary mb-0.5" dir="auto">{ref.title}</p>
                      {ref.excerpt && <p className="text-xs text-muted-foreground leading-relaxed" dir="auto">"{ref.excerpt}"</p>}
                    </div>
                    {ref.source_type && (
                      <span className={cn("text-xs px-1.5 py-0.5 rounded-md shrink-0",
                        ref.source_type === 'ويب' ? 'bg-blue-50 text-blue-700' : 'bg-muted text-muted-foreground')}>
                        {ref.source_type === 'قاعدة_المعرفة' ? '📚' : ref.source_type === 'ويب' ? '🌐' : '⚖️'}
                      </span>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* ── PDF Preview Modal ── */}
      {previewOpen && (
        <div className="fixed inset-0 z-50 flex flex-col bg-black/80" dir={lang === 'ar' ? 'rtl' : 'ltr'}>
          {/* Toolbar */}
          <div className="flex items-center justify-between gap-3 px-4 py-3 bg-background border-b border-secondary/30 shrink-0">
            <div className="flex items-center gap-2">
              <Eye className="w-4 h-4 text-primary" />
              <span className="text-sm font-bold text-primary">{t('معاينة PDF', 'PDF preview')}</span>
            </div>
            <div className="flex items-center gap-2">
              <a
                href={previewUrl}
                download={`rabab-legal-preview-${new Date().toISOString().slice(0, 10)}.pdf`}
                className="flex items-center gap-1.5 text-xs px-3 py-1.5 bg-primary text-primary-foreground rounded-lg font-semibold hover:bg-primary/90 transition-colors"
              >
                <FileDown className="w-3.5 h-3.5" />
                {t('تنزيل', 'Download')}
              </a>
              <button
                onClick={closePreview}
                className="flex items-center gap-1.5 text-xs px-3 py-1.5 border border-secondary/40 rounded-lg hover:bg-secondary/10 transition-colors"
              >
                <X className="w-3.5 h-3.5" />
                {t('إغلاق', 'Close')}
              </button>
            </div>
          </div>
          {/* PDF iframe */}
          <iframe
            src={previewUrl}
            className="flex-1 w-full bg-white"
            title={t('معاينة PDF', 'PDF preview')}
          />
        </div>
      )}

    </div>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────
export default function KnowledgeSearch() {
  const { isAuthenticated } = useAuth();
  const [, setLocation] = useLocation();
  const { lang, t } = useLang();
  setPageSEO({ title: t('البحث في الأنظمة السعودية', 'Search Saudi Laws'), description: t('ابحث في نصوص الأنظمة السعودية — نظام العمل السعودي، نظام الأحوال الشخصية السعودي، التعاميم واللوائح الرسمية.', 'Search the texts of Saudi laws, including labour and personal-status law, official circulars, and regulations.'), canonical: 'https://rabablegal.com/knowledge-search' });
  const [activeTab, setActiveTab] = useState<SearchTab>(() => {
    const param = new URLSearchParams(window.location.search).get('tab') as SearchTab | null;
    const valid: SearchTab[] = ['contract', 'consult', 'research', 'regulation', 'circular', 'codex'];
    return param && valid.includes(param) ? param : 'research';
  });
  const [queries, setQueries] = useState<Record<string, string>>({});
  const [results, setResults] = useState<Record<string, SearchResult[]>>({});
  const [smartSummary, setSmartSummary] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState<Record<string, boolean>>({});
  const [searched, setSearched] = useState<Record<string, boolean>>({});
  const [error, setError] = useState<Record<string, string>>({});
  const [upgradeRequired, setUpgradeRequired] = useState(false);
  const [fallback, setFallback] = useState<Record<string, boolean>>({});
  // Citation filters (judicial tab only)
  const [filterCourt, setFilterCourt] = useState('');
  const [filterStage, setFilterStage] = useState('');
  const [showFilters, setShowFilters] = useState(false);
  const [citableCount, setCitableCount] = useState<Record<string, { citable: number; total: number }>>({});
  // Tracks when results existed but all failed the 70% relevance gate
  const [noSufficientSources, setNoSufficientSources] = useState<Record<string, boolean>>({});
  // Tracks when each tab's results were last fetched (for stale-while-revalidate)
  const [lastFetched, setLastFetched] = useState<Record<string, number>>({});

  const STALE_TIME = 60_000; // 60 seconds

  const tab = TABS.find(t => t.id === activeTab)!;
  const query = queries[activeTab] ?? '';
  const tabResults = results[activeTab] ?? [];
  const tabLoading = loading[activeTab] ?? false;
  const tabSearched = searched[activeTab] ?? false;
  const tabError = error[activeTab] ?? '';

  // Core search executor — accepts explicit tabId/query/category so it can be
  // called both from the form handler and from the stale-data effect.
  const runSearch = useCallback(async (tabId: string, q: string, tabCategory: string | undefined, court: string, stage: string) => {
    if (!q.trim()) return;
    if (!isAuthenticated) { setLocation(`/login?returnTo=${encodeURIComponent(window.location.pathname + window.location.search)}`); return; }
    setLoading(p => ({ ...p, [tabId]: true }));
    setError(p => ({ ...p, [tabId]: '' }));
    setSearched(p => ({ ...p, [tabId]: true }));
    setUpgradeRequired(false);
    try {
      const params = new URLSearchParams({ q, category: tabCategory ?? '' });
      if (tabId === 'judicial') {
        if (court) params.set('court', court);
        if (stage) params.set('stage', stage);
      }
      const res = await fetch(
        `${API_BASE}/api/knowledge/search?${params}`,
        { credentials: 'include' }
      );
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        if (err.code === 'UPGRADE_REQUIRED') { setUpgradeRequired(true); setResults(p => ({ ...p, [tabId]: [] })); return; }
        throw new Error(err.error || 'فشل البحث');
      }
      const data = await res.json();
      setResults(p => ({ ...p, [tabId]: data.results ?? [] }));
      setSmartSummary(p => ({ ...p, [tabId]: data.smartSummary ?? '' }));
      setFallback(p => ({ ...p, [tabId]: !!data.fallback }));
      setNoSufficientSources(p => ({ ...p, [tabId]: !!data.noSufficientSources }));
      if (data.citableCount !== undefined) {
        setCitableCount(p => ({ ...p, [tabId]: { citable: data.citableCount, total: data.totalCount ?? data.results?.length ?? 0 } }));
      }
      setLastFetched(p => ({ ...p, [tabId]: Date.now() }));
    } catch (err: any) {
      setError(p => ({ ...p, [tabId]: err.message }));
    } finally {
      setLoading(p => ({ ...p, [tabId]: false }));
    }
  }, [isAuthenticated, setLocation]);

  const handleSearch = useCallback(async (e: React.FormEvent) => {
    e.preventDefault();
    if (tabLoading) return;
    runSearch(activeTab, query, tab.category, filterCourt, filterStage);
  }, [query, activeTab, tabLoading, tab.category, filterCourt, filterStage, runSearch]);

  // Auto-refetch when switching to a tab whose results are stale (> STALE_TIME ms old).
  // Only fires when the tab has already been searched and has a saved query — no
  // unnecessary loading spinners on tabs that haven't been used yet.
  const queriesRef = React.useRef(queries);
  queriesRef.current = queries;
  const loadingRef = React.useRef(loading);
  loadingRef.current = loading;
  const lastFetchedRef = React.useRef(lastFetched);
  lastFetchedRef.current = lastFetched;
  const searchedRef = React.useRef(searched);
  searchedRef.current = searched;

  React.useEffect(() => {
    const savedQuery = queriesRef.current[activeTab] ?? '';
    const alreadySearched = searchedRef.current[activeTab] ?? false;
    const isLoading = loadingRef.current[activeTab] ?? false;
    const fetchedAt = lastFetchedRef.current[activeTab] ?? 0;
    const isStale = fetchedAt === 0 || Date.now() - fetchedAt > STALE_TIME;

    if (alreadySearched && savedQuery.trim() && !isLoading && isStale) {
      const currentTab = TABS.find(t => t.id === activeTab)!;
      runSearch(activeTab, savedQuery, currentTab.category, filterCourt, filterStage);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTab]);

  const clearTab = () => {
    setQueries(p => ({ ...p, [activeTab]: '' }));
    setResults(p => ({ ...p, [activeTab]: [] }));
    setSmartSummary(p => ({ ...p, [activeTab]: '' }));
    setSearched(p => ({ ...p, [activeTab]: false }));
    setError(p => ({ ...p, [activeTab]: '' }));
  };

  return (
    <div className="min-h-screen flex flex-col overflow-x-hidden bg-muted/10" dir={lang === 'ar' ? 'rtl' : 'ltr'}>
      <Navbar />
      <main className="flex-1 w-full px-3 sm:px-5 lg:px-7 py-10 max-w-none">

        {/* Header */}
        <div className="text-center mb-8">
          <div className="w-14 h-14 bg-primary/10 rounded-2xl flex items-center justify-center mx-auto mb-3">
            <BookOpen className="w-7 h-7 text-primary" />
          </div>
          <h1 className="text-3xl font-bold text-primary mb-1">{t('الباحثة القانونية الذكية', 'Smart Legal Research')}</h1>
          <p className="text-muted-foreground text-base">{t('ابحث في مصادر قانونية موثوقة بالذكاء الاصطناعي', 'AI-powered search across trusted legal sources')}</p>
        </div>

        {/* Tabs */}
        <div className="flex gap-1 bg-amber-50 border border-amber-200 rounded-2xl p-1 mb-6 overflow-x-auto">
          {TABS.map(tb => (
            <button
              key={tb.id}
              onClick={() => setActiveTab(tb.id)}
              className={cn(
                'flex items-center gap-1.5 px-4 py-2.5 rounded-xl text-sm font-semibold whitespace-nowrap transition-all flex-1 justify-center',
                activeTab === tb.id
                  ? 'bg-gradient-to-b from-amber-400 to-amber-600 text-white shadow-md shadow-amber-200'
                  : 'text-amber-700 hover:bg-amber-100'
              )}
            >
              {tb.icon}
              <span>{t(tb.labelAr, tb.labelEn)}</span>
            </button>
          ))}
        </div>

        <div className="mb-5" />

        {/* ── Consult tab ── */}
        {activeTab === 'consult' && (
          <div className="text-center py-12 space-y-6">
            <div className="w-20 h-20 bg-primary/10 rounded-3xl flex items-center justify-center mx-auto">
              <MessageSquare className="w-10 h-10 text-primary" />
            </div>
            <div>
              <h2 className="text-xl font-bold text-primary mb-2">{t('طلب استشارة قانونية', 'Request a Legal Consultation')}</h2>
              <p className="text-muted-foreground text-sm max-w-sm mx-auto">
                {t('احصل على استشارة قانونية دقيقة مخصصة لوضعك — تتضمن تحليل المسألة، المستند القانوني، والخطوات المقترحة.', 'Get a precise consultation tailored to your situation, including issue analysis, legal support, and recommended next steps.')}
              </p>
            </div>
            <div className="flex flex-col sm:flex-row gap-3 justify-center">
              <Link href="/consultation">
                <button className="px-6 py-3 bg-primary text-primary-foreground rounded-xl font-bold text-sm hover:bg-primary/90 transition-colors">
                  {t('ابدأ استشارة جديدة', 'Start a New Consultation')}
                </button>
              </Link>
              <Link href="/dashboard">
                <button className="px-6 py-3 border border-secondary/40 rounded-xl font-medium text-sm hover:bg-secondary/10 transition-colors">
                  {t('استشاراتي السابقة', 'My Previous Consultations')}
                </button>
              </Link>
            </div>
          </div>
        )}

        {/* ── Regulatory researcher tab ── */}
        {activeTab === 'regulation' && <RegulatoryResearcher />}

        {/* ── MOJ Circulars tab ── */}
        {activeTab === 'circular' && <MojCircularBrowser />}

        {/* ── Contract drafter tab ── */}
        {activeTab === 'contract' && <ContractDrafter />}

        {/* ── Legal research report tab ── */}
        {activeTab === 'research' && <LegalResearcher />}

        {/* ── Legal codex browser tab ── */}
        {activeTab === 'codex' && <LegalCodexBrowser />}

        {/* ── Search tabs (judicial / circular / regulation) ── */}
        {!tab.actionOnly && (
          <>
            <form onSubmit={handleSearch} className="mb-6">
              <div className="relative">
                <Search className={cn('absolute top-1/2 -translate-y-1/2 w-5 h-5 text-muted-foreground', lang === 'ar' ? 'right-4' : 'left-4')} />
                <input
                  value={query}
                  onChange={e => setQueries(p => ({ ...p, [activeTab]: e.target.value }))}
                  placeholder={tab.placeholder}
                  className={cn(
                    'w-full h-14 rounded-2xl border-2 border-secondary/60 bg-background text-base outline-none focus:outline-none focus:ring-0 focus:border-secondary transition-colors shadow-sm',
                    lang === 'ar' ? 'pr-12 pl-20' : 'pl-12 pr-20'
                  )}
                />
                {query && (
                  <button type="button" onClick={clearTab}
                    className={cn('absolute top-1/2 -translate-y-1/2 p-1.5 text-muted-foreground hover:text-foreground', lang === 'ar' ? 'left-14' : 'right-14')}>
                    <X className="w-4 h-4" />
                  </button>
                )}
                <button
                  type="submit"
                  disabled={!query.trim() || tabLoading}
                  className={cn(
                    'absolute top-1/2 -translate-y-1/2 h-11 px-5 bg-primary text-primary-foreground rounded-xl font-bold text-base hover:bg-primary/90 disabled:opacity-50',
                    lang === 'ar' ? 'left-2' : 'right-2'
                  )}
                >
                  {tabLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : t('بحث', 'Search')}
                </button>
              </div>
            </form>

            {/* Upgrade */}
            {upgradeRequired && (
              <div className="mb-6 p-6 bg-primary/5 border-2 border-primary/30 rounded-2xl text-center">
                <Lock className="w-10 h-10 text-primary mx-auto mb-3" />
                <h3 className="font-bold text-primary text-lg mb-2">{t('خدمة مدفوعة', 'Paid Service')}</h3>
                <p className="text-muted-foreground text-sm mb-4">{t('الباحثة القانونية متاحة للمشتركين — اختر إحدى الباقات للوصول', 'Smart Legal Research is available to subscribers — choose a plan to access it.')}</p>
                <Link href="/pricing">
                  <button className="px-6 py-2.5 bg-primary text-primary-foreground rounded-xl font-bold text-sm hover:bg-primary/90">
                    {t('ترقية الباقة الآن', 'Upgrade Now')}
                  </button>
                </Link>
              </div>
            )}

            {/* Error */}
            {tabError && (
              <div className="mb-4 p-3 bg-destructive/10 border border-destructive/30 rounded-xl text-sm text-destructive">{localizedAuthError(tabError, t)}</div>
            )}

            {/* Fallback notice */}
            {fallback[activeTab] && !tabLoading && (
              <div className="mb-4 px-4 py-2.5 bg-amber-50 border border-amber-200 rounded-xl text-xs text-amber-800 flex items-center gap-2">
                <span>⚡</span>
                <span>{t('لم نجد نتائج في هذا القسم — نعرض من كافة المصادر المتاحة', 'No results were found in this section — showing results from all available sources.')}</span>
              </div>
            )}

            {/* No sufficient sources notice — shown when results existed but all below 70% */}
            {noSufficientSources[activeTab] && !tabLoading && (tabResults.length === 0) && (
              <div className="mb-4 px-4 py-4 bg-destructive/5 border border-destructive/20 rounded-xl text-sm text-destructive/90 text-center">
                <p className="font-bold mb-1">⚠️ {t('لا توجد مصادر كافية للإجابة', 'There are not enough sources to answer')}</p>
                <p className="text-xs text-muted-foreground">
                  {t('وُجدت نتائج لكن درجة صلتها بالسؤال أقل من 70% — عرضها يُضلّل أكثر مما يُفيد في السياق القانوني.', 'Results were found, but their relevance is below 70%; showing them could be misleading in a legal context.')}
                </p>
                <p className="text-xs text-muted-foreground mt-1">
                  💡 {t('حاول إعادة صياغة السؤال بمصطلحات أكثر تحديداً، أو ابحث بالمادة / النظام مباشرةً.', 'Try rephrasing your question with more specific terms, or search for the article or law directly.')}
                </p>
              </div>
            )}

            {/* Results count + filter toggle (judicial) */}
            {tabSearched && !tabLoading && !upgradeRequired && (
              <div className="flex items-center justify-between mb-4">
                <div>
                  <p className="text-xs text-muted-foreground">
                    {tabResults.length === 0 ? t('لم يُعثر على نتائج مطابقة', 'No matching results') : `${tabResults.length} ${t('نتيجة', 'results')}`}
                  </p>
                  {activeTab === 'judicial' && citableCount[activeTab] && citableCount[activeTab].citable > 0 && (
                    <p className="text-xs text-primary mt-0.5">
                      {citableCount[activeTab].citable} {t('نتيجة قابلة للاستشهاد', 'citable')} {citableCount[activeTab].total > citableCount[activeTab].citable ? `${t('من', 'of')} ${citableCount[activeTab].total}` : ''}
                    </p>
                  )}
                </div>
                {activeTab === 'judicial' && (
                  <button
                    onClick={() => setShowFilters(v => !v)}
                    className={cn(
                      "flex items-center gap-1 text-xs px-2.5 py-1 rounded-lg border transition-colors",
                      showFilters
                        ? "bg-primary/10 border-primary/30 text-primary"
                        : "border-secondary/40 text-muted-foreground hover:bg-secondary/10"
                    )}
                  >
                    <Search className="w-3 h-3" />
                    {t('تصفية حسب المحكمة / الدرجة', 'Filter by court / stage')}
                  </button>
                )}
              </div>
            )}

            {/* Citation filter panel */}
            {activeTab === 'judicial' && showFilters && (
              <div className="mb-4 p-4 bg-muted/30 border border-secondary/45 rounded-xl space-y-3 shadow-sm shadow-secondary/5">
                <div className="flex gap-3 flex-wrap">
                  <div className="flex-1 min-w-[160px]">
                    <label className="text-xs text-muted-foreground mb-1 block">المحكمة / الدائرة</label>
                    <input
                      value={filterCourt}
                      onChange={e => setFilterCourt(e.target.value)}
                      placeholder="مثال: المحكمة التجارية بالرياض"
                      className="w-full text-xs px-3 py-1.5 rounded-lg border border-secondary/40 bg-background focus:outline-none focus:border-secondary transition-colors"
                    />
                  </div>
                  <div className="flex-1 min-w-[140px]">
                    <label className="text-xs text-muted-foreground mb-1 block">درجة التقاضي</label>
                    <select
                      value={filterStage}
                      onChange={e => setFilterStage(e.target.value)}
                      className="w-full text-xs px-3 py-1.5 rounded-lg border border-secondary/40 bg-background focus:outline-none focus:border-secondary transition-colors"
                    >
                      <option value="">الكل</option>
                      <option value="ابتدائي">ابتدائي</option>
                      <option value="استئناف">استئناف</option>
                      <option value="تمييز">تمييز</option>
                      <option value="ديوان_المظالم">ديوان المظالم</option>
                    </select>
                  </div>
                </div>
                {(filterCourt || filterStage) && (
                  <button
                    onClick={() => { setFilterCourt(''); setFilterStage(''); }}
                    className="text-xs text-muted-foreground hover:text-foreground"
                  >
                    ✕ إزالة التصفية
                  </button>
                )}
              </div>
            )}

            {/* Istishad notice for judicial results */}
            {activeTab === 'judicial' && tabSearched && tabResults.length > 0 && !tabLoading && (
              <div className="mb-4 px-4 py-2.5 bg-amber-50/80 border border-amber-200/80 rounded-xl text-xs text-amber-800 flex items-start gap-2">
                <AlertTriangle className="w-3.5 h-3.5 shrink-0 mt-0.5" />
                <span>تنبيه: السوابق القضائية في المملكة العربية السعودية للاستئناس لا للإلزام. يُنصح بمراجعة محامٍ مرخّص قبل الاستناد إليها.</span>
              </div>
            )}

            {/* Smart summary */}
            {smartSummary[activeTab] && !tabLoading && tabResults.length > 0 && (
              <div className="mb-5 p-4 bg-primary/5 border border-primary/20 rounded-2xl shadow-sm">
                <div className="flex items-center gap-2 mb-2">
                  <span className="text-xs font-bold text-primary uppercase tracking-wide">✨ {t('ملخص ذكي', 'Smart Summary')}</span>
                </div>
                <p className="text-sm leading-relaxed text-foreground/90">{smartSummary[activeTab]}</p>
                <p className="text-[10px] text-muted-foreground mt-2">{t('مستخلص من المصادر أدناه — يُنصح بمراجعة النصوص الأصلية', 'Extracted from sources below — verify against original texts')}</p>
              </div>
            )}

            {/* Results */}
            <div className="space-y-3">
              {tabResults.map((r, i) => (
                  <div key={i} className="bg-card border border-secondary/40 rounded-xl p-5 hover:border-secondary hover:bg-secondary/5 transition-colors shadow-sm">
                    <div className="flex items-center gap-2 mb-3 flex-wrap">
                      <span className="text-xs text-primary/70 font-medium">
                        {activeTab === 'judicial' ? '⚖️ سابقة قضائية'
                         : activeTab === 'circular' ? '📋 تعميم'
                         : '📜 نظام / لائحة'}
                      </span>
                      {/* Phase-1: literal match badge — shown when chunk was retrieved by exact number/phrase */}
                      {r.literalMatch && (
                        <span className="text-xs px-2 py-0.5 rounded-full font-bold bg-emerald-100 text-emerald-700 border border-emerald-200 flex items-center gap-1">
                          <span>🎯</span> مطابقة حرفية
                        </span>
                      )}
                      <span className="flex-1" />
                      {/* Relevance score — separate from source verification */}
                      <span className={cn(
                        "text-xs px-2 py-0.5 rounded-full font-medium",
                        r.similarity >= 0.85 ? "bg-green-100 text-green-700"
                        : r.similarity >= 0.75 ? "bg-primary/10 text-primary"
                        : "bg-amber-100 text-amber-700"
                      )}>
                        صلة {Math.round(r.similarity * 100)}%
                      </span>
                    </div>
                    {/* Phase-1: extracted refs from auto-link — shown for linked results */}
                    {r.extractedRefs && r.extractedRefs.length > 0 && (
                      <div className="flex flex-wrap gap-1 mb-2">
                        {r.extractedRefs.map((ref, ri) => (
                          <span key={ri} className="text-[10px] px-1.5 py-0.5 rounded-md bg-blue-50 text-blue-700 border border-blue-100">
                            🔗 {ref}
                          </span>
                        ))}
                      </div>
                    )}
                    <p className="text-sm leading-relaxed text-foreground/90">
                      {trimContent(sanitizeText(r.content))}
                    </p>
                    <CitationCard result={r} />
                  </div>
                ))}
            </div>

            {/* Empty state */}
            {!tabSearched && (
              <div className="text-center py-14 text-muted-foreground">
                <div className="w-16 h-16 bg-muted rounded-2xl flex items-center justify-center mx-auto mb-4">
                  {React.cloneElement(
                    tab.icon as React.ReactElement<{ className?: string }>,
                    { className: 'w-8 h-8 text-muted-foreground' },
                  )}
                </div>
                <p className="text-sm font-medium mb-1">{t(tab.labelAr, tab.labelEn)}</p>
                <p className="text-xs">{t('اكتب موضوعاً للبدء', 'Type a topic to begin')}</p>
              </div>
            )}
          </>
        )}

      </main>
      <Footer />
    </div>
  );
}
