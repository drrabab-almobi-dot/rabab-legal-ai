/**
 * Admin: Legal Codex Management
 * Upload codex PDFs, trigger case extraction, monitor progress, and check text quality.
 */
import { useState, useEffect, useRef } from "react";
import {
  Upload, BookOpen, Loader2, CheckCircle, AlertTriangle, Trash2,
  Play, RefreshCw, ChevronDown, ChevronUp, FileText, ShieldCheck, RotateCcw, Search,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useLang } from '@/hooks/use-language';

const API_BASE = import.meta.env.BASE_URL?.replace(/\/$/, "") ?? "";

interface Codex {
  id: number;
  title: string;
  publisher: string | null;
  court: string | null;
  year: string | null;
  totalPages: number | null;
  totalCases: number;
  status: "pending" | "extracting" | "ready" | "error";
  fileSize: number | null;
  error: string | null;
  createdAt: string;
}

interface ExtractionJob {
  status: "running" | "done" | "error";
  processed: number;
  total: number;
  errors: string[];
}

interface QualityResult {
  hasIssue: boolean;
  category: string;
  score: number;
  reasons: string[];
  sampleText: string;
}

interface CodexQualityRow {
  codexId: number;
  title: string;
  status: string;
  quality: QualityResult | null;
}

interface KnowledgeQualityRow {
  docId: number;
  filename: string;
  sourceType: string | null;
  quality: QualityResult | null;
}

function statusBadge(status: string, t: (ar: string, en: string) => string) {
  const map: Record<string, string> = {
    pending: "bg-gray-100 text-gray-600",
    extracting: "bg-blue-100 text-blue-700 animate-pulse",
    ready: "bg-green-100 text-green-700",
    error: "bg-red-100 text-red-700",
  };
  const labels: Record<string, string> = {
    pending: t("في الانتظار", "Pending"),
    extracting: t("جارٍ الاستخراج", "Extracting"),
    ready: t("جاهز", "Ready"),
    error: t("خطأ", "Error"),
  };
  return (
    <span className={cn("px-2 py-0.5 rounded-full text-xs font-bold", map[status] ?? "bg-gray-100 text-gray-600")}>
      <span dir={labels[status] ? undefined : "auto"}>{labels[status] ?? status}</span>
    </span>
  );
}

function qualityBadge(q: QualityResult | null, t: (ar: string, en: string) => string) {
  if (!q) return <span className="px-2 py-0.5 rounded-full text-xs bg-gray-100 text-gray-500">{t("لا يوجد نص", "No text")}</span>;
  if (!q.hasIssue) return <span className="px-2 py-0.5 rounded-full text-xs bg-green-100 text-green-700 font-bold">✓ {t("النص سليم", "Text is valid")} ({q.score}/100)</span>;
  const catLabel: Record<string, string> = {
    reversed: t("حروف معكوسة ⚠️", "Reversed characters ⚠️"),
    word_order_reversed: t("ترتيب كلمات معكوس ⚠️", "Reversed word order ⚠️"),
    presentation_forms: t("أحرف OCR تالفة", "Corrupted OCR characters"),
    low_density: t("كثافة عربية منخفضة", "Low Arabic-text density"),
  };
  return (
    <span className="px-2 py-0.5 rounded-full text-xs bg-red-100 text-red-700 font-bold">
      <span dir={catLabel[q.category] ? undefined : "auto"}>{catLabel[q.category] ?? q.category}</span> ({q.score}/100)
    </span>
  );
}

