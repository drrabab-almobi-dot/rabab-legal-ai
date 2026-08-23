import React, { useState } from 'react';
import { AdminSidebar } from '@/components/layout';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { customFetch } from '@workspace/api-client-react';
import { ExternalLink, RefreshCw, FileText, Scale, BookOpen, AlertCircle, CheckCircle2, Clock } from 'lucide-react';

const SOURCES = [
  {
    id: 'judicial',
    label: 'الأحكام القضائية',
    icon: Scale,
    category: 'judicial',
    color: 'text-blue-400',
    bg: 'bg-blue-500/10 border-blue-500/30',
    links: [
      { label: 'البوابة القانونية — وزارة العدل', url: 'https://laws.moj.gov.sa/ar/JudicialDecisionsList/1' },
      { label: 'ديوان المظالم', url: 'https://www.bog.gov.sa' },
    ],
  },
  {
    id: 'circulars',
    label: 'تعاميم وزارة العدل',
    icon: FileText,
    category: 'circular',
    color: 'text-amber-400',
    bg: 'bg-amber-500/10 border-amber-500/30',
    links: [
      { label: 'بوابة التعاميم الرسمية', url: 'https://www.moj.gov.sa/TameemPortal/Pages/default.aspx' },
    ],
  },
  {
    id: 'laws',
    label: 'الأنظمة واللوائح',
    icon: BookOpen,
    category: 'regulation',
    color: 'text-green-400',
    bg: 'bg-green-500/10 border-green-500/30',
    links: [
      { label: 'الأنظمة واللوائح — وزارة العدل', url: 'https://laws.moj.gov.sa/ar/legislations-regulations?pageNumber=1&pageSize=9&sortingBy=7' },
      { label: 'هيئة الخبراء بمجلس الوزراء', url: 'https://laws.boe.gov.sa' },
    ],
  },
];

interface KbDoc {
  id: number;
  title: string;
  category: string;
  source_url: string | null;
  created_at: string;
}

interface CrawlStatus {
  isRunning: boolean;
  lastRun: string | null;
  totalIndexed: number;
  schedule: { enabled: boolean; intervalHours: number } | null;
}

