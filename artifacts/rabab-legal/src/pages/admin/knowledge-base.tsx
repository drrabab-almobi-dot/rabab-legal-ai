import React, { useState, useRef, useCallback } from 'react';
import { AdminSidebar } from '@/components/layout';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui';
import { useMetaJobSync } from '@/hooks/useMetaJobSync';

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

const STATUS_LABELS: Record<DocStatus, { label: string; color: string }> = {
  pending:  { label: 'في الانتظار', color: 'bg-yellow-100 text-yellow-800' },
  indexing: { label: 'جارٍ الفهرسة...', color: 'bg-blue-100 text-blue-700 animate-pulse' },
  indexed:  { label: 'مُفهرَس ✓', color: 'bg-green-100 text-green-800' },
  error:    { label: 'خطأ', color: 'bg-red-100 text-red-700' },
};

function StatusBadge({ status }: { status: DocStatus }) {
  const { label, color } = STATUS_LABELS[status] ?? STATUS_LABELS.error;
  return (
    <span className={`inline-block px-2 py-0.5 rounded text-xs font-medium ${color}`}>
      {label}
    </span>
  );
}

/** Returns true when the error message indicates the document is a scanned-image PDF */
function isScannedPdfError(errorMessage?: string | null): boolean {
  return !!errorMessage?.includes('مسحوح ضوئياً');
}

