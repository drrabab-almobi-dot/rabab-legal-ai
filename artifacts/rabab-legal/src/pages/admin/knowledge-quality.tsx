import React, { useState } from 'react';
import { AdminSidebar } from '@/components/layout';
import { useMetaJobSync } from '@/hooks/useMetaJobSync';
import { cn } from '@/lib/utils';
import {
  ShieldCheck, ShieldAlert, AlertCircle, RefreshCw, Trash2,
  ChevronDown, ChevronUp, CheckCircle2, BarChart3, BookMarked, Loader2,
  Pencil, Save, X, FileWarning, Download,
} from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';

const BASE = import.meta.env.BASE_URL.replace(/\/$/, '');

type CategoryKey = 'reversed' | 'presentation_forms' | 'low_density' | 'toc_suspected' | 'too_short' | 'pass';

const CATEGORY_LABELS: Record<string, string> = {
  reversed:           'نص معكوس',
  presentation_forms: 'أحرف OCR تالفة',
  low_density:        'كثافة عربية منخفضة',
  toc_suspected:      'فهرس محتويات',
  too_short:          'نص قصير جداً',
};

const CATEGORY_COLORS: Record<string, string> = {
  reversed:           'bg-red-100 text-red-800 border-red-200',
  presentation_forms: 'bg-orange-100 text-orange-800 border-orange-200',
  low_density:        'bg-amber-100 text-amber-800 border-amber-200',
  toc_suspected:      'bg-blue-100 text-blue-800 border-blue-200',
  too_short:          'bg-muted text-muted-foreground border-border',
  pass:               'bg-green-100 text-green-800 border-green-200',
};

interface QualitySummary {
  total: number; clean: number; blocked: number; healthPercent: number;
  byCategory: Record<string, number>;
}
interface DocBreakdown {
  documentId: number; filename: string; total: number; blocked: number;
  clean: number; healthPercent: number;
}
interface BlockedChunk {
  id: number; documentId: number; filename: string; chunkIndex: number;
  score: number; reasons: string[]; category: string; snippet: string;
}
interface ScanResult {
  summary: QualitySummary;
  documentBreakdown: DocBreakdown[];
  blockedChunks: BlockedChunk[];
}

function ScoreBar({ pct }: { pct: number }) {
  return (
    <div className="w-full h-2 bg-muted rounded-full overflow-hidden">
      <div
        className={cn('h-full rounded-full transition-all', pct >= 80 ? 'bg-green-500' : pct >= 50 ? 'bg-amber-400' : 'bg-red-500')}
        style={{ width: `${pct}%` }}
      />
    </div>
  );
}

// ── Citation metadata types ────────────────────────────────────────────────────
interface CitationDocStatus {
  id: number;
  filename: string;
  category: string;
  hasCaseMetadata: boolean;
  needsReview: boolean;
  caseNumber?: string | null;
  rulingNumber?: string | null;
  court?: string | null;
  hijriDate?: string | null;
  gregorianDate?: string | null;
  litigationStage?: string | null;
  disputeSubject?: string | null;
  deedNumber?: string | null;
}
interface CitationStats {
  total: number;
  judicial: number;
  withMetadata: number;
  withoutMetadata: number;
  needsReview: number;
  docs: CitationDocStatus[];
}

