/**
 * صفحة إعدادات واتساب في لوحة الإدارة
 * تفعيل/تعطيل الإرسال + عرض سجل الرسائل
 */
import React, { useState, useEffect } from 'react';
import { Navbar, Footer } from '@/components/layout';
import { ToggleLeft, ToggleRight, MessageSquare, Loader2, RefreshCw, ChevronLeft, ChevronRight, CheckCircle2, XCircle, AlertCircle } from 'lucide-react';
import { cn } from '@/lib/utils';

const API_BASE = import.meta.env.BASE_URL.replace(/\/$/, '');

interface WaConfig { enabled: boolean }
interface LogEntry {
  id: number;
  userId: number | null;
  toNumber: string | null;
  messagePreview: string;
  sent: boolean;
  adminDisabled: boolean;
  failReason: string | null;
  createdAt: string;
}
interface LogResponse { rows: LogEntry[]; total: number; page: number; pages: number }

export default function AdminWhatsAppSettings() {
  const [config, setConfig] = useState<WaConfig | null>(null);
  const [log, setLog] = useState<LogResponse | null>(null);
  const [page, setPage] = useState(1);
  const [saving, setSaving] = useState(false);
  const [loadingLog, setLoadingLog] = useState(false);

  const fetchConfig = async () => {
    const res = await fetch(`${API_BASE}/api/admin/whatsapp/settings`, { credentials: 'include' });
    if (res.ok) setConfig(await res.json());
  };

  const fetchLog = async (p = page) => {
    setLoadingLog(true);
    try {
      const res = await fetch(`${API_BASE}/api/admin/whatsapp/log?page=${p}&limit=50`, { credentials: 'include' });
      if (res.ok) setLog(await res.json());
    } finally {
      setLoadingLog(false);
    }
  };

  useEffect(() => { fetchConfig(); fetchLog(1); }, []);
  useEffect(() => { fetchLog(page); }, [page]);

  const toggle = async () => {
    if (!config) return;
    setSaving(true);
    try {
      const res = await fetch(`${API_BASE}/api/admin/whatsapp/settings`, {
        method: 'PATCH',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ enabled: !config.enabled }),
      });
      if (res.ok) setConfig(await res.json().then(d => d.config));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="min-h-screen flex flex-col bg-background" dir="rtl">
      <Navbar />
      <main className="flex-1 container mx-auto max-w-5xl px-4 py-10">
        <div className="flex items-center gap-3 mb-8">
          <div className="w-10 h-10 rounded-xl bg-green-500/10 flex items-center justify-center">
            <MessageSquare className="w-5 h-5 text-green-500" />
          </div>
          <div>
            <h1 className="text-2xl font-bold">إعدادات واتساب</h1>
            <p className="text-sm text-muted-foreground">تحكم في إرسال رسائل واتساب وتتبع سجلها</p>
          </div>
        </div>

        {/* Toggle */}
        <div className="bg-card border border-border rounded-2xl p-6 mb-8">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="font-bold text-foreground mb-1">حالة قناة واتساب</h2>
              <p className="text-sm text-muted-foreground">
                {config?.enabled
                  ? 'الإرسال مُفعَّل — الرسائل تُرسَل فعلياً عبر Twilio'
                  : 'الإرسال مُعطَّل — الرسائل تُحفظ في السجل فقط دون إرسال'}
              </p>
            </div>
            <button
              onClick={toggle}
              disabled={saving || !config}
              className={cn(
                'flex items-center gap-2 px-4 py-2 rounded-xl font-bold transition-all',
                config?.enabled
                  ? 'bg-red-500/15 text-red-400 hover:bg-red-500/25 border border-red-500/30'
                  : 'bg-green-500/15 text-green-400 hover:bg-green-500/25 border border-green-500/30'
              )}
            >
              {saving ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : config?.enabled ? (
                <><ToggleRight className="w-5 h-5" />تعطيل الإرسال</>
              ) : (
                <><ToggleLeft className="w-5 h-5" />تفعيل الإرسال</>
              )}
            </button>
          </div>
          {!config?.enabled && (
            <div className="mt-4 flex items-start gap-2 p-3 bg-amber-500/10 border border-amber-500/20 rounded-xl">
              <AlertCircle className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
              <p className="text-xs text-amber-400">
                قناة واتساب معطَّلة. جميع الرسائل مسجَّلة في السجل أدناه وستُرسَل فور التفعيل إذا أعدت تشغيل منطق الإرسال.
              </p>
            </div>
          )}
        </div>

        {/* Log */}
        <div className="bg-card border border-border rounded-2xl overflow-hidden">
          <div className="flex items-center justify-between px-4 py-3 border-b border-border">
            <h2 className="font-bold text-sm">سجل الرسائل</h2>
            <button onClick={() => fetchLog(page)} disabled={loadingLog} className="p-1.5 rounded hover:bg-muted transition-colors">
              <RefreshCw className={cn('w-3.5 h-3.5 text-muted-foreground', loadingLog && 'animate-spin')} />
            </button>
          </div>

          {!log?.rows.length ? (
            <div className="p-8 text-center text-muted-foreground text-sm">لا توجد رسائل مسجّلة بعد</div>
          ) : (
            <>
              <div className="overflow-x-auto">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="border-b border-border bg-muted/20">
                      <th className="text-right px-3 py-2.5 text-muted-foreground font-semibold">التاريخ</th>
                      <th className="text-right px-3 py-2.5 text-muted-foreground font-semibold">الرقم</th>
                      <th className="text-right px-3 py-2.5 text-muted-foreground font-semibold">الرسالة</th>
                      <th className="text-right px-3 py-2.5 text-muted-foreground font-semibold">الحالة</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border/50">
                    {log.rows.map(row => (
                      <tr key={row.id} className="hover:bg-muted/10 transition-colors">
                        <td className="px-3 py-2.5 text-muted-foreground whitespace-nowrap">
                          {new Date(row.createdAt).toLocaleString('ar-SA', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
                        </td>
                        <td className="px-3 py-2.5 font-mono">{row.toNumber ?? '—'}</td>
                        <td className="px-3 py-2.5 max-w-[280px] truncate text-muted-foreground">{row.messagePreview}</td>
                        <td className="px-3 py-2.5">
                          {row.sent ? (
                            <span className="flex items-center gap-1 text-green-400"><CheckCircle2 className="w-3 h-3" />أُرسلت</span>
                          ) : row.adminDisabled ? (
                            <span className="flex items-center gap-1 text-amber-400"><AlertCircle className="w-3 h-3" />معطَّل</span>
                          ) : (
                            <span className="flex items-center gap-1 text-red-400"><XCircle className="w-3 h-3" />{row.failReason ?? 'فشل'}</span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {log.pages > 1 && (
                <div className="flex items-center justify-between px-3 py-2.5 border-t border-border">
                  <span className="text-xs text-muted-foreground">صفحة {log.page} من {log.pages}</span>
                  <div className="flex gap-1">
                    <button onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page <= 1} className="p-1 rounded hover:bg-muted disabled:opacity-40">
                      <ChevronRight className="w-3.5 h-3.5" />
                    </button>
                    <button onClick={() => setPage(p => Math.min(log.pages, p + 1))} disabled={page >= log.pages} className="p-1 rounded hover:bg-muted disabled:opacity-40">
                      <ChevronLeft className="w-3.5 h-3.5" />
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
