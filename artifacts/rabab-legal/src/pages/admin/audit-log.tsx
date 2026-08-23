import React, { useState } from 'react';
import { AdminSidebar } from '@/components/layout';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui';
import { Search, RefreshCw, Shield, User, CreditCard, MessageSquare, BookOpen, LogIn } from 'lucide-react';

const API_BASE = import.meta.env.BASE_URL.replace(/\/$/, '');

interface LogEntry {
  id: number;
  userId?: number;
  userName?: string;
  userEmail?: string;
  action: string;
  targetType?: string;
  targetId?: string;
  details?: Record<string, unknown>;
  ip?: string;
  createdAt: string;
}

const ACTION_ICONS: Record<string, React.ReactNode> = {
  login: <LogIn className="w-4 h-4 text-blue-500" />,
  logout: <LogIn className="w-4 h-4 text-gray-400" />,
  'payment.verify': <CreditCard className="w-4 h-4 text-green-600" />,
  'payment.initiate': <CreditCard className="w-4 h-4 text-amber-500" />,
  'subscription.create': <Shield className="w-4 h-4 text-primary" />,
  'knowledge.upload': <BookOpen className="w-4 h-4 text-purple-500" />,
  'consultation.create': <MessageSquare className="w-4 h-4 text-secondary" />,
};

const ACTION_LABELS: Record<string, string> = {
  login: 'تسجيل دخول',
  logout: 'تسجيل خروج',
  'payment.verify': 'تأكيد دفع',
  'payment.initiate': 'بدء دفع',
  'subscription.create': 'إنشاء اشتراك',
  'knowledge.upload': 'رفع مستند',
  'consultation.create': 'استشارة جديدة',
  register: 'تسجيل حساب',
};

function getActionColor(action: string) {
  if (action.startsWith('payment')) return 'bg-green-50 border-green-200 text-green-800';
  if (action.startsWith('subscription')) return 'bg-primary/5 border-primary/20 text-primary';
  if (action === 'login' || action === 'register') return 'bg-blue-50 border-blue-200 text-blue-800';
  if (action === 'logout') return 'bg-muted/50 border-border text-muted-foreground';
  if (action.startsWith('knowledge')) return 'bg-purple-50 border-purple-200 text-purple-800';
  return 'bg-amber-50 border-amber-200 text-amber-800';
}

export default function AdminAuditLog() {
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(false);

  const fetchLogs = async (p = page, s = search) => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ page: String(p), search: s });
      const res = await fetch(`${API_BASE}/api/admin/audit-log?${params}`, { credentials: 'include' });
      const data = await res.json();
      setLogs(data.logs ?? []);
      setTotal(data.total ?? 0);
    } finally {
      setLoading(false);
    }
  };

  React.useEffect(() => { fetchLogs(1, ''); }, []);

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    setPage(1);
    fetchLogs(1, search);
  };

  return (
    <AdminSidebar>
      <div className="mb-6 flex items-center justify-between flex-wrap gap-4">
        <div>
          <h1 className="text-2xl font-bold text-primary">سجل التدقيق</h1>
          <p className="text-muted-foreground mt-1 text-sm">سجل شامل لكل العمليات ({total} إجمالاً)</p>
        </div>
        <button
          onClick={() => fetchLogs(page, search)}
          className="flex items-center gap-2 px-4 py-2 rounded-lg border border-border hover:bg-muted text-sm font-medium"
        >
          <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
          تحديث
        </button>
      </div>

      {/* Search */}
      <form onSubmit={handleSearch} className="mb-6 flex gap-2">
        <div className="relative flex-1">
          <Search className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="بحث في الإجراءات، IP، النوع..."
            className="w-full h-10 rounded-lg border border-input bg-background pr-10 pl-4 text-sm focus:outline-none focus:ring-2 focus:ring-primary/40"
          />
        </div>
        <button type="submit" className="px-4 py-2 bg-primary text-primary-foreground rounded-lg text-sm font-medium hover:bg-primary/90">
          بحث
        </button>
      </form>

      <Card className="border-border/50">
        <CardContent className="p-0">
          {loading ? (
            <div className="flex items-center justify-center py-20">
              <RefreshCw className="w-6 h-6 animate-spin text-primary/50" />
            </div>
          ) : logs.length === 0 ? (
            <div className="text-center py-20 text-muted-foreground">
              <Shield className="w-12 h-12 mx-auto mb-3 opacity-20" />
              <p>لا توجد سجلات بعد</p>
            </div>
          ) : (
            <div className="divide-y divide-border/50">
              {logs.map(log => (
                <div key={log.id} className="px-6 py-4 flex items-start gap-4 hover:bg-muted/30 transition-colors">
                  <div className="mt-1 shrink-0">
                    {ACTION_ICONS[log.action] ?? <Shield className="w-4 h-4 text-muted-foreground" />}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-bold border ${getActionColor(log.action)}`}>
                        {ACTION_LABELS[log.action] ?? log.action}
                      </span>
                      {log.targetType && (
                        <span className="text-xs text-muted-foreground bg-muted px-2 py-0.5 rounded-full">
                          {log.targetType} #{log.targetId}
                        </span>
                      )}
                    </div>
                    <div className="mt-1 flex items-center gap-3 text-xs text-muted-foreground flex-wrap">
                      {log.userName && (
                        <span className="flex items-center gap-1">
                          <User className="w-3 h-3" />
                          {log.userName} ({log.userEmail})
                        </span>
                      )}
                      {log.ip && <span>IP: {log.ip}</span>}
                    </div>
                    {log.details && Object.keys(log.details).length > 0 && (
                      <div className="mt-1 text-xs text-muted-foreground/70 font-mono bg-muted/50 px-2 py-1 rounded truncate">
                        {JSON.stringify(log.details)}
                      </div>
                    )}
                  </div>
                  <div className="text-xs text-muted-foreground shrink-0 text-left">
                    {new Date(log.createdAt).toLocaleString('ar-SA')}
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Pagination */}
      {total > 50 && (
        <div className="mt-4 flex items-center justify-between text-sm">
          <span className="text-muted-foreground">صفحة {page} من {Math.ceil(total / 50)}</span>
          <div className="flex gap-2">
            <button
              disabled={page === 1}
              onClick={() => { const p = page - 1; setPage(p); fetchLogs(p, search); }}
              className="px-3 py-1 rounded border border-border hover:bg-muted disabled:opacity-40"
            >السابق</button>
            <button
              disabled={page >= Math.ceil(total / 50)}
              onClick={() => { const p = page + 1; setPage(p); fetchLogs(p, search); }}
              className="px-3 py-1 rounded border border-border hover:bg-muted disabled:opacity-40"
            >التالي</button>
          </div>
        </div>
      )}
    </AdminSidebar>
  );
}
