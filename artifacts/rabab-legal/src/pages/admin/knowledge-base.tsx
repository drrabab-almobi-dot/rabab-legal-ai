import React, { useState, useRef, useCallback } from 'react';
import { AdminSidebar } from '@/components/layout';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui';
import { useMetaJobSync } from '@/hooks/useMetaJobSync';
import { useLang } from '@/hooks/use-language';

const BASE = import.meta.env.BASE_URL.replace(/\/$/, '');

type DocStatus = 'pending' | 'indexing' | 'indexed' | 'error';

interface KnowledgeDoc {
  id: number;
  filename: string;
  mimeType: string;
  sourceUrl?: string | null;
  status: DocStatus;
  errorMessage?: string | null;
  totalChunks: number;
  createdAt: string;
  category?: string | null;
  hasMeta?: unknown | null;
  lastCleanedAt?: string | null;
  cleanCount?: number | null;
}

const STATUS_LABELS: Record<DocStatus, { ar: string; en: string; color: string }> = {
  pending:  { ar: 'في الانتظار', en: 'Pending', color: 'bg-yellow-100 text-yellow-800' },
  indexing: { ar: 'جارٍ الفهرسة...', en: 'Indexing...', color: 'bg-blue-100 text-blue-700 animate-pulse' },
  indexed:  { ar: 'مُفهرَس ✓', en: 'Indexed ✓', color: 'bg-green-100 text-green-800' },
  error:    { ar: 'خطأ', en: 'Error', color: 'bg-red-100 text-red-700' },
};

function StatusBadge({ status }: { status: DocStatus }) {
  const { t } = useLang();
  const { ar, en, color } = STATUS_LABELS[status] ?? STATUS_LABELS.error;
  return (
    <span className={`inline-block px-2 py-0.5 rounded text-xs font-medium ${color}`}>
       {t(ar, en)}
    </span>
  );
}

/** Returns true when the error message indicates the document is a scanned-image PDF */
function isScannedPdfError(errorMessage?: string | null): boolean {
  return !!errorMessage?.includes('مسحوح ضوئياً');
}

function DocIcon({ mimeType, sourceUrl, errorMessage }: { mimeType: string; sourceUrl?: string | null; errorMessage?: string | null }) {
  const { t } = useLang();
  if (sourceUrl) return <span className="text-2xl shrink-0">🌐</span>;
  if (isScannedPdfError(errorMessage)) return <span className="text-2xl shrink-0" title={t('ملف ممسوح ضوئياً', 'Scanned PDF')}>📷</span>;
  if (mimeType === 'application/pdf') return <span className="text-2xl shrink-0">📄</span>;
  if (mimeType?.includes('word')) return <span className="text-2xl shrink-0">📝</span>;
  return <span className="text-2xl shrink-0">📃</span>;
}

type Tab = 'zip' | 'file' | 'url';

interface BulkStatus {
  total: number;
  done: number;
  failed: number;
  running: boolean;
  log: string[];
}

