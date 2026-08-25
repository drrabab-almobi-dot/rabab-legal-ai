/**
 * الباحث الذكي — صفحة مستقلة
 * البحث الدلالي في المدونات القضائية مع نافذتين: التفاصيل + صور الوثيقة الأصلية
 */
import { useState, useRef, useCallback, useEffect } from "react";
import { useLocation } from "wouter";
import { Navbar, Footer } from "@/components/layout";
import { DocumentPageViewer } from "@/components/DocumentPageViewer";
import { setPageSEO } from "@/lib/seo";
import {
  Search, Filter, Loader2, ChevronDown, Gavel, BookOpen,
  Copy, CheckCircle, Eye, Sparkles, X, ChevronRight, RefreshCw,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useAuth } from "@/hooks/use-auth";
import { useLang } from "@/hooks/use-language";

const API_BASE = import.meta.env.BASE_URL?.replace(/\/$/, "") ?? "";

// ── Types ─────────────────────────────────────────────────────────────────────
interface CaseSummary {
  id: number;
  codexId: number;
  caseNo: string | null;
  rulingNo: string | null;
  rulingDateHijri: string | null;
  court: string | null;
  circuit: string | null;
  litigationStage: string | null;
  disputeSubject: string | null;
  legalPrinciple: string | null;
  pageStartFile: number | null;
  pageStartPrinted: number | null;
  summaryConfidence: number;
  rulingConfidence: number;
  snippet: string | null;
}

interface CaseDetail extends CaseSummary {
  summary: string | null;
  reasoning: string | null;
  ruling: string | null;
  reasoningConfidence: number;
  pageEndPrinted: number | null;
  rulingDateGregorian: string | null;
  legalArticles: string[];
}

interface Codex { id: number; title: string; publisher: string | null; year: string | null; }

const STAGES = ["ابتدائي", "استئناف", "تمييز", "إداري", "تحكيم"];
const CONFIDENCE_THRESHOLD = 0.45;

function stageBadge(stage: string | null) {
  if (!stage) return null;
  const map: Record<string, string> = {
    ابتدائي: "bg-blue-100 text-blue-700",
    استئناف: "bg-amber-100 text-amber-700",
    تمييز: "bg-purple-100 text-purple-700",
    إداري: "bg-green-100 text-green-700",
    تحكيم: "bg-rose-100 text-rose-700",
  };
  return (
    <span className={cn("px-2 py-0.5 rounded-full text-[11px] font-bold", map[stage] ?? "bg-gray-100 text-gray-600")} dir="auto">
      {stage}
    </span>
  );
}

function confident(text: string | null | undefined, confidence: number) {
  return text && confidence >= CONFIDENCE_THRESHOLD ? text : null;
}

