/**
 * LegalCodexBrowser
 * Browsing + search interface for legal codex cases.
 * Shows case metadata, summary/reasoning/ruling (extracted text).
 * Document viewer (DocumentPageViewer) opens on demand at the correct page.
 *
 * Architecture reminder:
 * - Summary/reasoning/ruling from text = displayed in card (with confidence gate)
 * - PDF pages = displayed via DocumentPageViewer (pdfjs-dist renders images)
 * - Any confidence < 0.5 → show "غير متوفر في المستند"
 */
import { useState, useEffect, useRef, useCallback } from "react";
import { Link } from "wouter";
import {
  Search, BookOpen, Filter, ChevronDown, ChevronUp, Copy, Check,
  ExternalLink, Loader2, Calendar, Scale, Building2, FileText,
  AlertTriangle, X, Gavel, Eye, Upload
} from "lucide-react";
import { DocumentPageViewer } from "./DocumentPageViewer";
import { cn } from "@/lib/utils";
import { useAuth } from "@/hooks/use-auth";
import { useLang } from "@/hooks/use-language";

const API_BASE = import.meta.env.BASE_URL?.replace(/\/$/, "") === ""
  ? ""
  : import.meta.env.BASE_URL?.replace(/\/$/, "") ?? "";

function localizedAuthError(message: string, t: (ar: string, en: string) => string): string {
  const normalized = message.trim().toLowerCase();
  if (["unauthorized", "unauthorised", "unauthorized access", "authentication required", "auth_required", "authentication_required", "401", "غير مصرح", "غير مصرح به", "غير مخول", "يلزم تسجيل الدخول"].includes(normalized)) {
    return t("يرجى تسجيل الدخول للوصول إلى هذه الخدمة.", "Please sign in to access this service.");
  }
  if (["forbidden", "access denied", "permission denied", "forbidden_access", "403", "ممنوع", "الوصول مرفوض", "لا تملك صلاحية الوصول", "ليس لديك صلاحية الوصول"].includes(normalized)) {
    return t("ليس لديك صلاحية الوصول إلى هذه الخدمة.", "You do not have permission to access this service.");
  }
  return message;
}

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
  pageStartPrinted: string | null;
  summaryConfidence: number;
  rulingConfidence: number;
  snippet?: string | null;
}

interface CaseDetail {
  id: number;
  codexId: number;
  caseNo: string | null;
  rulingNo: string | null;
  rulingDateHijri: string | null;
  rulingDateGregorian: string | null;
  court: string | null;
  circuit: string | null;
  litigationStage: string | null;
  disputeSubject: string | null;
  legalPrinciple: string | null;
  legalArticles: string[];
  pageStartFile: number | null;
  pageEndFile: number | null;
  pageStartPrinted: string | null;
  pageEndPrinted: string | null;
  summary: string | null;
  summaryConfidence: number;
  reasoning: string | null;
  reasoningConfidence: number;
  ruling: string | null;
  rulingConfidence: number;
}

