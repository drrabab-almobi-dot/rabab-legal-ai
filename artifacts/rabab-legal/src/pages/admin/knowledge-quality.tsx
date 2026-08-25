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
import { useLang } from '@/hooks/use-language';

const BASE = import.meta.env.BASE_URL.replace(/\/$/, '');

type CategoryKey = 'reversed' | 'presentation_forms' | 'low_density' | 'toc_suspected' | 'too_short' | 'pass';

const CATEGORY_LABELS: Record<string, [string, string]> = {
  reversed:           ['نص معكوس', 'Reversed text'],
  presentation_forms: ['أحرف OCR تالفة', 'Damaged OCR characters'],
  low_density:        ['كثافة عربية منخفضة', 'Low Arabic density'],
  toc_suspected:      ['فهرس محتويات', 'Table of contents'],
  too_short:          ['نص قصير جداً', 'Text too short'],
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
  const { lang, t } = useLang();
  const locale = lang === 'ar' ? 'ar-SA' : 'en-US';
  const categoryLabel = (category: string) => {
    const label = CATEGORY_LABELS[category];
    return label ? t(...label) : category;
  };
  const formatNumber = (value: number) => value.toLocaleString(locale);
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
      if (!r.ok) throw new Error(t('فشل تحميل إحصاءات التغطية', 'Failed to load coverage statistics'));
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
      if (!r.ok) throw new Error(t('فشل تحميل الإحصاءات', 'Failed to load statistics'));
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
      if (!r.ok) throw new Error(t('فشل الفحص', 'Scan failed'));
      setResult(await r.json());
    } catch (e: any) {
      alert(e.message);
    } finally {
      setLoading(false);
    }
  };

  const deleteBlockedForDoc = async (docId: number, filename: string) => {
    if (!confirm(t(`حذف جميع المقاطع التالفة في "${filename}"؟ سيتم تقليص الوثيقة — يُنصح بإعادة فهرستها بعد الحذف.`, `Delete all damaged chunks in "${filename}"? The document will be reduced; reindexing it afterward is recommended.`))) return;
    setDeletingDoc(docId);
    try {
      const r = await fetch(`${BASE}/api/admin/knowledge/blocked-chunks/${docId}`, {
        method: 'DELETE', credentials: 'include',
      });
      const data = await r.json();
      setDeleteMsg(prev => ({ ...prev, [docId]: data.message ?? t('تم', 'Done') }));
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
    if (!confirm(t('سيتم إعادة فهرسة جميع الوثائق من الملفات الأصلية. هذه العملية قد تستغرق عدة دقائق. متابعة؟', 'All documents will be reindexed from their original files. This may take several minutes. Continue?'))) return;
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
        alert(data.message ?? t('تمت إعادة الفهرسة', 'Reindexing completed'));
      }
    } catch (e: any) {
      alert(e.message);
    } finally {
      setReindexLoading(false);
    }
  };

  const startPagesReindex = async () => {
    if (!confirm(t('سيتم استخراج أرقام الصفحات للمقاطع الموجودة من ملفات PDF المخزّنة. لن تتغير التضمينات. متابعة؟', 'Page numbers will be extracted for existing chunks from stored PDF files. Embeddings will not change. Continue?'))) return;
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
        alert(data.message ?? t('تمت العملية', 'Operation completed'));
      }
    } catch (e: any) {
      alert(e.message);
    } finally {
      setPagesLoading(false);
    }
  };

  const startExtractAllMeta = async () => {
    if (!confirm(t('سيتم استخراج بيانات الاستشهاد بالذكاء الاصطناعي لجميع الوثائق القضائية التي لا تحمل بيانات بعد. قد تستغرق العملية عدة دقائق. متابعة؟', 'Citation metadata will be extracted with AI for all judicial documents that do not yet have it. This may take several minutes. Continue?'))) return;
    setMetaAllLoading(true);
    try {
      const r = await fetch(`${BASE}/api/admin/knowledge/extract-all-metadata`, { method: 'POST', credentials: 'include' });
      const data = await r.json();
      if (data.jobId) {
        announceMetaJob(data.jobId, { total: data.total, done: 0, failed: 0, running: true, log: [], extracted: 0 });
      } else {
        alert(data.message ?? t('تمت العملية', 'Operation completed'));
      }
    } catch (e: any) {
      alert(e.message);
    } finally {
      setMetaAllLoading(false);
    }
  };

  const sanitizeCitations = async () => {
    if (!confirm(t('سيتم فحص جميع بيانات الاستشهاد وتصفير الحقول الخاطئة تلقائياً. متابعة؟', 'All citation metadata will be checked and invalid fields cleared automatically. Continue?'))) return;
    setSanitizeLoading(true);
    setSanitizeResult(null);
    try {
      const r = await fetch(`${BASE}/api/admin/knowledge/sanitize-citation-metadata`, {
        method: 'POST', credentials: 'include',
      });
      if (!r.ok) throw new Error(t('فشل تنظيف البيانات', 'Failed to clean metadata'));
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
      setMetaMsgs(prev => ({ ...prev, [docId]: data.extracted ? t('✓ تم استخراج البيانات', '✓ Metadata extracted') : t('لم تُستخرج بيانات', 'No metadata was extracted') }));
      await loadCitStats();
    } catch (e: any) {
      setMetaMsgs(prev => ({ ...prev, [docId]: e.message }));
    } finally {
      setExtractingMeta(null);
    }
  };

  const deleteCitMeta = async (docId: number, filename: string) => {
    if (!confirm(t(`حذف بيانات الاستشهاد للوثيقة "${filename}"؟ يمكن إعادة الاستخراج لاحقاً.`, `Delete citation metadata for "${filename}"? It can be extracted again later.`))) return;
    setDeletingCit(docId);
    try {
      const r = await fetch(`${BASE}/api/admin/knowledge/citation-metadata/${docId}`, {
        method: 'DELETE', credentials: 'include',
      });
      if (!r.ok) throw new Error(t('فشل الحذف', 'Deletion failed'));
      setMetaMsgs(prev => ({ ...prev, [docId]: t('✓ حُذفت البيانات', '✓ Metadata deleted') }));
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
      if (!r.ok) throw new Error(t('فشل الحفظ', 'Save failed'));
      setMetaMsgs(prev => ({ ...prev, [docId]: t('✓ حُفظت التعديلات', '✓ Changes saved') }));
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
      <div dir={lang === 'ar' ? 'rtl' : 'ltr'}>
      <div className="mb-6">
        <div className="flex items-center gap-3 mb-1">
          <BarChart3 className="w-6 h-6 text-primary" />
           <h1 className="text-2xl font-bold text-primary">{t('جودة قاعدة المعرفة', 'Knowledge base quality')}</h1>
        </div>
        <p className="text-muted-foreground text-sm">
           {t('فحص شامل لجميع مقاطع النص المخزّنة — يكشف النصوص المعكوسة والأحرف التالفة وكل ما يُلوّث نتائج البحث', 'A comprehensive scan of stored text chunks that detects reversed text, damaged characters, and anything that contaminates search results')}
        </p>
      </div>

      {/* Action buttons */}
      <div className="mb-6 flex flex-wrap gap-3">
        <button
          onClick={runScan}
          disabled={loading}
          className="flex items-center gap-2 px-5 py-2.5 bg-primary text-primary-foreground rounded-xl font-bold text-sm hover:bg-primary/90 disabled:opacity-60"
        >
           {loading ? <><RefreshCw className="w-4 h-4 animate-spin" /> {t('جارٍ الفحص…', 'Scanning…')}</> : <><RefreshCw className="w-4 h-4" /> {t('تشغيل فحص الجودة', 'Run quality scan')}</>}
        </button>
        <button
          onClick={startReindex}
          disabled={reindexLoading || (reindexJob?.running === true)}
          className="flex items-center gap-2 px-5 py-2.5 bg-amber-600 text-white rounded-xl font-bold text-sm hover:bg-amber-700 disabled:opacity-60"
        >
          {reindexLoading || reindexJob?.running
            ? <><RefreshCw className="w-4 h-4 animate-spin" /> {t('جارٍ إعادة الفهرسة…', 'Reindexing…')}</>
             : <><RefreshCw className="w-4 h-4" /> {t('إعادة فهرسة كل الملفات', 'Reindex all files')}</>}
        </button>
        <button
          onClick={startPagesReindex}
          disabled={pagesLoading || (pagesJob?.running === true)}
          className="flex items-center gap-2 px-5 py-2.5 bg-sky-600 text-white rounded-xl font-bold text-sm hover:bg-sky-700 disabled:opacity-60"
        >
          {pagesLoading || pagesJob?.running
            ? <><RefreshCw className="w-4 h-4 animate-spin" /> {t('جارٍ استخراج الصفحات…', 'Extracting pages…')}</>
             : <><RefreshCw className="w-4 h-4" /> {t('إعادة فهرسة أرقام الصفحات', 'Reindex page numbers')}</>}
        </button>
        <button
          onClick={startExtractAllMeta}
          disabled={metaAllLoading || (metaJob?.running === true)}
          className="flex items-center gap-2 px-5 py-2.5 bg-violet-600 text-white rounded-xl font-bold text-sm hover:bg-violet-700 disabled:opacity-60"
        >
          {metaAllLoading || metaJob?.running
            ? <><RefreshCw className="w-4 h-4 animate-spin" /> {t('جارٍ استخراج البيانات…', 'Extracting metadata…')}</>
             : <><BookMarked className="w-4 h-4" /> {t('استخراج بيانات الاستشهاد للكل', 'Extract citation metadata for all')}</>}
        </button>
      </div>

      {/* Reindex job progress */}
      {reindexJob && (
        <div className="mb-6 p-4 bg-amber-50 border border-amber-200 rounded-xl space-y-3">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-bold text-amber-900">
              {reindexJob.running ? t('⏳ إعادة الفهرسة جارية…', '⏳ Reindexing in progress…') : t('✅ اكتملت إعادة الفهرسة', '✅ Reindexing complete')}
            </h3>
            <span className="text-xs text-amber-700 font-medium">
              {formatNumber(reindexJob.done)}/{formatNumber(reindexJob.total)} {t('وثيقة', 'documents')}
              {reindexJob.failed > 0 && <span className="text-red-600 mr-2">({formatNumber(reindexJob.failed)} {t('فشل', 'failed')})</span>}
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
                <p key={i} dir="auto" className="text-xs text-amber-900 font-mono leading-relaxed">{line}</p>
              ))}
            </div>
          )}
          {!reindexJob.running && (
            <p className="text-xs text-amber-800">
              {t(`✓ نجح ${formatNumber(reindexJob.done)} — فشل ${formatNumber(reindexJob.failed)}`, `✓ Succeeded ${formatNumber(reindexJob.done)} — failed ${formatNumber(reindexJob.failed)}`)}
              {reindexJob.failed === 0 && t(' — الملفات التي لا تحتوي fileData (روابط URL) تُعاد فهرستها من النص المخزّن', ' — files without fileData (URL links) are reindexed from stored text')}
            </p>
          )}
        </div>
      )}

      {/* Pages re-index job progress */}
      {pagesJob && (
        <div className="mb-6 p-4 bg-sky-50 border border-sky-200 rounded-xl space-y-3">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-bold text-sky-900">
              {pagesJob.running ? t('⏳ استخراج أرقام الصفحات جارٍ…', '⏳ Page-number extraction in progress…') : t('✅ اكتمل استخراج أرقام الصفحات', '✅ Page-number extraction complete')}
            </h3>
            <span className="text-xs text-sky-700 font-medium">
              {formatNumber(pagesJob.done)}/{formatNumber(pagesJob.total)} {t('وثيقة', 'documents')}
              {pagesJob.failed > 0 && <span className="text-red-600 mr-2">({formatNumber(pagesJob.failed)} {t('فشل', 'failed')})</span>}
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
                <p key={i} dir="auto" className="text-xs text-sky-900 font-mono leading-relaxed">{line}</p>
              ))}
            </div>
          )}
          {!pagesJob.running && (
            <p className="text-xs text-sky-800">
              {t(`✓ نجح ${formatNumber(pagesJob.done)} — فشل ${formatNumber(pagesJob.failed)}`, `✓ Succeeded ${formatNumber(pagesJob.done)} — failed ${formatNumber(pagesJob.failed)}`)}
              {(pagesJob as any).chunksUpdated != null && t(` — مقاطع حصلت على أرقام صفحات: ${formatNumber((pagesJob as any).chunksUpdated)}`, ` — chunks assigned page numbers: ${formatNumber((pagesJob as any).chunksUpdated)}`)}
            </p>
          )}
        </div>
      )}

      {/* Extract-all-metadata job progress */}
      {metaJob && (
        <div className="mb-6 p-4 bg-violet-50 border border-violet-200 rounded-xl space-y-3">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-bold text-violet-900">
              {metaJob.running ? t('⏳ استخراج بيانات الاستشهاد جارٍ…', '⏳ Citation metadata extraction in progress…') : t('✅ اكتمل استخراج بيانات الاستشهاد', '✅ Citation metadata extraction complete')}
            </h3>
            <span className="text-xs text-violet-700 font-medium">
              {formatNumber(metaJob.done)}/{formatNumber(metaJob.total)} {t('وثيقة', 'documents')}
              {metaJob.failed > 0 && <span className="text-red-600 mr-2">({formatNumber(metaJob.failed)} {t('فشل', 'failed')})</span>}
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
                <p key={i} dir="auto" className="text-xs text-violet-900 font-mono leading-relaxed">{line}</p>
              ))}
            </div>
          )}
          {!metaJob.running && (
            <p className="text-xs text-violet-800">
              {t(`✓ فُحص ${formatNumber(metaJob.done)} — استُخرجت بيانات: ${(metaJob as any).extracted ?? '—'} — فشل ${formatNumber(metaJob.failed)}`, `✓ Checked ${formatNumber(metaJob.done)} — metadata extracted: ${(metaJob as any).extracted ?? '—'} — failed ${formatNumber(metaJob.failed)}`)}
              {(metaJob as any).rejectedFields > 0 && (
                <span className="mr-2 text-amber-700 font-semibold">
                  {t(`— ⚠️ حقول مرفوضة بالتحقق: ${(metaJob as any).rejectedFields}`, `— ⚠️ Fields rejected by validation: ${(metaJob as any).rejectedFields}`)}
                </span>
              )}
            </p>
          )}
        </div>
      )}

      {!result && !loading && !reindexJob && !pagesJob && !metaJob && (
        <p className="text-xs text-muted-foreground mb-6">{t('اضغط "فحص الجودة" للكشف عن المقاطع التالفة، أو "إعادة الفهرسة" لإعادة بناء كل القاعدة من الملفات الأصلية.', 'Click “Quality scan” to detect damaged chunks, or “Reindex all files” to rebuild the entire base from the original files.')}</p>
      )}

      {result && (
        <div className="space-y-6">
          {/* Summary cards */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
            <Card>
              <CardContent className="p-4 text-center">
                <p className="text-3xl font-bold text-foreground">{formatNumber(result.summary.total)}</p>
                <p className="text-xs text-muted-foreground mt-1">{t('إجمالي المقاطع', 'Total chunks')}</p>
              </CardContent>
            </Card>
            <Card className="border-green-200">
              <CardContent className="p-4 text-center">
                <p className="text-3xl font-bold text-green-600">{formatNumber(result.summary.clean)}</p>
                <p className="text-xs text-muted-foreground mt-1">{t('مقاطع سليمة', 'Clean chunks')}</p>
              </CardContent>
            </Card>
            <Card className="border-red-200">
              <CardContent className="p-4 text-center">
                <p className="text-3xl font-bold text-red-600">{formatNumber(result.summary.blocked)}</p>
                <p className="text-xs text-muted-foreground mt-1">{t('مقاطع محجوبة', 'Blocked chunks')}</p>
              </CardContent>
            </Card>
            <Card className={cn('border-2', result.summary.healthPercent >= 80 ? 'border-green-300' : result.summary.healthPercent >= 50 ? 'border-amber-300' : 'border-red-300')}>
              <CardContent className="p-4 text-center">
                <p className={cn('text-3xl font-bold', result.summary.healthPercent >= 80 ? 'text-green-600' : result.summary.healthPercent >= 50 ? 'text-amber-600' : 'text-red-600')}>
                  {formatNumber(result.summary.healthPercent)}%
                </p>
                <p className="text-xs text-muted-foreground mt-1">{t('نسبة الصحة', 'Health score')}</p>
              </CardContent>
            </Card>
          </div>

          {/* Category breakdown */}
          {Object.keys(result.summary.byCategory).length > 0 && (
            <Card>
              <CardContent className="p-5">
                <h2 className="font-bold text-primary mb-3 text-sm">{t('أسباب الحجب', 'Blocking reasons')}</h2>
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
                      {categoryLabel(cat)}: {formatNumber(count)}
                    </button>
                  ))}
                  {filterCat && (
                    <button onClick={() => setFilterCat('')} className="px-3 py-1.5 rounded-xl text-xs border border-border text-muted-foreground">
                      {t('✕ إلغاء الفلتر', '✕ Clear filter')}
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
                {t(`جودة كل وثيقة (${formatNumber(result.documentBreakdown.length)} وثيقة)`, `Quality by document (${formatNumber(result.documentBreakdown.length)} documents)`)}
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
                        <p className="text-sm font-medium text-foreground truncate" dir="auto">{doc.filename}</p>
                        <div className="flex items-center gap-3 mt-1">
                          <ScoreBar pct={doc.healthPercent} />
                          <span className="text-xs text-muted-foreground shrink-0">
                            {formatNumber(doc.clean)}/{formatNumber(doc.total)} {t('سليم', 'clean')}
                          </span>
                        </div>
                      </div>
                      {doc.blocked > 0 && (
                        <span className="text-xs font-bold text-red-600 bg-red-50 border border-red-100 rounded-lg px-2 py-0.5 shrink-0">
                          {formatNumber(doc.blocked)} {t('تالف', 'damaged')}
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
                            {deletingDoc === doc.documentId ? t('جارٍ الحذف…', 'Deleting…') : t(`حذف ${formatNumber(doc.blocked)} مقطع تالف`, `Delete ${formatNumber(doc.blocked)} damaged chunks`)}
                          </button>
                          <a
                            href={`/admin/knowledge-base`}
                            className="text-xs text-primary underline"
                          >
                            {t('← إعادة فهرسة الوثيقة', 'Reindex document →')}
                          </a>
                          {deleteMsg[doc.documentId] && (
                            <span dir="auto" className="text-xs text-green-700 font-medium">{deleteMsg[doc.documentId]}</span>
                          )}
                        </div>

                        {/* Blocked chunks for this doc */}
                        <div className="space-y-1.5 max-h-48 overflow-y-auto">
                          {result.blockedChunks.filter(c => c.documentId === doc.documentId).map(chunk => (
                            <div key={chunk.id} className={cn('rounded-lg border p-2.5 text-xs', CATEGORY_COLORS[chunk.category] ?? 'bg-muted border-border')}>
                              <div className="flex items-center gap-2 flex-wrap mb-1">
                                <span className="font-bold">{t(`مقطع #${formatNumber(chunk.chunkIndex)}`, `Chunk #${formatNumber(chunk.chunkIndex)}`)}</span>
                                <span className="opacity-70">{t(`درجة: ${formatNumber(chunk.score)}/100`, `Score: ${formatNumber(chunk.score)}/100`)}</span>
                                {chunk.reasons.map((r, i) => (
                                  <span key={i} dir="auto" className="bg-white/60 px-1.5 py-0.5 rounded border">{r}</span>
                                ))}
                              </div>
                              <p dir="auto" className="opacity-70 font-mono text-[10px] break-all line-clamp-2">{chunk.snippet}</p>
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
                  {t('المقاطع المحجوبة', 'Blocked chunks')} {filterCat ? `— ${categoryLabel(filterCat)}` : ''} ({formatNumber(filteredBlocked.length)})
                </h2>
                <div className="space-y-2 max-h-96 overflow-y-auto">
                  {filteredBlocked.map(chunk => (
                    <div key={chunk.id} className="border border-red-100 rounded-xl p-3 bg-red-50/30">
                      <div className="flex items-start gap-2 flex-wrap mb-1">
                        <span className={cn('text-[10px] font-bold border px-1.5 py-0.5 rounded-full', CATEGORY_COLORS[chunk.category] ?? 'bg-muted border-border')}>
                          {categoryLabel(chunk.category)}
                        </span>
                        <span className="text-xs text-muted-foreground" dir="auto">{chunk.filename}</span>
                        <span className="text-xs text-muted-foreground">{t(`مقطع #${formatNumber(chunk.chunkIndex)}`, `Chunk #${formatNumber(chunk.chunkIndex)}`)}</span>
                        <span className="text-xs font-bold text-red-600">{t(`درجة: ${formatNumber(chunk.score)}`, `Score: ${formatNumber(chunk.score)}`)}</span>
                      </div>
                      <div className="flex flex-wrap gap-1 mb-1.5">
                        {chunk.reasons.map((r, i) => (
                          <span key={i} dir="auto" className="text-[10px] bg-red-100 text-red-700 border border-red-200 px-1.5 py-0.5 rounded">{r}</span>
                        ))}
                      </div>
                      <p dir="auto" className="text-[10px] text-muted-foreground font-mono bg-muted/30 rounded-lg p-2 break-all line-clamp-3 border-r-2 border-red-300">
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
                <p className="font-bold text-green-800">{t('قاعدة المعرفة سليمة بالكامل ✓', 'Knowledge base is completely healthy ✓')}</p>
                <p className="text-sm text-green-700 mt-0.5">{t(`جميع المقاطع (${formatNumber(result.summary.total)}) اجتازت فحص الجودة`, `All ${formatNumber(result.summary.total)} chunks passed the quality scan`)}</p>
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
            <h2 className="text-lg font-bold text-primary">{t('تغطية أرقام الصفحات', 'Page-number coverage')}</h2>
          </div>
          <button
            onClick={loadPagesCoverage}
            disabled={coverageLoading}
            className="flex items-center gap-1.5 text-xs px-4 py-1.5 bg-primary/10 text-primary rounded-lg hover:bg-primary/20 disabled:opacity-60"
          >
            {coverageLoading
              ? <><Loader2 className="w-3 h-3 animate-spin" />{t('جارٍ التحميل…', 'Loading…')}</>
              : <><RefreshCw className="w-3 h-3" />{t('تحديث', 'Refresh')}</>}
          </button>
        </div>
        <p className="text-xs text-muted-foreground mb-4">
          {t('نسبة المقاطع التي تحمل أرقام صفحات من الـ PDF الأصلي — تعكس مدى اكتمال عملية استخراج الصفحات.', 'The share of chunks with page numbers from the original PDF, reflecting how complete page extraction is.')}
        </p>

        {pagesCoverage ? (
          <div className="space-y-4">
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              {[
                { label: t('إجمالي المقاطع', 'Total chunks'), value: formatNumber(pagesCoverage.totalChunks), color: 'text-foreground' },
                { label: t('تحمل أرقام صفحات', 'With page numbers'), value: formatNumber(pagesCoverage.withPages), color: 'text-green-700' },
                { label: t('بدون أرقام صفحات', 'Without page numbers'), value: formatNumber(pagesCoverage.withoutPages), color: 'text-amber-700' },
                { label: t('نسبة التغطية', 'Coverage'), value: `${formatNumber(pagesCoverage.coveragePercent)}%`, color: pagesCoverage.coveragePercent >= 80 ? 'text-green-700' : pagesCoverage.coveragePercent >= 40 ? 'text-amber-600' : 'text-red-600' },
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
                 <span>{t('نسبة تغطية أرقام الصفحات', 'Page-number coverage')}</span>
                 <span>{formatNumber(pagesCoverage.coveragePercent)}%</span>
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
                  {t('يمكنك تحسين التغطية بالنقر على زر ', 'You can improve coverage by clicking ')}<span className="font-semibold text-sky-700">{t('إعادة فهرسة أرقام الصفحات', 'Reindex page numbers')}</span>{t(' أعلاه.', ' above.')}
                </p>
              )}
            </div>
          </div>
        ) : (
          <p className="text-xs text-muted-foreground">{t('اضغط "تحديث" لعرض إحصاءات تغطية أرقام الصفحات.', 'Click “Refresh” to view page-number coverage statistics.')}</p>
        )}
      </div>

      {/* ── Citation metadata section ─────────────────────────────────────── */}
      <div className="mt-8 border-t border-border pt-8">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <BookMarked className="w-5 h-5 text-primary" />
            <h2 className="text-lg font-bold text-primary">{t('بيانات الاستشهاد القضائي', 'Judicial citation metadata')}</h2>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={sanitizeCitations}
              disabled={sanitizeLoading}
              className="flex items-center gap-1.5 text-xs px-4 py-1.5 bg-red-50 text-red-700 border border-red-200 rounded-lg hover:bg-red-100 disabled:opacity-60"
            >
              {sanitizeLoading
                ? <><Loader2 className="w-3 h-3 animate-spin" />{t('جارٍ الفحص…', 'Scanning…')}</>
                : <><ShieldCheck className="w-3 h-3" />{t('فحص وتنظيف البيانات الفاسدة', 'Scan and clean corrupt metadata')}</>}
            </button>
            <a
              href={`${BASE}/api/admin/knowledge/citation-export.csv`}
              download="citation-export.csv"
              className="flex items-center gap-1.5 text-xs px-4 py-1.5 bg-emerald-600 text-white rounded-lg hover:bg-emerald-700 font-semibold"
            >
              <Download className="w-3 h-3" />
              {t('تصدير CSV', 'Export CSV')}
            </a>
            <button
              onClick={loadCitStats}
              disabled={citLoading}
              className="flex items-center gap-1.5 text-xs px-4 py-1.5 bg-primary/10 text-primary rounded-lg hover:bg-primary/20 disabled:opacity-60"
            >
              {citLoading ? <><Loader2 className="w-3 h-3 animate-spin" />{t('جارٍ التحميل…', 'Loading…')}</> : <><RefreshCw className="w-3 h-3" />{t('فحص بيانات الاستشهاد', 'Check citation metadata')}</>}
            </button>
          </div>
        </div>
        <p className="text-xs text-muted-foreground mb-4">
          {t('يتحقق من اكتمال بيانات الاستشهاد (رقم القضية، المحكمة، التاريخ) للوثائق القضائية، ويتيح مراجعتها وتصحيحها يدوياً أو إعادة استخراجها.', 'Checks judicial documents for complete citation metadata (case number, court, date), and lets you review, correct, or re-extract it.')}
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
                <p dir="auto" className={cn('text-sm font-semibold', sanitizeResult.corrected > 0 ? 'text-amber-900' : 'text-green-900')}>
                {sanitizeResult.corrected > 0
                  ? t('اكتمل الفحص وتنظيف البيانات الفاسدة', 'Scan complete and corrupt metadata cleaned')
                  : t('اكتمل الفحص ولم يُعثر على بيانات فاسدة', 'Scan complete; no corrupt metadata found')}
              </p>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="bg-white rounded-lg border border-border p-3 text-center">
                <p className="text-2xl font-black text-foreground">{formatNumber(sanitizeResult.scanned)}</p>
                <p className="text-xs text-muted-foreground mt-0.5">{t('سجلات مفحوصة', 'Records checked')}</p>
              </div>
              <div className="bg-white rounded-lg border border-border p-3 text-center">
                <p className={cn('text-2xl font-black', sanitizeResult.corrected > 0 ? 'text-amber-700' : 'text-green-700')}>
                  {formatNumber(sanitizeResult.corrected)}
                </p>
                <p className="text-xs text-muted-foreground mt-0.5">{t('سجلات مُصحَّحة', 'Records corrected')}</p>
              </div>
            </div>
            {sanitizeResult.corrections.length > 0 && (
              <div className="space-y-1.5 max-h-48 overflow-y-auto">
                <p className="text-xs font-semibold text-amber-800">{t('الحقول التي أُزيلت:', 'Fields removed:')}</p>
                {sanitizeResult.corrections.map(c => (
                  <div key={c.id} className="flex items-start gap-2 text-xs bg-white rounded-lg border border-amber-100 px-3 py-2">
                    <FileWarning className="w-3 h-3 text-amber-500 mt-0.5 shrink-0" />
                    <span className="font-medium text-foreground truncate flex-1" dir="auto">{c.filename}</span>
                    <span className="text-amber-700 shrink-0" dir="auto">{c.nulledFields.join(lang === 'ar' ? '، ' : ', ')}</span>
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
                { label: t('إجمالي الوثائق', 'Total documents'), value: formatNumber(citStats.total), color: 'text-foreground' },
                { label: t('وثائق قضائية', 'Judicial documents'), value: formatNumber(citStats.judicial), color: 'text-primary' },
                { label: t('مكتملة البيانات', 'Metadata complete'), value: formatNumber(citStats.withMetadata), color: 'text-green-700' },
                { label: t('غير مستخرجة', 'Not extracted'), value: formatNumber(citStats.withoutMetadata), color: 'text-amber-700' },
                { label: t('تحتاج مراجعة', 'Needs review'), value: formatNumber(citStats.needsReview ?? 0), color: 'text-red-600' },
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
                      {t('⚠️ نسبة الاستشهادات المشبوهة أو المرفوضة', '⚠️ Suspicious or rejected citations')}
                    </span>
                    <span className="font-bold text-amber-700">{formatNumber(rejPct)}% ({formatNumber(citStats.needsReview ?? 0)} / {formatNumber(citStats.withMetadata)})</span>
                  </div>
                  <div className="w-full h-2 bg-amber-100 rounded-full overflow-hidden">
                    <div
                      className={cn('h-full rounded-full transition-all', rejPct >= 30 ? 'bg-red-500' : rejPct >= 10 ? 'bg-amber-500' : 'bg-yellow-400')}
                      style={{ width: `${rejPct}%` }}
                    />
                  </div>
                  <p className="text-[11px] text-amber-700">
                    {t('هذه الوثائق تحمل بيانات استشهاد ناقصة أو مشبوهة — يُنصح بمراجعتها يدوياً أو إعادة استخراجها.', 'These documents have incomplete or suspicious citation metadata; manual review or re-extraction is recommended.')}
                  </p>
                </div>
              );
            })()}

            {/* Progress bar */}
            {citStats.judicial > 0 && (
              <div className="space-y-1">
                <div className="flex justify-between text-xs text-muted-foreground">
                  <span>{t('نسبة اكتمال الاستشهاد', 'Citation completion')}</span>
                  <span>{formatNumber(Math.round(citStats.withMetadata / citStats.judicial * 100))}%</span>
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
                  { key: 'all',         label: t('الكل', 'All'),                    count: citStats.judicial },
                  { key: 'extracted',   label: t('مستخرجة', 'Extracted'),           count: citStats.withMetadata },
                  { key: 'unextracted', label: t('غير مستخرجة', 'Not extracted'),   count: citStats.withoutMetadata },
                  { key: 'review',      label: t('تحتاج مراجعة', 'Needs review'),   count: citStats.needsReview ?? 0 },
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
                    )}>{formatNumber(tab.count)}</span>
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
                      {t(`الوثائق القضائية (${formatNumber(filtered.length)})`, `Judicial documents (${formatNumber(filtered.length)})`)}
                    </h3>
                    {filtered.length === 0 && (
                      <p className="text-xs text-muted-foreground text-center py-4">{t('لا توجد وثائق في هذا التصنيف', 'No documents in this category')}</p>
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
                              <p className="text-xs font-medium text-foreground truncate" dir="auto">{doc.filename}</p>
                              {doc.hasCaseMetadata ? (
                                <p className="text-xs text-muted-foreground mt-0.5">
                                  <span dir="auto">{[doc.court, doc.caseNumber || doc.rulingNumber, doc.hijriDate && `${doc.hijriDate}${t('هـ', ' AH')}`].filter(Boolean).join(' · ')}</span>
                                  {doc.needsReview && <span className="text-red-600 font-medium mr-2">{t('— بيانات منقوصة', '— Incomplete metadata')}</span>}
                                </p>
                              ) : (
                                <p className="text-xs text-amber-700 mt-0.5">{t('لم تُستخرج بيانات الاستشهاد بعد', 'Citation metadata has not been extracted yet')}</p>
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
                                  {extractingMeta === doc.id ? <Loader2 className="w-3 h-3 animate-spin" /> : t('استخراج', 'Extract')}
                                </button>
                              )}
                              {doc.hasCaseMetadata && (
                                <>
                                  <button
                                    onClick={() => editingCit === doc.id ? setEditingCit(null) : startEditCit(doc)}
                                    className="p-1.5 rounded-lg border border-border hover:bg-muted/60 text-muted-foreground hover:text-foreground"
                                     title={t('تعديل يدوي', 'Edit manually')}
                                  >
                                    {editingCit === doc.id ? <X className="w-3.5 h-3.5" /> : <Pencil className="w-3.5 h-3.5" />}
                                  </button>
                                  <button
                                    onClick={() => extractMeta(doc.id, doc.filename)}
                                    disabled={extractingMeta === doc.id}
                                    className="p-1.5 rounded-lg border border-border hover:bg-muted/60 text-muted-foreground hover:text-foreground disabled:opacity-50"
                                     title={t('إعادة الاستخراج', 'Re-extract')}
                                  >
                                    {extractingMeta === doc.id ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <RefreshCw className="w-3.5 h-3.5" />}
                                  </button>
                                  <button
                                    onClick={() => deleteCitMeta(doc.id, doc.filename)}
                                    disabled={deletingCit === doc.id}
                                    className="p-1.5 rounded-lg border border-red-200 hover:bg-red-50 text-red-500 hover:text-red-700 disabled:opacity-50"
                                     title={t('حذف البيانات', 'Delete metadata')}
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
                              <span dir="auto" className="text-xs text-green-700 font-medium">{metaMsgs[doc.id]}</span>
                            </div>
                          )}

                          {/* Inline edit form */}
                          {editingCit === doc.id && (
                            <div className="border-t border-border bg-muted/20 px-4 py-3 space-y-3">
                              <p className="text-xs font-bold text-foreground mb-2">{t('تعديل بيانات الاستشهاد', 'Edit citation metadata')}</p>
                              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                                {([
                                  { key: 'caseNumber',      label: t('رقم القضية', 'Case number') },
                                  { key: 'rulingNumber',    label: t('رقم الحكم', 'Ruling number') },
                                  { key: 'court',           label: t('المحكمة / الدائرة', 'Court / circuit') },
                                  { key: 'hijriDate',       label: t('التاريخ الهجري', 'Hijri date') },
                                  { key: 'gregorianDate',   label: t('التاريخ الميلادي', 'Gregorian date') },
                                  { key: 'litigationStage', label: t('مرحلة التقاضي', 'Litigation stage') },
                                  { key: 'disputeSubject',  label: t('موضوع النزاع', 'Dispute subject') },
                                  { key: 'deedNumber',      label: t('رقم الصك / السند', 'Deed / instrument number') },
                                ] as const).map(({ key, label }) => (
                                  <div key={key}>
                                    <label className="text-[10px] text-muted-foreground font-medium block mb-1">{label}</label>
                                    <input
                                      type="text"
                                      value={editDraft[key] ?? ''}
                                      onChange={e => setEditDraft(prev => ({ ...prev, [key]: e.target.value }))}
                                      dir="auto"
                                      className="w-full text-xs border border-border rounded-lg px-2.5 py-1.5 bg-background focus:outline-none focus:ring-1 focus:ring-primary"
                                      placeholder={t(`أدخل ${label}…`, `Enter ${label}…`)}
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
                                  {savingCit === doc.id ? <><Loader2 className="w-3 h-3 animate-spin" />{t('جارٍ الحفظ…', 'Saving…')}</> : <><Save className="w-3 h-3" />{t('حفظ التعديلات', 'Save changes')}</>}
                                </button>
                                <button
                                  onClick={() => setEditingCit(null)}
                                  className="text-xs px-3 py-1.5 border border-border rounded-lg hover:bg-muted/60 text-muted-foreground"
                                >
                                  {t('إلغاء', 'Cancel')}
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
                 {t('لا توجد وثائق قضائية في قاعدة المعرفة بعد.', 'There are no judicial documents in the knowledge base yet.')}
              </p>
            )}
          </div>
        )}
      </div>
      </div>
    </AdminSidebar>
  );
}