// ── Case Detail View ───────────────────────────────────────────────────────────
function CaseDetailPanel({
  detail,
  codexTitle,
  onOpenViewer,
}: {
  detail: CaseDetail;
  codexTitle: string;
  onOpenViewer: (codexId: number, page: number) => void;
}) {
  const [copied, setCopied] = useState(false);
  const { lang, t } = useLang();

  const citation = [
    codexTitle,
    detail.caseNo ? `${t('قضية رقم', 'Case no.')} ${detail.caseNo}` : null,
    detail.rulingNo ? `${t('حكم رقم', 'Judgment no.')} ${detail.rulingNo}` : null,
    detail.rulingDateHijri ? `${t('بتاريخ', 'Dated')} ${detail.rulingDateHijri}${t('هـ', ' AH')}` : null,
    detail.court ?? null,
    detail.circuit ? `${t('دائرة', 'Circuit')} ${detail.circuit}` : null,
    detail.litigationStage ? `(${detail.litigationStage})` : null,
    detail.pageStartPrinted ? `${t('ص', 'p.')} ${detail.pageStartPrinted}` : null,
  ].filter(Boolean).join(t("، ", ", "));

  const copyCitation = () => {
    navigator.clipboard.writeText(citation).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
    });
  };

  const safeText = (text: string | null | undefined, confidence: number) =>
    confident(text, confidence) ?? t('غير متوفر في المستند', 'Not available in the document');

  return (
    <div className="h-full overflow-y-auto" dir={lang === 'ar' ? 'rtl' : 'ltr'} data-no-translate>
      <div className="space-y-4 p-4">
        {/* تنبيه استئناس */}
        <div className="p-3 bg-amber-50 border-2 border-amber-400/70 rounded-xl text-xs text-amber-800">
          <span className="font-bold">⚠️ </span>
          {t('السوابق القضائية في المملكة العربية السعودية للاستئناس لا للإلزام. يُرجى التحقق من المصدر الأصلي.', 'Judicial precedents in Saudi Arabia are for guidance, not binding authority. Please verify the original source.')}
        </div>

        {/* Header */}
        <div className="bg-card border-2 border-blue-400/70 rounded-2xl overflow-hidden shadow-sm shadow-blue-400/10">
          <div className="flex flex-wrap items-center gap-2 px-4 py-3 bg-muted/30 border-b border-blue-400/30">
            <Gavel className="w-4 h-4 text-primary" />
            <span className="flex-1 text-sm font-bold text-foreground leading-snug text-start" dir="auto">
              {detail.disputeSubject || t('موضوع غير محدد', 'Subject not specified')}
            </span>
            {stageBadge(detail.litigationStage)}
          </div>

          {/* Metadata */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 px-4 py-4 text-xs border-b border-blue-400/25">
            {[
               { label: t("المدونة", "Codex"), value: codexTitle },
               { label: t("رقم القضية", "Case number"), value: detail.caseNo },
               { label: t("رقم الحكم", "Judgment number"), value: detail.rulingNo },
                { label: t("التاريخ الهجري", "Hijri date"), value: detail.rulingDateHijri ? `${detail.rulingDateHijri}${t('هـ', ' AH')}` : null },
               { label: t("التاريخ الميلادي", "Gregorian date"), value: detail.rulingDateGregorian },
               { label: t("المحكمة", "Court"), value: detail.court },
               { label: t("الدائرة", "Circuit"), value: detail.circuit },
               { label: t("درجة التقاضي", "Litigation stage"), value: detail.litigationStage },
                { label: t("رقم الصفحة", "Page"), value: detail.pageStartPrinted ? `${t('ص', 'p.')} ${detail.pageStartPrinted}${detail.pageEndPrinted ? `–${detail.pageEndPrinted}` : ""}` : null },
            ].map(({ label, value }) => (
              <div key={label}>
                <p className="text-secondary font-semibold mb-0.5">{label}</p>
                <p className="font-semibold text-foreground text-start" dir="auto">{value || <span className="text-muted-foreground italic">—</span>}</p>
              </div>
            ))}
            {detail.legalArticles?.length > 0 && (
              <div className="col-span-full">
                <p className="text-secondary font-semibold mb-1">{t('المواد النظامية', 'Legal articles')}</p>
                <div className="flex flex-wrap gap-1">
                  {detail.legalArticles.map(a => (
                    <span key={a} className="px-2 py-0.5 bg-blue-50 border border-blue-100 text-blue-700 rounded-lg text-xs" dir="auto">{a}</span>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* ملخص */}
          <div className="px-4 py-3 border-b border-border/30 space-y-1.5">
            <div className="flex items-center gap-2">
              <div className="w-1.5 h-4 rounded-full bg-blue-500" />
              <span className="text-sm font-bold text-secondary">{t('ملخص القضية', 'Case summary')}</span>
            </div>
            <p className="text-sm leading-relaxed text-foreground/85 bg-muted/20 rounded-xl p-3 text-start" dir="auto">
              {safeText(detail.summary, detail.summaryConfidence)}
            </p>
          </div>

          {/* التسبيب */}
          <div className="px-4 py-3 border-b border-border/30 space-y-1.5">
            <div className="flex items-center gap-2">
              <div className="w-1.5 h-4 rounded-full bg-amber-500" />
              <span className="text-sm font-bold text-secondary">{t('التسبيب', 'Reasoning')}</span>
            </div>
            <p className="text-sm leading-relaxed text-foreground/85 bg-muted/20 rounded-xl p-3 text-start" dir="auto">
              {safeText(detail.reasoning, detail.reasoningConfidence ?? 0)}
            </p>
          </div>

          {/* المنطوق */}
          <div className="px-4 py-3 border-b border-border/30 space-y-1.5">
            <div className="flex items-center gap-2">
              <div className="w-1.5 h-4 rounded-full bg-green-500" />
              <span className="text-sm font-bold text-secondary">{t('المنطوق / الحكم', 'Ruling')}</span>
            </div>
            <p className="text-sm leading-relaxed text-foreground/85 bg-muted/20 rounded-xl p-3 text-start font-semibold" dir="auto">
              {safeText(detail.ruling, detail.rulingConfidence)}
            </p>
          </div>

          {/* المبدأ */}
          {detail.legalPrinciple && (
            <div className="px-4 py-3 border-b border-border/30 space-y-1.5">
              <div className="flex items-center gap-2">
                <div className="w-1.5 h-4 rounded-full bg-purple-500" />
                <span className="text-sm font-bold text-secondary">{t('المبدأ المستخلص', 'Extracted principle')}</span>
              </div>
              <p className="text-sm leading-relaxed text-foreground/90 bg-purple-50/50 border border-purple-100 rounded-xl p-3 text-start font-medium" dir="auto">
                {detail.legalPrinciple}
              </p>
            </div>
          )}

          {/* Disclaimer + view button */}
          <div className="px-4 py-3 border-b border-border/30 space-y-2">
            <p className="text-xs text-muted-foreground leading-relaxed">
              {t('⚠️ الملخص مُولَّد مساعداً من نص الوثيقة الرسمية. المعتمد هو الوثيقة الأصلية المعروضة بجانبه.', '⚠️ This summary is generated from the official document. The original document shown beside it is authoritative.')}
            </p>
            {detail.pageStartFile && (
              <button
                onClick={() => onOpenViewer(detail.codexId, detail.pageStartFile!)}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-primary text-primary-foreground rounded-xl text-xs font-bold hover:bg-primary/90 transition-colors"
              >
                <Eye className="w-3 h-3" />
                {t('الاطلاع على الوثيقة الأصلية', 'View original document')} ({t('ص', 'p.')} {detail.pageStartFile})
              </button>
            )}
          </div>

          {/* بطاقة الاستشهاد */}
          <div className="mx-4 mb-4 p-3 bg-muted/30 border border-blue-300/60 rounded-2xl space-y-1.5">
            <p className="text-xs font-bold text-secondary">📋 {t('بطاقة الاستشهاد', 'Citation card')}</p>
            <p className="text-xs text-muted-foreground leading-relaxed text-start" dir="auto">{citation}</p>
            <button
              onClick={copyCitation}
              className="flex items-center gap-1.5 text-xs text-primary hover:underline"
            >
              {copied ? <CheckCircle className="w-3 h-3 text-green-500" /> : <Copy className="w-3 h-3" />}
              {copied ? t('تم النسخ!', 'Copied!') : t('نسخ الاستشهاد', 'Copy citation')}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Result Card ────────────────────────────────────────────────────────────────
function ResultCard({ c, onSelect }: { c: CaseSummary; onSelect: () => void }) {
  const { t } = useLang();
  return (
    <button
      onClick={onSelect}
      className="w-full text-start p-4 bg-card border-2 border-secondary/65 rounded-2xl hover:border-secondary hover:shadow-md hover:shadow-secondary/10 transition-all space-y-2"
      dir="auto"
      data-no-translate
    >
      <div className="flex items-center gap-2 flex-wrap">
        {stageBadge(c.litigationStage)}
        {c.caseNo && <span className="text-xs font-mono text-muted-foreground" dir="auto">{c.caseNo}</span>}
        {c.rulingDateHijri && (
          <span className="text-xs text-muted-foreground" dir="auto">{c.rulingDateHijri}{t('هـ', ' AH')}</span>
        )}
        {c.pageStartPrinted && (
          <span className="text-xs text-muted-foreground bg-muted/50 px-1.5 py-0.5 rounded-lg" dir="auto">{t('ص', 'p.')} {c.pageStartPrinted}</span>
        )}
        <ChevronRight className="w-4 h-4 text-primary ms-auto" />
      </div>
      <p className="text-sm font-bold text-foreground line-clamp-2 text-start" dir="auto">
        {c.disputeSubject || t('موضوع غير محدد', 'Subject not specified')}
      </p>
      <div className="flex items-center gap-2 text-xs text-muted-foreground flex-wrap">
        {c.court && <span className="truncate max-w-[200px]" dir="auto">{c.court}</span>}
        {c.rulingNo && <span dir="auto">{t('حكم', 'Judgment')} {c.rulingNo}</span>}
      </div>
      {c.legalPrinciple && (
        <p className="text-xs text-purple-700 bg-purple-50 rounded-lg px-2 py-1 line-clamp-2 text-start" dir="auto">{c.legalPrinciple}</p>
      )}
      {c.snippet && !c.legalPrinciple && (
        <p className="text-xs text-muted-foreground line-clamp-3 leading-relaxed text-start" dir="auto">{c.snippet}</p>
      )}
    </button>
  );
}

// ── Main Page ──────────────────────────────────────────────────────────────────
export default function LegalSearchPage() {
  const { lang, t } = useLang();
  setPageSEO({
    title: t("الباحث الذكي — السوابق القضائية والمدونات", "Smart Research — Precedents & Codices"),
    description: t("بحث دلالي ذكي في المدونات القضائية السعودية. يفهم معنى الاستعلام ويعرض التفاصيل والصفحات الأصلية.", "Smart semantic research across Saudi legal codices. It understands your query and shows details and original pages."),
    canonical: "https://rabablegal.com/legal-search",
  });

  const { isAuthenticated } = useAuth();
  const [, setLocation] = useLocation();

  // Search
  const [query, setQuery] = useState("");
  const [lastQuery, setLastQuery] = useState("");
  const [cases, setCases] = useState<CaseSummary[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [expanded, setExpanded] = useState<string[]>([]);

  // Filters
  const [codices, setCodeces] = useState<Codex[]>([]);
  const [showFilters, setShowFilters] = useState(false);
  const [codexFilter, setCodexFilter] = useState("");
  const [courtFilter, setCourtFilter] = useState("");
  const [stageFilter, setStageFilter] = useState("");
  const [yearFilter, setYearFilter] = useState("");
  const [cityFilter, setCityFilter] = useState("");
  const [disputeFilter, setDisputeFilter] = useState("");

  // Detail + two-panel
  const [selectedCase, setSelectedCase] = useState<CaseDetail | null>(null);
  const [selectedCodexTitle, setSelectedCodexTitle] = useState("");
  const [detailLoading, setDetailLoading] = useState(false);

  // PDF viewer (inline in right panel)
  const [viewerCodexId, setViewerCodexId] = useState(0);
  const [viewerPage, setViewerPage] = useState(1);
  const [viewerOpen, setViewerOpen] = useState(false);
  const [viewerTitle, setViewerTitle] = useState("");

  // Load codices for filter
  useEffect(() => {
    fetch(`${API_BASE}/api/codex/codices`, { credentials: "include" })
      .then(r => r.json())
      .then(d => setCodeces(d.codices ?? []))
      .catch(() => {});
  }, []);

  const doSearch = useCallback(async () => {
    if (!query.trim()) return;
    if (!isAuthenticated) {
      setLocation(`/login?returnTo=${encodeURIComponent(window.location.pathname + window.location.search)}`);
      return;
    }
    setLoading(true);
    setError("");
    setCases([]);
    setSelectedCase(null);
    setViewerOpen(false);
    setLastQuery(query.trim());

    try {
      const r = await fetch(`${API_BASE}/api/codex/smart-search`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          q: query.trim(),
          codexId: codexFilter,
          court: courtFilter,
          stage: stageFilter,
          year: yearFilter,
          city: cityFilter,
          disputeType: disputeFilter,
        }),
      });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error || "فشل البحث");
      setCases(d.cases ?? []);
      setTotal(d.total ?? 0);
      setExpanded(d.expanded ?? []);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, [query, codexFilter, courtFilter, stageFilter, yearFilter, cityFilter, disputeFilter, isAuthenticated, setLocation]);

  const openDetail = async (c: CaseSummary) => {
    setDetailLoading(true);
    setSelectedCase(null);
    setViewerOpen(false);
    try {
      const r = await fetch(`${API_BASE}/api/codex/cases/${c.id}`, { credentials: "include" });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error || "فشل");
      const caseData: CaseDetail = d.case;
      setSelectedCase(caseData);
      const codex = codices.find(x => x.id === caseData.codexId);
      setSelectedCodexTitle(codex?.title ?? d.codex?.title ?? "");

      // Auto-open viewer if page is known
      if (caseData.pageStartFile) {
        setViewerCodexId(caseData.codexId);
        setViewerPage(caseData.pageStartFile);
        setViewerTitle(codex?.title ?? d.codex?.title ?? "المستند");
        setViewerOpen(true);
      }
    } catch (e: any) {
      setError(e.message);
    } finally {
      setDetailLoading(false);
    }
  };

  const openViewer = (codexId: number, page: number) => {
    const codex = codices.find(c => c.id === codexId);
    setViewerCodexId(codexId);
    setViewerPage(page);
    setViewerTitle(codex?.title ?? selectedCodexTitle ?? "المستند");
    setViewerOpen(true);
  };

  const hasFilters = !!(codexFilter || courtFilter || stageFilter || yearFilter || cityFilter || disputeFilter);

  return (
    <div className="min-h-screen bg-background flex flex-col" dir={lang === 'ar' ? 'rtl' : 'ltr'}>
      <Navbar />

      {/* ── Hero header ── */}
      <div className="bg-primary text-white px-3 sm:px-5 lg:px-7 py-8 border-b-4 border-secondary">
        <div className="w-full">
          <div className="flex items-center gap-3 mb-4">
            <div className="w-11 h-11 rounded-2xl border-2 border-secondary/70 bg-white/10 flex items-center justify-center">
              <Sparkles className="w-5 h-5 text-secondary" />
            </div>
            <div>
               <h1 className="text-2xl font-bold text-secondary">{t('الباحثة القانونية الذكية', 'Smart Legal Research')}</h1>
               <p className="text-sm text-white/70">{t('بحث دلالي يفهم معنى الاستعلام — السوابق القضائية والمدونات', 'Semantic search that understands your query across judicial precedents and codices')}</p>
            </div>
          </div>

          {/* Search form */}
          <form onSubmit={e => { e.preventDefault(); doSearch(); }} className="space-y-3 rounded-2xl border-2 border-secondary/65 bg-white/5 p-3 shadow-lg shadow-black/10">
            <div className="flex gap-2">
              <div className="flex-1 relative">
                <Search className="absolute end-3 top-1/2 -translate-y-1/2 w-4 h-4 text-white/40 pointer-events-none" />
                <input
                  value={query}
                  onChange={e => setQuery(e.target.value)}
                  placeholder={t('ابحث بموضوع النزاع أو مبدأ قانوني أو نص حكم...', 'Search by dispute subject, legal principle, or judgment text…')}
                  dir="auto"
                  className="w-full h-14 rounded-2xl bg-white/10 border-2 border-secondary/55 px-4 pe-10 text-base text-white placeholder:text-white/40 focus:outline-none focus:border-secondary focus:bg-white/15"
                />
              </div>
              <button
                type="submit"
                disabled={loading || !query.trim()}
                className="px-6 h-14 bg-secondary text-primary rounded-2xl font-bold text-base hover:bg-secondary/90 disabled:opacity-40 flex items-center gap-2 shrink-0 transition-colors"
              >
                {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
                 {loading ? t("جارٍ...", 'Searching…') : t("ابحث", 'Search')}
              </button>
            </div>

            {/* Filters toggle */}
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setShowFilters(v => !v)}
                className={cn(
                  "flex items-center gap-1.5 px-3 py-1.5 rounded-xl border text-xs font-bold transition-colors",
                  showFilters ? "border-secondary bg-secondary/20 text-secondary" : "border-secondary/55 bg-white/10 text-white hover:bg-white/15 hover:text-secondary"
                )}
              >
                <Filter className="w-3.5 h-3.5" />
                 {hasFilters ? `${t('الفلاتر', 'Filters')} (${[codexFilter, courtFilter, stageFilter, yearFilter, cityFilter, disputeFilter].filter(Boolean).length})` : t("الفلاتر", 'Filters')}
                <ChevronDown className={cn("w-3 h-3 transition-transform", showFilters && "rotate-180")} />
              </button>
              {hasFilters && (
                <button
                  type="button"
                  onClick={() => { setCodexFilter(""); setCourtFilter(""); setStageFilter(""); setYearFilter(""); setCityFilter(""); setDisputeFilter(""); }}
                  className="flex items-center gap-1 text-xs text-white/60 hover:text-white"
                >
                  <X className="w-3 h-3" />
                   {t('مسح الفلاتر', 'Clear filters')}
                </button>
              )}
            </div>

            {showFilters && (
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 rounded-xl border border-secondary/40 bg-black/10 p-2">
                {codices.length > 0 && (
                  <select
                    value={codexFilter}
                    onChange={e => setCodexFilter(e.target.value)}
                    className="h-9 rounded-xl bg-white/10 border border-secondary/55 px-3 text-xs text-white [&>option]:text-foreground [&>option]:bg-background focus:outline-none focus:border-secondary"
                  >
                    <option value="">{t('كل المدونات', 'All codices')}</option>
                    {codices.map(c => (
                      <option key={c.id} value={String(c.id)} dir="auto">{c.title}</option>
                    ))}
                  </select>
                )}
                <input
                  value={courtFilter}
                  onChange={e => setCourtFilter(e.target.value)}
                  placeholder={t('المحكمة', 'Court')}
                  dir="auto"
                  className="h-9 rounded-xl bg-white/10 border border-secondary/55 px-3 text-xs text-white placeholder:text-white/40 focus:outline-none focus:border-secondary"
                />
                <input
                  value={cityFilter}
                  onChange={e => setCityFilter(e.target.value)}
                  placeholder={t('المدينة', 'City')}
                  dir="auto"
                  className="h-9 rounded-xl bg-white/10 border border-blue-400/70 px-3 text-xs text-white placeholder:text-white/40 focus:outline-none focus:border-blue-300"
                />
                <select
                  value={stageFilter}
                  onChange={e => setStageFilter(e.target.value)}
                  className="h-9 rounded-xl bg-white/10 border border-emerald-400/70 px-3 text-xs text-white [&>option]:text-foreground [&>option]:bg-background focus:outline-none focus:border-emerald-300"
                >
                  <option value="">{t('كل الدرجات', 'All stages')}</option>
                  {STAGES.map(s => <option key={s} value={s} dir="auto">{s}</option>)}
                </select>
                <input
                  value={yearFilter}
                  onChange={e => setYearFilter(e.target.value)}
                  placeholder={t('السنة الهجرية (مثال: 1443)', 'Hijri year (e.g. 1443)')}
                  dir="auto"
                  className="h-9 rounded-xl bg-white/10 border border-amber-400/70 px-3 text-xs text-white placeholder:text-white/40 focus:outline-none focus:border-amber-300"
                />
                <input
                  value={disputeFilter}
                  onChange={e => setDisputeFilter(e.target.value)}
                  placeholder={t('نوع النزاع', 'Dispute type')}
                  dir="auto"
                  className="h-9 rounded-xl bg-white/10 border border-purple-400/70 px-3 text-xs text-white placeholder:text-white/40 focus:outline-none focus:border-purple-300"
                />
              </div>
            )}
          </form>
        </div>
      </div>

      {/* ── Main content: two-panel ── */}
      <div className="flex-1 w-full px-3 sm:px-5 lg:px-7 flex flex-col">

        {!isAuthenticated && (
          <div className="my-8 mx-auto w-full max-w-2xl text-center py-14 px-5 text-foreground rounded-2xl border-2 border-secondary/65 bg-card shadow-sm shadow-secondary/10" dir={lang === 'ar' ? 'rtl' : 'ltr'}>
            <BookOpen className="w-12 h-12 mx-auto mb-4 opacity-30" />
             <p className="text-lg font-bold mb-2">{t('تصفّح الباحثة الذكية ثم ابدأ تجربتك', 'Explore Smart Research, then start your experience')}</p>
             <p className="text-sm mb-4">{t('سجّل الدخول للبحث في المدونات القضائية والاستفادة من خدماتك المجانية.', 'Log in to search judicial codices and use your free services.')}</p>
            <button
              type="button"
              onClick={() => setLocation(`/login?returnTo=${encodeURIComponent(window.location.pathname + window.location.search)}`)}
              className="rounded-xl bg-secondary px-5 py-2.5 text-sm font-bold text-primary hover:bg-secondary/90"
            >
               {t('تسجيل الدخول للبحث', 'Log in to Search')}
            </button>
          </div>
        )}

        {isAuthenticated && !lastQuery && (
          <div className="my-8 mx-auto w-full max-w-2xl text-center py-14 px-5 text-foreground rounded-2xl border-2 border-blue-400/70 bg-card shadow-sm shadow-blue-400/10" dir={lang === 'ar' ? 'rtl' : 'ltr'}>
            <Sparkles className="w-12 h-12 mx-auto mb-4 opacity-20" />
            <p className="text-base font-bold text-secondary mb-2">{t('ابحث بموضوع أو مبدأ قانوني', 'Search by subject or legal principle')}</p>
            <p className="text-sm text-foreground/85">{t('مثال: "مكافأة نهاية الخدمة"، "شرط جزائي في عقد الإيجار"، "الدفع بعدم الاختصاص"', 'Examples: “end-of-service benefit”, “liquidated damages in a lease”, “lack of jurisdiction”.')}</p>
          </div>
        )}

        {isAuthenticated && error && (
          <div className="p-4 m-4 bg-destructive/10 border border-destructive/20 rounded-2xl text-sm text-destructive" dir={lang === 'ar' ? 'rtl' : 'ltr'}>
            <span dir="auto">{error}</span>
            <button onClick={doSearch} className="ms-3 text-xs underline"><RefreshCw className="inline w-3 h-3 me-1" />{t('إعادة المحاولة', 'Try again')}</button>
          </div>
        )}

        {isAuthenticated && loading && (
          <div className="flex items-center justify-center py-20 gap-3 text-muted-foreground">
            <Loader2 className="w-6 h-6 animate-spin text-primary" />
            <div dir={lang === 'ar' ? 'rtl' : 'ltr'}>
              <p className="text-sm font-semibold text-foreground">{t('يجري البحث الدلالي...', 'Searching semantically…')}</p>
              <p className="text-xs text-muted-foreground">{t('توسيع الاستعلام وفهم المعنى القانوني', 'Expanding the query and interpreting legal meaning')}</p>
            </div>
          </div>
        )}

        {isAuthenticated && !loading && lastQuery && (
          <div className={cn(
            "flex-1 flex flex-col md:flex-row",
             selectedCase ? cn("md:divide-x-2 divide-blue-400/35", lang === 'ar' && "md:divide-x-reverse") : ""
          )}>
            {/* ── Left panel: results list — hidden on mobile when a case is open ── */}
            <div className={cn(
              "overflow-y-auto",
              selectedCase ? "hidden md:block md:w-96 shrink-0 border-s border-border/40" : "flex-1"
            )}>
              <div className="p-4 space-y-3" dir={lang === 'ar' ? 'rtl' : 'ltr'}>
                {/* Stats + expanded terms */}
                {!loading && (
                  <div className="flex items-center justify-between gap-2 text-xs text-muted-foreground">
                    <span>{total} {t('نتيجة', 'results')}</span>
                    {expanded.length > 1 && (
                      <span className="text-primary/70">
                         {t('بحث في:', 'Also searched:')} {expanded.slice(1).join(" | ")}
                      </span>
                    )}
                  </div>
                )}

                {cases.length === 0 && !loading && lastQuery && (
                  <div className="text-center py-12 text-muted-foreground">
                    <Search className="w-8 h-8 mx-auto mb-3 opacity-30" />
                    <p className="text-sm">{t('لم تُعثر نتائج لهذا البحث', 'No results found for this search')}</p>
                    <p className="text-xs mt-1">{t('جرّب مصطلحاً مختلفاً أو مسح الفلاتر', 'Try a different term or clear the filters')}</p>
                  </div>
                )}

                {cases.map(c => (
                  <ResultCard
                    key={c.id}
                    c={c}
                    onSelect={() => openDetail(c)}
                  />
                ))}
              </div>
            </div>

            {/* ── Right panels: detail + viewer ── */}
            {selectedCase && (
              <div className="flex-1 flex flex-col min-h-0 min-h-[50vh] md:min-h-[70vh]">
                {detailLoading ? (
                  <div className="flex-1 flex items-center justify-center">
                    <Loader2 className="w-6 h-6 animate-spin text-primary" />
                  </div>
                ) : (
                  <div className={cn("flex-1 flex flex-col md:flex-row", viewerOpen ? cn("md:divide-x-2 divide-blue-400/35", lang === 'ar' && "md:divide-x-reverse") : "")}>
                    {/* Case detail */}
                    <div className={cn("overflow-y-auto", viewerOpen ? "md:w-[42%] md:shrink-0" : "flex-1")}>
                      <div className="sticky top-0 z-10 flex items-center justify-between px-4 py-2 bg-background border-b border-blue-400/35">
                        <button
                          onClick={() => { setSelectedCase(null); setViewerOpen(false); }}
                          className="flex items-center gap-1.5 text-xs text-primary hover:underline"
                        >
                          {t('← العودة للنتائج', '← Back to results')}
                        </button>
                        {!viewerOpen && selectedCase.pageStartFile && (
                          <button
                            onClick={() => openViewer(selectedCase.codexId, selectedCase.pageStartFile!)}
                            className="flex items-center gap-1.5 text-xs font-bold text-primary bg-primary/10 px-2.5 py-1 rounded-lg hover:bg-primary/20 transition-colors"
                          >
                            <Eye className="w-3 h-3" />
                            {t('فتح الوثيقة', 'Open document')}
                          </button>
                        )}
                      </div>
                      <CaseDetailPanel
                        detail={selectedCase}
                        codexTitle={selectedCodexTitle}
                        onOpenViewer={openViewer}
                      />
                    </div>

                    {/* PDF viewer — inline, fills remaining space */}
                    {viewerOpen && (
                      <div className="flex-1 border-e-2 border-blue-400/35 min-h-[60vh] md:min-h-[70vh]">
                        <DocumentPageViewer
                          inline
                          pdfUrl={`${API_BASE}/api/codex/${viewerCodexId}/pdf`}
                          initialPage={viewerPage}
                          title={viewerTitle}
                          onClose={() => setViewerOpen(false)}
                        />
                      </div>
                    )}
                  </div>
                )}
              </div>
            )}
          </div>
        )}
      </div>

      <Footer />
    </div>
  );
}