interface Codex {
  id: number;
  title: string;
  court: string | null;
  publisher: string | null;
  totalCases: number;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

const CONFIDENCE_THRESHOLD = 0.5;

function confident(text: string | null | undefined, confidence: number): string | null {
  if (!text || confidence < CONFIDENCE_THRESHOLD) return null;
  return text;
}

function stageBadge(stage: string | null) {
  if (!stage) return null;
  const colors: Record<string, string> = {
    "ابتدائي": "bg-blue-100 text-blue-700",
    "استئناف": "bg-amber-100 text-amber-700",
    "تمييز": "bg-purple-100 text-purple-700",
    "عالي": "bg-red-100 text-red-700",
    "غير محدد": "bg-gray-100 text-gray-600",
  };
  const cls = colors[stage] ?? "bg-gray-100 text-gray-600";
  return <span className={cn("px-2 py-0.5 rounded-full text-xs font-bold text-start", cls)} dir="auto">{stage}</span>;
}

// ── Case Detail Card ──────────────────────────────────────────────────────────

interface CaseDetailViewProps {
  detail: CaseDetail;
  codexTitle: string;
  onOpenViewer: (codexId: number, pageFile: number) => void;
  onBack: () => void;
}

function CaseDetailView({ detail, codexTitle, onOpenViewer, onBack }: CaseDetailViewProps) {
  const [copied, setCopied] = useState(false);
  const [expandSection, setExpandSection] = useState<"summary" | "reasoning" | "ruling" | null>(null);
  const { isAr, t } = useLang();
  const uiDir = isAr ? "rtl" : "ltr";

  const safeText = (text: string | null | undefined, confidence: number) =>
    confident(text, confidence) ?? t("غير متوفر في المستند", "Unavailable in document");
  const isAvailable = (text: string | null | undefined, confidence: number) =>
    !!text && confidence >= CONFIDENCE_THRESHOLD;

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

  return (
    <div className="space-y-4" dir={uiDir}>
      {/* Back button */}
      <button onClick={onBack} className="flex items-center gap-2 text-sm text-primary hover:underline font-medium">
        <ChevronDown className="w-4 h-4 rotate-90" />
        {t("العودة إلى نتائج البحث", "Back to search results")}
      </button>

      {/* استشهاد إلزامي */}
      <div className="p-3 bg-amber-50 border border-amber-200 rounded-xl text-xs text-amber-800">
        <span className="font-bold">⚠️ {t("تنبيه مهم:", "Important notice:")} </span>
        {t("السوابق القضائية في المملكة العربية السعودية للاستئناس لا للإلزام. مخرجات المنصة للاسترشاد ولا تغني عن مراجعة المحامي المختص والتحقق من المصدر الأصلي.", "Saudi judicial precedents are for guidance, not binding authority. Platform output is guidance only and does not replace consulting qualified counsel or verifying the original source.")}
      </div>

      {/* Case card header */}
      <div className="bg-card border-2 border-blue-400/70 rounded-2xl overflow-hidden shadow-sm shadow-blue-400/10">
        <div className="flex flex-wrap items-center gap-2 px-5 py-3 bg-muted/30 border-b border-blue-400/30">
          <Gavel className="w-4 h-4 text-primary" />
          <span className="flex-1 text-sm font-bold text-foreground leading-snug text-start" dir="auto">{detail.disputeSubject || t("موضوع غير محدد", "Unspecified subject")}</span>
          {stageBadge(detail.litigationStage)}
        </div>

        {/* Metadata grid */}
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 px-5 py-4 text-xs border-b border-border/30">
          {[
            { label: t("المدونة", "Collection"), value: codexTitle },
            { label: t("رقم القضية", "Case number"), value: detail.caseNo },
            { label: t("رقم الحكم", "Ruling number"), value: detail.rulingNo },
            { label: t("التاريخ الهجري", "Hijri date"), value: detail.rulingDateHijri ? `${detail.rulingDateHijri}${t("هـ", " AH")}` : null },
            { label: t("التاريخ الميلادي", "Gregorian date"), value: detail.rulingDateGregorian },
            { label: t("المحكمة", "Court"), value: detail.court },
            { label: t("الدائرة", "Circuit"), value: detail.circuit },
            { label: t("درجة التقاضي", "Litigation stage"), value: detail.litigationStage },
            { label: t("رقم الصفحة المطبوع", "Printed page number"), value: detail.pageStartPrinted ? `${t("ص", "p.")}${detail.pageStartPrinted}${detail.pageEndPrinted ? `–${detail.pageEndPrinted}` : ""}` : null },
            { label: t("المبدأ القضائي", "Legal principle"), value: detail.legalPrinciple },
          ].map(({ label, value }) => (
            <div key={label}>
              <p className="text-muted-foreground mb-0.5">{label}</p>
              <p className="font-semibold text-foreground text-start" dir="auto">{value || <span className="text-muted-foreground italic">{t("غير محدد", "Unspecified")}</span>}</p>
            </div>
          ))}
          {detail.legalArticles?.length > 0 && (
            <div className="col-span-full">
              <p className="text-muted-foreground mb-1">{t("المواد النظامية المطبّقة", "Applied legal articles")}</p>
              <div className="flex flex-wrap gap-1">
                {detail.legalArticles.map(a => (
                  <span key={a} className="px-2 py-0.5 bg-blue-50 border border-blue-100 text-blue-700 rounded-lg text-xs text-start" dir="auto">{a}</span>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* ══ القالب الإلزامي للملخص ══════════════════════════════════════════ */}

        {/* ١ — ملخص القضية */}
        <div className="px-5 py-4 border-b border-border/30 space-y-2">
          <div className="flex items-center gap-2">
            <div className="w-1.5 h-5 rounded-full bg-blue-500" />
            <span className="text-sm font-bold text-foreground flex-1">{t("ملخص القضية", "Case summary")}</span>
            {isAvailable(detail.summary, detail.summaryConfidence)
              ? <span className="text-xs text-green-600 bg-green-50 px-2 py-0.5 rounded-full">{t("مستخرج من النص", "Extracted from text")}</span>
              : <span className="text-xs text-amber-600 bg-amber-50 px-2 py-0.5 rounded-full">{t("غير متوفر في المستند", "Unavailable in document")}</span>}
          </div>
          <div className="ps-4 text-sm leading-relaxed text-foreground/85 bg-muted/20 rounded-xl p-3 text-start" dir="auto">
            {safeText(detail.summary, detail.summaryConfidence)}
          </div>
        </div>

        {/* ٢ — التسبيب */}
        <div className="px-5 py-4 border-b border-border/30 space-y-2">
          <div className="flex items-center gap-2">
            <div className="w-1.5 h-5 rounded-full bg-amber-500" />
            <span className="text-sm font-bold text-foreground flex-1">{t("التسبيب", "Reasoning")}</span>
            {isAvailable(detail.reasoning, detail.reasoningConfidence)
              ? <span className="text-xs text-green-600 bg-green-50 px-2 py-0.5 rounded-full">{t("مستخرج من النص", "Extracted from text")}</span>
              : <span className="text-xs text-amber-600 bg-amber-50 px-2 py-0.5 rounded-full">{t("غير متوفر في المستند", "Unavailable in document")}</span>}
          </div>
          <div className="ps-4 text-sm leading-relaxed text-foreground/85 bg-muted/20 rounded-xl p-3 text-start" dir="auto">
            {safeText(detail.reasoning, detail.reasoningConfidence)}
          </div>
        </div>

        {/* ٣ — المنطوق / الحكم */}
        <div className="px-5 py-4 border-b border-border/30 space-y-2">
          <div className="flex items-center gap-2">
            <div className="w-1.5 h-5 rounded-full bg-green-500" />
            <span className="text-sm font-bold text-foreground flex-1">{t("المنطوق / الحكم", "Ruling")}</span>
            {isAvailable(detail.ruling, detail.rulingConfidence)
              ? <span className="text-xs text-green-600 bg-green-50 px-2 py-0.5 rounded-full">{t("مستخرج من النص", "Extracted from text")}</span>
              : <span className="text-xs text-amber-600 bg-amber-50 px-2 py-0.5 rounded-full">{t("غير متوفر في المستند", "Unavailable in document")}</span>}
          </div>
          <div className="ps-4 text-sm leading-relaxed text-foreground/85 bg-muted/20 rounded-xl p-3 font-semibold text-start" dir="auto">
            {safeText(detail.ruling, detail.rulingConfidence)}
          </div>
        </div>

        {/* ٤ — المبدأ المستخلص (إن وُجد نصاً) */}
        {detail.legalPrinciple && (
          <div className="px-5 py-4 border-b border-border/30 space-y-2">
            <div className="flex items-center gap-2">
              <div className="w-1.5 h-5 rounded-full bg-purple-500" />
              <span className="text-sm font-bold text-foreground flex-1">{t("المبدأ المستخلص", "Extracted principle")}</span>
              <span className="text-xs text-purple-600 bg-purple-50 px-2 py-0.5 rounded-full">{t("وارد في النص", "Stated in text")}</span>
            </div>
            <div className="ps-4 text-sm leading-relaxed text-foreground/90 bg-purple-50/50 border border-purple-100 rounded-xl p-3 font-medium text-start" dir="auto">
              {detail.legalPrinciple}
            </div>
          </div>
        )}

        {/* جملة ختامية + زر الوثيقة الأصلية */}
        <div className="px-5 py-4 border-b border-border/30 space-y-2.5">
          <p className="text-xs text-muted-foreground leading-relaxed">
            ⚠️ {t("الملخص أعلاه مُولَّد مساعداً للقراءة من نص الوثيقة الرسمية حصراً. المعتمد هو نص الوثيقة الأصلية المعروضة بجانبه. يُرجى الاطلاع على تفاصيل المواد ونطاق السريان في الوثيقة الأصلية.", "The summary above is generated solely to assist reading the official document text. The original document shown alongside it is authoritative; review its provisions and applicability scope.")}
          </p>
          {detail.pageStartFile && (
            <button
              onClick={() => onOpenViewer(detail.codexId, detail.pageStartFile!)}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-primary text-primary-foreground rounded-xl text-xs font-bold hover:bg-primary/90 transition-colors"
            >
              <Eye className="w-3 h-3" />
              {t("الاطلاع على تفاصيل المواد في الوثيقة الأصلية", "View provision details in the original document")} ({t("ص", "p.")}{detail.pageStartFile})
            </button>
          )}
        </div>

        {/* ── بطاقة الاستشهاد ── */}
        <div className="mx-5 mb-5 p-4 bg-muted/30 border border-blue-300/60 rounded-2xl space-y-2">
          <p className="text-xs font-bold text-foreground">📋 {t("بطاقة الاستشهاد", "Citation card")}</p>
          <p className="text-xs text-muted-foreground leading-relaxed text-start" dir="auto">{citation}</p>
          <button
            onClick={copyCitation}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-primary text-primary-foreground rounded-xl text-xs font-bold hover:bg-primary/90 transition-colors"
          >
            {copied ? <Check className="w-3 h-3" /> : <Copy className="w-3 h-3" />}
            {copied ? t("تم النسخ!", "Copied!") : t("نسخ الاستشهاد", "Copy citation")}
          </button>
        </div>
      </div>
    </div>
  );
}

// ══════════════════════════════════════════════════════════════════════════════
// Main Browser Component
// ══════════════════════════════════════════════════════════════════════════════

export function LegalCodexBrowser() {
  const { user } = useAuth();
  const { isAr, t } = useLang();
  const isAdmin = user?.role === 'admin';
  const uiDir = isAr ? "rtl" : "ltr";

  // List state
  const [cases, setCases] = useState<CaseSummary[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [pages, setPages] = useState(1);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  // Search state
  const [query, setQuery] = useState("");
  const [codexFilter, setCodexFilter] = useState("");
  const [courtFilter, setCourtFilter] = useState("");
  const [stageFilter, setStageFilter] = useState("");
  const [yearFilter, setYearFilter] = useState("");
  const [showFilters, setShowFilters] = useState(false);

  // Codex list for filter dropdown
  const [codices, setCodeces] = useState<Codex[]>([]);
  const [noCodexYet, setNoCodexYet] = useState(false);

  // Detail state
  const [selectedCase, setSelectedCase] = useState<CaseDetail | null>(null);
  const [selectedCodexTitle, setSelectedCodexTitle] = useState("");
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailError, setDetailError] = useState("");

  // Viewer state
  const [viewerOpen, setViewerOpen] = useState(false);
  const [viewerCodexId, setViewerCodexId] = useState(0);
  const [viewerPage, setViewerPage] = useState(1);
  const [viewerTitle, setViewerTitle] = useState("");

  const fetchList = useCallback(async (pg = 1) => {
    setLoading(true);
    setError("");
    try {
      const params = new URLSearchParams({ page: String(pg), limit: "20" });
      if (query.trim()) params.set("q", query.trim());
      if (codexFilter) params.set("codexId", codexFilter);
      if (courtFilter) params.set("court", courtFilter);
      if (stageFilter) params.set("stage", stageFilter);
      if (yearFilter) params.set("year", yearFilter);

      const r = await fetch(`${API_BASE}/api/codex/search?${params}`, { credentials: "include" });
      if (!r.ok) throw new Error((await r.json().catch(() => ({}))).error || "فشل التحميل");
      const data = await r.json();
      setCases(data.cases ?? []);
      setTotal(data.total ?? 0);
      setPage(data.page ?? 1);
      setPages(data.pages ?? 1);
      setNoCodexYet(data.total === 0 && !query && !codexFilter && !courtFilter && !stageFilter && !yearFilter);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, [query, codexFilter, courtFilter, stageFilter, stageFilter, yearFilter]);

  const fetchCodeces = async () => {
    try {
      const r = await fetch(`${API_BASE}/api/codex/codices`, { credentials: "include" });
      if (r.ok) {
        const d = await r.json();
        setCodeces(d.codices ?? []);
      }
    } catch { /* silent */ }
  };

  const fetchedRef = useRef(false);
  useEffect(() => {
    if (fetchedRef.current) return;
    fetchedRef.current = true;
    fetchList(1);
    fetchCodeces();
  }, []);

  const openDetail = async (c: CaseSummary) => {
    setSelectedCase(null);
    setDetailError("");
    setDetailLoading(true);
    try {
      const r = await fetch(`${API_BASE}/api/codex/cases/${c.id}`, { credentials: "include" });
      if (!r.ok) throw new Error((await r.json().catch(() => ({}))).error || "فشل التحميل");
      const data = await r.json();
      setSelectedCase(data.case);
      setSelectedCodexTitle(data.codex?.title ?? "");
    } catch (e: any) {
      setDetailError(e.message);
    } finally {
      setDetailLoading(false);
    }
  };

  const openViewer = (codexId: number, pageFile: number) => {
    const codex = codices.find(c => c.id === codexId);
    setViewerCodexId(codexId);
    setViewerPage(pageFile);
    setViewerTitle(codex?.title ?? selectedCodexTitle ?? "المستند");
    setViewerOpen(true);
  };

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    setPage(1);
    fetchList(1);
  };

  const clearFilters = () => {
    setCodexFilter(""); setCourtFilter(""); setStageFilter(""); setYearFilter("");
    setTimeout(() => fetchList(1), 50);
  };

  // ── Detail view ────────────────────────────────────────────────────────────
  if (detailLoading) {
    return (
      <div className="flex items-center justify-center py-20 gap-3 text-muted-foreground">
        <Loader2 className="w-6 h-6 animate-spin" />
        <span className="text-sm">{t("جارٍ تحميل القضية...", "Loading case...")}</span>
      </div>
    );
  }

  if (selectedCase) {
    return (
      <div
        className="flex flex-col md:flex-row border-2 border-blue-400/70 rounded-2xl overflow-hidden shadow-sm shadow-blue-400/10"
        style={{ minHeight: "68vh" }}
      >
        {/* ── يسار: تفاصيل القضية (قابل للتمرير) ── */}
        <div
          className={`overflow-y-auto border-b md:border-b-0 md:border-l border-blue-400/30 ${viewerOpen ? "md:w-[42%] md:shrink-0" : "w-full"}`}
        >
          <CaseDetailView
            detail={selectedCase}
            codexTitle={selectedCodexTitle}
            onOpenViewer={openViewer}
            onBack={() => { setSelectedCase(null); setDetailError(""); }}
          />
        </div>

        {/* ── يمين: عارض الوثيقة مضمَّن ── */}
        {viewerOpen ? (
          <div className="flex-1 min-h-[60vh] md:min-h-0 md:h-full">
            <DocumentPageViewer
              inline
              pdfUrl={`${API_BASE}/api/codex/${viewerCodexId}/pdf`}
              initialPage={viewerPage}
              title={viewerTitle}
              onClose={() => setViewerOpen(false)}
            />
          </div>
        ) : (
          <div className="flex-1 flex flex-col items-center justify-center gap-3 text-muted-foreground bg-blue-50/30 cursor-pointer hover:bg-blue-50/60 transition-colors min-h-[120px] md:min-h-0" onClick={() => selectedCase.pageStartFile && openViewer(selectedCase.codexId, selectedCase.pageStartFile)}>
            <FileText className="w-10 h-10 opacity-20" />
            <p className="text-sm text-center px-4">
              {selectedCase.pageStartFile
                ? t("اضغط هنا لعرض الوثيقة الأصلية", "Click here to view the original document")
                : t("لا رقم صفحة متاح لهذه القضية", "No page number is available for this case")}
            </p>
          </div>
        )}
      </div>
    );
  }

  // ── List view ──────────────────────────────────────────────────────────────
  return (
    <div className="space-y-4" dir={uiDir}>
      {/* Search form */}
      <form onSubmit={handleSearch} className="space-y-2">
        <div className="flex gap-2">
          <input
            value={query}
            onChange={e => setQuery(e.target.value)}
            placeholder={t("ابحث بموضوع النزاع أو رقم القضية أو المبدأ القضائي أو نص الحكم...", "Search by dispute subject, case number, legal principle, or ruling text...")}
            className="flex-1 h-11 rounded-2xl border-2 border-primary/55 bg-background px-4 text-sm focus:outline-none focus:border-primary focus:ring-2 focus:ring-primary/15 transition-colors shadow-sm"
            disabled={loading}
          />
          <button
            type="submit"
            disabled={loading}
            className="h-11 px-4 bg-primary text-primary-foreground rounded-2xl font-bold text-sm hover:bg-primary/90 disabled:opacity-50 flex items-center gap-2"
          >
            {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Search className="w-4 h-4" />}
            {t("بحث", "Search")}
          </button>
          <button
            type="button"
            onClick={() => setShowFilters(s => !s)}
            className={cn(
              "h-11 px-3 border rounded-2xl text-sm flex items-center gap-1 transition-colors",
              showFilters ? "bg-primary/10 border-primary text-primary" : "border-primary/45 hover:border-primary hover:bg-primary/5"
            )}
          >
            <Filter className="w-4 h-4" />
          </button>
        </div>

        {/* Filters panel */}
        {showFilters && (
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 p-3 bg-blue-50/30 rounded-2xl border border-blue-300/60 shadow-sm shadow-blue-400/5">
            <select value={codexFilter} onChange={e => setCodexFilter(e.target.value)}
              className="h-9 rounded-xl border border-primary/45 bg-background px-2 text-xs focus:outline-none focus:border-primary focus:ring-2 focus:ring-primary/15">
              <option value="">{t("كل المدونات", "All collections")}</option>
              {codices.map(c => <option key={c.id} value={c.id} dir="auto">{c.title} ({c.totalCases})</option>)}
            </select>
            <input value={courtFilter} onChange={e => setCourtFilter(e.target.value)}
              placeholder={t("المحكمة...", "Court...")} className="h-9 rounded-xl border border-blue-400/55 bg-background px-2 text-xs focus:outline-none focus:border-primary focus:ring-2 focus:ring-primary/15" />
            <select value={stageFilter} onChange={e => setStageFilter(e.target.value)}
              className="h-9 rounded-xl border border-purple-400/55 bg-background px-2 text-xs focus:outline-none focus:border-primary focus:ring-2 focus:ring-primary/15">
              <option value="">{t("كل الدرجات", "All stages")}</option>
              <option value="ابتدائي">{t("ابتدائي", "First instance")}</option>
              <option value="استئناف">{t("استئناف", "Appeal")}</option>
              <option value="تمييز">{t("تمييز", "Cassation")}</option>
              <option value="عالي">{t("عالي", "High")}</option>
            </select>
            <div className="flex gap-1">
              <input value={yearFilter} onChange={e => setYearFilter(e.target.value)}
                placeholder={t("السنة الهجرية...", "Hijri year...")} className="flex-1 h-9 rounded-xl border border-amber-400/60 bg-background px-2 text-xs focus:outline-none focus:border-primary focus:ring-2 focus:ring-primary/15" />
              <button type="button" onClick={clearFilters}
                className="h-9 px-2 rounded-xl border border-primary/40 hover:border-primary hover:bg-primary/5 text-muted-foreground text-xs">
                {t("مسح", "Clear")}
              </button>
            </div>
          </div>
        )}
      </form>

      {detailError && (
        <div className="p-3 bg-destructive/10 border border-destructive/30 rounded-xl text-sm text-destructive">{localizedAuthError(detailError, t)}</div>
      )}
      {error && (
        <div className="p-3 bg-destructive/10 border border-destructive/30 rounded-xl text-sm text-destructive">{localizedAuthError(error, t)}</div>
      )}

      {/* Header row */}
      <div className="flex items-center gap-2">
        <BookOpen className="w-4 h-4 text-primary" />
        <h3 className="text-sm font-bold text-foreground">{t("المدونات القضائية", "Judicial Collections")}</h3>
        {total > 0 && (
          <span className="text-xs text-muted-foreground bg-muted px-2 py-0.5 rounded-full">{total} {t("قضية", "cases")}</span>
        )}
        {codices.length > 0 && (
          <span className="text-xs text-muted-foreground bg-muted px-2 py-0.5 rounded-full">{codices.length} {t("مدونة", "collections")}</span>
        )}
        <div className="flex items-center gap-2 mr-auto">
          {isAdmin && (
            <Link href="/admin/legal-codex" className="flex items-center gap-1 text-xs text-amber-700 bg-amber-50 hover:bg-amber-100 border border-amber-200 px-2 py-0.5 rounded-full transition-colors">
              <Upload className="w-3 h-3" />{t("رفع مدونات", "Upload collections")}
            </Link>
          )}
          <Link href="/legal-search" className="flex items-center gap-1 text-xs text-primary bg-primary/10 hover:bg-primary/20 border border-primary/20 px-2 py-0.5 rounded-full transition-colors">
            <ExternalLink className="w-3 h-3" />{t("الباحث الذكي", "Smart Research")}
          </Link>
        </div>
      </div>

      {/* Global disclaimer */}
      <div className="p-2.5 bg-amber-50 border border-amber-100 rounded-xl text-xs text-amber-800">
          <span className="font-bold">⚖️ {t("تنبيه:", "Notice:")} </span>
          {t("السوابق القضائية في المملكة العربية السعودية للاستئناس لا للإلزام. المحامي يقرأ من صورة الصفحة الأصلية — انقر على القضية ثم \"عرض المستند الأصلي\".", "Saudi judicial precedents are for guidance, not binding authority. Review the original page image by selecting a case and opening the original document.")}
      </div>

      {/* Empty states */}
      {loading && (
        <div className="flex items-center justify-center py-12 gap-3 text-muted-foreground">
          <Loader2 className="w-5 h-5 animate-spin" />
          <span className="text-sm">{t("جارٍ البحث...", "Searching...")}</span>
        </div>
      )}

      {!loading && noCodexYet && (
        <div className="text-center py-14 text-muted-foreground">
          <div className="w-16 h-16 bg-muted rounded-2xl flex items-center justify-center mx-auto mb-4">
            <BookOpen className="w-8 h-8 text-muted-foreground" />
          </div>
          <p className="text-sm font-medium mb-1">{t("لم تُرفع مدونات قضائية بعد", "No judicial collections have been uploaded yet")}</p>
          <p className="text-xs text-muted-foreground">{t("تواصلي مع الإدارة لرفع ملفات PDF للمدونات القضائية", "Contact the administrator to upload judicial-collection PDFs")}</p>
        </div>
      )}

      {!loading && !noCodexYet && cases.length === 0 && (
        <div className="text-center py-12 text-muted-foreground">
          <Search className="w-10 h-10 mx-auto mb-3 opacity-30" />
          <p className="text-sm">{t("لا توجد قضايا مطابقة — جرّبي كلمات مختلفة أو امسحي الفلاتر", "No matching cases — try different terms or clear filters")}</p>
        </div>
      )}

      {/* Case list */}
      {!loading && cases.length > 0 && (
        <div className="space-y-2">
          {cases.map(c => (
            <button
              key={c.id}
              onClick={() => openDetail(c)}
            className="w-full text-start bg-card border-2 border-blue-300/65 rounded-xl px-4 py-3.5 hover:border-primary hover:bg-primary/5 hover:shadow-md hover:shadow-primary/10 transition-all shadow-sm group"
              dir="auto"
            >
              <div className="flex items-start gap-3">
                <div className="w-9 h-9 rounded-xl bg-primary/10 flex items-center justify-center shrink-0 mt-0.5">
                  <Gavel className="w-4 h-4 text-primary" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap mb-0.5">
                    <p className="text-sm font-semibold text-foreground leading-snug text-start" dir="auto">
                      {c.disputeSubject || `قضية #${c.id}`}
                    </p>
                    {stageBadge(c.litigationStage)}
                  </div>
                  <div className="flex items-center gap-3 flex-wrap text-xs text-muted-foreground">
                    {c.caseNo && <span className="font-medium text-foreground/70">قضية {c.caseNo}</span>}
                    {c.court && (
                      <span className="flex items-center gap-0.5">
                        <Building2 className="w-3 h-3" />{c.court}
                      </span>
                    )}
                    {c.rulingDateHijri && (
                      <span className="flex items-center gap-0.5">
                        <Calendar className="w-3 h-3" />{c.rulingDateHijri}هـ
                      </span>
                    )}
                    {c.pageStartPrinted && <span>ص{c.pageStartPrinted}</span>}
                  </div>
                  {c.legalPrinciple && (
                    <p className="text-xs text-muted-foreground mt-1 line-clamp-1 italic text-start" dir={uiDir}>
                      المبدأ: <span dir="auto">{c.legalPrinciple}</span>
                    </p>
                  )}
                  {c.snippet && (
                    <p className="text-xs text-muted-foreground mt-1 line-clamp-2 leading-relaxed bg-muted/30 rounded px-2 py-1 text-start" dir="auto">
                      ...{c.snippet.slice(0, 200)}...
                    </p>
                  )}
                </div>
                <Eye className="w-4 h-4 text-muted-foreground group-hover:text-primary transition-colors shrink-0 mt-1" />
              </div>
            </button>
          ))}
        </div>
      )}

      {/* Pagination */}
      {pages > 1 && (
        <div className="flex items-center justify-center gap-3 pt-2">
          <button onClick={() => { const p = page - 1; setPage(p); fetchList(p); }} disabled={page <= 1 || loading}
            className="px-3 py-1.5 border border-border rounded-xl text-sm disabled:opacity-40 hover:bg-muted/50">
            {t("السابق", "Previous")}
          </button>
          <span className="text-sm text-muted-foreground">{t("صفحة", "Page")} {page} {t("من", "of")} {pages}</span>
          <button onClick={() => { const p = page + 1; setPage(p); fetchList(p); }} disabled={page >= pages || loading}
            className="px-3 py-1.5 border border-border rounded-xl text-sm disabled:opacity-40 hover:bg-muted/50">
            {t("التالي", "Next")}
          </button>
        </div>
      )}

      {/* Viewer (floating full-screen) */}
      {viewerOpen && (
        <DocumentPageViewer
          pdfUrl={`${API_BASE}/api/codex/${viewerCodexId}/pdf`}
          initialPage={viewerPage}
          title={viewerTitle}
          onClose={() => setViewerOpen(false)}
        />
      )}
    </div>
  );
}