function fmtSize(bytes: number | null, t: (ar: string, en: string) => string) {
  if (!bytes) return "—";
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} ${t("ك.ب", "KB")}`;
  return `${(bytes / 1024 / 1024).toFixed(1)} ${t("م.ب", "MB")}`;
}

export default function AdminLegalCodexPage() {
  const { lang, t } = useLang();
  const [codices, setCodeces] = useState<Codex[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [expandedId, setExpandedId] = useState<number | null>(null);
  const [jobs, setJobs] = useState<Record<number, ExtractionJob>>({});

  // Upload form state
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState("");
  const [uploadSuccess, setUploadSuccess] = useState("");
  const fileRef = useRef<HTMLInputElement>(null);
  const [formData, setFormData] = useState({ title: "", publisher: "", court: "", year: "" });

  // Quality scan state
  const [scanningCodex, setScanningCodex] = useState(false);
  const [codexScanResults, setCodexScanResults] = useState<CodexQualityRow[] | null>(null);
  const [scanningKnowledge, setScanningKnowledge] = useState(false);
  const [knowledgeScan, setKnowledgeScan] = useState<{ total: number; issuesFound: number; results: KnowledgeQualityRow[] } | null>(null);
  const [showKnowledgeScan, setShowKnowledgeScan] = useState(false);

  const fetchList = async () => {
    try {
      const r = await fetch(`${API_BASE}/api/admin/codex/list`, { credentials: "include" });
      if (!r.ok) throw new Error(t("فشل التحميل", "Failed to load"));
      const d = await r.json();
      setCodeces(d.codices ?? []);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchList(); }, []);

  // Poll extraction status for running jobs
  useEffect(() => {
    const extractingIds = codices.filter(c => c.status === "extracting").map(c => c.id);
    if (extractingIds.length === 0) return;

    const interval = setInterval(async () => {
      for (const id of extractingIds) {
        try {
          const r = await fetch(`${API_BASE}/api/admin/codex/${id}/job-status`, { credentials: "include" });
          const d = await r.json();
          if (d.job) setJobs(prev => ({ ...prev, [id]: d.job }));
          if (d.codex?.status && d.codex.status !== "extracting") {
            fetchList();
          }
        } catch { /* silent */ }
      }
    }, 3000);
    return () => clearInterval(interval);
  }, [codices]);

  const handleUpload = async (e: React.FormEvent) => {
    e.preventDefault();
    const file = fileRef.current?.files?.[0];
    if (!file) return setUploadError(t("اختاري ملف PDF", "Select a PDF file"));
    if (!formData.title.trim()) return setUploadError(t("عنوان المدونة مطلوب", "Codex title is required"));

    setUploading(true);
    setUploadError("");
    setUploadSuccess("");

    try {
      const fd = new FormData();
      fd.append("file", file);
      fd.append("title", formData.title);
      fd.append("publisher", formData.publisher);
      fd.append("court", formData.court);
      fd.append("year", formData.year);

      const r = await fetch(`${API_BASE}/api/admin/codex/upload`, {
        method: "POST",
        body: fd,
        credentials: "include",
      });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error || t("فشل الرفع", "Upload failed"));

      setUploadSuccess(t(
        `تم رفع "${formData.title}" بنجاح (المعرّف: ${d.codexId})`,
        `"${formData.title}" uploaded successfully (ID: ${d.codexId})`,
      ));
      setFormData({ title: "", publisher: "", court: "", year: "" });
      if (fileRef.current) fileRef.current.value = "";
      fetchList();
    } catch (e: any) {
      setUploadError(e.message);
    } finally {
      setUploading(false);
    }
  };

  const startExtraction = async (id: number) => {
    try {
      const r = await fetch(`${API_BASE}/api/admin/codex/${id}/extract`, {
        method: "POST",
        credentials: "include",
      });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error || t("فشل التشغيل", "Failed to start extraction"));
      setCodeces(prev => prev.map(c => c.id === id ? { ...c, status: "extracting" } : c));
    } catch (e: any) {
      alert(e.message);
    }
  };

  const reExtract = async (id: number) => {
    if (!confirm(t(
      "سيُعاد استخراج جميع القضايا من الملف الأصلي — القضايا الحالية ستُحذف وتُعاد بالخوارزمية الجديدة. متأكد؟",
      "All cases will be extracted again from the original file. Existing cases will be deleted and recreated with the new algorithm. Are you sure?",
    ))) return;
    try {
      const r = await fetch(`${API_BASE}/api/admin/codex/${id}/reextract`, {
        method: "POST",
        credentials: "include",
      });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error || t("فشلت إعادة الاستخراج", "Re-extraction failed"));
      setCodeces(prev => prev.map(c => c.id === id ? { ...c, status: "extracting", totalCases: 0 } : c));
    } catch (e: any) {
      alert(e.message);
    }
  };

  const deleteCodex = async (id: number, title: string) => {
    if (!confirm(t(
      `حذف "${title}"؟ سيُحذف معها جميع القضايا المستخرجة.`,
      `Delete "${title}"? All extracted cases associated with it will also be deleted.`,
    ))) return;
    try {
      await fetch(`${API_BASE}/api/admin/codex/${id}`, { method: "DELETE", credentials: "include" });
      setCodeces(prev => prev.filter(c => c.id !== id));
    } catch (e: any) {
      alert(e.message);
    }
  };

  const scanCodexQuality = async () => {
    setScanningCodex(true);
    setCodexScanResults(null);
    try {
      const r = await fetch(`${API_BASE}/api/admin/codex/quality-scan`, { credentials: "include" });
      const d = await r.json();
      setCodexScanResults(d.results ?? []);
    } catch { /* silent */ } finally {
      setScanningCodex(false);
    }
  };

  const scanKnowledgeQuality = async () => {
    setScanningKnowledge(true);
    setKnowledgeScan(null);
    setShowKnowledgeScan(true);
    try {
      const r = await fetch(`${API_BASE}/api/admin/codex/knowledge-quality-scan`, { credentials: "include" });
      const d = await r.json();
      setKnowledgeScan(d);
    } catch { /* silent */ } finally {
      setScanningKnowledge(false);
    }
  };

  return (
    <div className="max-w-4xl mx-auto p-6 space-y-8" dir={lang === 'ar' ? 'rtl' : 'ltr'}>
      {/* ── Header ── */}
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 rounded-2xl bg-primary/10 flex items-center justify-center">
          <BookOpen className="w-5 h-5 text-primary" />
        </div>
        <div>
          <h1 className="text-xl font-bold text-foreground">{t('إدارة المدونات القضائية', 'Judicial codex management')}</h1>
          <p className="text-sm text-muted-foreground">{t('رفع ملفات PDF للمدونات واستخراج القضايا تلقائياً', 'Upload codex PDFs and extract cases automatically')}</p>
        </div>
      </div>

      {/* ── Quality Scan Section ── */}
      <div className="bg-amber-50 border border-amber-200 rounded-2xl p-5 space-y-4">
        <div className="flex items-center gap-2">
          <ShieldCheck className="w-5 h-5 text-amber-700" />
           <h2 className="text-sm font-bold text-amber-800">{t('فحص جودة النصوص المستخرجة', 'Extracted-text quality check')}</h2>
        </div>
        <p className="text-xs text-amber-700 leading-relaxed">
          {t(
            "تفحص هذه الأداة الوثائق المخزّنة للكشف عن النص العربي المعكوس (خلل الاستخراج من PDF). النصوص المعكوسة لا يمكن البحث فيها وتُفسد الاستشهادات — يجب إعادة استخراجها.",
            "This tool scans stored documents for reversed Arabic text (a PDF extraction defect). Reversed text cannot be searched and corrupts citations, so it must be re-extracted.",
          )}
        </p>
        <div className="flex flex-wrap gap-3">
          <button
            onClick={scanCodexQuality}
            disabled={scanningCodex}
            className="flex items-center gap-2 px-4 py-2 bg-amber-700 text-white rounded-xl text-sm font-bold hover:bg-amber-800 disabled:opacity-50 transition-colors"
          >
            {scanningCodex ? <Loader2 className="w-4 h-4 animate-spin" /> : <Search className="w-4 h-4" />}
             {t('فحص المدونات', 'Scan codices')} ({codices.length})
          </button>
          <button
            onClick={scanKnowledgeQuality}
            disabled={scanningKnowledge}
            className="flex items-center gap-2 px-4 py-2 bg-amber-600 text-white rounded-xl text-sm font-bold hover:bg-amber-700 disabled:opacity-50 transition-colors"
          >
            {scanningKnowledge ? <Loader2 className="w-4 h-4 animate-spin" /> : <Search className="w-4 h-4" />}
             {t('فحص قاعدة المعرفة (التعاميم والوثائق)', 'Scan knowledge base (circulars and documents)')}
          </button>
        </div>

        {/* Codex scan results */}
        {codexScanResults && (
          <div className="space-y-2">
            <p className="text-xs font-bold text-amber-800">
               {t("نتائج فحص المدونات —", "Codex scan results —")}
              {codexScanResults.filter(r => r.quality?.hasIssue).length === 0
                 ? t(" ✅ جميع المدونات نصوصها سليمة", " ✅ All codices contain valid text")
                 : t(
                   ` ⚠️ ${codexScanResults.filter(r => r.quality?.hasIssue).length} مدونة تحتاج إعادة استخراج`,
                   ` ⚠️ ${codexScanResults.filter(r => r.quality?.hasIssue).length} codices require re-extraction`,
                 )}
            </p>
            <div className="space-y-1.5">
              {codexScanResults.map(row => (
                <div key={row.codexId} className="flex items-center gap-2 text-xs bg-white/70 rounded-xl px-3 py-2">
                   <span className="font-medium text-foreground flex-1 truncate" dir="auto">{row.title}</span>
                   {qualityBadge(row.quality, t)}
                  {row.quality?.hasIssue && (
                    <button
                      onClick={() => reExtract(row.codexId)}
                      className="flex items-center gap-1 px-2 py-1 bg-red-600 text-white rounded-lg text-xs font-bold hover:bg-red-700 transition-colors"
                    >
                      <RotateCcw className="w-3 h-3" />
                       {t("إعادة استخراج", "Re-extract")}
                    </button>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Knowledge base scan results */}
        {showKnowledgeScan && (
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <p className="text-xs font-bold text-amber-800">
                {scanningKnowledge ? (
                   <span className="flex items-center gap-1"><Loader2 className="w-3 h-3 animate-spin" /> {t("جارٍ الفحص...", "Scanning...")}</span>
                ) : knowledgeScan ? (
                  knowledgeScan.issuesFound === 0
                     ? t(`✅ ${knowledgeScan.total} وثيقة — النصوص سليمة`, `✅ ${knowledgeScan.total} documents — text is valid`)
                     : t(
                       `⚠️ ${knowledgeScan.issuesFound} وثيقة من ${knowledgeScan.total} تحتاج إعادة فهرسة`,
                       `⚠️ ${knowledgeScan.issuesFound} of ${knowledgeScan.total} documents require reindexing`,
                     )
                 ) : t("فشل الفحص", "Scan failed")}
              </p>
               <button onClick={() => setShowKnowledgeScan(false)} className="text-xs text-amber-700 hover:underline">{t("إخفاء", "Hide")}</button>
            </div>
            {knowledgeScan && knowledgeScan.issuesFound > 0 && (
              <div className="space-y-1.5 max-h-48 overflow-y-auto">
                {knowledgeScan.results.filter(r => r.quality?.hasIssue).map(row => (
                  <div key={row.docId} className="flex items-start gap-2 text-xs bg-red-50/70 rounded-xl px-3 py-2">
                    <div className="flex-1 min-w-0">
                       <p className="font-medium text-foreground truncate" dir="auto">{row.filename}</p>
                       <p className="text-muted-foreground" dir="auto">{row.sourceType}</p>
                      {row.quality?.reasons.length ? (
                         <p className="text-red-600 text-[10px] mt-0.5" dir="auto">{row.quality.reasons.join(' | ')}</p>
                      ) : null}
                    </div>
                     {qualityBadge(row.quality, t)}
                  </div>
                ))}
              </div>
            )}
            {knowledgeScan && knowledgeScan.issuesFound > 0 && (
              <p className="text-xs text-amber-700">
                {t(
                  "ℹ️ لإعادة فهرسة الوثائق المعطوبة، اذهبي إلى الإدارة ← قاعدة المعرفة ← إعادة الفهرسة الشاملة.",
                  "ℹ️ To reindex affected documents, go to Admin → Knowledge Base → Full Reindex.",
                )}
              </p>
            )}
          </div>
        )}
      </div>

      {/* ── Upload form ── */}
      <div className="bg-card border-2 border-primary/45 rounded-2xl p-5 space-y-4 shadow-sm shadow-primary/10">
        <h2 className="text-sm font-bold text-foreground flex items-center gap-2">
          <Upload className="w-4 h-4 text-primary" />
           {t('رفع مدونة جديدة', 'Upload a new codex')}
        </h2>

        {/* Technical note about the new extraction engine */}
        <div className="p-3 bg-green-50 border border-green-100 rounded-xl text-xs text-green-800 space-y-1">
          <p className="font-bold">{t("⚙️ محرك الاستخراج المُحدَّث (pdftotext v25.07):", "⚙️ Updated extraction engine (pdftotext v25.07):")}</p>
          <p>{t("• يستخدم خوارزمية Unicode Bidi الأصلية — يُخرج العربية بترتيبها الصحيح", "• Uses the native Unicode Bidi algorithm to output Arabic in the correct order")}</p>
          <p>{t("• يُزيل محارف الكشيدة (ـ) التي تُفسد الفهرسة والبحث", "• Removes tatweel characters (ـ) that interfere with indexing and search")}</p>
          <p>{t("• يُفعِّل بوابة جودة ترفض الوثائق ذات النص المعكوس قبل الإدخال", "• Enforces a quality gate that rejects documents with reversed text before ingestion")}</p>
          <p>{t('• يدعم بنية مجموعات الأحكام: يكتشف "رقم الصك" كبداية كل حكم', '• Supports judgment-compilation structure by detecting "deed number" as the start of each judgment')}</p>
        </div>

        <form onSubmit={handleUpload} className="space-y-3">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="sm:col-span-2">
               <label className="block text-xs font-medium text-foreground mb-1">{t('عنوان المدونة *', 'Codex title *')}</label>
              <input
                value={formData.title}
                onChange={e => setFormData(p => ({ ...p, title: e.target.value }))}
                placeholder={t("مثال: مجموعة الأحكام القضائية لعام 1434هـ - المجلد الثالث", "Example: Judicial Rulings Collection for 1434 AH - Volume 3")}
                dir="auto"
                className="w-full h-10 rounded-xl border border-primary/50 bg-background px-3 text-sm focus:outline-none focus:border-primary focus:ring-2 focus:ring-primary/15"
                required
              />
            </div>
            <div>
               <label className="block text-xs font-medium text-foreground mb-1">{t('الجهة الناشرة', 'Publisher')}</label>
              <input
                value={formData.publisher}
                onChange={e => setFormData(p => ({ ...p, publisher: e.target.value }))}
                placeholder={t("وزارة العدل / مركز البحوث", "Ministry of Justice / Research Center")}
                dir="auto"
                className="w-full h-10 rounded-xl border border-blue-400/60 bg-background px-3 text-sm focus:outline-none focus:border-primary focus:ring-2 focus:ring-primary/15"
              />
            </div>
            <div>
               <label className="block text-xs font-medium text-foreground mb-1">{t('المحكمة / الجهة', 'Court / entity')}</label>
              <input
                value={formData.court}
                onChange={e => setFormData(p => ({ ...p, court: e.target.value }))}
                placeholder={t("محكمة التمييز", "Court of Cassation")}
                dir="auto"
                className="w-full h-10 rounded-xl border border-purple-400/60 bg-background px-3 text-sm focus:outline-none focus:border-primary focus:ring-2 focus:ring-primary/15"
              />
            </div>
            <div>
               <label className="block text-xs font-medium text-foreground mb-1">{t('سنة الإصدار', 'Year of publication')}</label>
              <input
                value={formData.year}
                onChange={e => setFormData(p => ({ ...p, year: e.target.value }))}
                placeholder="1434"
                dir="auto"
                className="w-full h-10 rounded-xl border border-amber-400/60 bg-background px-3 text-sm focus:outline-none focus:border-primary focus:ring-2 focus:ring-primary/15"
              />
            </div>
            <div>
               <label className="block text-xs font-medium text-foreground mb-1">{t('ملف PDF *', 'PDF file *')}</label>
              <input
                ref={fileRef}
                type="file"
                accept=".pdf,application/pdf"
                dir="auto"
                className="w-full h-10 rounded-xl border-2 border-dashed border-primary/55 bg-background px-3 text-sm file:me-3 file:py-1 file:px-3 file:rounded-lg file:border-0 file:bg-primary/10 file:text-primary file:text-xs file:font-bold cursor-pointer hover:border-primary focus:outline-none focus:ring-2 focus:ring-primary/15"
              />
            </div>
          </div>

          {uploadError && <p className="text-xs text-destructive bg-destructive/10 px-3 py-2 rounded-xl" dir="auto">{uploadError}</p>}
          {uploadSuccess && <p className="text-xs text-green-700 bg-green-50 px-3 py-2 rounded-xl" dir="auto">✅ {uploadSuccess}</p>}

          <button
            type="submit"
            disabled={uploading}
            className="px-4 py-2 bg-primary text-primary-foreground rounded-xl text-sm font-bold hover:bg-primary/90 disabled:opacity-50 flex items-center gap-2"
          >
            {uploading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Upload className="w-4 h-4" />}
             {uploading ? t("جارٍ الرفع...", "Uploading...") : t("رفع المدونة", "Upload codex")}
          </button>
        </form>
      </div>

      {/* ── Format guide ── */}
      <div className="p-4 bg-blue-50 border border-blue-100 rounded-2xl text-xs text-blue-800 space-y-1.5">
        <p className="font-bold">{t("📋 بنية مجموعات الأحكام القضائية (الاكتشاف التلقائي):", "📋 Judgment-compilation structure (automatic detection):")}</p>
        <p>{t("كل حكم يبدأ بـ: رقم الصك (معرّف عددي) ← تاريخه ← رقم الدعوى ← رقم قرار التصديق", "Each judgment starts with: deed number (numeric identifier) → date → case number → ratification decision number")}</p>
        <p>{t("يليه: المبادئ المستخلصة ← المواد النظامية ← الوقائع والتسبيب والمنطوق", "Followed by: extracted principles → statutory provisions → facts, reasoning, and ruling")}</p>
        <p className="font-bold mt-1.5">{t("⚠️ النص للبحث والفهرسة — المحامي يقرأ صور الصفحات الأصلية في العارض", "⚠️ Text is used for search and indexing; the lawyer reads the original page images in the viewer")}</p>
      </div>

      {/* ── Codex list ── */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
           <h2 className="text-sm font-bold text-foreground">{t('المدونات المرفوعة', 'Uploaded codices')} ({codices.length})</h2>
          <button onClick={fetchList} className="p-1.5 rounded-lg hover:bg-muted/50 text-muted-foreground transition-colors" title={t("تحديث", "Refresh")} aria-label={t("تحديث قائمة المدونات", "Refresh codex list")}>
            <RefreshCw className="w-4 h-4" />
          </button>
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-10 gap-3 text-muted-foreground">
            <Loader2 className="w-5 h-5 animate-spin" />
             <span className="text-sm">{t('جارٍ التحميل...', 'Loading...')}</span>
          </div>
        ) : error ? (
          <p className="text-sm text-destructive" dir="auto">{error}</p>
        ) : codices.length === 0 ? (
          <div className="text-center py-10 text-muted-foreground">
            <FileText className="w-10 h-10 mx-auto mb-3 opacity-30" />
             <p className="text-sm">{t('لا توجد مدونات مرفوعة بعد', 'No uploaded codices yet')}</p>
          </div>
        ) : (
          codices.map(codex => {
            const job = jobs[codex.id];
            const isExpanded = expandedId === codex.id;
            const codexScan = codexScanResults?.find(r => r.codexId === codex.id);

            return (
              <div key={codex.id} className="bg-card border-2 border-blue-300/65 rounded-2xl overflow-hidden shadow-sm shadow-blue-400/5 hover:border-primary/60 transition-colors">
                <div className="flex items-center gap-3 px-4 py-3">
                  <div className="w-9 h-9 rounded-xl bg-primary/10 flex items-center justify-center shrink-0">
                    <BookOpen className="w-4 h-4 text-primary" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                       <p className="text-sm font-semibold text-foreground truncate" dir="auto">{codex.title}</p>
                       {statusBadge(codex.status, t)}
                       {codexScan && qualityBadge(codexScan.quality, t)}
                    </div>
                    <div className="flex items-center gap-3 text-xs text-muted-foreground mt-0.5">
                       {codex.court && <span dir="auto">{codex.court}</span>}
                       {codex.year && <span dir="auto">{codex.year}{lang === "ar" ? "هـ" : " AH"}</span>}
                       <span>{fmtSize(codex.fileSize, t)}</span>
                       {codex.totalPages && <span>{codex.totalPages} {t("صفحة", "pages")}</span>}
                       {codex.status === "ready" && <span className="text-green-600 font-semibold">{codex.totalCases} {t("قضية", "cases")}</span>}
                    </div>
                    {/* Extraction progress */}
                    {codex.status === "extracting" && job && (
                      <div className="mt-1.5 space-y-1">
                        <div className="flex items-center gap-2 text-xs text-blue-600">
                          <Loader2 className="w-3 h-3 animate-spin" />
                           <span>{t(
                             `معالجة ${job.processed} من ${job.total} قضية...`,
                             `Processing ${job.processed} of ${job.total} cases...`,
                           )}</span>
                        </div>
                        <div className="w-full bg-gray-200 rounded-full h-1.5">
                          <div
                            className="bg-primary h-1.5 rounded-full transition-all duration-500"
                            style={{ width: `${job.total > 0 ? (job.processed / job.total) * 100 : 0}%` }}
                          />
                        </div>
                        {job.errors.length > 0 && (
                           <p className="text-xs text-amber-600" dir="auto">{job.errors[job.errors.length - 1]}</p>
                        )}
                      </div>
                    )}
                    {codex.error && (
                       <p className="text-xs text-destructive mt-1 leading-relaxed" dir="auto">{codex.error}</p>
                    )}
                  </div>
                  <div className="flex items-center gap-1 shrink-0">
                    {/* Re-extract with new engine */}
                    {codex.status === "ready" && (
                      <button
                        onClick={() => reExtract(codex.id)}
                        className="flex items-center gap-1 px-2.5 py-1.5 bg-amber-600 text-white rounded-xl text-xs font-bold hover:bg-amber-700 transition-colors"
                         title={t("إعادة الاستخراج بالمحرك الجديد", "Re-extract with the new engine")}
                      >
                        <RotateCcw className="w-3 h-3" />
                         {t("إعادة", "Redo")}
                      </button>
                    )}
                    {(codex.status === "pending" || codex.status === "error") && (
                      <button
                        onClick={() => startExtraction(codex.id)}
                        className="flex items-center gap-1 px-2.5 py-1.5 bg-primary text-primary-foreground rounded-xl text-xs font-bold hover:bg-primary/90 transition-colors"
                         title={t("استخراج القضايا", "Extract cases")}
                      >
                        <Play className="w-3 h-3" />
                         {t("استخراج", "Extract")}
                      </button>
                    )}
                    {codex.status === "extracting" && (
                      <div className="flex items-center gap-1 px-2.5 py-1.5 bg-blue-50 text-blue-600 rounded-xl text-xs font-bold">
                        <Loader2 className="w-3 h-3 animate-spin" />
                         {t("جارٍ...", "Working...")}
                      </div>
                    )}
                    <button
                      onClick={() => setExpandedId(isExpanded ? null : codex.id)}
                      className="p-1.5 rounded-xl hover:bg-muted/50 text-muted-foreground transition-colors"
                       title={isExpanded ? t("إخفاء التفاصيل", "Hide details") : t("عرض التفاصيل", "Show details")}
                       aria-label={isExpanded ? t("إخفاء تفاصيل المدونة", "Hide codex details") : t("عرض تفاصيل المدونة", "Show codex details")}
                    >
                      {isExpanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                    </button>
                    <button
                      onClick={() => deleteCodex(codex.id, codex.title)}
                      className="p-1.5 rounded-xl hover:bg-destructive/10 text-muted-foreground hover:text-destructive transition-colors"
                       title={t("حذف المدونة", "Delete codex")}
                       aria-label={t("حذف المدونة", "Delete codex")}
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>

                {isExpanded && (
                  <div className="px-4 pb-4 border-t border-border/30 pt-3 text-xs text-muted-foreground space-y-1">
                    {codex.publisher && <p><span className="font-semibold text-foreground">{t("الناشر:", "Publisher:")}</span> <span dir="auto">{codex.publisher}</span></p>}
                    {codex.court && <p><span className="font-semibold text-foreground">{t("الجهة:", "Entity:")}</span> <span dir="auto">{codex.court}</span></p>}
                    {codex.year && <p><span className="font-semibold text-foreground">{t("السنة:", "Year:")}</span> <span dir="auto">{codex.year}{lang === "ar" ? "هـ" : " AH"}</span></p>}
                    <p><span className="font-semibold text-foreground">{t("الحجم:", "Size:")}</span> {fmtSize(codex.fileSize, t)}</p>
                    <p><span className="font-semibold text-foreground">{t("الصفحات:", "Pages:")}</span> {codex.totalPages ?? t("غير محدد", "Not specified")}</p>
                    <p><span className="font-semibold text-foreground">{t("القضايا المستخرجة:", "Extracted cases:")}</span> {codex.totalCases}</p>
                    <p><span className="font-semibold text-foreground">{t("تاريخ الرفع:", "Upload date:")}</span> {new Date(codex.createdAt).toLocaleDateString(lang === "ar" ? "ar-SA" : "en-US", { year: "numeric", month: "long", day: "numeric" })}</p>
                    {codex.error && (
                      <div className="mt-1 p-2 bg-red-50 rounded-lg">
                        <p className="font-semibold text-destructive">{t("تفاصيل الخطأ:", "Error details:")}</p>
                        <p className="text-destructive whitespace-pre-wrap" dir="auto">{codex.error}</p>
                      </div>
                    )}
                    {job?.errors?.length > 0 && (
                      <div>
                        <p className="font-semibold text-foreground">{t(
                          `سجل الاستخراج (${job.errors.length} ملاحظة):`,
                          `Extraction log (${job.errors.length} entries):`,
                        )}</p>
                        {job.errors.slice(-5).map((e, i) => (
                          <p key={i} dir="auto" className={cn(lang === "ar" ? "pr-2" : "pl-2", e.startsWith('⚠️') ? 'text-amber-600' : 'text-destructive')}>
                            {e}
                          </p>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
