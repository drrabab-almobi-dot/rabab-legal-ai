/**
 * DocumentPageViewer
 * Renders a PDF as sequential page images using pdfjs-dist (client-side).
 * Architecture: text is for search only — lawyers read from original page images.
 *
 * Features:
 * - Page-by-page image display (canvas → img)
 * - Lazy loading (only renders visible ±1 pages)
 * - Arrow navigation, scroll, keyboard, touch swipe
 * - Jump to specific page
 * - Zoom in/out
 * - Download full PDF or current page
 * - Opens at specific page (initialPage prop)
 */
import { useEffect, useRef, useState, useCallback } from "react";
import { ChevronUp, ChevronDown, ZoomIn, ZoomOut, Download, Loader2, X, BookOpen, AlertTriangle } from "lucide-react";
import { cn } from "@/lib/utils";

// Lazy-load pdfjs-dist to avoid blocking the main bundle
let pdfjsLib: any = null;
async function loadPdfjsLib() {
  if (pdfjsLib) return pdfjsLib;
  const mod = await import("pdfjs-dist");
  // Use local worker from node_modules
  const workerUrl = new URL("pdfjs-dist/build/pdf.worker.min.mjs", import.meta.url).href;
  mod.GlobalWorkerOptions.workerSrc = workerUrl;
  pdfjsLib = mod;
  return mod;
}

interface DocumentPageViewerProps {
  /** Full URL to the PDF binary (served by API) */
  pdfUrl: string;
  /** Open at this page number (1-based file order) */
  initialPage?: number;
  /** Codex title shown in header */
  title?: string;
  /** Called when user closes the viewer */
  onClose: () => void;
  /** Total pages hint (optional — will be detected from PDF) */
  totalPages?: number;
  /** If true, renders inline (fills parent container) instead of fixed fullscreen overlay */
  inline?: boolean;
}

interface RenderedPage {
  pageNum: number;
  dataUrl: string;
  width: number;
  height: number;
}

const MIN_SCALE = 0.5;
const MAX_SCALE = 3.0;
const DEFAULT_SCALE = 1.0;