export default function KnowledgeQuality() {
  const [result, setResult] = useState<ScanResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [deletingDoc, setDeletingDoc] = useState<number | null>(null);
  const [deleteMsg, setDeleteMsg] = useState<Record<number, string>>({});
  const [expandedDoc, setExpandedDoc] = useState<number | null>(null);
  const [filterCat, setFilterCat] = useState<string>('');
  // Citation metadata stats
  const [citStats, setCitStats] = useState<CitationStats | null>(null);
  const [citLoading, setCitLoading] = useState(false);
  const [extractingMeta, setExtractingMeta] = useState<number | null>(null);
  const [metaMsgs, setMetaMsgs] = useState<Record<number, string>>({});
  // Citation filter: 'all' | 'extracted' | 'unextracted' | 'review'
  // Pre-activate from URL param ?citFilter=review (used in Telegram deep-link)
  const [citFilter, setCitFilter] = useState<'all' | 'extracted' | 'unextracted' | 'review'>(() => {
    const p = new URLSearchParams(window.location.search).get('citFilter');
    return (p === 'review' || p === 'extracted' || p === 'unextracted') ? p : 'all';
  });
  // Delete citation metadata
  const [deletingCit, setDeletingCit] = useState<number | null>(null);
  // Inline edit: docId → draft fields
  const [editingCit, setEditingCit] = useState<number | null>(null);
  const [editDraft, setEditDraft] = useState<Record<string, string>>({});
  const [savingCit, setSavingCit] = useState<number | null>(null);
  // Full re-index job
  const [reindexJobId, setReindexJobId] = useState<string | null>(null);
  const [reindexJob, setReindexJob] = useState<{ total: number; done: number; failed: number; running: boolean; log: string[] } | null>(null);
  const [reindexLoading, setReindexLoading] = useState(false);
  const reindexPollRef = React.useRef<ReturnType<typeof setInterval> | null>(null);
  // Page-numbers re-index job
  const [pagesJobId, setPagesJobId] = useState<string | null>(null);
  const [pagesJob, setPagesJob] = useState<{ total: number; done: number; failed: number; running: boolean; log: string[]; chunksUpdated?: number } | null>(null);
  const [pagesLoading, setPagesLoading] = useState(false);
  const pagesPollRef = React.useRef<ReturnType<typeof setInterval> | null>(null);
  // Pages coverage stats
  interface PagesCoverage { totalChunks: number; withPages: number; withoutPages: number; coveragePercent: number; }
  const [pagesCoverage, setPagesCoverage] = useState<PagesCoverage | null>(null);
  const [coverageLoading, setCoverageLoading] = useState(false);

  // Sanitize corrupt citation metadata
  interface SanitizeCorrection { id: number; filename: string; nulledFields: string[]; }
  interface SanitizeResult { scanned: number; corrected: number; message: string; corrections: SanitizeCorrection[]; }
  const [sanitizeLoading, setSanitizeLoading] = useState(false);
  const [sanitizeResult, setSanitizeResult] = useState<SanitizeResult | null>(null);


  const loadPagesCoverage = async () => {
    setCoverageLoading(true);
    try {
      const r = await fetch(`${BASE}/api/admin/knowledge/pages-coverage`, { credentials: 'include' });
      if (!r.ok) throw new Error('فشل تحميل إحصاءات التغطية');
      setPagesCoverage(await r.json());
    } catch (e: any) {
      alert(e.message);
    } finally {
      setCoverageLoading(false);
    }
  };

  const loadCitStats = async () => {
    setCitLoading(true);
    try {
      const r = await fetch(`${BASE}/api/admin/knowledge/citation-stats`, { credentials: 'include' });
      if (!r.ok) throw new Error('فشل تحميل الإحصاءات');
      setCitStats(await r.json());
    } catch (e: any) {
      alert(e.message);
    } finally {
      setCitLoading(false);
    }
  };

  // Extract-all-metadata job — synced across all open admin tabs
  const [metaAllLoading, setMetaAllLoading] = useState(false);
  const { metaJob, announceJob: announceMetaJob } = useMetaJobSync(loadCitStats);

  const runScan = async () => {
    setLoading(true);
    try {
      const r = await fetch(`${BASE}/api/admin/knowledge/quality-scan`, { credentials: 'include' });
      if (!r.ok) throw new Error('فشل الفحص');
      setResult(await r.json());
    } catch (e: any) {
      alert(e.message);
    } finally {
      setLoading(false);
    }
  };

  const deleteBlockedForDoc = async (docId: number, filename: string) => {
    if (!confirm(`حذف جميع المقاطع التالفة في "${filename}"؟ سيتم تقليص الوثيقة — يُنصح بإعادة فهرستها بعد الحذف.`)) return;
    setDeletingDoc(docId);
    try {
      const r = await fetch(`${BASE}/api/admin/knowledge/blocked-chunks/${docId}`, {
        method: 'DELETE', credentials: 'include',
      });
      const data = await r.json();
      setDeleteMsg(prev => ({ ...prev, [docId]: data.message ?? 'تم' }));
      // Refresh scan
      await runScan();
    } catch (e: any) {
      setDeleteMsg(prev => ({ ...prev, [docId]: e.message }));
    } finally {
      setDeletingDoc(null);
    }
  };

  const filteredBlocked = result?.blockedChunks.filter(c => !filterCat || c.category === filterCat) ?? [];

  const startReindex = async () => {
    if (!confirm('سيتم إعادة فهرسة جميع الوثائق من الملفات الأصلية. هذه العملية قد تستغرق عدة دقائق. متابعة؟')) return;
    setReindexLoading(true);
    try {
      const r = await fetch(`${BASE}/api/admin/knowledge/reindex-all`, { method: 'POST', credentials: 'include' });
      const data = await r.json();
      if (data.jobId) {
        setReindexJobId(data.jobId);
        setReindexJob({ total: data.total, done: 0, failed: 0, running: true, log: [] });
        // Poll status every 3s
        reindexPollRef.current = setInterval(async () => {
          try {
            const sr = await fetch(`${BASE}/api/admin/knowledge/reindex-status/${data.jobId}`, { credentials: 'include' });
            const sdata = await sr.json();
            setReindexJob(sdata);
            if (!sdata.running) {
              clearInterval(reindexPollRef.current!);
              reindexPollRef.current = null;
            }
          } catch {}
        }, 3000);
      } else {
        alert(data.message ?? 'تمت إعادة الفهرسة');
      }
    } catch (e: any) {
      alert(e.message);
    } finally {
      setReindexLoading(false);
    }
  };

  const startPagesReindex = async () => {
    if (!confirm('سيتم استخراج أرقام الصفحات للمقاطع الموجودة من ملفات PDF المخزّنة. لن تتغير التضمينات. متابعة؟')) return;
    setPagesLoading(true);
    try {
      const r = await fetch(`${BASE}/api/admin/knowledge/reindex-all-pages`, { method: 'POST', credentials: 'include' });
      const data = await r.json();
      if (data.jobId) {
        setPagesJobId(data.jobId);
        setPagesJob({ total: data.total, done: 0, failed: 0, running: true, log: [], chunksUpdated: 0 });
        pagesPollRef.current = setInterval(async () => {
          try {
            const sr = await fetch(`${BASE}/api/admin/knowledge/reindex-status/${data.jobId}`, { credentials: 'include' });
            const sdata = await sr.json();
            setPagesJob(sdata);
            if (!sdata.running) { clearInterval(pagesPollRef.current!); pagesPollRef.current = null; }
          } catch {}
        }, 3000);
      } else {
        alert(data.message ?? 'تمت العملية');
      }
    } catch (e: any) {
      alert(e.message);
    } finally {
      setPagesLoading(false);
    }
  };

  const startExtractAllMeta = async () => {
    if (!confirm('سيتم استخراج بيانات الاستشهاد بالذكاء الاصطناعي لجميع الوثائق القضائية التي لا تحمل بيانات بعد. قد تستغرق العملية عدة دقائق. متابعة؟')) return;
    setMetaAllLoading(true);
    try {
      const r = await fetch(`${BASE}/api/admin/knowledge/extract-all-metadata`, { method: 'POST', credentials: 'include' });
      const data = await r.json();
      if (data.jobId) {
        announceMetaJob(data.jobId, { total: data.total, done: 0, failed: 0, running: true, log: [], extracted: 0 });
      } else {
        alert(data.message ?? 'تمت العملية');
      }
    } catch (e: any) {
      alert(e.message);
    } finally {
      setMetaAllLoading(false);
    }
  };

  const sanitizeCitations = async () => {
    if (!confirm('سيتم فحص جميع بيانات الاستشهاد وتصفير الحقول الخاطئة تلقائياً. متابعة؟')) return;
    setSanitizeLoading(true);
    setSanitizeResult(null);
    try {
      const r = await fetch(`${BASE}/api/admin/knowledge/sanitize-citation-metadata`, {
        method: 'POST', credentials: 'include',
      });
      if (!r.ok) throw new Error('فشل تنظيف البيانات');
      setSanitizeResult(await r.json());
    } catch (e: any) {
      alert(e.message);
    } finally {
      setSanitizeLoading(false);
    }
  };

  const extractMeta = async (docId: number, filename: string) => {
    setExtractingMeta(docId);
    try {
      const r = await fetch(`${BASE}/api/admin/knowledge/extract-metadata/${docId}`, {
        method: 'POST', credentials: 'include',
      });
      const data = await r.json();
      setMetaMsgs(prev => ({ ...prev, [docId]: data.extracted ? '✓ تم استخراج البيانات' : 'لم تُستخرج بيانات' }));
      await loadCitStats();
    } catch (e: any) {
      setMetaMsgs(prev => ({ ...prev, [docId]: e.message }));
    } finally {
      setExtractingMeta(null);
    }
  };

  const deleteCitMeta = async (docId: number, filename: string) => {
    if (!confirm(`حذف بيانات الاستشهاد للوثيقة "${filename}"؟ يمكن إعادة الاستخراج لاحقاً.`)) return;
    setDeletingCit(docId);
    try {
      const r = await fetch(`${BASE}/api/admin/knowledge/citation-metadata/${docId}`, {
        method: 'DELETE', credentials: 'include',
      });
      if (!r.ok) throw new Error('فشل الحذف');
      setMetaMsgs(prev => ({ ...prev, [docId]: '✓ حُذفت البيانات' }));
      await loadCitStats();
    } catch (e: any) {
      setMetaMsgs(prev => ({ ...prev, [docId]: e.message }));
    } finally {
      setDeletingCit(null);
    }
  };

  const startEditCit = (doc: CitationDocStatus) => {
    setEditingCit(doc.id);
    setEditDraft({
      caseNumber:      doc.caseNumber      ?? '',
      rulingNumber:    doc.rulingNumber    ?? '',
      court:           doc.court           ?? '',
      hijriDate:       doc.hijriDate       ?? '',
      gregorianDate:   doc.gregorianDate   ?? '',
      litigationStage: doc.litigationStage ?? '',
      disputeSubject:  doc.disputeSubject  ?? '',
      deedNumber:      doc.deedNumber      ?? '',
    });
  };

  const saveEditCit = async (docId: number) => {
    setSavingCit(docId);
    try {
      const r = await fetch(`${BASE}/api/admin/knowledge/citation-metadata/${docId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify(editDraft),
      });
      if (!r.ok) throw new Error('فشل الحفظ');
      setMetaMsgs(prev => ({ ...prev, [docId]: '✓ حُفظت التعديلات' }));
      setEditingCit(null);
      await loadCitStats();
    } catch (e: any) {
      setMetaMsgs(prev => ({ ...prev, [docId]: e.message }));
    } finally {
      setSavingCit(null);
    }
  };

  return (
    <AdminSidebar>
      <div className="mb-6">
        <div className="flex items-center gap-3 mb-1">
          <BarChart3 className="w-6 h-6 text-primary" />
          <h1 className="text-2xl font-bold text-primary">جودة قاعدة المعرفة</h1>
        </div>
        <p className="text-muted-foreground text-sm">
          فحص شامل لجميع مقاطع النص المخزّنة — يكشف النصوص المعكوسة والأحرف التالفة وكل ما يُلوّث نتائج البحث
        </p>
      </div>

      {/* Action buttons */}
      <div className="mb-6 flex flex-wrap gap-3">
        <button
          onClick={runScan}
          disabled={loading}
          className="flex items-center gap-2 px-5 py-2.5 bg-primary text-primary-foreground rounded-xl font-bold text-sm hover:bg-primary/90 disabled:opacity-60"
        >
          {loading ? <><RefreshCw className="w-4 h-4 animate-spin" /> جارٍ الفحص…</> : <><RefreshCw className="w-4 h-4" /> تشغيل فحص الجودة</>}
        </button>
        <button
          onClick={startReindex}
          disabled={reindexLoading || (reindexJob?.running === true)}
          className="flex items-center gap-2 px-5 py-2.5 bg-amber-600 text-white rounded-xl font-bold text-sm hover:bg-amber-700 disabled:opacity-60"
        >
          {reindexLoading || reindexJob?.running
            ? <><RefreshCw className="w-4 h-4 animate-spin" /> جارٍ إعادة الفهرسة…</>
            : <><RefreshCw className="w-4 h-4" /> إعادة فهرسة كل الملفات</>}
        </button>
        <button
          onClick={startPagesReindex}
          disabled={pagesLoading || (pagesJob?.running === true)}
          className="flex items-center gap-2 px-5 py-2.5 bg-sky-600 text-white rounded-xl font-bold text-sm hover:bg-sky-700 disabled:opacity-60"
        >
          {pagesLoading || pagesJob?.running
            ? <><RefreshCw className="w-4 h-4 animate-spin" /> جارٍ استخراج الصفحات…</>
            : <><RefreshCw className="w-4 h-4" /> إعادة فهرسة أرقام الصفحات</>}
        </button>
        <button
          onClick={startExtractAllMeta}
          disabled={metaAllLoading || (metaJob?.running === true)}
          className="flex items-center gap-2 px-5 py-2.5 bg-violet-600 text-white rounded-xl font-bold text-sm hover:bg-violet-700 disabled:opacity-60"
        >
          {metaAllLoading || metaJob?.running
            ? <><RefreshCw className="w-4 h-4 animate-spin" /> جارٍ استخراج البيانات…</>
            : <><BookMarked className="w-4 h-4" /> استخراج بيانات الاستشهاد للكل</>}
        </button>
      </div>

      {/* Reindex job progress */}
      {reindexJob && (
        <div className="mb-6 p-4 bg-amber-50 border border-amber-200 rounded-xl space-y-3">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-bold text-amber-900">
              {reindexJob.running ? '⏳ إعادة الفهرسة جارية…' : '✅ اكتملت إعادة الفهرسة'}
            </h3>
            <span className="text-xs text-amber-700 font-medium">
              {reindexJob.done}/{reindexJob.total} وثيقة
              {reindexJob.failed > 0 && <span className="text-red-600 mr-2">({reindexJob.failed} فشل)</span>}
            </span>
          </div>
          {/* Progress bar */}
          <div className="w-full h-2 bg-amber-100 rounded-full overflow-hidden">
            <div
              className={`h-full rounded-full transition-all ${reindexJob.running ? 'bg-amber-500' : 'bg-green-500'}`}
              style={{ width: `${reindexJob.total > 0 ? Math.round((reindexJob.done / reindexJob.total) * 100) : 0}%` }}
            />
          </div>
          {/* Last log lines */}
          {reindexJob.log.length > 0 && (
            <div className="bg-amber-900/10 rounded-lg p-2 max-h-32 overflow-y-auto">
              {reindexJob.log.slice(-8).map((line, i) => (
                <p key={i} className="text-xs text-amber-900 font-mono leading-relaxed">{line}</p>
              ))}
            </div>
          )}
          {!reindexJob.running && (
            <p className="text-xs text-amber-800">
              ✓ نجح {reindexJob.done} — فشل {reindexJob.failed}
              {reindexJob.failed === 0 && ' — الملفات التي لا تحتوي fileData (روابط URL) تُعاد فهرستها من النص المخزّن'}
            </p>
          )}
        </div>
      )}

      {/* Pages re-index job progress */}
      {pagesJob && (
        <div className="mb-6 p-4 bg-sky-50 border border-sky-200 rounded-xl space-y-3">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-bold text-sky-900">
              {pagesJob.running ? '⏳ استخراج أرقام الصفحات جارٍ…' : '✅ اكتمل استخراج أرقام الصفحات'}
            </h3>
            <span className="text-xs text-sky-700 font-medium">
              {pagesJob.done}/{pagesJob.total} وثيقة
              {pagesJob.failed > 0 && <span className="text-red-600 mr-2">({pagesJob.failed} فشل)</span>}
            </span>
          </div>
          <div className="w-full h-2 bg-sky-100 rounded-full overflow-hidden">
            <div
              className={`h-full rounded-full transition-all ${pagesJob.running ? 'bg-sky-500' : 'bg-green-500'}`}
              style={{ width: `${pagesJob.total > 0 ? Math.round((pagesJob.done / pagesJob.total) * 100) : 0}%` }}
            />
          </div>
          {pagesJob.log.length > 0 && (
            <div className="bg-sky-900/10 rounded-lg p-2 max-h-28 overflow-y-auto">
              {pagesJob.log.slice(-6).map((line, i) => (
                <p key={i} className="text-xs text-sky-900 font-mono leading-relaxed">{line}</p>
              ))}
            </div>
          )}
          {!pagesJob.running && (
            <p className="text-xs text-sky-800">
              ✓ نجح {pagesJob.done} — فشل {pagesJob.failed}
              {(pagesJob as any).chunksUpdated != null && ` — مقاطع حصلت على أرقام صفحات: ${(pagesJob as any).chunksUpdated}`}
            </p>
          )}
        </div>
      )}

      {/* Extract-all-metadata job progress */}
      {metaJob && (
        <div className="mb-6 p-4 bg-violet-50 border border-violet-200 rounded-xl space-y-3">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-bold text-violet-900">
              {metaJob.running ? '⏳ استخراج بيانات الاستشهاد جارٍ…' : '✅ اكتمل استخراج بيانات الاستشهاد'}
            </h3>
            <span className="text-xs text-violet-700 font-medium">
              {metaJob.done}/{metaJob.total} وثيقة
              {metaJob.failed > 0 && <span className="text-red-600 mr-2">({metaJob.failed} فشل)</span>}
            </span>
          </div>
          <div className="w-full h-2 bg-violet-100 rounded-full overflow-hidden">
            <div
              className={`h-full rounded-full transition-all ${metaJob.running ? 'bg-violet-500' : 'bg-green-500'}`}
              style={{ width: `${metaJob.total > 0 ? Math.round((metaJob.done / metaJob.total) * 100) : 0}%` }}
            />
          </div>
          {metaJob.log.length > 0 && (
            <div className="bg-violet-900/10 rounded-lg p-2 max-h-28 overflow-y-auto">
              {metaJob.log.slice(-6).map((line, i) => (
                <p key={i} className="text-xs text-violet-900 font-mono leading-relaxed">{line}</p>
              ))}
            </div>
          )}
          {!metaJob.running && (
            <p className="text-xs text-violet-800">
              ✓ فُحص {metaJob.done} — استُخرجت بيانات: {(metaJob as any).extracted ?? '—'} — فشل {metaJob.failed}
              {(metaJob as any).rejectedFields > 0 && (
                <span className="mr-2 text-amber-700 font-semibold">
                  — ⚠️ حقول مرفوضة بالتحقق: {(metaJob as any).rejectedFields}
                </span>
              )}
            </p>
          )}
        </div>
      )}

      {!result && !loading && !reindexJob && !pagesJob && !metaJob && (
        <p className="text-xs text-muted-foreground mb-6">اضغط "فحص الجودة" للكشف عن المقاطع التالفة، أو "إعادة الفهرسة" لإعادة بناء كل القاعدة من الملفات الأصلية.</p>
      )}

      {result && (
        <div className="space-y-6">
          {/* Summary cards */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
            <Card>
              <CardContent className="p-4 text-center">
                <p className="text-3xl font-bold text-foreground">{result.summary.total.toLocaleString()}</p>
                <p className="text-xs text-muted-foreground mt-1">إجمالي المقاطع</p>
              </CardContent>
            </Card>
            <Card className="border-green-200">
              <CardContent className="p-4 text-center">
                <p className="text-3xl font-bold text-green-600">{result.summary.clean.toLocaleString()}</p>
                <p className="text-xs text-muted-foreground mt-1">مقاطع سليمة</p>
              </CardContent>
            </Card>
            <Card className="border-red-200">
              <CardContent className="p-4 text-center">
                <p className="text-3xl font-bold text-red-600">{result.summary.blocked.toLocaleString()}</p>
                <p className="text-xs text-muted-foreground mt-1">مقاطع محجوبة</p>
              </CardContent>
            </Card>
            <Card className={cn('border-2', result.summary.healthPercent >= 80 ? 'border-green-300' : result.summary.healthPercent >= 50 ? 'border-amber-300' : 'border-red-300')}>
              <CardContent className="p-4 text-center">
                <p className={cn('text-3xl font-bold', result.summary.healthPercent >= 80 ? 'text-green-600' : result.summary.healthPercent >= 50 ? 'text-amber-600' : 'text-red-600')}>
                  {result.summary.healthPercent}%
                </p>
                <p className="text-xs text-muted-foreground mt-1">نسبة الصحة</p>
              </CardContent>
            </Card>
          </div>

          {/* Category breakdown */}
          {Object.keys(result.summary.byCategory).length > 0 && (
            <Card>
              <CardContent className="p-5">
                <h2 className="font-bold text-primary mb-3 text-sm">أسباب الحجب</h2>
                <div className="flex flex-wrap gap-2">
                  {Object.entries(result.summary.byCategory).map(([cat, count]) => (
                    <button
                      key={cat}
                      onClick={() => setFilterCat(prev => prev === cat ? '' : cat)}
                      className={cn(
                        'px-3 py-1.5 rounded-xl text-xs font-bold border transition-all',
                        CATEGORY_COLORS[cat] ?? 'bg-muted text-foreground border-border',
                        filterCat === cat && 'ring-2 ring-primary ring-offset-1'
                      )}
                    >
                      {CATEGORY_LABELS[cat] ?? cat}: {count}
                    </button>
                  ))}
                  {filterCat && (
                    <button onClick={() => setFilterCat('')} className="px-3 py-1.5 rounded-xl text-xs border border-border text-muted-foreground">
                      ✕ إلغاء الفلتر
                    </button>
                  )}
                </div>
              </CardContent>
            </Card>
          )}

          {/* Per-document breakdown */}
          <Card>
            <CardContent className="p-5">
              <h2 className="font-bold text-primary mb-4 text-sm flex items-center gap-2">
                <FileWarning className="w-4 h-4" />
                جودة كل وثيقة ({result.documentBreakdown.length} وثيقة)
              </h2>
              <div className="space-y-3">
                {result.documentBreakdown.map(doc => (
                  <div key={doc.documentId} className={cn(
                    'border rounded-xl overflow-hidden',
                    doc.blocked > 0 ? 'border-amber-200' : 'border-green-100'
                  )}>
                    <div
                      className="flex items-center gap-3 px-4 py-3 cursor-pointer hover:bg-muted/30"
                      onClick={() => setExpandedDoc(prev => prev === doc.documentId ? null : doc.documentId)}
                    >
                      {doc.blocked === 0
                        ? <CheckCircle2 className="w-4 h-4 text-green-500 shrink-0" />
                        : <AlertCircle className="w-4 h-4 text-amber-500 shrink-0" />
                      }
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-foreground truncate">{doc.filename}</p>
                        <div className="flex items-center gap-3 mt-1">
                          <ScoreBar pct={doc.healthPercent} />
                          <span className="text-xs text-muted-foreground shrink-0">
                            {doc.clean}/{doc.total} سليم
                          </span>
                        </div>
                      </div>
                      {doc.blocked > 0 && (
                        <span className="text-xs font-bold text-red-600 bg-red-50 border border-red-100 rounded-lg px-2 py-0.5 shrink-0">
                          {doc.blocked} تالف
                        </span>
                      )}
                      {expandedDoc === doc.documentId
                        ? <ChevronUp className="w-4 h-4 text-muted-foreground shrink-0" />
                        : <ChevronDown className="w-4 h-4 text-muted-foreground shrink-0" />
                      }
                    </div>

                    {expandedDoc === doc.documentId && doc.blocked > 0 && (
                      <div className="border-t border-border px-4 py-3 bg-muted/20 space-y-2">
                        {/* Actions */}
                        <div className="flex items-center gap-3 flex-wrap">
                          <button
                            onClick={() => deleteBlockedForDoc(doc.documentId, doc.filename)}
                            disabled={deletingDoc === doc.documentId}
                            className="flex items-center gap-1.5 text-xs bg-red-600 text-white px-3 py-1.5 rounded-lg font-bold hover:bg-red-700 disabled:opacity-60"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                            {deletingDoc === doc.documentId ? 'جارٍ الحذف…' : `حذف ${doc.blocked} مقطع تالف`}
                          </button>
                          <a
                            href={`/admin/knowledge-base`}
                            className="text-xs text-primary underline"
                          >
                            ← إعادة فهرسة الوثيقة
                          </a>
                          {deleteMsg[doc.documentId] && (
                            <span className="text-xs text-green-700 font-medium">{deleteMsg[doc.documentId]}</span>
                          )}
                        </div>

                        {/* Blocked chunks for this doc */}
                        <div className="space-y-1.5 max-h-48 overflow-y-auto">
                          {result.blockedChunks.filter(c => c.documentId === doc.documentId).map(chunk => (
                            <div key={chunk.id} className={cn('rounded-lg border p-2.5 text-xs', CATEGORY_COLORS[chunk.category] ?? 'bg-muted border-border')}>
                              <div className="flex items-center gap-2 flex-wrap mb-1">
                                <span className="font-bold">مقطع #{chunk.chunkIndex}</span>
                                <span className="opacity-70">درجة: {chunk.score}/100</span>
                                {chunk.reasons.map((r, i) => (
                                  <span key={i} className="bg-white/60 px-1.5 py-0.5 rounded border">{r}</span>
                                ))}
                              </div>
                              <p className="opacity-70 font-mono text-[10px] break-all line-clamp-2">{chunk.snippet}</p>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>

          {/* All blocked chunks (filtered) */}
          {filteredBlocked.length > 0 && (
            <Card className="border-red-100">
              <CardContent className="p-5">
                <h2 className="font-bold text-red-700 mb-4 text-sm flex items-center gap-2">
                  <ShieldAlert className="w-4 h-4" />
                  المقاطع المحجوبة {filterCat ? `— ${CATEGORY_LABELS[filterCat] ?? filterCat}` : ''} ({filteredBlocked.length})
                </h2>
                <div className="space-y-2 max-h-96 overflow-y-auto">
                  {filteredBlocked.map(chunk => (
                    <div key={chunk.id} className="border border-red-100 rounded-xl p-3 bg-red-50/30">
                      <div className="flex items-start gap-2 flex-wrap mb-1">
                        <span className={cn('text-[10px] font-bold border px-1.5 py-0.5 rounded-full', CATEGORY_COLORS[chunk.category] ?? 'bg-muted border-border')}>
                          {CATEGORY_LABELS[chunk.category] ?? chunk.category}
                        </span>
                        <span className="text-xs text-muted-foreground">{chunk.filename}</span>
                        <span className="text-xs text-muted-foreground">مقطع #{chunk.chunkIndex}</span>
                        <span className="text-xs font-bold text-red-600">درجة: {chunk.score}</span>
                      </div>
                      <div className="flex flex-wrap gap-1 mb-1.5">
                        {chunk.reasons.map((r, i) => (
                          <span key={i} className="text-[10px] bg-red-100 text-red-700 border border-red-200 px-1.5 py-0.5 rounded">{r}</span>
                        ))}
                      </div>
                      <p className="text-[10px] text-muted-foreground font-mono bg-muted/30 rounded-lg p-2 break-all line-clamp-3 border-r-2 border-red-300">
                        {chunk.snippet}
                      </p>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}

            {result.summary.clean === result.summary.total && (
            <div className="flex items-center gap-3 p-5 bg-green-50 border border-green-200 rounded-2xl">
              <ShieldCheck className="w-8 h-8 text-green-500 shrink-0" />
              <div>
                <p className="font-bold text-green-800">قاعدة المعرفة سليمة بالكامل ✓</p>
                <p className="text-sm text-green-700 mt-0.5">جميع المقاطع ({result.summary.total}) اجتازت فحص الجودة</p>
              </div>
            </div>
          )}
        </div>
      )}

      {/* ── Pages coverage card ───────────────────────────────────────────── */}
      <div className="mt-8 border-t border-border pt-8">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <BarChart3 className="w-5 h-5 text-primary" />
            <h2 className="text-lg font-bold text-primary">تغطية أرقام الصفحات</h2>
          </div>
          <button
            onClick={loadPagesCoverage}
            disabled={coverageLoading}
            className="flex items-center gap-1.5 text-xs px-4 py-1.5 bg-primary/10 text-primary rounded-lg hover:bg-primary/20 disabled:opacity-60"
          >
            {coverageLoading
              ? <><Loader2 className="w-3 h-3 animate-spin" />جارٍ التحميل…</>
              : <><RefreshCw className="w-3 h-3" />تحديث</>}
          </button>
        </div>
        <p className="text-xs text-muted-foreground mb-4">
          نسبة المقاطع التي تحمل أرقام صفحات من الـ PDF الأصلي — تعكس مدى اكتمال عملية استخراج الصفحات.
        </p>

        {pagesCoverage ? (
          <div className="space-y-4">
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              {[
                { label: 'إجمالي المقاطع',     value: pagesCoverage.totalChunks,  color: 'text-foreground' },
                { label: 'تحمل أرقام صفحات', value: pagesCoverage.withPages,    color: 'text-green-700' },
                { label: 'بدون أرقام صفحات', value: pagesCoverage.withoutPages, color: 'text-amber-700' },
                { label: 'نسبة التغطية',       value: `${pagesCoverage.coveragePercent}%`, color: pagesCoverage.coveragePercent >= 80 ? 'text-green-700' : pagesCoverage.coveragePercent >= 40 ? 'text-amber-600' : 'text-red-600' },
              ].map(({ label, value, color }) => (
                <Card key={label}>
                  <CardContent className="p-3 text-center">
                    <p className={cn('text-2xl font-black', color)}>{value}</p>
                    <p className="text-xs text-muted-foreground mt-0.5">{label}</p>
                  </CardContent>
                </Card>
              ))}
            </div>

            <div className="space-y-1">
              <div className="flex justify-between text-xs text-muted-foreground">
                <span>نسبة تغطية أرقام الصفحات</span>
                <span>{pagesCoverage.coveragePercent}%</span>
              </div>
              <div className="w-full h-3 bg-muted rounded-full overflow-hidden">
                <div
                  className={cn(
                    'h-full rounded-full transition-all',
                    pagesCoverage.coveragePercent >= 80 ? 'bg-green-500'
                    : pagesCoverage.coveragePercent >= 40 ? 'bg-amber-400'
                    : 'bg-red-500'
                  )}
                  style={{ width: `${pagesCoverage.coveragePercent}%` }}
                />
              </div>
              {pagesCoverage.withoutPages > 0 && (
                <p className="text-xs text-muted-foreground pt-1">
                  يمكنك تحسين التغطية بالنقر على زر <span className="font-semibold text-sky-700">إعادة فهرسة أرقام الصفحات</span> أعلاه.
                </p>
              )}
            </div>
          </div>
        ) : (
          <p className="text-xs text-muted-foreground">اضغط "تحديث" لعرض إحصاءات تغطية أرقام الصفحات.</p>
        )}
      </div>

      {/* ── Citation metadata section ─────────────────────────────────────── */}
      <div className="mt-8 border-t border-border pt-8">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <BookMarked className="w-5 h-5 text-primary" />
            <h2 className="text-lg font-bold text-primary">بيانات الاستشهاد القضائي</h2>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={sanitizeCitations}
              disabled={sanitizeLoading}
              className="flex items-center gap-1.5 text-xs px-4 py-1.5 bg-red-50 text-red-700 border border-red-200 rounded-lg hover:bg-red-100 disabled:opacity-60"
            >
              {sanitizeLoading
                ? <><Loader2 className="w-3 h-3 animate-spin" />جارٍ الفحص…</>
                : <><ShieldCheck className="w-3 h-3" />فحص وتنظيف البيانات الفاسدة</>}
            </button>
            <a
              href={`${BASE}/api/admin/knowledge/citation-export.csv`}
              download="citation-export.csv"
              className="flex items-center gap-1.5 text-xs px-4 py-1.5 bg-emerald-600 text-white rounded-lg hover:bg-emerald-700 font-semibold"
            >
              <Download className="w-3 h-3" />
              تصدير CSV
            </a>
            <button
              onClick={loadCitStats}
              disabled={citLoading}
              className="flex items-center gap-1.5 text-xs px-4 py-1.5 bg-primary/10 text-primary rounded-lg hover:bg-primary/20 disabled:opacity-60"
            >
              {citLoading ? <><Loader2 className="w-3 h-3 animate-spin" />جارٍ التحميل…</> : <><RefreshCw className="w-3 h-3" />فحص بيانات الاستشهاد</>}
            </button>
          </div>
        </div>
        <p className="text-xs text-muted-foreground mb-4">
          يتحقق من اكتمال بيانات الاستشهاد (رقم القضية، المحكمة، التاريخ) للوثائق القضائية، ويتيح مراجعتها وتصحيحها يدوياً أو إعادة استخراجها.
        </p>

        {/* Sanitize results */}
        {sanitizeResult && (
          <div className={cn(
            'mb-4 rounded-xl border p-4 space-y-3',
            sanitizeResult.corrected > 0
              ? 'bg-amber-50 border-amber-200'
              : 'bg-green-50 border-green-200',
          )}>
            <div className="flex items-start gap-2">
              {sanitizeResult.corrected > 0
                ? <ShieldAlert className="w-4 h-4 text-amber-600 mt-0.5 shrink-0" />
                : <ShieldCheck className="w-4 h-4 text-green-600 mt-0.5 shrink-0" />}
              <p className={cn('text-sm font-semibold', sanitizeResult.corrected > 0 ? 'text-amber-900' : 'text-green-900')}>
                {sanitizeResult.message}
              </p>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="bg-white rounded-lg border border-border p-3 text-center">
                <p className="text-2xl font-black text-foreground">{sanitizeResult.scanned}</p>
                <p className="text-xs text-muted-foreground mt-0.5">سجلات مفحوصة</p>
              </div>
              <div className="bg-white rounded-lg border border-border p-3 text-center">
                <p className={cn('text-2xl font-black', sanitizeResult.corrected > 0 ? 'text-amber-700' : 'text-green-700')}>
                  {sanitizeResult.corrected}
                </p>
                <p className="text-xs text-muted-foreground mt-0.5">سجلات مُصحَّحة</p>
              </div>
            </div>
            {sanitizeResult.corrections.length > 0 && (
              <div className="space-y-1.5 max-h-48 overflow-y-auto">
                <p className="text-xs font-semibold text-amber-800">الحقول التي أُزيلت:</p>
                {sanitizeResult.corrections.map(c => (
                  <div key={c.id} className="flex items-start gap-2 text-xs bg-white rounded-lg border border-amber-100 px-3 py-2">
                    <FileWarning className="w-3 h-3 text-amber-500 mt-0.5 shrink-0" />
                    <span className="font-medium text-foreground truncate flex-1">{c.filename}</span>
                    <span className="text-amber-700 shrink-0">{c.nulledFields.join('، ')}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {citStats && (
          <div className="space-y-4">
            {/* Summary cards */}
            <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
              {[
                { label: 'إجمالي الوثائق',   value: citStats.total,            color: 'text-foreground' },
                { label: 'وثائق قضائية',     value: citStats.judicial,         color: 'text-primary' },
                { label: 'مكتملة البيانات',  value: citStats.withMetadata,     color: 'text-green-700' },
                { label: 'غير مستخرجة',      value: citStats.withoutMetadata,  color: 'text-amber-700' },
                { label: 'تحتاج مراجعة',     value: citStats.needsReview ?? 0, color: 'text-red-600' },
              ].map(({ label, value, color }) => (
                <Card key={label}>
                  <CardContent className="p-3 text-center">
                    <p className={cn('text-2xl font-black', color)}>{value}</p>
                    <p className="text-xs text-muted-foreground mt-0.5">{label}</p>
                  </CardContent>
                </Card>
              ))}
            </div>

            {/* Rejection ratio bar */}
            {citStats.withMetadata > 0 && (citStats.needsReview ?? 0) > 0 && (() => {
              const rejPct = Math.round(((citStats.needsReview ?? 0) / citStats.withMetadata) * 100);
              return (
                <div className="p-4 bg-amber-50 border border-amber-200 rounded-xl space-y-2">
                  <div className="flex items-center justify-between text-xs">
                    <span className="font-semibold text-amber-900">
                      ⚠️ نسبة الاستشهادات المشبوهة أو المرفوضة
                    </span>
                    <span className="font-bold text-amber-700">{rejPct}% ({citStats.needsReview} / {citStats.withMetadata})</span>
                  </div>
                  <div className="w-full h-2 bg-amber-100 rounded-full overflow-hidden">
                    <div
                      className={cn('h-full rounded-full transition-all', rejPct >= 30 ? 'bg-red-500' : rejPct >= 10 ? 'bg-amber-500' : 'bg-yellow-400')}
                      style={{ width: `${rejPct}%` }}
                    />
                  </div>
                  <p className="text-[11px] text-amber-700">
                    هذه الوثائق تحمل بيانات استشهاد ناقصة أو مشبوهة — يُنصح بمراجعتها يدوياً أو إعادة استخراجها.
                  </p>
                </div>
              );
            })()}

            {/* Progress bar */}
            {citStats.judicial > 0 && (
              <div className="space-y-1">
                <div className="flex justify-between text-xs text-muted-foreground">
                  <span>نسبة اكتمال الاستشهاد</span>
                  <span>{Math.round(citStats.withMetadata / citStats.judicial * 100)}%</span>
                </div>
                <div className="w-full h-2 bg-muted rounded-full overflow-hidden">
                  <div
                    className="h-full bg-green-500 rounded-full transition-all"
                    style={{ width: `${citStats.judicial > 0 ? citStats.withMetadata / citStats.judicial * 100 : 0}%` }}
                  />
                </div>
              </div>
            )}

            {/* Filter tabs */}
            {citStats.docs.length > 0 && (
              <div className="flex flex-wrap gap-2">
                {([
                  { key: 'all',         label: 'الكل',              count: citStats.judicial },
                  { key: 'extracted',   label: 'مستخرجة',           count: citStats.withMetadata },
                  { key: 'unextracted', label: 'غير مستخرجة',       count: citStats.withoutMetadata },
                  { key: 'review',      label: 'تحتاج مراجعة',      count: citStats.needsReview ?? 0 },
                ] as const).map(tab => (
                  <button
                    key={tab.key}
                    onClick={() => setCitFilter(tab.key)}
                    className={cn(
                      'px-3 py-1.5 rounded-xl text-xs font-bold border transition-all',
                      citFilter === tab.key
                        ? 'bg-primary text-primary-foreground border-primary'
                        : 'bg-muted text-foreground border-border hover:bg-muted/60'
                    )}
                  >
                    {tab.label}
                    <span className={cn(
                      'mr-1.5 px-1.5 py-0.5 rounded-full text-[10px]',
                      citFilter === tab.key ? 'bg-white/20' : 'bg-border'
                    )}>{tab.count}</span>
                  </button>
                ))}
              </div>
            )}

            {/* Per-doc list */}
            {citStats.docs.length > 0 && (() => {
              const filtered = citStats.docs.filter(d => {
                if (citFilter === 'extracted')   return d.hasCaseMetadata && !d.needsReview;
                if (citFilter === 'unextracted') return !d.hasCaseMetadata;
                if (citFilter === 'review')      return d.needsReview;
                return true;
              });
              return (
                <Card>
                  <CardContent className="p-4">
                    <h3 className="text-sm font-bold text-foreground mb-3">
                      الوثائق القضائية ({filtered.length})
                    </h3>
                    {filtered.length === 0 && (
                      <p className="text-xs text-muted-foreground text-center py-4">لا توجد وثائق في هذا التصنيف</p>
                    )}
                    <div className="space-y-2 max-h-[32rem] overflow-y-auto">
                      {filtered.map(doc => (
                        <div key={doc.id} className={cn(
                          'rounded-xl border overflow-hidden',
                          doc.needsReview
                            ? 'border-red-200 bg-red-50/30'
                            : doc.hasCaseMetadata
                              ? 'border-green-200 bg-green-50/30'
                              : 'border-amber-200 bg-amber-50/30'
                        )}>
                          {/* Header row */}
                          <div className="flex items-center gap-3 p-3">
                            {doc.needsReview
                              ? <FileWarning className="w-4 h-4 text-red-500 shrink-0" />
                              : doc.hasCaseMetadata
                                ? <CheckCircle2 className="w-4 h-4 text-green-600 shrink-0" />
                                : <AlertCircle className="w-4 h-4 text-amber-600 shrink-0" />
                            }
                            <div className="flex-1 min-w-0">
                              <p className="text-xs font-medium text-foreground truncate">{doc.filename}</p>
                              {doc.hasCaseMetadata ? (
                                <p className="text-xs text-muted-foreground mt-0.5">
                                  {[doc.court, doc.caseNumber || doc.rulingNumber, doc.hijriDate && `${doc.hijriDate}هـ`].filter(Boolean).join(' · ')}
                                  {doc.needsReview && <span className="text-red-600 font-medium mr-2">— بيانات منقوصة</span>}
                                </p>
                              ) : (
                                <p className="text-xs text-amber-700 mt-0.5">لم تُستخرج بيانات الاستشهاد بعد</p>
                              )}
                            </div>
                            {/* Action buttons */}
                            <div className="flex items-center gap-1.5 shrink-0">
                              {!doc.hasCaseMetadata && (
                                <button
                                  onClick={() => extractMeta(doc.id, doc.filename)}
                                  disabled={extractingMeta === doc.id}
                                  className="text-xs px-2.5 py-1 bg-primary text-primary-foreground rounded-lg hover:bg-primary/90 disabled:opacity-60"
                                >
                                  {extractingMeta === doc.id ? <Loader2 className="w-3 h-3 animate-spin" /> : 'استخراج'}
                                </button>
                              )}
                              {doc.hasCaseMetadata && (
                                <>
                                  <button
                                    onClick={() => editingCit === doc.id ? setEditingCit(null) : startEditCit(doc)}
                                    className="p-1.5 rounded-lg border border-border hover:bg-muted/60 text-muted-foreground hover:text-foreground"
                                    title="تعديل يدوي"
                                  >
                                    {editingCit === doc.id ? <X className="w-3.5 h-3.5" /> : <Pencil className="w-3.5 h-3.5" />}
                                  </button>
                                  <button
                                    onClick={() => extractMeta(doc.id, doc.filename)}
                                    disabled={extractingMeta === doc.id}
                                    className="p-1.5 rounded-lg border border-border hover:bg-muted/60 text-muted-foreground hover:text-foreground disabled:opacity-50"
                                    title="إعادة الاستخراج"
                                  >
                                    {extractingMeta === doc.id ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <RefreshCw className="w-3.5 h-3.5" />}
                                  </button>
                                  <button
                                    onClick={() => deleteCitMeta(doc.id, doc.filename)}
                                    disabled={deletingCit === doc.id}
                                    className="p-1.5 rounded-lg border border-red-200 hover:bg-red-50 text-red-500 hover:text-red-700 disabled:opacity-50"
                                    title="حذف البيانات"
                                  >
                                    {deletingCit === doc.id ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Trash2 className="w-3.5 h-3.5" />}
                                  </button>
                                </>
                              )}
                            </div>
                          </div>

                          {/* Status message */}
                          {metaMsgs[doc.id] && (
                            <div className="px-3 pb-2">
                              <span className="text-xs text-green-700 font-medium">{metaMsgs[doc.id]}</span>
                            </div>
                          )}

                          {/* Inline edit form */}
                          {editingCit === doc.id && (
                            <div className="border-t border-border bg-muted/20 px-4 py-3 space-y-3">
                              <p className="text-xs font-bold text-foreground mb-2">تعديل بيانات الاستشهاد</p>
                              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                                {([
                                  { key: 'caseNumber',      label: 'رقم القضية' },
                                  { key: 'rulingNumber',    label: 'رقم الحكم' },
                                  { key: 'court',           label: 'المحكمة / الدائرة' },
                                  { key: 'hijriDate',       label: 'التاريخ الهجري' },
                                  { key: 'gregorianDate',   label: 'التاريخ الميلادي' },
                                  { key: 'litigationStage', label: 'مرحلة التقاضي' },
                                  { key: 'disputeSubject',  label: 'موضوع النزاع' },
                                  { key: 'deedNumber',      label: 'رقم الصك / السند' },
                                ] as const).map(({ key, label }) => (
                                  <div key={key}>
                                    <label className="text-[10px] text-muted-foreground font-medium block mb-1">{label}</label>
                                    <input
                                      type="text"
                                      value={editDraft[key] ?? ''}
                                      onChange={e => setEditDraft(prev => ({ ...prev, [key]: e.target.value }))}
                                      dir="auto"
                                      className="w-full text-xs border border-border rounded-lg px-2.5 py-1.5 bg-background focus:outline-none focus:ring-1 focus:ring-primary"
                                      placeholder={`أدخل ${label}…`}
                                    />
                                  </div>
                                ))}
                              </div>
                              <div className="flex items-center gap-2 pt-1">
                                <button
                                  onClick={() => saveEditCit(doc.id)}
                                  disabled={savingCit === doc.id}
                                  className="flex items-center gap-1.5 text-xs px-3 py-1.5 bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:opacity-60 font-bold"
                                >
                                  {savingCit === doc.id ? <><Loader2 className="w-3 h-3 animate-spin" />جارٍ الحفظ…</> : <><Save className="w-3 h-3" />حفظ التعديلات</>}
                                </button>
                                <button
                                  onClick={() => setEditingCit(null)}
                                  className="text-xs px-3 py-1.5 border border-border rounded-lg hover:bg-muted/60 text-muted-foreground"
                                >
                                  إلغاء
                                </button>
                              </div>
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  </CardContent>
                </Card>
              );
            })()}

            {citStats.judicial === 0 && (
              <p className="text-sm text-muted-foreground text-center py-6">
                لا توجد وثائق قضائية في قاعدة المعرفة بعد.
              </p>
            )}
          </div>
        )}
      </div>
    </AdminSidebar>
  );
}
