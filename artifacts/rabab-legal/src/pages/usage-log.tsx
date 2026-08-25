/**
 * صفحة سجل الاستهلاك — تعرض تاريخ الخدمات المستهلكة مع إمكانية التصدير CSV
 */
import React, { useState, useEffect } from 'react';
import { Navbar, Footer } from '@/components/layout';
import { BarChart2, Download, RefreshCw, ChevronLeft, ChevronRight, FileDown } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useLang } from '@/hooks/use-language';

const API_BASE = import.meta.env.BASE_URL.replace(/\/$/, '');
const PAGE_SIZE = 20;

interface LogEntry {
  id: number;
  serviceType: string;
  unitsDeducted: number;
  balanceAfter: number | null;
  description: string | null;
  createdAt: string;
}

interface LogResponse {
  rows: LogEntry[];
  total: number;
  page: number;
  pages: number;
}

const SERVICE_LABELS: Record<string, [string, string]> = {
  consultation: ['استشارة قانونية', 'Legal consultation'],
  contract_draft: ['صياغة عقد', 'Contract drafting'],
  contract_review: ['مراجعة عقد', 'Contract review'],
};

function ServiceBadge({ type }: { type: string }) {
  const { t } = useLang();
  const colors: Record<string, string> = {
    consultation: 'bg-blue-500/15 text-blue-400 border-blue-500/30',
    contract_draft: 'bg-purple-500/15 text-purple-400 border-purple-500/30',
    contract_review: 'bg-amber-500/15 text-amber-400 border-amber-500/30',
  };
  return (
    <span className={cn('text-xs px-2 py-0.5 rounded-full border font-medium', colors[type] ?? 'bg-muted text-muted-foreground border-border')}>
       {SERVICE_LABELS[type] ? t(...SERVICE_LABELS[type]) : type}
    </span>
  );
}