export function DocumentPageViewer({
  pdfUrl,
  initialPage = 1,
  title = "المستند",
  onClose,
  totalPages: totalPagesProp,
  inline = false,
}: DocumentPageViewerProps) {
  const [pdfDoc, setPdfDoc] = useState<any>(null);
  const [numPages, setNumPages] = useState(totalPagesProp ?? 0);
  const [currentPage, setCurrentPage] = useState(initialPage);
  const [scale, setScale] = useState(DEFAULT_SCALE);
  const [renderedPages, setRenderedPages] = useState<Map<number, RenderedPage>>(new Map());
  const [renderingPages, setRenderingPages] = useState<Set<number>>(new Set());
  const [jumpInput, setJumpInput] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const containerRef = useRef<HTMLDivElement>(null);
  const pageRefs = useRef<Map<number, HTMLDivElement>>(new Map());
  const renderQueueRef = useRef<number[]>([]);
  const isRenderingRef = useRef(false);
  const pdfDocRef = useRef<any>(null);

  // ── Load PDF ─────────────────────────────────────────────────────────────
  useEffect(() => {
    let cancelled = false;

    (async () => {
      try {
        setLoading(true);
        setError("");
        const lib = await loadPdfjsLib();

        const loadingTask = lib.getDocument({
          url: pdfUrl,
          withCredentials: true,
          cMapUrl: "https://cdn.jsdelivr.net/npm/pdfjs-dist@latest/cmaps/",
          cMapPacked: true,
        });

        const doc = await loadingTask.promise;
        if (cancelled) return;

        pdfDocRef.current = doc;
        setPdfDoc(doc);
        setNumPages(doc.numPages);
        setLoading(false);
      } catch (e: any) {
        if (!cancelled) {
          setError("فشل تحميل المستند: " + (e.message || "خطأ غير معروف"));
          setLoading(false);
        }
      }
    })();

    return () => { cancelled = true; };
  }, [pdfUrl]);

  // ── Render a single page to canvas ────────────────────────────────────────
  const renderPage = useCallback(async (pageNum: number) => {
    const doc = pdfDocRef.current;
    if (!doc || pageNum < 1 || pageNum > doc.numPages) return;
    if (renderedPages.has(pageNum)) return;

    setRenderingPages(prev => new Set(prev).add(pageNum));

    try {
      const page = await doc.getPage(pageNum);
      const viewport = page.getViewport({ scale });

      const canvas = document.createElement("canvas");
      canvas.width = viewport.width;
      canvas.height = viewport.height;

      const ctx = canvas.getContext("2d")!;
      await page.render({ canvasContext: ctx, viewport }).promise;

      const dataUrl = canvas.toDataURL("image/jpeg", 0.92);

      setRenderedPages(prev => {
        const next = new Map(prev);
        next.set(pageNum, { pageNum, dataUrl, width: viewport.width, height: viewport.height });
        return next;
      });
    } catch (e) {
      console.warn(`Failed to render page ${pageNum}`, e);
    } finally {
      setRenderingPages(prev => {
        const next = new Set(prev);
        next.delete(pageNum);
        return next;
      });
    }
  }, [scale, renderedPages]);

  // ── Re-render all cached pages when scale changes ─────────────────────────
  useEffect(() => {
    if (!pdfDoc) return;
    setRenderedPages(new Map());
  }, [scale, pdfDoc]);

  // ── Render pages around current ───────────────────────────────────────────
  useEffect(() => {
    if (!pdfDoc || loading) return;
    const pagesToRender = [
      currentPage,
      currentPage + 1,
      currentPage - 1,
      currentPage + 2,
    ].filter(p => p >= 1 && p <= numPages && !renderedPages.has(p) && !renderingPages.has(p));

    pagesToRender.forEach(p => renderPage(p));
  }, [currentPage, pdfDoc, numPages, loading, scale]);

  // ── Scroll to current page ────────────────────────────────────────────────
  useEffect(() => {
    const el = pageRefs.current.get(currentPage);
    if (el) {
      el.scrollIntoView({ behavior: "smooth", block: "start" });
    }
  }, [currentPage]);

  // ── Keyboard navigation ────────────────────────────────────────────────────
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === "ArrowDown" || e.key === "PageDown") {
        e.preventDefault();
        setCurrentPage(p => Math.min(numPages, p + 1));
      } else if (e.key === "ArrowUp" || e.key === "PageUp") {
        e.preventDefault();
        setCurrentPage(p => Math.max(1, p - 1));
      } else if (e.key === "Escape") {
        onClose();
      } else if (e.key === "+" || e.key === "=") {
        setScale(s => Math.min(MAX_SCALE, s + 0.25));
      } else if (e.key === "-") {
        setScale(s => Math.max(MIN_SCALE, s - 0.25));
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [numPages, onClose]);

  // ── Touch swipe for mobile ─────────────────────────────────────────────────
  const touchStartY = useRef(0);
  const handleTouchStart = (e: React.TouchEvent) => { touchStartY.current = e.touches[0].clientY; };
  const handleTouchEnd = (e: React.TouchEvent) => {
    const dy = touchStartY.current - e.changedTouches[0].clientY;
    if (Math.abs(dy) > 50) {
      if (dy > 0) setCurrentPage(p => Math.min(numPages, p + 1));
      else setCurrentPage(p => Math.max(1, p - 1));
    }
  };

  // ── Scroll detection to update current page ───────────────────────────────
  const handleScroll = useCallback(() => {
    if (!containerRef.current) return;
    const scrollTop = containerRef.current.scrollTop;
    const containerH = containerRef.current.clientHeight;
    let closestPage = currentPage;
    let closestDist = Infinity;

    pageRefs.current.forEach((el, pageNum) => {
      const rect = el.getBoundingClientRect();
      const containerRect = containerRef.current!.getBoundingClientRect();
      const dist = Math.abs(rect.top - containerRect.top);
      if (dist < closestDist) { closestDist = dist; closestPage = pageNum; }
    });

    if (closestPage !== currentPage) setCurrentPage(closestPage);
  }, [currentPage]);

  // ── Download helpers ───────────────────────────────────────────────────────
  const downloadPdf = () => {
    const a = document.createElement("a");
    a.href = pdfUrl;
    a.download = `${title}.pdf`;
    a.target = "_blank";
    a.click();
  };

  const downloadCurrentPage = () => {
    const page = renderedPages.get(currentPage);
    if (!page) return;
    const a = document.createElement("a");
    a.href = page.dataUrl;
    a.download = `${title}-صفحة-${currentPage}.jpg`;
    a.target = "_blank";   // #379: keep viewer open — don't navigate away
    a.rel = "noopener noreferrer";
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  };

  const handleJumpSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const n = parseInt(jumpInput);
    if (!isNaN(n) && n >= 1 && n <= numPages) {
      setCurrentPage(n);
      setJumpInput("");
    }
  };

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <div className={inline ? "flex flex-col h-full bg-black/90" : "fixed inset-0 z-50 bg-black/90 flex flex-col"} dir="rtl">

      {/* ── Top bar ── */}
      <div className="flex items-center gap-2 px-4 py-2 bg-gray-900 border-b border-gray-700 shrink-0">
        <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-gray-700 text-gray-300 hover:text-white transition-colors" title="إغلاق (Esc)">
          <X className="w-5 h-5" />
        </button>

        <div className="flex items-center gap-1 mr-1">
          <BookOpen className="w-4 h-4 text-primary/80" />
          <span className="text-sm font-semibold text-white truncate max-w-[200px] sm:max-w-sm">{title}</span>
        </div>

        <div className="flex-1" />

        {/* Page indicator + jump */}
        {numPages > 0 && (
          <form onSubmit={handleJumpSubmit} className="flex items-center gap-1.5">
            <input
              value={jumpInput}
              onChange={e => setJumpInput(e.target.value)}
              placeholder={`${currentPage}`}
              className="w-12 h-7 text-center text-sm bg-gray-800 border border-gray-600 rounded-lg text-white focus:outline-none focus:border-primary"
            />
            <span className="text-xs text-gray-400">/ {numPages}</span>
          </form>
        )}

        {/* Zoom controls */}
        <div className="flex items-center gap-1 mr-2">
          <button onClick={() => setScale(s => Math.max(MIN_SCALE, s - 0.25))} className="p-1.5 rounded-lg hover:bg-gray-700 text-gray-300 hover:text-white transition-colors" title="تصغير (-)">
            <ZoomOut className="w-4 h-4" />
          </button>
          <span className="text-xs text-gray-400 w-10 text-center">{Math.round(scale * 100)}%</span>
          <button onClick={() => setScale(s => Math.min(MAX_SCALE, s + 0.25))} className="p-1.5 rounded-lg hover:bg-gray-700 text-gray-300 hover:text-white transition-colors" title="تكبير (+)">
            <ZoomIn className="w-4 h-4" />
          </button>
        </div>

        {/* Download */}
        <button onClick={downloadPdf} className="hidden sm:flex items-center gap-1 px-2 py-1 rounded-lg hover:bg-gray-700 text-gray-300 hover:text-white text-xs transition-colors" title="تحميل المستند كاملاً">
          <Download className="w-3.5 h-3.5" />
          <span>تحميل</span>
        </button>
      </div>

      {/* ── Main content ── */}
      <div className="flex flex-1 overflow-hidden">

        {/* ── Page list (scrollable) ── */}
        <div
          ref={containerRef}
          onScroll={handleScroll}
          onTouchStart={handleTouchStart}
          onTouchEnd={handleTouchEnd}
          className="flex-1 overflow-y-auto overscroll-contain bg-gray-800"
          style={{ scrollSnapType: "y mandatory" }}
        >
          {loading ? (
            <div className="flex flex-col items-center justify-center h-full gap-4 text-gray-400">
              <Loader2 className="w-10 h-10 animate-spin text-primary" />
              <p className="text-sm">جارٍ تحميل المستند...</p>
            </div>
          ) : error ? (
            <div className="flex flex-col items-center justify-center h-full gap-4 text-red-400 p-6 text-center">
              <AlertTriangle className="w-10 h-10" />
              <p className="text-sm">{error}</p>
              <button onClick={onClose} className="px-4 py-2 bg-gray-700 rounded-xl text-sm text-white hover:bg-gray-600">إغلاق</button>
            </div>
          ) : (
            <div className="flex flex-col items-center gap-3 py-4 px-2">
              {Array.from({ length: numPages }, (_, i) => i + 1).map(pageNum => {
                const rendered = renderedPages.get(pageNum);
                const isRendering = renderingPages.has(pageNum);
                const isCurrent = pageNum === currentPage;

                return (
                  <div
                    key={pageNum}
                    ref={el => { if (el) pageRefs.current.set(pageNum, el); else pageRefs.current.delete(pageNum); }}
                    style={{ scrollSnapAlign: "start" }}
                    className={cn(
                      "relative w-full max-w-3xl rounded-lg overflow-hidden transition-all",
                      isCurrent ? "ring-2 ring-primary shadow-xl shadow-primary/20" : "ring-1 ring-gray-600"
                    )}
                    onClick={() => setCurrentPage(pageNum)}
                  >
                    {/* Page number badge */}
                    <div className="absolute top-2 right-2 z-10 px-2 py-0.5 bg-black/60 backdrop-blur-sm rounded-lg text-xs text-white font-mono">
                      {pageNum}
                    </div>

                    {rendered ? (
                      <img
                        src={rendered.dataUrl}
                        alt={`صفحة ${pageNum}`}
                        className="w-full h-auto block"
                        style={{ maxWidth: rendered.width }}
                      />
                    ) : (
                      <div
                        className="w-full bg-white flex items-center justify-center"
                        style={{ aspectRatio: "0.707", minHeight: "400px" }}
                      >
                        {isRendering ? (
                          <Loader2 className="w-8 h-8 animate-spin text-gray-400" />
                        ) : (
                          <div className="text-gray-300 text-sm">صفحة {pageNum}</div>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* ── Side navigation ── */}
        {!loading && !error && numPages > 1 && (
          <div className="w-12 flex flex-col items-center justify-center gap-3 bg-gray-900 border-r border-gray-700 shrink-0">
            <button
              onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
              disabled={currentPage <= 1}
              className="p-2 rounded-xl hover:bg-gray-700 text-gray-300 hover:text-white disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
              title="الصفحة السابقة (↑)"
            >
              <ChevronUp className="w-5 h-5" />
            </button>

            <div className="flex flex-col items-center gap-0.5">
              <span className="text-xs font-bold text-primary">{currentPage}</span>
              <div className="w-px h-6 bg-gray-600" />
              <span className="text-xs text-gray-500">{numPages}</span>
            </div>

            <button
              onClick={() => setCurrentPage(p => Math.min(numPages, p + 1))}
              disabled={currentPage >= numPages}
              className="p-2 rounded-xl hover:bg-gray-700 text-gray-300 hover:text-white disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
              title="الصفحة التالية (↓)"
            >
              <ChevronDown className="w-5 h-5" />
            </button>
          </div>
        )}
      </div>

      {/* ── Bottom bar (download current page) ── */}
      {!loading && !error && (
        <div className="flex items-center justify-between px-4 py-2 bg-gray-900 border-t border-gray-700 text-xs text-gray-400 shrink-0">
          <span>استخدم ↑↓ للتنقل | + − للتكبير | Esc للإغلاق</span>
          {renderedPages.has(currentPage) && (
            <button onClick={downloadCurrentPage} className="flex items-center gap-1 text-gray-400 hover:text-white transition-colors">
              <Download className="w-3 h-3" />
              تحميل الصفحة الحالية
            </button>
          )}
        </div>
      )}
    </div>
  );
}
