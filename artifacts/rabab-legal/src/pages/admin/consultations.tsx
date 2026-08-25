import React, { useState, useEffect, useCallback } from 'react';
import { AdminSidebar } from '@/components/layout';
import { Card, CardContent, FramedState, Skeleton } from '@/components/ui';
import { MessageSquare, CheckCircle, Clock, XCircle, ChevronDown, ChevronUp, ExternalLink } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useLang } from '@/hooks/use-language';

const BASE = import.meta.env.BASE_URL.replace(/\/$/, '');

interface ConsultationRow {
  id: number;
  userId: number;
  subscriptionId: number | null;
  title: string;
  areaAr: string | null;
  status: 'pending' | 'answered' | 'closed';
  chatgptUrl: string | null;
  createdAt: string;
}

interface VerificationSource {
  name: string;
  similarity: number;
  verified: boolean;
  snippet: string;
  sourceType: 'kb' | 'web';
  url?: string;
  documentId?: number;
  pageStart?: number | null;
  pageEnd?: number | null;
}

interface AdminMessage {
  id: number;
  role: 'user' | 'assistant';
  content: string;
  createdAt: string;
  sources: VerificationSource[] | null;
}

// ─── Source Cards ─────────────────────────────────────────────────────────────
function SourceCards({ sources }: { sources: VerificationSource[] }) {
  const { t } = useLang();
  if (sources.length === 0) return null;
  return (
    <div className="mt-2 space-y-1">
       <p className="text-[11px] text-muted-foreground font-medium">📚 {sources.length} {t('مصدر مُستند إليه', 'supporting source(s)')}</p>
      <div className="space-y-1 max-h-52 overflow-y-auto">
        {sources.map((s, i) => {
          const hasPage = s.sourceType === 'kb' && s.pageStart != null;
          const pageLabel = hasPage
             ? `${t('ص', 'p.')}${s.pageStart}${s.pageEnd != null && s.pageEnd !== s.pageStart ? `–${s.pageEnd}` : ''}`
            : null;
          const pdfUrl = hasPage && s.documentId
            ? `${BASE}/api/documents/${s.documentId}/view#page=${s.pageStart}`
            : null;
          return (
            <div key={i} className="flex items-start gap-1.5 bg-muted/40 rounded-lg px-2.5 py-1.5 text-xs">
              <span className={cn('shrink-0 font-bold', s.sourceType === 'web' ? 'text-blue-600' : 'text-green-600')}>
                {s.sourceType === 'web' ? '🌐' : '📚'}
              </span>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-1.5 flex-wrap">
                   <span dir="auto" className="font-medium text-foreground/80 truncate">{s.name}</span>
                  <span className="text-muted-foreground shrink-0">{s.similarity}%</span>
                  {pageLabel && (
                    <span className="shrink-0 bg-primary/10 text-primary text-[10px] font-bold px-1.5 py-0.5 rounded-full">
                      {pageLabel}
                    </span>
                  )}
                  {pdfUrl && (
                    <a
                      href={pdfUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="shrink-0 inline-flex items-center gap-0.5 text-[10px] text-blue-600 hover:underline"
                    >
                      <ExternalLink className="w-2.5 h-2.5" />
                       {t('فتح عند', 'Open at')} {pageLabel}
                    </a>
                  )}
                  {s.url && !pdfUrl && (
                    <a
                      href={s.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="shrink-0 inline-flex items-center gap-0.5 text-[10px] text-blue-600 hover:underline"
                    >
                      <ExternalLink className="w-2.5 h-2.5" />
                       {t('فتح', 'Open')}
                    </a>
                  )}
                </div>
                 <p dir="auto" className="text-muted-foreground/70 text-[10px] mt-0.5 line-clamp-2">{s.snippet}</p>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ─── Consultation Detail Row ──────────────────────────────────────────────────
function ConsultationDetail({ consultationId }: { consultationId: number }) {
  const { lang, t } = useLang();
  const [messages, setMessages] = useState<AdminMessage[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch(`${BASE}/api/admin/consultations/${consultationId}/messages`, { credentials: 'include' })
       .then(r => r.ok ? r.json() : Promise.reject(t('فشل التحميل', 'Loading failed')))
      .then(data => setMessages(data))
       .catch(e => setError(typeof e === 'string' ? e : t('فشل تحميل الرسائل', 'Failed to load messages')))
      .finally(() => setLoading(false));
  }, [consultationId]);

  if (loading) return (
    <div className="m-4 space-y-2 rounded-2xl border-2 border-secondary/45 bg-secondary/5 p-4">
      {[1, 2, 3].map(i => <Skeleton key={i} className="h-10 w-full" />)}
    </div>
  );
  if (error) return <FramedState tone="error" title={error} className="m-4 min-h-24" />;
   if (!messages?.length) return <FramedState icon={<MessageSquare className="h-5 w-5 text-secondary/70" />} title={t('لا توجد رسائل', 'No messages')} className="m-4 min-h-24" />;

  return (
     <div className="p-4 space-y-3 bg-muted/10" dir={lang === 'ar' ? 'rtl' : 'ltr'}>
      {messages.map(msg => (
        <div
          key={msg.id}
          className={cn(
            'rounded-xl px-3 py-2.5 text-sm',
            msg.role === 'user'
              ? 'bg-background border border-border ml-8'
              : 'bg-primary/5 border border-primary/10 mr-8'
          )}
        >
          <div className="flex items-center gap-2 mb-1">
            <span className="text-xs font-semibold text-muted-foreground">
               {msg.role === 'user' ? `👤 ${t('المستخدم', 'User')}` : '⚖️ رباب'}
            </span>
            <span className="text-[10px] text-muted-foreground/60">
               {new Date(msg.createdAt).toLocaleString(lang === 'ar' ? 'ar-SA' : 'en-US', { hour: '2-digit', minute: '2-digit', day: 'numeric', month: 'short' })}
            </span>
          </div>
           <p dir="auto" className="whitespace-pre-wrap leading-relaxed text-foreground/90">{msg.content}</p>
          {msg.role === 'assistant' && msg.sources && msg.sources.length > 0 && (
            <SourceCards sources={msg.sources} />
          )}
        </div>
      ))}
    </div>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────
export default function AdminConsultations() {
  const { lang, t } = useLang();
  const [consultations, setConsultations] = useState<ConsultationRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<'all' | 'pending' | 'answered' | 'closed'>('all');
  const [search, setSearch] = useState('');
  const [expandedId, setExpandedId] = useState<number | null>(null);

  const fetchConsultations = useCallback(async () => {
    try {
      const r = await fetch(`${BASE}/api/admin/consultations`, { credentials: 'include' });
       if (!r.ok) throw new Error(t('فشل تحميل الاستشارات', 'Failed to load consultations'));
      setConsultations(await r.json());
    } catch (e: any) { setError(e.message); }
    finally { setLoading(false); }
   }, [t]);

  useEffect(() => { fetchConsultations(); }, [fetchConsultations]);

  const filtered = consultations
    .filter(c => filter === 'all' || c.status === filter)
    .filter(c => !search || c.title.includes(search) || c.areaAr?.includes(search));

  const counts = {
    all: consultations.length,
    pending: consultations.filter(c => c.status === 'pending').length,
    answered: consultations.filter(c => c.status === 'answered').length,
    closed: consultations.filter(c => c.status === 'closed').length,
  };

   const statusConfig: Record<string, { label: string; icon: React.ReactNode; color: string }> = {
     pending: { label: t('معلقة', 'Pending'), icon: <Clock className="w-3.5 h-3.5" />, color: 'bg-yellow-100 text-yellow-700' },
     answered: { label: t('مجابة', 'Answered'), icon: <CheckCircle className="w-3.5 h-3.5" />, color: 'bg-green-100 text-green-700' },
     closed: { label: t('مغلقة', 'Closed'), icon: <XCircle className="w-3.5 h-3.5" />, color: 'bg-muted text-muted-foreground border border-border' },
   };
   return (
     <AdminSidebar><div dir={lang === 'ar' ? 'rtl' : 'ltr'}>
      <div className="mb-8">
         <h1 className="text-2xl font-bold text-primary">{t('الاستشارات', 'Consultations')}</h1>
         <p className="text-muted-foreground mt-1">{t('متابعة جميع استشارات المنصة', 'Monitor all platform consultations')}</p>
      </div>

      {error && <div className="mb-4 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">{error}</div>}

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
         {(['all', 'answered', 'pending', 'closed'] as const).map(f => <Card key={f}><CardContent className="p-4 text-center"><p className="text-2xl font-bold text-primary">{counts[f]}</p><p className="text-sm text-muted-foreground">{f === 'all' ? t('الكل', 'All') : statusConfig[f].label}</p></CardContent></Card>)}
      </div>

      {/* Filters + Search */}
      <div className="flex flex-col sm:flex-row gap-3 mb-4">
        <div className="flex gap-2 flex-wrap">
          {(['all', 'answered', 'pending', 'closed'] as const).map(f => (
            <button key={f} onClick={() => setFilter(f)}
              className={`px-3 py-1.5 rounded-full text-sm font-medium transition-colors flex items-center gap-1
                ${filter === f ? 'bg-primary text-white' : 'bg-muted hover:bg-muted/70 text-foreground'}`}>
               {f === 'all' ? <MessageSquare className="w-3.5 h-3.5" /> : statusConfig[f].icon}
               {f === 'all' ? t('الكل', 'All') : statusConfig[f].label}
            </button>
          ))}
        </div>
        <input
          className="flex-1 border border-border rounded-md px-3 py-1.5 text-sm bg-background"
           placeholder={t('بحث بالعنوان أو المجال...', 'Search by title or area...')}
          value={search} onChange={e => setSearch(e.target.value)}
        />
      </div>

      <Card>
        <CardContent className="p-0">
          {loading ? (
            <div className="m-4 space-y-3 rounded-2xl border-2 border-secondary/45 bg-secondary/5 p-4">{[1,2,3,4,5].map(i => <Skeleton key={i} className="h-14 w-full" />)}</div>
          ) : filtered.length === 0 ? (
            <FramedState icon={<MessageSquare className="h-8 w-8 text-secondary/60" />} title={t('لا توجد استشارات', 'No consultations')} className="m-4" />
          ) : (
            <div className="divide-y divide-border/50">
              {filtered.map(c => {
                 const cfg = statusConfig[c.status] ?? statusConfig.pending;
                const isExpanded = expandedId === c.id;
                return (
                  <div key={c.id}>
                    <button
                       className={`w-full ${lang === 'ar' ? 'text-right' : 'text-left'} hover:bg-muted/20 transition-colors`}
                      onClick={() => setExpandedId(isExpanded ? null : c.id)}
                    >
                      <div className="flex items-center gap-3 py-3 px-4">
                        <span className="text-muted-foreground font-mono text-xs w-8 shrink-0">{c.id}</span>
                        <div className="flex-1 min-w-0">
                           <p dir="auto" className="font-medium text-sm truncate">{c.title}</p>
                          <div className="flex items-center gap-2 mt-0.5">
                            {c.areaAr && (
                              <span className="bg-primary/10 text-primary text-[10px] px-1.5 py-0.5 rounded-full">{c.areaAr}</span>
                            )}
                            <span className="text-muted-foreground text-[10px]">#{c.userId}</span>
                            <span className="text-muted-foreground text-[10px]">
                               {new Date(c.createdAt).toLocaleDateString(lang === 'ar' ? 'ar-SA' : 'en-US', { year: 'numeric', month: 'short', day: 'numeric' })}
                            </span>
                          </div>
                        </div>
                        <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-medium shrink-0 ${cfg.color}`}>
                          {cfg.icon}{cfg.label}
                        </span>
                        {isExpanded
                          ? <ChevronUp className="w-4 h-4 text-muted-foreground shrink-0" />
                          : <ChevronDown className="w-4 h-4 text-muted-foreground shrink-0" />
                        }
                      </div>
                    </button>
                    {isExpanded && <ConsultationDetail consultationId={c.id} />}
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>
     </div></AdminSidebar>
  );
}
