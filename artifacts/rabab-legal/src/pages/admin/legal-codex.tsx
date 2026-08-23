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

function statusBadge(status: string) {
  const map: Record<string, string> = {
    pending: "bg-gray-100 text-gray-600",
    extracting: "bg-blue-100 text-blue-700 animate-pulse",
    ready: "bg-green-100 text-green-700",
    error: "bg-red-100 text-red-700",
  };
  const labels: Record<string, string> = {
    pending: "في الانتظار",
    extracting: "جارٍ الاستخراج",
    ready: "جاهز",
    error: "خطأ",
  };
  return (
    <span className={cn("px-2 py-0.5 rounded-full text-xs font-bold", map[status] ?? "bg-gray-100 text-gray-600")}>
      {labels[status] ?? status}
    </span>
  );
}

function qualityBadge(q: QualityResult | null) {
  if (!q) return <span className="px-2 py-0.5 rounded-full text-xs bg-gray-100 text-gray-500">لا يوجد نص</span>;
  if (!q.hasIssue) return <span className="px-2 py-0.5 rounded-full text-xs bg-green-100 text-green-700 font-bold">✓ النص سليم ({q.score}/100)</span>;
  const catLabel: Record<string, string> = {
    reversed: "حروف معكوسة ⚠️",
    word_order_reversed: "ترتيب كلمات معكوس ⚠️",
    presentation_forms: "أحرف OCR تالفة",
    low_density: "كثافة عربية منخفضة",
  };
  return (
    <span className="px-2 py-0.5 rounded-full text-xs bg-red-100 text-red-700 font-bold">
      {catLabel[q.category] ?? q.category} ({q.score}/100)
    </span>
  );
}