export default function MojContent() {
  const [activeTab, setActiveTab] = useState('judicial');
  const qc = useQueryClient();

  // جلب الوثائق من قاعدة المعرفة
  const { data: docs = [], isLoading: docsLoading } = useQuery<KbDoc[]>({
    queryKey: ['admin-kb-docs'],
    queryFn: async () => {
      const r = await customFetch('/api/admin/knowledge/documents?limit=200');
      const d = await r.json();
      return d.documents ?? d.items ?? d ?? [];
    },
  });

  // حالة الزحف
  const { data: crawlStatus } = useQuery<CrawlStatus>({
    queryKey: ['moj-crawl-status'],
    queryFn: async () => {
      const r = await customFetch('/api/admin/knowledge/crawl-moj/status');
      return r.json();
    },
    refetchInterval: 5000,
  });

  // تشغيل الزحف
  const crawlMutation = useMutation({
    mutationFn: async () => {
      const r = await customFetch('/api/admin/knowledge/crawl-moj', { method: 'POST' });
      return r.json();
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['moj-crawl-status'] });
      qc.invalidateQueries({ queryKey: ['admin-kb-docs'] });
    },
  });

  const source = SOURCES.find(s => s.id === activeTab)!;
  const filteredDocs = docs.filter(d => d.category === source.category);

  return (
    <AdminSidebar>
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-foreground">محتوى وزارة العدل</h1>
        <p className="text-muted-foreground text-sm mt-1">
          أحكام وتعاميم وأنظمة مفهرسة في قاعدة المعرفة
        </p>
      </div>

      {/* شريط حالة الزحف */}
      <div className="flex items-center justify-between bg-card border border-border rounded-xl px-5 py-4 mb-6">
        <div className="flex items-center gap-3">
          {crawlStatus?.isRunning ? (
            <>
              <RefreshCw className="w-5 h-5 text-amber-400 animate-spin" />
              <span className="text-sm font-medium text-foreground">جارٍ زحف مواقع وزارة العدل…</span>
            </>
          ) : (
            <>
              <CheckCircle2 className="w-5 h-5 text-green-400" />
              <div>
                <p className="text-sm font-medium text-foreground">
                  {crawlStatus?.totalIndexed ?? 0} وثيقة مفهرسة من وزارة العدل
                </p>
                {crawlStatus?.lastRun && (
                  <p className="text-xs text-muted-foreground flex items-center gap-1 mt-0.5">
                    <Clock className="w-3 h-3" />
                    آخر زحف: {new Date(crawlStatus.lastRun).toLocaleString('ar-SA')}
                  </p>
                )}
              </div>
            </>
          )}
        </div>
        <button
          onClick={() => crawlMutation.mutate()}
          disabled={crawlStatus?.isRunning || crawlMutation.isPending}
          className="flex items-center gap-2 px-4 py-2 bg-primary text-primary-foreground rounded-lg text-sm font-medium hover:bg-primary/90 disabled:opacity-50 transition-colors"
        >
          <RefreshCw className={`w-4 h-4 ${crawlMutation.isPending ? 'animate-spin' : ''}`} />
          زحف الآن
        </button>
      </div>

      {/* التبويبات */}
      <div className="flex flex-wrap gap-2 mb-5">
        {SOURCES.map(s => {
          const Icon = s.icon;
          const count = docs.filter(d => d.category === s.category).length;
          return (
            <button
              key={s.id}
              onClick={() => setActiveTab(s.id)}
              className={`flex items-center gap-2 px-4 py-2.5 rounded-lg text-sm font-medium transition-colors border ${
                activeTab === s.id
                  ? 'bg-primary text-primary-foreground border-primary'
                  : 'bg-card border-border text-foreground hover:bg-muted'
              }`}
            >
              <Icon className="w-4 h-4" />
              {s.label}
              <span className={`text-xs px-1.5 py-0.5 rounded-full font-bold ${
                activeTab === s.id ? 'bg-white/20' : 'bg-muted'
              }`}>
                {count}
              </span>
            </button>
          );
        })}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
        {/* الوثائق المفهرسة */}
        <div className="lg:col-span-2 bg-card border border-border rounded-xl overflow-hidden">
          <div className="px-5 py-4 border-b border-border">
            <h2 className="font-bold text-foreground text-base">الوثائق المفهرسة — {source.label}</h2>
          </div>

          {docsLoading ? (
            <div className="flex items-center justify-center py-16">
              <RefreshCw className="w-6 h-6 text-muted-foreground animate-spin" />
            </div>
          ) : filteredDocs.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 text-center gap-3 px-6">
              <AlertCircle className="w-10 h-10 text-muted-foreground" />
              <p className="font-medium text-foreground">لا توجد وثائق مفهرسة حتى الآن</p>
              <p className="text-sm text-muted-foreground">
                اضغط "زحف الآن" لجلب محتوى {source.label} من المواقع الرسمية وفهرستها تلقائياً.
              </p>
            </div>
          ) : (
            <div className="divide-y divide-border">
              {filteredDocs.map(doc => (
                <div key={doc.id} className="flex items-start gap-3 px-5 py-3.5 hover:bg-muted/40 transition-colors">
                  <FileText className={`w-4 h-4 mt-0.5 shrink-0 ${source.color}`} />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-foreground truncate">{doc.title}</p>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      {new Date(doc.created_at).toLocaleDateString('ar-SA')}
                    </p>
                  </div>
                  {doc.source_url && (
                    <a
                      href={doc.source_url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="shrink-0 text-muted-foreground hover:text-primary transition-colors"
                      title="المصدر الأصلي"
                    >
                      <ExternalLink className="w-3.5 h-3.5" />
                    </a>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>

        {/* الروابط الرسمية */}
        <div className="space-y-4">
          <div className="bg-card border border-border rounded-xl overflow-hidden">
            <div className="px-5 py-4 border-b border-border">
              <h2 className="font-bold text-foreground text-base">المصادر الرسمية</h2>
            </div>
            <div className="p-4 flex flex-col gap-2">
              {source.links.map(link => (
                <a
                  key={link.url}
                  href={link.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-2 px-4 py-3 bg-muted rounded-lg text-sm text-foreground hover:bg-muted/70 transition-colors group"
                >
                  <ExternalLink className="w-4 h-4 text-muted-foreground group-hover:text-primary shrink-0 transition-colors" />
                  {link.label}
                </a>
              ))}
            </div>
          </div>

          {/* ملاحظة */}
          <div className={`border rounded-xl p-4 ${source.bg}`}>
            <p className="text-xs text-muted-foreground leading-relaxed">
              المواقع الحكومية تمنع التضمين المباشر. يستخدم النظام محرك Tavily لجلب الوثائق وفهرستها تلقائياً في قاعدة المعرفة حتى تكون متاحة للمستخدمين دون الحاجة للوصول المباشر.
            </p>
          </div>
        </div>
      </div>
    </AdminSidebar>
  );
}