export default function KnowledgeBase() {
  const { lang, t } = useLang();
  const [docs, setDocs] = useState<KnowledgeDoc[]>([]);
  const [loading, setLoading] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [progress, setProgress] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const [tab, setTab] = useState<Tab>('zip');
  const [urlInput, setUrlInput] = useState('');
  const [titleInput, setTitleInput] = useState('');
  const [categoryInput, setCategoryInput] = useState<string>('general');
  const [bulkStatus, setBulkStatus] = useState<BulkStatus | null>(null);
  const [activeJobId, setActiveJobId] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const zipInputRef = useRef<HTMLInputElement>(null);
  const pollingRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const bulkPollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // MOJ Crawl state
  const [mojCrawling, setMojCrawling] = useState(false);
  const [mojLog, setMojLog] = useState<string[]>([]);
  const [mojLastCrawl, setMojLastCrawl] = useState<string | null>(null);
  const [mojTotalIndexed, setMojTotalIndexed] = useState(0);
  const mojPollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Per-doc citation extraction state
  const [extractingDocIds, setExtractingDocIds] = useState<Set<number>>(new Set());

  const extractDocMeta = async (id: number) => {
    setExtractingDocIds(prev => new Set(prev).add(id));
    try {
      const r = await fetch(`${BASE}/api/admin/knowledge/extract-metadata/${id}`, {
        method: 'POST', credentials: 'include',
      });
      const data = await r.json();
      if (!r.ok) throw new Error(data.error ?? t('فشل الاستخراج', 'Extraction failed'));
      // Refresh docs list and citation stats
      // eslint-disable-next-line @typescript-eslint/no-use-before-define
      await fetchDocs();
      // eslint-disable-next-line @typescript-eslint/no-use-before-define
      loadCitStats();
    } catch (e: any) {
      setError(e.message);
    } finally {
      setExtractingDocIds(prev => { const s = new Set(prev); s.delete(id); return s; });
    }
  };

  // Citation extraction state
  const [citWithoutMeta, setCitWithoutMeta] = useState<number | null>(null);
  const [metaAllLoading, setMetaAllLoading] = useState(false);

  const loadCitStats = useCallback(async () => {
    try {
      const r = await fetch(`${BASE}/api/admin/knowledge/citation-stats`, { credentials: 'include' });
      if (!r.ok) return;
      const data = await r.json();
      if (typeof data.withoutMetadata === 'number') setCitWithoutMeta(data.withoutMetadata);
    } catch { /* silent */ }
  }, []);

  // Synced across all open admin tabs via BroadcastChannel + localStorage
  const { metaJob, announceJob: announceMetaJob } = useMetaJobSync(loadCitStats);

  const startExtractAllMeta = async (force = false) => {
    const confirmMsg = force
      ? t('وضع إعادة الاستخراج الكاملة: سيتم إعادة معالجة جميع الوثائق القضائية بغض النظر عن بياناتها الحالية. قد تستغرق العملية وقتاً أطول. متابعة؟', 'Full re-extraction will reprocess every judicial document regardless of current metadata. This may take longer. Continue?')
      : t('سيتم استخراج بيانات الاستشهاد بالذكاء الاصطناعي لجميع الوثائق القضائية التي لا تحمل بيانات بعد. قد تستغرق العملية عدة دقائق. متابعة؟', 'AI will extract citation metadata for judicial documents that do not have it yet. This may take several minutes. Continue?');
    if (!confirm(confirmMsg)) return;
    setMetaAllLoading(true);
    try {
      const r = await fetch(`${BASE}/api/admin/knowledge/extract-all-metadata`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ force }),
      });
      const data = await r.json();
      if (data.jobId) {
        announceMetaJob(data.jobId, { total: data.total, done: 0, failed: 0, running: true, log: [], extracted: 0 });
      } else {
         alert(data.message ?? t('تمت العملية', 'Operation completed'));
        loadCitStats();
      }
    } catch (e: any) {
      setError(e.message);
    } finally {
      setMetaAllLoading(false);
    }
  };

  const fetchDocs = useCallback(async () => {
    try {
      const r = await fetch(`${BASE}/api/admin/knowledge/documents`, { credentials: 'include' });
      if (!r.ok) throw new Error(await r.text());
      const data: KnowledgeDoc[] = await r.json();
      setDocs(data);
      const anyIndexing = data.some((d) => d.status === 'pending' || d.status === 'indexing');
      if (!anyIndexing && pollingRef.current) {
        clearInterval(pollingRef.current);
        pollingRef.current = null;
      }
    } catch (e: any) {
      setError(e.message);
    }
  }, []);

  const stopMojPoll = React.useCallback(() => {
    if (mojPollRef.current) { clearInterval(mojPollRef.current); mojPollRef.current = null; }
  }, []);

  const pollMojStatus = React.useCallback(async () => {
    try {
      const r = await fetch(`${BASE}/api/admin/knowledge/crawl-moj/status`, { credentials: 'include' });
      if (!r.ok) { stopMojPoll(); return; }
      const data = await r.json();
      if (data.job?.log) setMojLog(data.job.log);
      if (data.state?.lastCrawlAt) setMojLastCrawl(data.state.lastCrawlAt);
      if (typeof data.state?.totalIndexed === 'number') setMojTotalIndexed(data.state.totalIndexed);
      if (!data.job?.running) { setMojCrawling(false); stopMojPoll(); fetchDocs(); }
    } catch { stopMojPoll(); }
  }, [stopMojPoll, fetchDocs]);

  const startMojCrawl = async () => {
    if (mojCrawling) return;
    setMojCrawling(true);
    setMojLog([]);
    try {
      const r = await fetch(`${BASE}/api/admin/knowledge/crawl-moj`, { method: 'POST', credentials: 'include' });
      if (!r.ok) { const d = await r.json().catch(() => ({})); setError(d.error ?? t('فشل الزحف', 'Crawl failed')); setMojCrawling(false); return; }
      stopMojPoll();
      mojPollRef.current = setInterval(pollMojStatus, 2500);
    } catch (e: any) { setError(e.message); setMojCrawling(false); }
  };

  // Fetch initial MOJ state
  React.useEffect(() => {
    fetch(`${BASE}/api/admin/knowledge/crawl-moj/status`, { credentials: 'include' })
      .then(r => r.ok ? r.json() : null)
      .then(d => {
        if (!d) return;
        if (d.state?.lastCrawlAt) setMojLastCrawl(d.state.lastCrawlAt);
        if (typeof d.state?.totalIndexed === 'number') setMojTotalIndexed(d.state.totalIndexed);
        if (d.job?.running) { setMojCrawling(true); mojPollRef.current = setInterval(pollMojStatus, 2500); }
      }).catch(() => {});
    return () => stopMojPoll();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  React.useEffect(() => {
    setLoading(true);
    fetchDocs().finally(() => setLoading(false));
    loadCitStats();
    return () => {
      if (pollingRef.current) clearInterval(pollingRef.current);
      if (bulkPollRef.current) clearInterval(bulkPollRef.current);
      // eslint-disable-next-line @typescript-eslint/no-use-before-define
      if (reindexAllPollRef.current) clearInterval(reindexAllPollRef.current);
    };
  }, [fetchDocs, loadCitStats]);

  const startPolling = useCallback(() => {
    if (pollingRef.current) return;
    pollingRef.current = setInterval(fetchDocs, 3000);
  }, [fetchDocs]);

  const stopBulkPoll = useCallback(() => {
    if (bulkPollRef.current) { clearInterval(bulkPollRef.current); bulkPollRef.current = null; }
  }, []);

  const startBulkPoll = useCallback((jobId: string) => {
    stopBulkPoll();
    bulkPollRef.current = setInterval(async () => {
      try {
        const r = await fetch(`${BASE}/api/admin/knowledge/zip-status/${jobId}`, { credentials: 'include' });
        if (!r.ok) { stopBulkPoll(); return; }
        const st: BulkStatus = await r.json();
        setBulkStatus(st);
        fetchDocs(); // refresh doc list too
        if (!st.running) stopBulkPoll();
      } catch { stopBulkPoll(); }
    }, 2000);
  }, [stopBulkPoll, fetchDocs]);

  // ── ZIP bulk upload ──────────────────────────────────────────────────────────
  const uploadZip = async (file: File) => {
    if (!file.name.match(/\.zip$/i)) { setError(t('يجب أن يكون الملف بصيغة ZIP', 'The file must be a ZIP archive')); return; }
    setUploading(true);
    setError(null);
    setBulkStatus(null);
     setProgress(`${t('جارٍ رفع', 'Uploading')} ${file.name} (${(file.size / 1024 / 1024).toFixed(1)} MB)...`);
    try {
      const form = new FormData();
      form.append('file', file);
      form.append('category', categoryInput);
      const r = await fetch(`${BASE}/api/admin/knowledge/zip-upload`, {
        method: 'POST', credentials: 'include', body: form,
      });
      const data = await r.json();
      if (!r.ok) throw new Error(data.error ?? t('فشل الرفع', 'Upload failed'));
      setProgress(null);
      setActiveJobId(data.jobId);
      setBulkStatus({ total: data.total, done: 0, failed: 0, running: true, log: [] });
      startBulkPoll(data.jobId);
      startPolling();
    } catch (e: any) {
      setError(e.message);
      setProgress(null);
    } finally {
      setUploading(false);
    }
  };

  // ── URL ingestion ────────────────────────────────────────────────────────────
  const addUrl = async () => {
    const url = urlInput.trim();
    if (!url) { setError(t('أدخل رابطاً صالحاً', 'Enter a valid URL')); return; }
    if (!/^https?:\/\/.+/.test(url)) { setError(t('الرابط يجب أن يبدأ بـ https:// أو http://', 'The URL must start with https:// or http://')); return; }
    setUploading(true);
     setProgress(`${t('جارٍ جلب المحتوى من:', 'Fetching content from:')} ${url}`);
    setError(null);
    try {
      const r = await fetch(`${BASE}/api/admin/knowledge/url`, {
        method: 'POST', credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url, title: titleInput.trim() || undefined, category: categoryInput }),
      });
      const data = await r.json();
      if (!r.ok) throw new Error(data.error ?? t('فشل جلب الرابط', 'Failed to fetch URL'));
     setProgress(t('تم الجلب والفهرسة بنجاح ✓', 'Fetched and indexed successfully ✓'));
      setUrlInput(''); setTitleInput('');
      await fetchDocs(); startPolling();
    } catch (e: any) {
      setError(e.message);
    } finally {
      setUploading(false);
      setTimeout(() => setProgress(null), 5000);
    }
  };

  // ── Single file upload ───────────────────────────────────────────────────────
  const uploadFile = useCallback(async (file: File) => {
    const allowed = ['application/pdf', 'text/plain', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'];
    if (!allowed.includes(file.type) && !file.name.match(/\.(txt|pdf|docx)$/i)) {
       setError(t('يُسمح فقط بملفات PDF أو TXT أو DOCX', 'Only PDF, TXT, or DOCX files are allowed'));
      return;
    }
    setUploading(true);
     setProgress(`${t('جارٍ رفع:', 'Uploading:')} ${file.name}...`);
    setError(null);
    try {
      const form = new FormData();
      form.append('file', file);
      form.append('category', categoryInput);
      const r = await fetch(`${BASE}/api/admin/knowledge/upload`, {
        method: 'POST', credentials: 'include', body: form,
      });
      const data = await r.json();
      if (!r.ok) throw new Error(data.error ?? t('فشل الرفع', 'Upload failed'));
     setProgress(t('تم الرفع والفهرسة بنجاح ✓', 'Uploaded and indexed successfully ✓'));
      await fetchDocs(); startPolling();
    } catch (e: any) {
      setError(e.message);
    } finally {
      setUploading(false);
      setTimeout(() => setProgress(null), 5000);
    }
  }, [fetchDocs, startPolling, t]);

  const handleFiles = (files: FileList | null) => {
    if (!files) return;
    Array.from(files).forEach(uploadFile);
  };

  const deleteDoc = async (id: number) => {
    if (!confirm(t('هل أنت متأكد من حذف هذا المصدر وجميع أجزائه؟', 'Are you sure you want to delete this source and all its chunks?'))) return;
    try {
      const r = await fetch(`${BASE}/api/admin/knowledge/documents/${id}`, {
        method: 'DELETE', credentials: 'include',
      });
      if (!r.ok) throw new Error(t('فشل الحذف', 'Delete failed'));
      await fetchDocs();
    } catch (e: any) {
      setError(e.message);
    }
  };

  const reindexDoc = async (id: number) => {
    try {
      const r = await fetch(`${BASE}/api/admin/knowledge/reindex/${id}`, {
        method: 'POST', credentials: 'include',
      });
      if (!r.ok) throw new Error(t('فشل إعادة الفهرسة', 'Reindex failed'));
      await fetchDocs(); startPolling();
    } catch (e: any) {
      setError(e.message);
    }
  };

  const indexedCount = docs.filter((d) => d.status === 'indexed').length;
  const totalChunks  = docs.filter((d) => d.status === 'indexed').reduce((s, d) => s + d.totalChunks, 0);
  const pendingCount = docs.filter((d) => d.status === 'pending' || d.status === 'indexing').length;
  const generalCount = docs.filter((d) => d.status === 'indexed' && (d as any).category === 'general').length;

  const [reindexingAll, setReindexingAll] = React.useState(false);
  const [reindexAllMsg, setReindexAllMsg] = React.useState<string | null>(null);
  const [reindexAllJob, setReindexAllJob] = React.useState<BulkStatus | null>(null);
  const reindexAllPollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const stopReindexAllPoll = useCallback(() => {
    if (reindexAllPollRef.current) { clearInterval(reindexAllPollRef.current); reindexAllPollRef.current = null; }
  }, []);

  const startReindexAllPoll = useCallback((jobId: string) => {
    stopReindexAllPoll();
    reindexAllPollRef.current = setInterval(async () => {
      try {
        const r = await fetch(`${BASE}/api/admin/knowledge/reindex-status/${jobId}`, { credentials: 'include' });
        if (!r.ok) { stopReindexAllPoll(); return; }
        const st: BulkStatus = await r.json();
        setReindexAllJob(st);
        fetchDocs();
        if (!st.running) {
          stopReindexAllPoll();
          setReindexingAll(false);
          setReindexAllMsg(`${t('اكتملت إعادة الفهرسة:', 'Reindex complete:')} ${t('نجح', 'succeeded')} ${st.done}، ${t('فشل', 'failed')} ${st.failed}`);
        }
      } catch { stopReindexAllPoll(); setReindexingAll(false); }
    }, 3000);
  }, [stopReindexAllPoll, fetchDocs, t]);

  const reindexAll = async () => {
    if (!confirm(t('سيُعاد بناء قاعدة المعرفة بالكامل من الملفات الأصلية. قد يستغرق ذلك عدة دقائق. هل تريد المتابعة؟', 'The entire knowledge base will be rebuilt from the original files. This may take several minutes. Continue?'))) return;
    setReindexingAll(true);
    setReindexAllMsg(null);
    setReindexAllJob(null);
    try {
      const r = await fetch(`${BASE}/api/admin/knowledge/reindex-all`, {
        method: 'POST', credentials: 'include',
      });
      const data = await r.json();
      if (!r.ok) throw new Error(data.error ?? t('فشل إعادة الفهرسة', 'Reindex failed'));
      if (data.jobId) {
        setReindexAllJob({ total: data.total, done: 0, failed: 0, running: true, log: [] });
        startReindexAllPoll(data.jobId);
      } else {
        // Immediate completion (0 indexable docs)
        setReindexAllMsg(data.message ?? t('تم', 'Done'));
        setReindexingAll(false);
      }
    } catch (e: any) {
      setReindexAllMsg(e.message);
      setReindexingAll(false);
    }
  };

  const [reclassifying, setReclassifying] = React.useState(false);
  const [reclassifyMsg, setReclassifyMsg] = React.useState<string | null>(null);

  const reclassifyAll = async () => {
    setReclassifying(true);
    setReclassifyMsg(null);
    try {
      const r = await fetch(`${BASE}/api/admin/knowledge/reclassify-all`, {
        method: 'POST', credentials: 'include',
      });
      const data = await r.json();
      setReclassifyMsg(data.message ?? t('تم', 'Done'));
      fetchDocs();
    } catch (e: any) {
      setReclassifyMsg(e.message);
    } finally {
      setReclassifying(false);
    }
  };

  const bulkPercent = bulkStatus && bulkStatus.total > 0
    ? Math.round(((bulkStatus.done + bulkStatus.failed) / bulkStatus.total) * 100) : 0;

  return (
    <AdminSidebar>
      <div dir={lang === 'ar' ? 'rtl' : 'ltr'}>
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-primary">{t('قاعدة المعرفة القانونية', 'Legal knowledge base')}</h1>
        <p className="text-muted-foreground mt-1">
          {t('ارفعي الملفات القانونية والأرشيفات الموثقة ليستخدمها المساعد مرجعاً في كل إجابة', 'Upload verified legal files and archives for the assistant to use as references in every answer')}
        </p>
        <a
          href="https://smart-legal-researcher.s3t3-9306.chatgpt.site/"
          target="_blank"
          rel="noopener noreferrer"
          className="mt-3 inline-flex items-center gap-2 rounded-lg border border-primary/30 bg-primary/5 px-3 py-2 text-sm font-semibold text-primary hover:bg-primary/10"
        >
          {t('فتح الباحثة الذكية للأرشيف والبحث القانوني', 'Open the smart legal researcher archive')}
          <span aria-hidden="true">↗</span>
        </a>
      </div>

      {/* Reclassify banner */}
      {generalCount > 0 && (
        <div className="mb-4 p-4 bg-amber-50 border border-amber-200 rounded-xl flex items-center justify-between gap-4">
          <div>
            <p className="font-semibold text-amber-800 text-sm">⚠️ {generalCount} {t('وثيقة بدون تصنيف محدد', 'documents without a specific category')}</p>
            <p className="text-xs text-amber-700 mt-0.5">{t('يمكن إعادة تصنيفها تلقائياً بالذكاء الاصطناعي لتحسين نتائج البحث', 'They can be automatically categorized with AI to improve search results')}</p>
          </div>
          <button
            onClick={reclassifyAll}
            disabled={reclassifying}
            className="shrink-0 px-4 py-2 bg-amber-600 text-white rounded-lg text-sm font-bold hover:bg-amber-700 disabled:opacity-60 flex items-center gap-2"
          >
            {reclassifying ? `⏳ ${t('جارٍ...', 'Working...')}` : `🤖 ${t('صنّف الآن', 'Categorize now')}`}
          </button>
        </div>
      )}
      {reclassifyMsg && (
        <div className="mb-4 p-3 bg-green-50 border border-green-200 rounded-xl text-sm text-green-800 font-medium">
          ✅ {reclassifyMsg}
        </div>
      )}

      {/* Re-index all banner */}
      <div className="mb-4 p-4 bg-blue-50 border border-blue-200 rounded-xl">
        <div className="flex items-center justify-between gap-4">
          <div>
            <p className="font-semibold text-blue-800 text-sm">🔄 {t('إعادة فهرسة قاعدة المعرفة بالكامل', 'Reindex the entire knowledge base')}</p>
            <p className="text-xs text-blue-700 mt-0.5">{t('يُعيد بناء الـ chunks من الملفات الأصلية — يُطبّق فلتر صفحات الفهرس على الوثائق القديمة', 'Rebuilds chunks from original files and applies the table-of-contents filter to older documents')}</p>
          </div>
          <button
            onClick={reindexAll}
            disabled={reindexingAll}
            className="shrink-0 px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-bold hover:bg-blue-700 disabled:opacity-60 flex items-center gap-2"
          >
            {reindexingAll ? `⏳ ${t('جارٍ...', 'Working...')}` : `🔄 ${t('إعادة فهرسة الكل', 'Reindex all')}`}
          </button>
        </div>

        {/* Live progress */}
        {reindexAllJob && (
          <div className="mt-3">
            {reindexAllJob.total > 0 && (
              <>
                <div className="flex justify-between text-xs text-blue-700 mb-1">
                   <span>{reindexAllJob.done + reindexAllJob.failed} / {reindexAllJob.total} {t('وثيقة', 'documents')}</span>
                  <span>{Math.round(((reindexAllJob.done + reindexAllJob.failed) / reindexAllJob.total) * 100)}%</span>
                </div>
                <div className="w-full bg-blue-200 rounded-full h-2 mb-2">
                  <div
                    className="bg-blue-600 h-2 rounded-full transition-all duration-500"
                    style={{ width: `${Math.round(((reindexAllJob.done + reindexAllJob.failed) / reindexAllJob.total) * 100)}%` }}
                  />
                </div>
              </>
            )}
            {reindexAllJob.log.length > 0 && (
              <div className="bg-blue-100 rounded-lg p-2 max-h-28 overflow-y-auto text-xs text-blue-900 font-mono space-y-0.5" dir="auto">
                {reindexAllJob.log.slice(-10).map((line, i) => (
                  <div key={i}>{line}</div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
      {reindexAllMsg && (
        <div className="mb-4 p-3 bg-blue-50 border border-blue-200 rounded-xl text-sm text-blue-800 font-medium">
          ✅ {reindexAllMsg}
        </div>
      )}

      {/* Stats */}
      <div className="grid grid-cols-1 gap-4 mb-6 sm:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardContent className="p-4 text-center">
            <p className="text-3xl font-bold text-foreground">{docs.length}</p>
            <p className="text-sm text-muted-foreground">{t('إجمالي المصادر', 'Total sources')}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 text-center">
            <p className="text-3xl font-bold text-green-600">{indexedCount}</p>
            <p className="text-sm text-muted-foreground">{t('مُفهرَس ونشط', 'Indexed and active')}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 text-center">
            <p className="text-3xl font-bold text-blue-600">{totalChunks}</p>
            <p className="text-sm text-muted-foreground">{t('أجزاء مُضمَّنة', 'Embedded chunks')}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 text-center">
            <p className={`text-3xl font-bold ${pendingCount > 0 ? 'text-yellow-600 animate-pulse' : 'text-muted-foreground'}`}>
              {pendingCount}
            </p>
            <p className="text-sm text-muted-foreground">{t('قيد الفهرسة', 'Being indexed')}</p>
          </CardContent>
        </Card>
      </div>

      {/* MOJ Circular Crawler Card */}
      <Card className="mb-6 border-amber-200 bg-amber-50/40">
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between flex-wrap gap-2">
            <div>
              <CardTitle className="text-base flex items-center gap-2">
                🏛️ {t('مزامنة تعاميم وزارة العدل', 'Ministry of Justice circular sync')}
              </CardTitle>
              <p className="text-xs text-muted-foreground mt-1">
                 {t('يبحث تلقائياً في moj.gov.sa ويُفهرس التعاميم الجديدة مباشرة', 'Automatically searches moj.gov.sa and indexes new circulars')}
              </p>
            </div>
            <button
              onClick={startMojCrawl}
              disabled={mojCrawling}
              className="flex items-center gap-2 px-4 py-2 bg-amber-600 text-white rounded-xl text-sm font-bold hover:bg-amber-700 disabled:opacity-60 transition-colors"
            >
              {mojCrawling
                 ? <><span className="animate-spin">⏳</span> {t('جارٍ الزحف...', 'Crawling...')}</>
                 : `🔍 ${t('ابدأ المزامنة', 'Start sync')}`}
            </button>
          </div>
          {(mojLastCrawl || mojTotalIndexed > 0) && (
            <div className="flex gap-4 text-xs text-muted-foreground mt-2">
               {mojLastCrawl && <span>{t('آخر مزامنة:', 'Last sync:')} {new Date(mojLastCrawl).toLocaleString(lang === 'ar' ? 'ar-SA' : 'en-US')}</span>}
               {mojTotalIndexed > 0 && <span>{t('إجمالي المُفهرَس:', 'Total indexed:')} {mojTotalIndexed} {t('مستند', 'documents')}</span>}
            </div>
          )}
        </CardHeader>
        {mojLog.length > 0 && (
          <CardContent className="pt-0">
            <div className="bg-muted rounded-lg p-3 max-h-32 overflow-y-auto text-xs font-mono space-y-0.5 border border-amber-300/60" dir="auto">
              {mojLog.slice(-12).map((l, i) => (
                <p key={i} className={l.startsWith('✅') ? 'text-green-700' : l.startsWith('❌') ? 'text-red-600' : l.startsWith('🔍') ? 'text-blue-700' : 'text-amber-800'}>{l}</p>
              ))}
            </div>
          </CardContent>
        )}
      </Card>

      {/* Citation Extraction Card */}
      <Card className="mb-6 border-violet-200 bg-violet-50/40">
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between flex-wrap gap-2">
            <div>
              <CardTitle className="text-base flex items-center gap-2">
                🏷️ {t('استخراج بيانات الاستشهاد', 'Extract citation metadata')}
              </CardTitle>
              <p className="text-xs text-muted-foreground mt-1">
                {t('يستخرج تلقائياً رقم القضية والمحكمة والتاريخ من الوثائق القضائية', 'Automatically extracts case number, court, and date from judicial documents')}
                {citWithoutMeta !== null && citWithoutMeta > 0 && (
                   <span className="mr-1 font-semibold text-violet-700">— {citWithoutMeta} {t('وثيقة تنتظر الاستخراج', 'documents awaiting extraction')}</span>
                )}
                {citWithoutMeta === 0 && (
                   <span className="mr-1 text-green-700 font-semibold">— {t('جميع الوثائق لديها بيانات ✓', 'All documents have metadata ✓')}</span>
                )}
              </p>
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={() => startExtractAllMeta(false)}
                disabled={metaAllLoading || metaJob?.running === true || citWithoutMeta === 0}
                className="flex items-center gap-2 px-4 py-2 bg-violet-600 text-white rounded-xl text-sm font-bold hover:bg-violet-700 disabled:opacity-60 transition-colors"
              >
                {metaAllLoading || metaJob?.running
                   ? <><span className="animate-spin">⏳</span> {t('جارٍ الاستخراج...', 'Extracting...')}</>
                   : `🔖 ${t('استخراج للكل', 'Extract all')}`}
              </button>
              <button
                onClick={() => startExtractAllMeta(true)}
                disabled={metaAllLoading || metaJob?.running === true}
                 title={t('إعادة استخراج كاملة — يُعيد معالجة جميع الوثائق القضائية بغض النظر عن بياناتها الحالية', 'Full re-extraction — reprocesses all judicial documents regardless of their current metadata')}
                className="flex items-center gap-2 px-4 py-2 bg-orange-600 text-white rounded-xl text-sm font-bold hover:bg-orange-700 disabled:opacity-60 transition-colors"
              >
                {metaAllLoading || metaJob?.running
                   ? <><span className="animate-spin">⏳</span> {t('جارٍ إعادة الاستخراج...', 'Re-extracting...')}</>
                   : `🔄 ${t('إعادة استخراج كاملة', 'Full re-extraction')}`}
              </button>
            </div>
          </div>
        </CardHeader>
        {metaJob && (
          <CardContent className="pt-0">
            <div className="space-y-2">
              <div className="flex items-center justify-between text-xs">
                <span className="font-semibold text-violet-900">
                   {metaJob.running ? `⏳ ${t('جارٍ الاستخراج…', 'Extracting…')}` : `✅ ${t('اكتمل الاستخراج', 'Extraction complete')}`}
                </span>
                <span className="text-violet-700 font-medium">
                   {metaJob.done}/{metaJob.total} {t('وثيقة', 'documents')}
                   {metaJob.failed > 0 && <span className="text-red-600 mr-2">({metaJob.failed} {t('فشل', 'failed')})</span>}
                </span>
              </div>
              <div className="w-full h-2 bg-violet-100 rounded-full overflow-hidden">
                <div
                  className={`h-2 rounded-full transition-all duration-500 ${metaJob.running ? 'bg-violet-500' : 'bg-green-500'}`}
                  style={{ width: `${metaJob.total > 0 ? Math.round((metaJob.done / metaJob.total) * 100) : 0}%` }}
                />
              </div>
              {metaJob.log.length > 0 && (
                <div className="bg-muted rounded-lg p-2 max-h-28 overflow-y-auto text-xs font-mono space-y-0.5 border border-violet-300/60" dir="auto">
                  {metaJob.log.slice(-8).map((l, i) => (
                    <p key={i} className={l.startsWith('✅') ? 'text-green-700' : l.startsWith('❌') ? 'text-red-600' : 'text-violet-800'}>{l}</p>
                  ))}
                </div>
              )}
              {!metaJob.running && (
                <p className="text-xs text-violet-800">
                  ✓ {t('فُحص', 'Checked')} {metaJob.done} — {t('استُخرجت بيانات:', 'Metadata extracted:')} {(metaJob as any).extracted ?? '—'} — {t('فشل', 'Failed')} {metaJob.failed}
                  {(metaJob as any).rejectedFields > 0 && (
                    <span className="mr-2 text-amber-700 font-semibold">
                      — ⚠️ {t('حقول مرفوضة بالتحقق:', 'Fields rejected by validation:')} {(metaJob as any).rejectedFields}
                    </span>
                  )}
                </p>
              )}
            </div>
          </CardContent>
        )}
      </Card>

      {/* Bulk progress bar (shown during ZIP processing) */}
      {bulkStatus && (
        <Card className="mb-6 border-blue-200 bg-blue-50/60">
          <CardContent className="p-5">
            <div className="flex items-center justify-between mb-2">
              <p className="font-semibold text-blue-900 text-sm">
                {bulkStatus.running ? `⏳ ${t('جارٍ فهرسة الملفات...', 'Indexing files...')}` : `🎉 ${t('اكتملت المعالجة', 'Processing complete')}`}
              </p>
              <span className="text-sm font-bold text-blue-700">
                {bulkStatus.done + bulkStatus.failed} / {bulkStatus.total}
              </span>
            </div>
            {/* Progress bar */}
            <div className="w-full bg-blue-100 rounded-full h-3 mb-3 overflow-hidden">
              <div
                className={`h-3 rounded-full transition-all duration-500 ${bulkStatus.running ? 'bg-blue-500' : 'bg-green-500'}`}
                style={{ width: `${bulkPercent}%` }}
              />
            </div>
            <div className="flex gap-4 text-xs text-blue-800 mb-3">
              <span>✅ {t('نجح:', 'Succeeded:')} {bulkStatus.done}</span>
              {bulkStatus.failed > 0 && <span>❌ {t('فشل:', 'Failed:')} {bulkStatus.failed}</span>}
              <span className="text-blue-500">{bulkPercent}%</span>
            </div>
            {/* Log tail */}
            {bulkStatus.log.length > 0 && (
              <div className="bg-muted rounded-lg p-3 max-h-32 overflow-y-auto text-xs font-mono space-y-0.5" dir="auto">
                {bulkStatus.log.slice(-10).map((l, i) => (
                  <p key={i} className={l.startsWith('✅') ? 'text-green-700' : l.startsWith('❌') ? 'text-red-600' : 'text-blue-700'}>{l}</p>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* Add Source Card */}
      <Card className="mb-6">
        <CardHeader className="pb-3">
          <CardTitle className="text-base">{t('إضافة مصادر', 'Add sources')}</CardTitle>
          <div className="flex gap-1 mt-2 bg-muted rounded-lg p-1 w-fit">
            <button onClick={() => setTab('zip')}
              className={`px-4 py-1.5 rounded-md text-sm font-medium transition-colors ${tab === 'zip' ? 'bg-card shadow text-primary border border-primary/50' : 'text-muted-foreground hover:text-foreground'}`}>
              📦 {t('رفع ZIP', 'Upload ZIP')}
            </button>
            <button onClick={() => setTab('file')}
              className={`px-4 py-1.5 rounded-md text-sm font-medium transition-colors ${tab === 'file' ? 'bg-card shadow text-primary border border-primary/50' : 'text-muted-foreground hover:text-foreground'}`}>
              📂 {t('ملف واحد', 'Single file')}
            </button>
            <button onClick={() => setTab('url')}
              className={`px-4 py-1.5 rounded-md text-sm font-medium transition-colors ${tab === 'url' ? 'bg-card shadow text-primary border border-primary/50' : 'text-muted-foreground hover:text-foreground'}`}>
              🌐 {t('رابط موقع', 'Website URL')}
            </button>
          </div>
        </CardHeader>
        <CardContent>

          {/* ── Category selector (shared across all tabs) ── */}
          <div className="mb-4">
            <label className="block text-sm font-medium mb-1">{t('تصنيف المستند', 'Document category')} <span className="text-red-500">*</span></label>
            <select
              value={categoryInput}
              onChange={(e) => setCategoryInput(e.target.value)}
              className="w-full border-2 border-primary/50 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 bg-background"
            >
              <option value="judicial">⚖️ {t('مدونات قضائية / سوابق', 'Judicial codices / precedents')}</option>
              <option value="circular">📋 {t('تعاميم وأوامر', 'Circulars and orders')}</option>
              <option value="regulation">📜 {t('أنظمة ولوائح (هيئة الخبراء)', 'Laws and regulations (Bureau of Experts)')}</option>
              <option value="contract">📝 {t('عقود ونماذج', 'Contracts and templates')}</option>
              <option value="general">📂 {t('عام', 'General')}</option>
            </select>
          </div>

          {/* ── ZIP Tab ── */}
          {tab === 'zip' && (
            <div className="space-y-4">
              {/* Guide box */}
              <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 text-sm text-amber-900">
                <p className="font-bold mb-2">📦 {t('كيف ترفعين أرشيف مستندات موثّق دفعةً واحدة؟', 'How do you upload a verified document archive in bulk?')}</p>
                <ol className="space-y-1 list-decimal list-inside text-amber-800">
                  <li>{t('اختاري الملفات من أرشيف الباحثة الذكية أو من مصدر قانوني موثّق ومصرّح باستخدامه', 'Select files from the smart researcher archive or another verified, authorized legal source')}</li>
                  <li>{t('راجعي المصدر وبيانات الحكم أو النظام قبل الرفع', 'Verify the source and judgment or regulation metadata before uploading')}</li>
                  <li>{t('ضعي الملفات في مجلد واحد وحوّليه إلى ZIP', 'Place the files in one folder and compress it into a ZIP archive')}</li>
                  <li>{t('ارفعيه هنا — النظام يفهرس كل PDF/TXT/DOCX تلقائياً', 'Upload it here — the system automatically indexes every PDF, TXT, and DOCX file')}</li>
                </ol>
              </div>

              {/* Drop zone */}
              <div
                className={`border-2 border-dashed rounded-xl p-12 text-center transition-colors cursor-pointer
                  ${dragOver ? 'border-primary bg-primary/5 shadow-md shadow-primary/10' : 'border-cyan-400/65 hover:border-primary hover:bg-primary/5'}
                  ${uploading ? 'opacity-60 pointer-events-none' : ''}`}
                onClick={() => zipInputRef.current?.click()}
                onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
                onDragLeave={() => setDragOver(false)}
                onDrop={(e) => {
                  e.preventDefault(); setDragOver(false);
                  const f = e.dataTransfer.files[0];
                  if (f) uploadZip(f);
                }}
              >
                <div className="text-5xl mb-3">📦</div>
                <p className="font-semibold text-base">{t('اسحب ملف ZIP هنا أو انقر للاختيار', 'Drag a ZIP file here or click to select')}</p>
                <p className="text-sm text-muted-foreground mt-1">{t('حتى 500 MB · يدعم آلاف الملفات', 'Up to 500 MB · supports thousands of files')}</p>
              </div>
              <input
                ref={zipInputRef}
                type="file"
                accept=".zip,application/zip,application/x-zip-compressed"
                className="hidden"
                onChange={(e) => { const f = e.target.files?.[0]; if (f) uploadZip(f); e.target.value = ''; }}
              />
            </div>
          )}

          {/* ── Single file Tab ── */}
          {tab === 'file' && (
            <div>
              <div
                className={`border-2 border-dashed rounded-xl p-10 text-center transition-colors cursor-pointer
                  ${dragOver ? 'border-primary bg-primary/5 shadow-md shadow-primary/10' : 'border-blue-400/65 hover:border-primary hover:bg-primary/5'}
                  ${uploading ? 'opacity-60 pointer-events-none' : ''}`}
                onClick={() => fileInputRef.current?.click()}
                onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
                onDragLeave={() => setDragOver(false)}
                onDrop={(e) => { e.preventDefault(); setDragOver(false); handleFiles(e.dataTransfer.files); }}
              >
                <div className="text-4xl mb-3">📂</div>
                <p className="text-muted-foreground font-medium">{t('اسحب الملف وأفلته هنا، أو انقر للاختيار', 'Drag and drop a file here, or click to select')}</p>
                <p className="text-sm text-muted-foreground/70 mt-1">PDF · TXT · DOCX ({t('حتى 20 MB', 'up to 20 MB')})</p>
              </div>
              <input
                ref={fileInputRef}
                type="file"
                accept=".pdf,.txt,.docx,application/pdf,text/plain,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
                multiple
                className="hidden"
                onChange={(e) => handleFiles(e.target.files)}
              />
            </div>
          )}

          {/* ── URL Tab ── */}
          {tab === 'url' && (
            <div className="space-y-3">
              <div>
                <label className="block text-sm font-medium mb-1">{t('رابط الصفحة', 'Page URL')} <span className="text-red-500">*</span></label>
                <input
                  type="url" value={urlInput}
                  onChange={(e) => setUrlInput(e.target.value)}
                  placeholder="https://moj.gov.sa/ar/Laws/Pages/..."
                  className="w-full border-2 border-blue-400/60 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 bg-background"
                  disabled={uploading} onKeyDown={(e) => e.key === 'Enter' && addUrl()} dir="ltr"
                />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">{t('اسم المصدر (اختياري)', 'Source name (optional)')}</label>
                <input
                  type="text" value={titleInput}
                  onChange={(e) => setTitleInput(e.target.value)}
                  placeholder={t('مثال: نظام العمل السعودي', 'Example: Saudi Labor Law')}
                  className="w-full border-2 border-purple-400/60 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 bg-background"
                  disabled={uploading}
                />
              </div>
              <button
                onClick={addUrl} disabled={uploading || !urlInput.trim()}
                className="w-full py-2.5 bg-primary text-primary-foreground rounded-lg text-sm font-medium hover:bg-primary/90 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {uploading ? t('جارٍ الجلب والفهرسة...', 'Fetching and indexing...') : t('جلب وفهرسة المحتوى', 'Fetch and index content')}
              </button>
              <p className="text-xs text-muted-foreground">
                {t('ملاحظة: بعض المواقع الحكومية تحجب الطلبات الآلية — استخدمي رفع ZIP للمستندات الحكومية', 'Note: Some government sites block automated requests — use ZIP upload for government documents')}
              </p>
            </div>
          )}

          {progress && (
            <div className="mt-4 p-3 bg-blue-50 text-blue-800 rounded-lg text-sm flex items-center gap-2">
              {uploading ? <span className="animate-spin inline-block">⏳</span> : <span>✅</span>}
              {progress}
            </div>
          )}
          {error && (
            <div className="mt-4 p-3 bg-red-50 text-red-700 rounded-lg text-sm flex items-center gap-2">
              <span>❌</span>
              <span className="flex-1">{error}</span>
              <button className="underline shrink-0" onClick={() => setError(null)}>{t('إغلاق', 'Close')}</button>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Sources List */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center justify-between">
            <span>{t('المصادر المستوردة', 'Imported sources')} ({docs.length})</span>
            <button
              onClick={() => { setLoading(true); fetchDocs().finally(() => setLoading(false)); }}
              className="text-xs text-primary hover:underline font-normal"
            >
              {t('تحديث', 'Refresh')}
            </button>
          </CardTitle>
        </CardHeader>
        <CardContent>
          {loading ? (
            <p className="text-center text-muted-foreground py-8">{t('جارٍ التحميل...', 'Loading...')}</p>
          ) : docs.length === 0 ? (
            <div className="text-center py-12">
              <p className="text-5xl mb-4">📭</p>
              <p className="text-muted-foreground">{t('لا توجد مصادر مضافة بعد', 'No sources added yet')}</p>
              <p className="text-sm text-muted-foreground/70 mt-1">{t('ارفعي أرشيف ZIP موثّق لبدء الفهرسة الشاملة', 'Upload a verified ZIP archive to start comprehensive indexing')}</p>
            </div>
          ) : (
            <div className="space-y-2">
              {docs.map((doc) => (
                <div
                  key={doc.id}
                  className="flex items-center justify-between p-3 border border-blue-300/60 rounded-lg hover:border-primary/60 hover:bg-primary/5 transition-colors"
                >
                  <div className="flex items-center gap-3 flex-1 min-w-0">
                    <DocIcon mimeType={doc.mimeType} sourceUrl={doc.sourceUrl} errorMessage={doc.errorMessage} />
                    <div className="min-w-0">
                      <p className="font-medium text-sm truncate" title={doc.filename} dir="auto">{doc.filename}</p>
                      {doc.sourceUrl && (
                        <a href={doc.sourceUrl} target="_blank" rel="noopener noreferrer"
                          className="text-xs text-blue-600 hover:underline truncate block max-w-xs" dir="ltr">
                          {doc.sourceUrl}
                        </a>
                      )}
                      <div className="flex items-center gap-2 mt-0.5 flex-wrap">
                        <StatusBadge status={doc.status} />
                        {doc.status === 'indexed' && (
                          <span className="text-xs text-muted-foreground">{doc.totalChunks} {t('جزء', 'chunks')}</span>
                        )}
                        {doc.errorMessage && (
                          <span className="text-xs text-red-600 truncate max-w-xs" title={doc.errorMessage} dir="auto">
                            {doc.errorMessage.slice(0, 60)}
                          </span>
                        )}
                        {(doc.cleanCount ?? 0) > 1 && (
                          <span
                            className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-xs font-medium bg-orange-100 text-orange-800"
                            title={`${t('نُظِّفت بيانات الاستشهاد', 'Citation metadata was cleaned')} ${doc.cleanCount} ${t('مرة — آخرها:', 'times — most recently:')} ${doc.lastCleanedAt ? new Date(doc.lastCleanedAt).toLocaleDateString(lang === 'ar' ? 'ar-SA' : 'en-US') : '—'}`}
                          >
                            ⚠️ {t('تكرّر تلف البيانات', 'Repeated metadata corruption')} ({doc.cleanCount}×)
                          </span>
                        )}
                        {(doc.cleanCount ?? 0) === 1 && doc.lastCleanedAt && (
                          <span
                            className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-xs font-medium bg-yellow-50 text-yellow-700"
                            title={`${t('نُظِّفت بيانات الاستشهاد مرة واحدة —', 'Citation metadata was cleaned once —')} ${new Date(doc.lastCleanedAt).toLocaleDateString(lang === 'ar' ? 'ar-SA' : 'en-US')}`}
                          >
                            🧹 {t('نُظِّف مرة', 'Cleaned once')}
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center gap-1 shrink-0 mr-3">
                    {doc.status === 'indexed' && doc.category === 'judicial' && !doc.hasMeta && (
                      <button
                        onClick={() => extractDocMeta(doc.id)}
                        disabled={extractingDocIds.has(doc.id)}
                        className="text-xs text-violet-600 hover:text-violet-800 hover:bg-violet-50 px-2 py-1 rounded disabled:opacity-50"
                        title={t('استخراج بيانات الاستشهاد', 'Extract citation metadata')}
                      >
                        {extractingDocIds.has(doc.id) ? <span className="animate-spin inline-block">⏳</span> : '🔖'}
                      </button>
                    )}
                    {(doc.status === 'error' || doc.status === 'indexed') && (
                      <button onClick={() => reindexDoc(doc.id)}
                        className="text-xs text-blue-600 hover:underline px-2 py-1 rounded hover:bg-blue-50"
                        title={t('إعادة فهرسة', 'Reindex')}>
                        🔄
                      </button>
                    )}
                    <a
                      href={`${BASE}/api/admin/knowledge/documents/${doc.id}/download`}
                      download={doc.filename}
                      className="text-xs text-green-600 hover:text-green-800 hover:bg-green-50 px-2 py-1 rounded"
                      title={t('تحميل الملف الأصلي', 'Download original file')}
                    >
                      ⬇️
                    </a>
                    <button onClick={() => deleteDoc(doc.id)}
                      className="text-xs text-red-500 hover:text-red-700 hover:bg-red-50 px-2 py-1 rounded"
                      title={t('حذف', 'Delete')}>
                      🗑
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
      </div>
    </AdminSidebar>
  );
}