function fmtSize(bytes: number | null) {
  if (!bytes) return "—";
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

export default function AdminLegalCodexPage() {
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
      if (!r.ok) throw new Error("فشل التحميل");
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
    if (!file) return setUploadError("اختاري ملف PDF");
    if (!formData.title.trim()) return setUploadError("عنوان المدونة مطلوب");

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
      if (!r.ok) throw new Error(d.error || "فشل الرفع");

      setUploadSuccess(`تم رفع "${formData.title}" بنجاح (ID: ${d.codexId})`);
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
      if (!r.ok) throw new Error(d.error || "فشل التشغيل");
      setCodeces(prev => prev.map(c => c.id === id ? { ...c, status: "extracting" } : c));
    } catch (e: any) {
      alert(e.message);
    }
  };

  const reExtract = async (id: number) => {
    if (!confirm("سيُعاد استخراج جميع القضايا من الملف الأصلي — القضايا الحالية ستُحذف وتُعاد بالخوارزمية الجديدة. متأكد؟")) return;
    try {
      const r = await fetch(`${API_BASE}/api/admin/codex/${id}/reextract`, {
        method: "POST",
        credentials: "include",
      });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error || "فشل");
      setCodeces(prev => prev.map(c => c.id === id ? { ...c, status: "extracting", totalCases: 0 } : c));
    } catch (e: any) {
      alert(e.message);
    }
  };

  const deleteCodex = async (id: number, title: string) => {
    if (!confirm(`حذف "${title}"؟ سيُحذف معها جميع القضايا المستخرجة.`)) return;
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
    <div className="max-w-4xl mx-auto p-6 space-y-8" dir="rtl">
      {/* ── Header ── */}
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 rounded-2xl bg-primary/10 flex items-center justify-center">
          <BookOpen className="w-5 h-5 text-primary" />
        </div>
        <div>
          <h1 className="text-xl font-bold text-foreground">إدارة المدونات القضائية</h1>
          <p className="text-sm text-muted-foreground">رفع ملفات PDF للمدونات واستخراج القضايا تلقائياً</p>
        </div>
      </div>

      {/* ── Quality Scan Section ── */}
      <div className="bg-amber-50 border border-amber-200 rounded-2xl p-5 space-y-4">
        <div className="flex items-center gap-2">
          <ShieldCheck className="w-5 h-5 text-amber-700" />
          <h2 className="text-sm font-bold text-amber-800">فحص جودة النصوص المستخرجة</h2>
        </div>
        <p className="text-xs text-amber-700 leading-relaxed">
          يفحص هذا الأداء الوثائق المخزّنة للكشف عن النص العربي المعكوس (خلل الاستخراج من PDF).
          النصوص المعكوسة لا يمكن البحث فيها وتُفسد الاستشهادات — يجب إعادة استخراجها.
        </p>
        <div className="flex flex-wrap gap-3">
          <button
            onClick={scanCodexQuality}
            disabled={scanningCodex}
            className="flex items-center gap-2 px-4 py-2 bg-amber-700 text-white rounded-xl text-sm font-bold hover:bg-amber-800 disabled:opacity-50 transition-colors"
          >
            {scanningCodex ? <Loader2 className="w-4 h-4 animate-spin" /> : <Search className="w-4 h-4" />}
            فحص المدونات ({codices.length})
          </button>
          <button
            onClick={scanKnowledgeQuality}
            disabled={scanningKnowledge}
            className="flex items-center gap-2 px-4 py-2 bg-amber-600 text-white rounded-xl text-sm font-bold hover:bg-amber-700 disabled:opacity-50 transition-colors"
          >
            {scanningKnowledge ? <Loader2 className="w-4 h-4 animate-spin" /> : <Search className="w-4 h-4" />}
            فحص قاعدة المعرفة (التعاميم والوثائق)
          </button>
        </div>

        {/* Codex scan results */}
        {codexScanResults && (
          <div className="space-y-2">
            <p className="text-xs font-bold text-amber-800">
              نتائج فحص المدونات —
              {codexScanResults.filter(r => r.quality?.hasIssue).length === 0
                ? ' ✅ جميع المدونات نصوصها سليمة'
                : ` ⚠️ ${codexScanResults.filter(r => r.quality?.hasIssue).length} مدونة تحتاج إعادة استخراج`}
            </p>
            <div className="space-y-1.5">
              {codexScanResults.map(row => (
                <div key={row.codexId} className="flex items-center gap-2 text-xs bg-white/70 rounded-xl px-3 py-2">
                  <span className="font-medium text-foreground flex-1 truncate">{row.title}</span>
                  {qualityBadge(row.quality)}
                  {row.quality?.hasIssue && (
                    <button
                      onClick={() => reExtract(row.codexId)}
                      className="flex items-center gap-1 px-2 py-1 bg-red-600 text-white rounded-lg text-xs font-bold hover:bg-red-700 transition-colors"
                    >
                      <RotateCcw className="w-3 h-3" />
                      إعادة استخراج
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
                  <span className="flex items-center gap-1"><Loader2 className="w-3 h-3 animate-spin" /> جارٍ الفحص...</span>
                ) : knowledgeScan ? (
                  knowledgeScan.issuesFound === 0
                    ? `✅ ${knowledgeScan.total} وثيقة — النصوص سليمة`
                    : `⚠️ ${knowledgeScan.issuesFound} وثيقة من ${knowledgeScan.total} تحتاج إعادة فهرسة`
                ) : "فشل الفحص"}
              </p>
              <button onClick={() => setShowKnowledgeScan(false)} className="text-xs text-amber-700 hover:underline">إخفاء</button>
            </div>
            {knowledgeScan && knowledgeScan.issuesFound > 0 && (
              <div className="space-y-1.5 max-h-48 overflow-y-auto">
                {knowledgeScan.results.filter(r => r.quality?.hasIssue).map(row => (
                  <div key={row.docId} className="flex items-start gap-2 text-xs bg-red-50/70 rounded-xl px-3 py-2">
                    <div className="flex-1 min-w-0">
                      <p className="font-medium text-foreground truncate">{row.filename}</p>
                      <p className="text-muted-foreground">{row.sourceType}</p>
                      {row.quality?.reasons.length ? (
                        <p className="text-red-600 text-[10px] mt-0.5">{row.quality.reasons.join(' | ')}</p>
                      ) : null}
                    </div>
                    {qualityBadge(row.quality)}
                  </div>
                ))}
              </div>
            )}
            {knowledgeScan && knowledgeScan.issuesFound > 0 && (
              <p className="text-xs text-amber-700">
                ℹ️ لإعادة فهرسة الوثائق المعطوبة، اذهبي إلى <strong>الإدارة → قاعدة المعرفة → إعادة الفهرسة الشاملة</strong>.
              </p>
            )}
          </div>
        )}
      </div>

      {/* ── Upload form ── */}
      <div className="bg-card border border-border/60 rounded-2xl p-5 space-y-4">
        <h2 className="text-sm font-bold text-foreground flex items-center gap-2">
          <Upload className="w-4 h-4 text-primary" />
          رفع مدونة جديدة
        </h2>

        {/* Technical note about the new extraction engine */}
        <div className="p-3 bg-green-50 border border-green-100 rounded-xl text-xs text-green-800 space-y-1">
          <p className="font-bold">⚙️ محرك الاستخراج المُحدَّث (pdftotext v25.07):</p>
          <p>• يستخدم خوارزمية Unicode Bidi الأصلية — يُخرج العربية بترتيبها الصحيح</p>
          <p>• يُزيل محارف الكشيدة (ـ) التي تُفسد الفهرسة والبحث</p>
          <p>• يُفعِّل gate جودة: يرفض الوثائق ذات النص المعكوس قبل الإدخال</p>
          <p>• يدعم بنية مجموعات الأحكام: يكتشف "رقم الصك" كبداية كل حكم</p>
        </div>

        <form onSubmit={handleUpload} className="space-y-3">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="sm:col-span-2">
              <label className="block text-xs font-medium text-foreground mb-1">عنوان المدونة *</label>
              <input
                value={formData.title}
                onChange={e => setFormData(p => ({ ...p, title: e.target.value }))}
                placeholder="مثال: مجموعة الأحكام القضائية لعام 1434هـ - المجلد الثالث"
                className="w-full h-10 rounded-xl border border-border bg-background px-3 text-sm focus:outline-none focus:border-primary"
                required
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-foreground mb-1">الجهة الناشرة</label>
              <input
                value={formData.publisher}
                onChange={e => setFormData(p => ({ ...p, publisher: e.target.value }))}
                placeholder="وزارة العدل / مركز البحوث"
                className="w-full h-10 rounded-xl border border-border bg-background px-3 text-sm focus:outline-none focus:border-primary"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-foreground mb-1">المحكمة / الجهة</label>
              <input
                value={formData.court}
                onChange={e => setFormData(p => ({ ...p, court: e.target.value }))}
                placeholder="محكمة التمييز"
                className="w-full h-10 rounded-xl border border-border bg-background px-3 text-sm focus:outline-none focus:border-primary"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-foreground mb-1">سنة الإصدار</label>
              <input
                value={formData.year}
                onChange={e => setFormData(p => ({ ...p, year: e.target.value }))}
                placeholder="1434"
                className="w-full h-10 rounded-xl border border-border bg-background px-3 text-sm focus:outline-none focus:border-primary"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-foreground mb-1">ملف PDF *</label>
              <input
                ref={fileRef}
                type="file"
                accept=".pdf,application/pdf"
                className="w-full h-10 rounded-xl border border-border bg-background px-3 text-sm file:mr-3 file:py-1 file:px-3 file:rounded-lg file:border-0 file:bg-primary/10 file:text-primary file:text-xs file:font-bold cursor-pointer"
              />
            </div>
          </div>

          {uploadError && <p className="text-xs text-destructive bg-destructive/10 px-3 py-2 rounded-xl">{uploadError}</p>}
          {uploadSuccess && <p className="text-xs text-green-700 bg-green-50 px-3 py-2 rounded-xl">✅ {uploadSuccess}</p>}

          <button
            type="submit"
            disabled={uploading}
            className="px-4 py-2 bg-primary text-primary-foreground rounded-xl text-sm font-bold hover:bg-primary/90 disabled:opacity-50 flex items-center gap-2"
          >
            {uploading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Upload className="w-4 h-4" />}
            {uploading ? "جارٍ الرفع..." : "رفع المدونة"}
          </button>
        </form>
      </div>

      {/* ── Format guide ── */}
      <div className="p-4 bg-blue-50 border border-blue-100 rounded-2xl text-xs text-blue-800 space-y-1.5">
        <p className="font-bold">📋 بنية مجموعات الأحكام القضائية (الاكتشاف التلقائي):</p>
        <p>كل حكم يبدأ بـ: <strong>رقم الصك</strong> (معرّف عددي) ← تاريخه ← رقم الدعوى ← رقم قرار التصديق</p>
        <p>يليه: المبادئ المستخلصة ← المواد النظامية ← الوقائع والتسبيب والمنطوق</p>
        <p className="font-bold mt-1.5">⚠️ النص للبحث والفهرسة — المحامي يقرأ صور الصفحات الأصلية في العارض</p>
      </div>

      {/* ── Codex list ── */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-bold text-foreground">المدونات المرفوعة ({codices.length})</h2>
          <button onClick={fetchList} className="p-1.5 rounded-lg hover:bg-muted/50 text-muted-foreground transition-colors" title="تحديث">
            <RefreshCw className="w-4 h-4" />
          </button>
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-10 gap-3 text-muted-foreground">
            <Loader2 className="w-5 h-5 animate-spin" />
            <span className="text-sm">جارٍ التحميل...</span>
          </div>
        ) : error ? (
          <p className="text-sm text-destructive">{error}</p>
        ) : codices.length === 0 ? (
          <div className="text-center py-10 text-muted-foreground">
            <FileText className="w-10 h-10 mx-auto mb-3 opacity-30" />
            <p className="text-sm">لا توجد مدونات مرفوعة بعد</p>
          </div>
        ) : (
          codices.map(codex => {
            const job = jobs[codex.id];
            const isExpanded = expandedId === codex.id;
            const codexScan = codexScanResults?.find(r => r.codexId === codex.id);

            return (
              <div key={codex.id} className="bg-card border border-border/60 rounded-2xl overflow-hidden">
                <div className="flex items-center gap-3 px-4 py-3">
                  <div className="w-9 h-9 rounded-xl bg-primary/10 flex items-center justify-center shrink-0">
                    <BookOpen className="w-4 h-4 text-primary" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <p className="text-sm font-semibold text-foreground truncate">{codex.title}</p>
                      {statusBadge(codex.status)}
                      {codexScan && qualityBadge(codexScan.quality)}
                    </div>
                    <div className="flex items-center gap-3 text-xs text-muted-foreground mt-0.5">
                      {codex.court && <span>{codex.court}</span>}
                      {codex.year && <span>{codex.year}هـ</span>}
                      <span>{fmtSize(codex.fileSize)}</span>
                      {codex.totalPages && <span>{codex.totalPages} صفحة</span>}
                      {codex.status === "ready" && <span className="text-green-600 font-semibold">{codex.totalCases} قضية</span>}
                    </div>
                    {/* Extraction progress */}
                    {codex.status === "extracting" && job && (
                      <div className="mt-1.5 space-y-1">
                        <div className="flex items-center gap-2 text-xs text-blue-600">
                          <Loader2 className="w-3 h-3 animate-spin" />
                          <span>معالجة {job.processed} من {job.total} قضية...</span>
                        </div>
                        <div className="w-full bg-gray-200 rounded-full h-1.5">
                          <div
                            className="bg-primary h-1.5 rounded-full transition-all duration-500"
                            style={{ width: `${job.total > 0 ? (job.processed / job.total) * 100 : 0}%` }}
                          />
                        </div>
                        {job.errors.length > 0 && (
                          <p className="text-xs text-amber-600">{job.errors[job.errors.length - 1]}</p>
                        )}
                      </div>
                    )}
                    {codex.error && (
                      <p className="text-xs text-destructive mt-1 leading-relaxed">{codex.error}</p>
                    )}
                  </div>
                  <div className="flex items-center gap-1 shrink-0">
                    {/* Re-extract with new engine */}
                    {codex.status === "ready" && (
                      <button
                        onClick={() => reExtract(codex.id)}
                        className="flex items-center gap-1 px-2.5 py-1.5 bg-amber-600 text-white rounded-xl text-xs font-bold hover:bg-amber-700 transition-colors"
                        title="إعادة الاستخراج بالمحرك الجديد"
                      >
                        <RotateCcw className="w-3 h-3" />
                        إعادة
                      </button>
                    )}
                    {(codex.status === "pending" || codex.status === "error") && (
                      <button
                        onClick={() => startExtraction(codex.id)}
                        className="flex items-center gap-1 px-2.5 py-1.5 bg-primary text-primary-foreground rounded-xl text-xs font-bold hover:bg-primary/90 transition-colors"
                        title="استخراج القضايا"
                      >
                        <Play className="w-3 h-3" />
                        استخراج
                      </button>
                    )}
                    {codex.status === "extracting" && (
                      <div className="flex items-center gap-1 px-2.5 py-1.5 bg-blue-50 text-blue-600 rounded-xl text-xs font-bold">
                        <Loader2 className="w-3 h-3 animate-spin" />
                        جارٍ...
                      </div>
                    )}
                    <button
                      onClick={() => setExpandedId(isExpanded ? null : codex.id)}
                      className="p-1.5 rounded-xl hover:bg-muted/50 text-muted-foreground transition-colors"
                    >
                      {isExpanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                    </button>
                    <button
                      onClick={() => deleteCodex(codex.id, codex.title)}
                      className="p-1.5 rounded-xl hover:bg-destructive/10 text-muted-foreground hover:text-destructive transition-colors"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>

                {isExpanded && (
                  <div className="px-4 pb-4 border-t border-border/30 pt-3 text-xs text-muted-foreground space-y-1">
                    {codex.publisher && <p><span className="font-semibold text-foreground">الناشر:</span> {codex.publisher}</p>}
                    {codex.court && <p><span className="font-semibold text-foreground">الجهة:</span> {codex.court}</p>}
                    {codex.year && <p><span className="font-semibold text-foreground">السنة:</span> {codex.year}هـ</p>}
                    <p><span className="font-semibold text-foreground">الحجم:</span> {fmtSize(codex.fileSize)}</p>
                    <p><span className="font-semibold text-foreground">الصفحات:</span> {codex.totalPages ?? "غير محدد"}</p>
                    <p><span className="font-semibold text-foreground">القضايا المستخرجة:</span> {codex.totalCases}</p>
                    <p><span className="font-semibold text-foreground">تاريخ الرفع:</span> {new Date(codex.createdAt).toLocaleDateString("ar-SA", { year: "numeric", month: "long", day: "numeric" })}</p>
                    {codex.error && (
                      <div className="mt-1 p-2 bg-red-50 rounded-lg">
                        <p className="font-semibold text-destructive">تفاصيل الخطأ:</p>
                        <p className="text-destructive whitespace-pre-wrap">{codex.error}</p>
                      </div>
                    )}
                    {job?.errors?.length > 0 && (
                      <div>
                        <p className="font-semibold text-foreground">سجل الاستخراج ({job.errors.length} ملاحظة):</p>
                        {job.errors.slice(-5).map((e, i) => (
                          <p key={i} className={cn("pr-2", e.startsWith('⚠️') ? 'text-amber-600' : 'text-destructive')}>
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