function DocIcon({ mimeType, sourceUrl, errorMessage }: { mimeType: string; sourceUrl?: string | null; errorMessage?: string | null }) {
  if (sourceUrl) return <span className="text-2xl shrink-0">🌐</span>;
  if (isScannedPdfError(errorMessage)) return <span className="text-2xl shrink-0" title="ملف مسحوح ضوئياً">📷</span>;
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
      if (!r.ok) throw new Error(data.error ?? 'فشل الاستخراج');
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
      ? 'وضع إعادة الاستخراج الكاملة: سيتم إعادة معالجة جميع الوثائق القضائية بغض النظر عن بياناتها الحالية. قد تستغرق العملية وقتاً أطول. متابعة؟'
      : 'سيتم استخراج بيانات الاستشهاد بالذكاء الاصطناعي لجميع الوثائق القضائية التي لا تحمل بيانات بعد. قد تستغرق العملية عدة دقائق. متابعة؟';
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
        alert(data.message ?? 'تمت العملية');
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
      if (!r.ok) { const d = await r.json().catch(() => ({})); setError(d.error ?? 'فشل الزحف'); setMojCrawling(false); return; }
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
    if (!file.name.match(/\.zip$/i)) { setError('يجب أن يكون الملف بصيغة ZIP'); return; }
    setUploading(true);
    setError(null);
    setBulkStatus(null);
    setProgress(`جارٍ رفع ${file.name} (${(file.size / 1024 / 1024).toFixed(1)} MB)...`);
    try {
      const form = new FormData();
      form.append('file', file);
      form.append('category', categoryInput);
      const r = await fetch(`${BASE}/api/admin/knowledge/zip-upload`, {
        method: 'POST', credentials: 'include', body: form,
      });
      const data = await r.json();
      if (!r.ok) throw new Error(data.error ?? 'فشل الرفع');
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
    if (!url) { setError('أدخل رابطاً صالحاً'); return; }
    if (!/^https?:\/\/.+/.test(url)) { setError('الرابط يجب أن يبدأ بـ https:// أو http://'); return; }
    setUploading(true);
    setProgress(`جارٍ جلب المحتوى من: ${url}`);
    setError(null);
    try {
      const r = await fetch(`${BASE}/api/admin/knowledge/url`, {
        method: 'POST', credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url, title: titleInput.trim() || undefined, category: categoryInput }),
      });
      const data = await r.json();
      if (!r.ok) throw new Error(data.error ?? 'فشل جلب الرابط');
      setProgress('تم الجلب والفهرسة بنجاح ✓');
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
      setError('يُسمح فقط بملفات PDF أو TXT أو DOCX');
      return;
    }
    setUploading(true);
    setProgress(`جارٍ رفع: ${file.name}...`);
    setError(null);
    try {
      const form = new FormData();
      form.append('file', file);
      form.append('category', categoryInput);
      const r = await fetch(`${BASE}/api/admin/knowledge/upload`, {
        method: 'POST', credentials: 'include', body: form,
      });
      const data = await r.json();
      if (!r.ok) throw new Error(data.error ?? 'فشل الرفع');
      setProgress('تم الرفع والفهرسة بنجاح ✓');
      await fetchDocs(); startPolling();
    } catch (e: any) {
      setError(e.message);
    } finally {
      setUploading(false);
      setTimeout(() => setProgress(null), 5000);
    }
  }, [fetchDocs, startPolling]);

  const handleFiles = (files: FileList | null) => {
    if (!files) return;
    Array.from(files).forEach(uploadFile);
  };

  const deleteDoc = async (id: number) => {
    if (!confirm('هل أنت متأكد من حذف هذا المصدر وجميع أجزائه؟')) return;
    try {
      const r = await fetch(`${BASE}/api/admin/knowledge/documents/${id}`, {
        method: 'DELETE', credentials: 'include',
      });
      if (!r.ok) throw new Error('فشل الحذف');
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
      if (!r.ok) throw new Error('فشل إعادة الفهرسة');
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
          setReindexAllMsg(`اكتملت إعادة الفهرسة: نجح ${st.done}، فشل ${st.failed}`);
        }
      } catch { stopReindexAllPoll(); setReindexingAll(false); }
    }, 3000);
  }, [stopReindexAllPoll, fetchDocs]);

  const reindexAll = async () => {
    if (!confirm('سيُعاد بناء قاعدة المعرفة بالكامل من الملفات الأصلية. قد يستغرق ذلك عدة دقائق. هل تريد المتابعة؟')) return;
    setReindexingAll(true);
    setReindexAllMsg(null);
    setReindexAllJob(null);
    try {
      const r = await fetch(`${BASE}/api/admin/knowledge/reindex-all`, {
        method: 'POST', credentials: 'include',
      });
      const data = await r.json();
      if (!r.ok) throw new Error(data.error ?? 'فشل إعادة الفهرسة');
      if (data.jobId) {
        setReindexAllJob({ total: data.total, done: 0, failed: 0, running: true, log: [] });
        startReindexAllPoll(data.jobId);
      } else {
        // Immediate completion (0 indexable docs)
        setReindexAllMsg(data.message ?? 'تم');
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
      setReclassifyMsg(data.message ?? 'تم');
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
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-primary">قاعدة المعرفة القانونية</h1>
        <p className="text-muted-foreground mt-1">
          ارفع ملفاتك القانونية أو ZIP من تيليجرام ليستخدمها المساعد مرجعاً في كل إجابة
        </p>
      </div>

      {/* Reclassify banner */}
      {generalCount > 0 && (
        <div className="mb-4 p-4 bg-amber-50 border border-amber-200 rounded-xl flex items-center justify-between gap-4">
          <div>
            <p className="font-semibold text-amber-800 text-sm">⚠️ {generalCount} وثيقة بدون تصنيف محدد</p>
            <p className="text-xs text-amber-700 mt-0.5">يمكن إعادة تصنيفها تلقائياً بالذكاء الاصطناعي لتحسين نتائج البحث</p>
          </div>
          <button
            onClick={reclassifyAll}
            disabled={reclassifying}
            className="shrink-0 px-4 py-2 bg-amber-600 text-white rounded-lg text-sm font-bold hover:bg-amber-700 disabled:opacity-60 flex items-center gap-2"
          >
            {reclassifying ? '⏳ جارٍ...' : '🤖 صنّف الآن'}
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
            <p className="font-semibold text-blue-800 text-sm">🔄 إعادة فهرسة قاعدة المعرفة بالكامل</p>
            <p className="text-xs text-blue-700 mt-0.5">يُعيد بناء الـ chunks من الملفات الأصلية — يُطبّق فلتر صفحات الفهرس على الوثائق القديمة</p>
          </div>
          <button
            onClick={reindexAll}
            disabled={reindexingAll}
            className="shrink-0 px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-bold hover:bg-blue-700 disabled:opacity-60 flex items-center gap-2"
          >
            {reindexingAll ? '⏳ جارٍ...' : '🔄 إعادة فهرسة الكل'}
          </button>
        </div>

        {/* Live progress */}
        {reindexAllJob && (
          <div className="mt-3">
            {reindexAllJob.total > 0 && (
              <>
                <div className="flex justify-between text-xs text-blue-700 mb-1">
                  <span>{reindexAllJob.done + reindexAllJob.failed} / {reindexAllJob.total} وثيقة</span>
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
              <div className="bg-blue-100 rounded-lg p-2 max-h-28 overflow-y-auto text-xs text-blue-900 font-mono space-y-0.5" dir="rtl">
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
      <div className="grid grid-cols-4 gap-4 mb-6">
        <Card>
          <CardContent className="p-4 text-center">
            <p className="text-3xl font-bold text-foreground">{docs.length}</p>
            <p className="text-sm text-muted-foreground">إجمالي المصادر</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 text-center">
            <p className="text-3xl font-bold text-green-600">{indexedCount}</p>
            <p className="text-sm text-muted-foreground">مُفهرَس ونشط</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 text-center">
            <p className="text-3xl font-bold text-blue-600">{totalChunks}</p>
            <p className="text-sm text-muted-foreground">أجزاء مُضمَّنة</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 text-center">
            <p className={`text-3xl font-bold ${pendingCount > 0 ? 'text-yellow-600 animate-pulse' : 'text-muted-foreground'}`}>
              {pendingCount}
            </p>
            <p className="text-sm text-muted-foreground">قيد الفهرسة</p>
          </CardContent>
        </Card>
      </div>

      {/* MOJ Circular Crawler Card */}
      <Card className="mb-6 border-amber-200 bg-amber-50/40">
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between flex-wrap gap-2">
            <div>
              <CardTitle className="text-base flex items-center gap-2">
                🏛️ مزامنة تعاميم وزارة العدل
              </CardTitle>
              <p className="text-xs text-muted-foreground mt-1">
                يبحث تلقائياً في moj.gov.sa ويُفهرس التعاميم الجديدة مباشرة
              </p>
            </div>
            <button
              onClick={startMojCrawl}
              disabled={mojCrawling}
              className="flex items-center gap-2 px-4 py-2 bg-amber-600 text-white rounded-xl text-sm font-bold hover:bg-amber-700 disabled:opacity-60 transition-colors"
            >
              {mojCrawling
                ? <><span className="animate-spin">⏳</span> جارٍ الزحف...</>
                : '🔍 ابدأ المزامنة'}
            </button>
          </div>
          {(mojLastCrawl || mojTotalIndexed > 0) && (
            <div className="flex gap-4 text-xs text-muted-foreground mt-2">
              {mojLastCrawl && <span>آخر مزامنة: {new Date(mojLastCrawl).toLocaleString('ar-SA')}</span>}
              {mojTotalIndexed > 0 && <span>إجمالي المُفهرَس: {mojTotalIndexed} مستند</span>}
            </div>
          )}
        </CardHeader>
        {mojLog.length > 0 && (
          <CardContent className="pt-0">
            <div className="bg-muted rounded-lg p-3 max-h-32 overflow-y-auto text-xs font-mono space-y-0.5 text-right border border-border" dir="rtl">
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
                🏷️ استخراج بيانات الاستشهاد
              </CardTitle>
              <p className="text-xs text-muted-foreground mt-1">
                يستخرج تلقائياً رقم القضية والمحكمة والتاريخ من الوثائق القضائية
                {citWithoutMeta !== null && citWithoutMeta > 0 && (
                  <span className="mr-1 font-semibold text-violet-700">— {citWithoutMeta} وثيقة تنتظر الاستخراج</span>
                )}
                {citWithoutMeta === 0 && (
                  <span className="mr-1 text-green-700 font-semibold">— جميع الوثائق لديها بيانات ✓</span>
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
                  ? <><span className="animate-spin">⏳</span> جارٍ الاستخراج...</>
                  : '🔖 استخراج للكل'}
              </button>
              <button
                onClick={() => startExtractAllMeta(true)}
                disabled={metaAllLoading || metaJob?.running === true}
                title="إعادة استخراج كاملة — يُعيد معالجة جميع الوثائق القضائية بغض النظر عن بياناتها الحالية"
                className="flex items-center gap-2 px-4 py-2 bg-orange-600 text-white rounded-xl text-sm font-bold hover:bg-orange-700 disabled:opacity-60 transition-colors"
              >
                {metaAllLoading || metaJob?.running
                  ? <><span className="animate-spin">⏳</span> جارٍ إعادة الاستخراج...</>
                  : '🔄 إعادة استخراج كاملة'}
              </button>
            </div>
          </div>
        </CardHeader>
        {metaJob && (
          <CardContent className="pt-0">
            <div className="space-y-2">
              <div className="flex items-center justify-between text-xs">
                <span className="font-semibold text-violet-900">
                  {metaJob.running ? '⏳ جارٍ الاستخراج…' : '✅ اكتمل الاستخراج'}
                </span>
                <span className="text-violet-700 font-medium">
                  {metaJob.done}/{metaJob.total} وثيقة
                  {metaJob.failed > 0 && <span className="text-red-600 mr-2">({metaJob.failed} فشل)</span>}
                </span>
              </div>
              <div className="w-full h-2 bg-violet-100 rounded-full overflow-hidden">
                <div
                  className={`h-2 rounded-full transition-all duration-500 ${metaJob.running ? 'bg-violet-500' : 'bg-green-500'}`}
                  style={{ width: `${metaJob.total > 0 ? Math.round((metaJob.done / metaJob.total) * 100) : 0}%` }}
                />
              </div>
              {metaJob.log.length > 0 && (
                <div className="bg-muted rounded-lg p-2 max-h-28 overflow-y-auto text-xs font-mono space-y-0.5 text-right border border-border" dir="rtl">
                  {metaJob.log.slice(-8).map((l, i) => (
                    <p key={i} className={l.startsWith('✅') ? 'text-green-700' : l.startsWith('❌') ? 'text-red-600' : 'text-violet-800'}>{l}</p>
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
          </CardContent>
        )}
      </Card>

      {/* Bulk progress bar (shown during ZIP processing) */}
      {bulkStatus && (
        <Card className="mb-6 border-blue-200 bg-blue-50/60">
          <CardContent className="p-5">
            <div className="flex items-center justify-between mb-2">
              <p className="font-semibold text-blue-900 text-sm">
                {bulkStatus.running ? '⏳ جارٍ فهرسة الملفات...' : '🎉 اكتملت المعالجة'}
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
              <span>✅ نجح: {bulkStatus.done}</span>
              {bulkStatus.failed > 0 && <span>❌ فشل: {bulkStatus.failed}</span>}
              <span className="text-blue-500">{bulkPercent}%</span>
            </div>
            {/* Log tail */}
            {bulkStatus.log.length > 0 && (
              <div className="bg-muted rounded-lg p-3 max-h-32 overflow-y-auto text-xs font-mono space-y-0.5 text-right" dir="rtl">
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
          <CardTitle className="text-base">إضافة مصادر</CardTitle>
          <div className="flex gap-1 mt-2 bg-muted rounded-lg p-1 w-fit">
            <button onClick={() => setTab('zip')}
              className={`px-4 py-1.5 rounded-md text-sm font-medium transition-colors ${tab === 'zip' ? 'bg-card shadow text-primary border border-border' : 'text-muted-foreground hover:text-foreground'}`}>
              📦 رفع ZIP
            </button>
            <button onClick={() => setTab('file')}
              className={`px-4 py-1.5 rounded-md text-sm font-medium transition-colors ${tab === 'file' ? 'bg-card shadow text-primary border border-border' : 'text-muted-foreground hover:text-foreground'}`}>
              📂 ملف واحد
            </button>
            <button onClick={() => setTab('url')}
              className={`px-4 py-1.5 rounded-md text-sm font-medium transition-colors ${tab === 'url' ? 'bg-card shadow text-primary border border-border' : 'text-muted-foreground hover:text-foreground'}`}>
              🌐 رابط موقع
            </button>
          </div>
        </CardHeader>
        <CardContent>

          {/* ── Category selector (shared across all tabs) ── */}
          <div className="mb-4">
            <label className="block text-sm font-medium mb-1">تصنيف المستند <span className="text-red-500">*</span></label>
            <select
              value={categoryInput}
              onChange={(e) => setCategoryInput(e.target.value)}
              className="w-full border border-border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 bg-background"
            >
              <option value="judicial">⚖️ مدونات قضائية / سوابق</option>
              <option value="circular">📋 تعاميم وأوامر</option>
              <option value="regulation">📜 أنظمة ولوائح (هيئة الخبراء)</option>
              <option value="contract">📝 عقود ونماذج</option>
              <option value="general">📂 عام</option>
            </select>
          </div>

          {/* ── ZIP Tab ── */}
          {tab === 'zip' && (
            <div className="space-y-4">
              {/* Guide box */}
              <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 text-sm text-amber-900">
                <p className="font-bold mb-2">📲 كيف تصدّرين ملفات قناة تيليجرام دفعةً واحدة؟</p>
                <ol className="space-y-1 list-decimal list-inside text-amber-800">
                  <li>افتحي <strong>Telegram Desktop</strong> على الكمبيوتر</li>
                  <li>اذهبي للقناة ← اضغطي على اسمها ← <strong>⋮ ← Export Chat History</strong></li>
                  <li>اختاري <strong>Only files</strong> (أو Documents)</li>
                  <li>اضغطي <strong>Export</strong> وانتظري التنزيل</li>
                  <li>اضغطي على المجلد الناتج وحوّليه إلى ZIP</li>
                  <li>ارفعيه هنا — النظام يفهرس كل PDF/TXT/DOCX تلقائياً</li>
                </ol>
              </div>

              {/* Drop zone */}
              <div
                className={`border-2 border-dashed rounded-xl p-12 text-center transition-colors cursor-pointer
                  ${dragOver ? 'border-primary bg-primary/5' : 'border-border hover:border-primary/50 hover:bg-muted/30'}
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
                <p className="font-semibold text-base">اسحب ملف ZIP هنا أو انقر للاختيار</p>
                <p className="text-sm text-muted-foreground mt-1">حتى 500 MB · يدعم آلاف الملفات</p>
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
                  ${dragOver ? 'border-primary bg-primary/5' : 'border-border hover:border-primary/50 hover:bg-muted/30'}
                  ${uploading ? 'opacity-60 pointer-events-none' : ''}`}
                onClick={() => fileInputRef.current?.click()}
                onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
                onDragLeave={() => setDragOver(false)}
                onDrop={(e) => { e.preventDefault(); setDragOver(false); handleFiles(e.dataTransfer.files); }}
              >
                <div className="text-4xl mb-3">📂</div>
                <p className="text-muted-foreground font-medium">اسحب الملف وأفلته هنا، أو انقر للاختيار</p>
                <p className="text-sm text-muted-foreground/70 mt-1">PDF · TXT · DOCX (حتى 20 MB)</p>
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
                <label className="block text-sm font-medium mb-1">رابط الصفحة <span className="text-red-500">*</span></label>
                <input
                  type="url" value={urlInput}
                  onChange={(e) => setUrlInput(e.target.value)}
                  placeholder="https://moj.gov.sa/ar/Laws/Pages/..."
                  className="w-full border border-border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 bg-background"
                  disabled={uploading} onKeyDown={(e) => e.key === 'Enter' && addUrl()} dir="ltr"
                />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">اسم المصدر (اختياري)</label>
                <input
                  type="text" value={titleInput}
                  onChange={(e) => setTitleInput(e.target.value)}
                  placeholder="مثال: نظام العمل السعودي"
                  className="w-full border border-border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 bg-background"
                  disabled={uploading}
                />
              </div>
              <button
                onClick={addUrl} disabled={uploading || !urlInput.trim()}
                className="w-full py-2.5 bg-primary text-primary-foreground rounded-lg text-sm font-medium hover:bg-primary/90 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {uploading ? 'جارٍ الجلب والفهرسة...' : 'جلب وفهرسة المحتوى'}
              </button>
              <p className="text-xs text-muted-foreground">
                ملاحظة: بعض المواقع الحكومية تحجب الطلبات الآلية — استخدمي رفع ZIP للمستندات الحكومية
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
              <button className="underline shrink-0" onClick={() => setError(null)}>إغلاق</button>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Sources List */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center justify-between">
            <span>المصادر المستوردة ({docs.length})</span>
            <button
              onClick={() => { setLoading(true); fetchDocs().finally(() => setLoading(false)); }}
              className="text-xs text-primary hover:underline font-normal"
            >
              تحديث
            </button>
          </CardTitle>
        </CardHeader>
        <CardContent>
          {loading ? (
            <p className="text-center text-muted-foreground py-8">جارٍ التحميل...</p>
          ) : docs.length === 0 ? (
            <div className="text-center py-12">
              <p className="text-5xl mb-4">📭</p>
              <p className="text-muted-foreground">لا توجد مصادر مضافة بعد</p>
              <p className="text-sm text-muted-foreground/70 mt-1">ارفعي ZIP من تيليجرام لبدء الفهرسة الشاملة</p>
            </div>
          ) : (
            <div className="space-y-2">
              {docs.map((doc) => (
                <div
                  key={doc.id}
                  className="flex items-center justify-between p-3 border border-border rounded-lg hover:bg-muted/20 transition-colors"
                >
                  <div className="flex items-center gap-3 flex-1 min-w-0">
                    <DocIcon mimeType={doc.mimeType} sourceUrl={doc.sourceUrl} errorMessage={doc.errorMessage} />
                    <div className="min-w-0">
                      <p className="font-medium text-sm truncate" title={doc.filename}>{doc.filename}</p>
                      {doc.sourceUrl && (
                        <a href={doc.sourceUrl} target="_blank" rel="noopener noreferrer"
                          className="text-xs text-blue-600 hover:underline truncate block max-w-xs" dir="ltr">
                          {doc.sourceUrl}
                        </a>
                      )}
                      <div className="flex items-center gap-2 mt-0.5 flex-wrap">
                        <StatusBadge status={doc.status} />
                        {doc.status === 'indexed' && (
                          <span className="text-xs text-muted-foreground">{doc.totalChunks} جزء</span>
                        )}
                        {doc.errorMessage && (
                          <span className="text-xs text-red-600 truncate max-w-xs" title={doc.errorMessage}>
                            {doc.errorMessage.slice(0, 60)}
                          </span>
                        )}
                        {(doc.cleanCount ?? 0) > 1 && (
                          <span
                            className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-xs font-medium bg-orange-100 text-orange-800"
                            title={`نُظِّفت بيانات الاستشهاد ${doc.cleanCount} مرة — آخرها: ${doc.lastCleanedAt ? new Date(doc.lastCleanedAt).toLocaleDateString('ar-SA') : '—'}`}
                          >
                            ⚠️ تكرّر تلف البيانات ({doc.cleanCount}×)
                          </span>
                        )}
                        {(doc.cleanCount ?? 0) === 1 && doc.lastCleanedAt && (
                          <span
                            className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-xs font-medium bg-yellow-50 text-yellow-700"
                            title={`نُظِّفت بيانات الاستشهاد مرة واحدة — ${new Date(doc.lastCleanedAt).toLocaleDateString('ar-SA')}`}
                          >
                            🧹 نُظِّف مرة
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
                        title="استخراج بيانات الاستشهاد"
                      >
                        {extractingDocIds.has(doc.id) ? <span className="animate-spin inline-block">⏳</span> : '🔖'}
                      </button>
                    )}
                    {(doc.status === 'error' || doc.status === 'indexed') && (
                      <button onClick={() => reindexDoc(doc.id)}
                        className="text-xs text-blue-600 hover:underline px-2 py-1 rounded hover:bg-blue-50"
                        title="إعادة فهرسة">
                        🔄
                      </button>
                    )}
                    <a
                      href={`${BASE}/api/admin/knowledge/documents/${doc.id}/download`}
                      download={doc.filename}
                      className="text-xs text-green-600 hover:text-green-800 hover:bg-green-50 px-2 py-1 rounded"
                      title="تحميل الملف الأصلي"
                    >
                      ⬇️
                    </a>
                    <button onClick={() => deleteDoc(doc.id)}
                      className="text-xs text-red-500 hover:text-red-700 hover:bg-red-50 px-2 py-1 rounded"
                      title="حذف">
                      🗑
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </AdminSidebar>
  );
}