export default function UsageLogPage() {
  const { lang, t } = useLang();
  const [data, setData] = useState<LogResponse | null>(null);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(false);
  const [exporting, setExporting] = useState(false);

  const fetch_ = async (p = page) => {
    setLoading(true);
    try {
      const res = await fetch(`${API_BASE}/api/quota/usage-log?page=${p}&limit=${PAGE_SIZE}`, { credentials: 'include' });
      if (res.ok) setData(await res.json());
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetch_(page); }, [page]);

  const exportCsv = async () => {
    setExporting(true);
    try {
      const res = await fetch(`${API_BASE}/api/quota/usage-log/export`, { credentials: 'include' });
      if (!res.ok) return;
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `usage-log-${new Date().toISOString().slice(0, 10)}.csv`;
      a.click();
      URL.revokeObjectURL(url);
    } finally {
      setExporting(false);
    }
  };

  return (
    <div className="min-h-screen flex flex-col bg-background" dir={lang === 'ar' ? 'rtl' : 'ltr'}>
      <Navbar />
      <main className="flex-1 container mx-auto max-w-4xl px-4 py-10">
        {/* Header */}
        <div className="flex items-center justify-between mb-8">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center">
              <BarChart2 className="w-5 h-5 text-primary" />
            </div>
            <div>
               <h1 className="text-2xl font-bold text-foreground">{t('سجل الاستهلاك', 'Usage log')}</h1>
               <p className="text-sm text-muted-foreground">{t('تاريخ الخدمات المستخدمة وتفاصيل الخصم', 'History of used services and deduction details')}</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => fetch_(page)}
              disabled={loading}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-muted hover:bg-muted/70 text-muted-foreground text-sm transition-colors"
            >
              <RefreshCw className={cn('w-3.5 h-3.5', loading && 'animate-spin')} />
               {t('تحديث', 'Refresh')}
            </button>
            <button
              onClick={exportCsv}
              disabled={exporting}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-primary/10 hover:bg-primary/20 text-primary text-sm font-medium transition-colors"
            >
              <FileDown className="w-3.5 h-3.5" />
               {exporting ? t('جارٍ التصدير...', 'Exporting...') : t('تصدير CSV', 'Export CSV')}
            </button>
          </div>
        </div>

        {/* Table */}
        <div className="bg-card border border-border rounded-2xl overflow-hidden">
          {loading && !data ? (
            <div className="p-12 text-center text-muted-foreground">
              <RefreshCw className="w-6 h-6 animate-spin mx-auto mb-3" />
               {t('جارٍ التحميل...', 'Loading...')}
            </div>
          ) : !data?.rows.length ? (
            <div className="p-12 text-center text-muted-foreground">
              <BarChart2 className="w-8 h-8 mx-auto mb-3 opacity-40" />
               <p>{t('لا توجد سجلات استهلاك بعد', 'No usage records yet')}</p>
            </div>
          ) : (
            <>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-border bg-muted/30">
                       <th className="text-start px-4 py-3 font-semibold text-muted-foreground">{t('التاريخ', 'Date')}</th>
                       <th className="text-start px-4 py-3 font-semibold text-muted-foreground">{t('الخدمة', 'Service')}</th>
                       <th className="text-start px-4 py-3 font-semibold text-muted-foreground">{t('الوحدات المخصومة', 'Units deducted')}</th>
                       <th className="text-start px-4 py-3 font-semibold text-muted-foreground">{t('الرصيد بعدها', 'Balance after')}</th>
                       <th className="text-start px-4 py-3 font-semibold text-muted-foreground">{t('ملاحظة', 'Note')}</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border/50">
                    {data.rows.map(row => (
                      <tr key={row.id} className="hover:bg-muted/20 transition-colors">
                        <td className="px-4 py-3 text-muted-foreground whitespace-nowrap">
                           {new Date(row.createdAt).toLocaleString(lang === 'ar' ? 'ar-SA' : 'en-US', {
                            year: 'numeric', month: 'short', day: 'numeric',
                            hour: '2-digit', minute: '2-digit',
                          })}
                        </td>
                        <td className="px-4 py-3">
                          <ServiceBadge type={row.serviceType} />
                        </td>
                        <td className="px-4 py-3">
                          <span className="font-bold text-red-400">-{row.unitsDeducted}</span>
                        </td>
                        <td className="px-4 py-3">
                          {row.balanceAfter !== null ? (
                            <span className={cn('font-semibold', row.balanceAfter <= 0 ? 'text-red-400' : row.balanceAfter <= 2 ? 'text-amber-400' : 'text-green-400')}>
                              {row.balanceAfter}
                            </span>
                          ) : (
                             <span className="text-muted-foreground text-xs">{t('تجربة مجانية', 'Free trial')}</span>
                          )}
                        </td>
                        <td className="px-4 py-3 text-muted-foreground text-xs">{row.description ?? '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {/* Pagination */}
              {data.pages > 1 && (
                <div className="flex items-center justify-between px-4 py-3 border-t border-border bg-muted/10">
                  <span className="text-xs text-muted-foreground">
                           {t(`صفحة ${data.page} من ${data.pages} — إجمالي ${data.total} سجل`, `Page ${data.page} of ${data.pages} — ${data.total} total records`)}
                  </span>
                  <div className="flex items-center gap-1">
                    <button
                      onClick={() => setPage(p => Math.max(1, p - 1))}
                      disabled={page <= 1}
                        aria-label={t('الصفحة السابقة', 'Previous page')}
                      className="p-1.5 rounded-lg hover:bg-muted disabled:opacity-40 transition-colors"
                    >
                        {lang === 'ar' ? <ChevronRight className="w-4 h-4" /> : <ChevronLeft className="w-4 h-4" />}
                    </button>
                    <button
                      onClick={() => setPage(p => Math.min(data.pages, p + 1))}
                      disabled={page >= data.pages}
                        aria-label={t('الصفحة التالية', 'Next page')}
                      className="p-1.5 rounded-lg hover:bg-muted disabled:opacity-40 transition-colors"
                    >
                        {lang === 'ar' ? <ChevronLeft className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
                    </button>
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      </main>
      <Footer />
    </div>
  );
}
