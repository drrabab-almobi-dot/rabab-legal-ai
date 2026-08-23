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
    <span className={cn("px-2 py-0.5 rounded-full text-[11px] font-bold", map[stage] ?? "bg-gray-100 text-gray-600")}>
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

  const citation = [
    codexTitle,
    detail.caseNo ? `قضية رقم ${detail.caseNo}` : null,
    detail.rulingNo ? `حكم رقم ${detail.rulingNo}` : null,
    detail.rulingDateHijri ? `بتاريخ ${detail.rulingDateHijri}هـ` : null,
    detail.court ?? null,
    detail.circuit ? `دائرة ${detail.circuit}` : null,
    detail.litigationStage ? `(${detail.litigationStage})` : null,
    detail.pageStartPrinted ? `ص${detail.pageStartPrinted}` : null,
  ].filter(Boolean).join("، ");

  const copyCitation = () => {
    navigator.clipboard.writeText(citation).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
    });
  };

  const safeText = (text: string | null | undefined, confidence: number) =>
    confident(text, confidence) ?? "غير متوفر في المستند";

  return (
    <div className="h-full overflow-y-auto" dir="rtl">
      <div className="space-y-4 p-4">
        {/* تنبيه استئناس */}
        <div className="p-3 bg-amber-50 border border-amber-200 rounded-xl text-xs text-amber-800">
          <span className="font-bold">⚠️ </span>
          السوابق القضائية في المملكة العربية السعودية للاستئناس لا للإلزام. يُرجى التحقق من المصدر الأصلي.
        </div>

        {/* Header */}
        <div className="bg-card border border-border/60 rounded-2xl overflow-hidden shadow-sm">
          <div className="flex flex-wrap items-center gap-2 px-4 py-3 bg-muted/30 border-b border-border/40">
            <Gavel className="w-4 h-4 text-primary" />
            <span className="flex-1 text-sm font-bold text-foreground leading-snug">
              {detail.disputeSubject || "موضوع غير محدد"}
            </span>
            {stageBadge(detail.litigationStage)}
          </div>

          {/* Metadata */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 px-4 py-4 text-xs border-b border-border/30">
            {[
              { label: "المدونة", value: codexTitle },
              { label: "رقم القضية", value: detail.caseNo },
              { label: "رقم الحكم", value: detail.rulingNo },
              { label: "التاريخ الهجري", value: detail.rulingDateHijri ? `${detail.rulingDateHijri}هـ` : null },
              { label: "التاريخ الميلادي", value: detail.rulingDateGregorian },
              { label: "المحكمة", value: detail.court },
              { label: "الدائرة", value: detail.circuit },
              { label: "درجة التقاضي", value: detail.litigationStage },
              { label: "رقم الصفحة", value: detail.pageStartPrinted ? `ص${detail.pageStartPrinted}${detail.pageEndPrinted ? `–${detail.pageEndPrinted}` : ""}` : null },
            ].map(({ label, value }) => (
              <div key={label}>
                <p className="text-muted-foreground mb-0.5">{label}</p>
                <p className="font-semibold text-foreground">{value || <span className="text-muted-foreground italic">—</span>}</p>
              </div>
            ))}
            {detail.legalArticles?.length > 0 && (
              <div className="col-span-full">
                <p className="text-muted-foreground mb-1">المواد النظامية</p>
                <div className="flex flex-wrap gap-1">
                  {detail.legalArticles.map(a => (
                    <span key={a} className="px-2 py-0.5 bg-blue-50 border border-blue-100 text-blue-700 rounded-lg text-xs">{a}</span>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* ملخص */}
          <div className="px-4 py-3 border-b border-border/30 space-y-1.5">
            <div className="flex items-center gap-2">
              <div className="w-1.5 h-4 rounded-full bg-blue-500" />
              <span className="text-sm font-bold text-foreground">ملخص القضية</span>
            </div>
            <p className="text-sm leading-relaxed text-foreground/85 bg-muted/20 rounded-xl p-3 pr-4" dir="rtl">
              {safeText(detail.summary, detail.summaryConfidence)}
            </p>
          </div>

          {/* التسبيب */}
          <div className="px-4 py-3 border-b border-border/30 space-y-1.5">
            <div className="flex items-center gap-2">
              <div className="w-1.5 h-4 rounded-full bg-amber-500" />
              <span className="text-sm font-bold text-foreground">التسبيب</span>
            </div>
            <p className="text-sm leading-relaxed text-foreground/85 bg-muted/20 rounded-xl p-3 pr-4" dir="rtl">
              {safeText(detail.reasoning, detail.reasoningConfidence ?? 0)}
            </p>
          </div>

          {/* المنطوق */}
          <div className="px-4 py-3 border-b border-border/30 space-y-1.5">
            <div className="flex items-center gap-2">
              <div className="w-1.5 h-4 rounded-full bg-green-500" />
              <span className="text-sm font-bold text-foreground">المنطوق / الحكم</span>
            </div>
            <p className="text-sm leading-relaxed text-foreground/85 bg-muted/20 rounded-xl p-3 pr-4 font-semibold" dir="rtl">
              {safeText(detail.ruling, detail.rulingConfidence)}
            </p>
          </div>

          {/* المبدأ */}
          {detail.legalPrinciple && (
            <div className="px-4 py-3 border-b border-border/30 space-y-1.5">
              <div className="flex items-center gap-2">
                <div className="w-1.5 h-4 rounded-full bg-purple-500" />
                <span className="text-sm font-bold text-foreground">المبدأ المستخلص</span>
              </div>
              <p className="text-sm leading-relaxed text-foreground/90 bg-purple-50/50 border border-purple-100 rounded-xl p-3 pr-4 font-medium" dir="rtl">
                {detail.legalPrinciple}
              </p>
            </div>
          )}

          {/* Disclaimer + view button */}
          <div className="px-4 py-3 border-b border-border/30 space-y-2">
            <p className="text-xs text-muted-foreground leading-relaxed">
              ⚠️ الملخص مُولَّد مساعداً من نص الوثيقة الرسمية. المعتمد هو الوثيقة الأصلية المعروضة بجانبه.
            </p>
            {detail.pageStartFile && (
              <button
                onClick={() => onOpenViewer(detail.codexId, detail.pageStartFile!)}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-primary text-primary-foreground rounded-xl text-xs font-bold hover:bg-primary/90 transition-colors"
              >
                <Eye className="w-3 h-3" />
                الاطلاع على الوثيقة الأصلية (ص{detail.pageStartFile})
              </button>
            )}
          </div>

          {/* بطاقة الاستشهاد */}
          <div className="mx-4 mb-4 p-3 bg-muted/30 border border-border/50 rounded-2xl space-y-1.5">
            <p className="text-xs font-bold text-foreground">📋 بطاقة الاستشهاد</p>
            <p className="text-xs text-muted-foreground leading-relaxed" dir="rtl">{citation}</p>
            <button
              onClick={copyCitation}
              className="flex items-center gap-1.5 text-xs text-primary hover:underline"
            >
              {copied ? <CheckCircle className="w-3 h-3 text-green-500" /> : <Copy className="w-3 h-3" />}
              {copied ? "تم النسخ!" : "نسخ الاستشهاد"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Result Card ────────────────────────────────────────────────────────────────
function ResultCard({ c, onSelect }: { c: CaseSummary; onSelect: () => void }) {
  return (
    <button
      onClick={onSelect}
      className="w-full text-right p-4 bg-card border border-border/60 rounded-2xl hover:border-primary/60 hover:shadow-sm transition-all space-y-2"
      dir="rtl"
    >
      <div className="flex items-center gap-2 flex-wrap">
        {stageBadge(c.litigationStage)}
        {c.caseNo && <span className="text-xs font-mono text-muted-foreground">{c.caseNo}</span>}
        {c.rulingDateHijri && (
          <span className="text-xs text-muted-foreground">{c.rulingDateHijri}هـ</span>
        )}
        {c.pageStartPrinted && (
          <span className="text-xs text-muted-foreground bg-muted/50 px-1.5 py-0.5 rounded-lg">ص{c.pageStartPrinted}</span>
        )}
        <ChevronRight className="w-4 h-4 text-primary mr-auto" />
      </div>
      <p className="text-sm font-bold text-foreground line-clamp-2">
        {c.disputeSubject || "موضوع غير محدد"}
      </p>
      <div className="flex items-center gap-2 text-xs text-muted-foreground flex-wrap">
        {c.court && <span className="truncate max-w-[200px]">{c.court}</span>}
        {c.rulingNo && <span>حكم {c.rulingNo}</span>}
      </div>
      {c.legalPrinciple && (
        <p className="text-xs text-purple-700 bg-purple-50 rounded-lg px-2 py-1 line-clamp-2">{c.legalPrinciple}</p>
      )}
      {c.snippet && !c.legalPrinciple && (
        <p className="text-xs text-muted-foreground line-clamp-3 leading-relaxed">{c.snippet}</p>
      )}
    </button>
  );
}

// ── Main Page ──────────────────────────────────────────────────────────────────
export default function LegalSearchPage() {
  setPageSEO({
    title: "الباحث الذكي — السوابق القضائية والمدونات",
    description: "بحث دلالي ذكي في المدونات القضائية السعودية. يفهم معنى الاستعلام ويعرض التفاصيل والصفحات الأصلية.",
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
    <div className="min-h-screen bg-background flex flex-col">
      <Navbar />

      {/* ── Hero header ── */}
      <div className="bg-primary text-white px-4 py-8" dir="rtl">
        <div className="container mx-auto max-w-6xl">
          <div className="flex items-center gap-3 mb-4">
            <div className="w-11 h-11 rounded-2xl bg-white/10 flex items-center justify-center">
              <Sparkles className="w-5 h-5 text-secondary" />
            </div>
            <div>
              <h1 className="text-xl font-bold">الباحثة القانونية الذكية</h1>
              <p className="text-xs text-white/70">بحث دلالي يفهم معنى الاستعلام — السوابق القضائية والمدونات</p>
            </div>
          </div>

          {/* Search form */}
          <form onSubmit={e => { e.preventDefault(); doSearch(); }} className="space-y-3">
            <div className="flex gap-2">
              <div className="flex-1 relative">
                <Search className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-white/40 pointer-events-none" />
                <input
                  value={query}
                  onChange={e => setQuery(e.target.value)}
                  placeholder="ابحث بموضوع النزاع أو مبدأ قانوني أو نص حكم..."
                  className="w-full h-12 rounded-2xl bg-white/10 border border-white/20 px-4 pr-10 text-sm text-white placeholder:text-white/40 focus:outline-none focus:border-secondary/60 focus:bg-white/15"
                />
              </div>
              <button
                type="submit"
                disabled={loading || !query.trim()}
                className="px-5 h-12 bg-secondary text-primary rounded-2xl font-bold text-sm hover:bg-secondary/90 disabled:opacity-40 flex items-center gap-2 shrink-0 transition-colors"
              >
                {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
                {loading ? "جارٍ..." : "ابحث"}
              </button>
            </div>

            {/* Filters toggle */}
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setShowFilters(v => !v)}
                className={cn(
                  "flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold transition-colors",
                  showFilters ? "bg-white/20 text-white" : "bg-white/10 text-white/70 hover:bg-white/15 hover:text-white"
                )}
              >
                <Filter className="w-3.5 h-3.5" />
                {hasFilters ? `فلاتر (${[codexFilter, courtFilter, stageFilter, yearFilter, cityFilter, disputeFilter].filter(Boolean).length})` : "الفلاتر"}
                <ChevronDown className={cn("w-3 h-3 transition-transform", showFilters && "rotate-180")} />
              </button>
              {hasFilters && (
                <button
                  type="button"
                  onClick={() => { setCodexFilter(""); setCourtFilter(""); setStageFilter(""); setYearFilter(""); setCityFilter(""); setDisputeFilter(""); }}
                  className="flex items-center gap-1 text-xs text-white/60 hover:text-white"
                >
                  <X className="w-3 h-3" />
                  مسح الفلاتر
                </button>
              )}
            </div>

            {showFilters && (
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                {codices.length > 0 && (
                  <select
                    value={codexFilter}
                    onChange={e => setCodexFilter(e.target.value)}
                    className="h-9 rounded-xl bg-white/10 border border-white/20 px-3 text-xs text-white [&>option]:text-foreground [&>option]:bg-background focus:outline-none"
                  >
                    <option value="">كل المدونات</option>
                    {codices.map(c => (
                      <option key={c.id} value={String(c.id)}>{c.title}</option>
                    ))}
                  </select>
                )}
                <input
                  value={courtFilter}
                  onChange={e => setCourtFilter(e.target.value)}
                  placeholder="المحكمة"
                  className="h-9 rounded-xl bg-white/10 border border-white/20 px-3 text-xs text-white placeholder:text-white/40 focus:outline-none"
                />
                <input
                  value={cityFilter}
                  onChange={e => setCityFilter(e.target.value)}
                  placeholder="المدينة"
                  className="h-9 rounded-xl bg-white/10 border border-white/20 px-3 text-xs text-white placeholder:text-white/40 focus:outline-none"
                />
                <select
                  value={stageFilter}
                  onChange={e => setStageFilter(e.target.value)}
                  className="h-9 rounded-xl bg-white/10 border border-white/20 px-3 text-xs text-white [&>option]:text-foreground [&>option]:bg-background focus:outline-none"
                >
                  <option value="">كل الدرجات</option>
                  {STAGES.map(s => <option key={s} value={s}>{s}</option>)}
                </select>
                <input
                  value={yearFilter}
                  onChange={e => setYearFilter(e.target.value)}
                  placeholder="السنة الهجرية (مثال: 1443)"
                  className="h-9 rounded-xl bg-white/10 border border-white/20 px-3 text-xs text-white placeholder:text-white/40 focus:outline-none"
                />
                <input
                  value={disputeFilter}
                  onChange={e => setDisputeFilter(e.target.value)}
                  placeholder="نوع النزاع"
                  className="h-9 rounded-xl bg-white/10 border border-white/20 px-3 text-xs text-white placeholder:text-white/40 focus:outline-none"
                />
              </div>
            )}
          </form>
        </div>
      </div>

      {/* ── Main content: two-panel ── */}
      <div className="flex-1 container mx-auto max-w-[1600px] flex flex-col">

        {!isAuthenticated && (
          <div className="text-center py-20 text-muted-foreground" dir="rtl">
            <BookOpen className="w-12 h-12 mx-auto mb-4 opacity-30" />
            <p className="text-lg font-bold mb-2">تصفّح الباحثة الذكية ثم ابدأ تجربتك</p>
            <p className="text-sm mb-4">سجّل الدخول للبحث في المدونات القضائية والاستفادة من خدماتك المجانية.</p>
            <button
              type="button"
              onClick={() => setLocation(`/login?returnTo=${encodeURIComponent(window.location.pathname + window.location.search)}`)}
              className="rounded-xl bg-secondary px-5 py-2.5 text-sm font-bold text-primary hover:bg-secondary/90"
            >
              تسجيل الدخول للبحث
            </button>
          </div>
        )}

        {isAuthenticated && !lastQuery && (
          <div className="text-center py-20 text-muted-foreground" dir="rtl">
            <Sparkles className="w-12 h-12 mx-auto mb-4 opacity-20" />
            <p className="text-base font-bold text-foreground/70 mb-2">ابحث بموضوع أو مبدأ قانوني</p>
            <p className="text-sm">مثال: "مكافأة نهاية الخدمة"، "شرط جزائي في عقد الإيجار"، "الدفع بعدم الاختصاص"</p>
          </div>
        )}

        {isAuthenticated && error && (
          <div className="p-4 m-4 bg-destructive/10 border border-destructive/20 rounded-2xl text-sm text-destructive" dir="rtl">
            {error}
            <button onClick={doSearch} className="mr-3 text-xs underline"><RefreshCw className="inline w-3 h-3 ml-1" />إعادة المحاولة</button>
          </div>
        )}

        {isAuthenticated && loading && (
          <div className="flex items-center justify-center py-20 gap-3 text-muted-foreground">
            <Loader2 className="w-6 h-6 animate-spin text-primary" />
            <div dir="rtl">
              <p className="text-sm font-semibold text-foreground">يجري البحث الدلالي...</p>
              <p className="text-xs text-muted-foreground">توسيع الاستعلام وفهم المعنى القانوني</p>
            </div>
          </div>
        )}

        {isAuthenticated && !loading && lastQuery && (
          <div className={cn(
            "flex-1 flex flex-col md:flex-row",
            selectedCase ? "md:divide-x md:divide-x-reverse divide-border/40" : ""
          )}>
            {/* ── Left panel: results list — hidden on mobile when a case is open ── */}
            <div className={cn(
              "overflow-y-auto",
              selectedCase ? "hidden md:block md:w-80 shrink-0 border-l border-border/40" : "flex-1"
            )}>
              <div className="p-4 space-y-3" dir="rtl">
                {/* Stats + expanded terms */}
                {!loading && (
                  <div className="flex items-center justify-between gap-2 text-xs text-muted-foreground">
                    <span>{total} نتيجة</span>
                    {expanded.length > 1 && (
                      <span className="text-primary/70">
                        بحث في: {expanded.slice(1).join(" | ")}
                      </span>
                    )}
                  </div>
                )}

                {cases.length === 0 && !loading && lastQuery && (
                  <div className="text-center py-12 text-muted-foreground">
                    <Search className="w-8 h-8 mx-auto mb-3 opacity-30" />
                    <p className="text-sm">لم تُعثر نتائج لهذا البحث</p>
                    <p className="text-xs mt-1">جرّب مصطلحاً مختلفاً أو مسح الفلاتر</p>
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
                  <div className={cn("flex-1 flex flex-col md:flex-row", viewerOpen ? "md:divide-x md:divide-x-reverse divide-border/40" : "")}>
                    {/* Case detail */}
                    <div className={cn("overflow-y-auto", viewerOpen ? "md:w-[42%] md:shrink-0" : "flex-1")}>
                      <div className="sticky top-0 z-10 flex items-center justify-between px-4 py-2 bg-background border-b border-border/40">
                        <button
                          onClick={() => { setSelectedCase(null); setViewerOpen(false); }}
                          className="flex items-center gap-1.5 text-xs text-primary hover:underline"
                        >
                          ← العودة للنتائج
                        </button>
                        {!viewerOpen && selectedCase.pageStartFile && (
                          <button
                            onClick={() => openViewer(selectedCase.codexId, selectedCase.pageStartFile!)}
                            className="flex items-center gap-1.5 text-xs font-bold text-primary bg-primary/10 px-2.5 py-1 rounded-lg hover:bg-primary/20 transition-colors"
                          >
                            <Eye className="w-3 h-3" />
                            فتح الوثيقة
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
                      <div className="flex-1 border-r border-border/40 min-h-[60vh] md:min-h-[70vh]">
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
