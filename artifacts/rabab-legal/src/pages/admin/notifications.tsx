import React, { useState, useEffect } from 'react';
import { AdminSidebar } from '@/components/layout';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui';
import {
  Bell, Plus, Send, Trash2, CheckCircle2, Clock, AlertTriangle,
  Info, RefreshCw, Megaphone, Mail, MessageSquare, Users,
  BarChart2, TrendingUp, CalendarDays, Phone,
} from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { useLang } from '@/hooks/use-language';

const API_BASE = import.meta.env.BASE_URL.replace(/\/$/, '');

interface Notification {
  id: number;
  titleAr: string;
  titleEn?: string;
  bodyAr: string;
  bodyEn?: string;
  type: 'update' | 'alert' | 'info' | 'legal_change';
  isPublished: boolean;
  publishedAt?: string;
  createdAt: string;
}

const TYPE_CONFIG = {
  update:       { ar: 'تحديث', en: 'Update', icon: <RefreshCw className="w-4 h-4" />, color: 'bg-blue-50 text-blue-700 border-blue-200' },
  alert:        { ar: 'تنبيه', en: 'Alert', icon: <AlertTriangle className="w-4 h-4" />, color: 'bg-red-50 text-red-700 border-red-200' },
  info:         { ar: 'معلومة', en: 'Information', icon: <Info className="w-4 h-4" />, color: 'bg-gray-50 text-gray-700 border-gray-200' },
  legal_change: { ar: 'تعديل قانوني', en: 'Legal change', icon: <Bell className="w-4 h-4" />, color: 'bg-amber-50 text-amber-700 border-amber-200' },
};

// ─── Reminder type labels ─────────────────────────────────────────────────────
const REMINDER_TYPE_LABELS: Record<string, string> = {
  '3_days_before_expiry': 'قبل 3 أيام من الانتهاء',
  '7_days_before_expiry': 'قبل 7 أيام من الانتهاء',
  'after_expiry': 'بعد انتهاء الاشتراك',
};

function reminderTypeLabel(type: string, translate: (ar: string, en: string) => string): string {
  const en: Record<string, string> = {
    '3_days_before_expiry': '3 days before expiry',
    '7_days_before_expiry': '7 days before expiry',
    'after_expiry': 'After subscription expiry',
  };
  return REMINDER_TYPE_LABELS[type] ? translate(REMINDER_TYPE_LABELS[type], en[type]) : type;
}

// ─── Reminder Stats panel ─────────────────────────────────────────────────────
interface ReminderStats {
  sentThisMonth: number;
  totalSent: number;
  afterExpirySent: number;
  converted: number;
  conversionRate: number;
  byType: { reminderType: string; cnt: number }[];
  recent: {
    id: number;
    reminderType: string;
    sentAt: string;
    subscriptionId: number;
    userName: string;
    userEmail: string;
    hasPhone: boolean;
    subStatus: string;
    subEndDate: string | null;
  }[];
}

function ReminderStatsPanel() {
  const { lang, t } = useLang();
  const [stats, setStats] = useState<ReminderStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`${API_BASE}/api/admin/reminder-stats`, { credentials: 'include' });
      if (!res.ok) throw new Error('فشل تحميل الإحصائيات');
      setStats(await res.json());
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <RefreshCw className="w-6 h-6 animate-spin text-primary/50" />
      </div>
    );
  }

  if (error || !stats) {
    return (
      <div className="flex flex-col items-center gap-3 py-20 text-muted-foreground">
        <AlertTriangle className="w-8 h-8 text-destructive/50" />
        <p>{error ?? t('لا توجد بيانات', 'No data')}</p>
        <button onClick={load} className="text-sm text-primary underline">{t('إعادة المحاولة', 'Try again')}</button>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Summary cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-2 mb-1 text-muted-foreground text-xs">
              <CalendarDays className="w-4 h-4" />
               {t('تذكيرات هذا الشهر', 'Reminders this month')}
            </div>
            <p className="text-3xl font-bold text-primary">{stats.sentThisMonth}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-2 mb-1 text-muted-foreground text-xs">
              <Bell className="w-4 h-4" />
               {t('إجمالي التذكيرات', 'Total reminders')}
            </div>
            <p className="text-3xl font-bold text-primary">{stats.totalSent}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-2 mb-1 text-muted-foreground text-xs">
              <Users className="w-4 h-4" />
               {t('مُذكَّرون بعد الانتهاء', 'Reminded after expiry')}
            </div>
            <p className="text-3xl font-bold text-primary">{stats.afterExpirySent}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-2 mb-1 text-muted-foreground text-xs">
              <TrendingUp className="w-4 h-4" />
               {t('نسبة التجديد بعد التذكير', 'Renewal rate after reminder')}
            </div>
            <p className="text-3xl font-bold text-green-600">{stats.conversionRate}%</p>
            <p className="text-xs text-muted-foreground mt-0.5">{stats.converted} {t('من', 'of')} {stats.afterExpirySent}</p>
          </CardContent>
        </Card>
      </div>

      {/* Breakdown by type */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <BarChart2 className="w-4 h-4 text-primary" />
             {t('توزيع التذكيرات حسب النوع', 'Reminders by type')}
          </CardTitle>
        </CardHeader>
        <CardContent>
          {stats.byType.length === 0 ? (
             <p className="text-sm text-muted-foreground">{t('لا توجد بيانات بعد', 'No data yet')}</p>
          ) : (
            <div className="space-y-3">
              {stats.byType.map(row => {
                const pct = stats.totalSent > 0 ? Math.round((row.cnt / stats.totalSent) * 100) : 0;
                return (
                  <div key={row.reminderType}>
                    <div className="flex justify-between text-sm mb-1">
                      <span className="font-medium">{reminderTypeLabel(row.reminderType, t)}</span>
                      <span className="text-muted-foreground">{row.cnt} ({pct}%)</span>
                    </div>
                    <div className="h-2 rounded-full bg-muted overflow-hidden">
                      <div
                        className="h-full rounded-full bg-primary/70 transition-all"
                        style={{ width: `${pct}%` }}
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Recent reminders table */}
      <Card>
        <CardHeader className="pb-3 flex flex-row items-center justify-between">
          <CardTitle className="text-base flex items-center gap-2">
            <Clock className="w-4 h-4 text-primary" />
             {t('آخر 20 تذكير مُرسَل', 'Last 20 sent reminders')}
          </CardTitle>
          <button
            onClick={load}
            className="flex items-center gap-1 text-xs text-muted-foreground hover:text-primary transition-colors"
          >
             <RefreshCw className="w-3.5 h-3.5" /> {t('تحديث', 'Refresh')}
          </button>
        </CardHeader>
        <CardContent className="p-0">
          {stats.recent.length === 0 ? (
             <p className="text-sm text-muted-foreground px-5 py-4">{t('لا توجد تذكيرات بعد', 'No reminders yet')}</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b bg-muted/30 text-muted-foreground text-xs">
                    <th className="px-4 py-2.5 text-start font-medium">{t('المستخدم', 'User')}</th>
                    <th className="px-4 py-2.5 text-start font-medium">{t('نوع التذكير', 'Reminder type')}</th>
                    <th className="px-4 py-2.5 text-start font-medium">{t('القناة', 'Channel')}</th>
                    <th className="px-4 py-2.5 text-start font-medium">{t('حالة الاشتراك', 'Subscription status')}</th>
                    <th className="px-4 py-2.5 text-start font-medium">{t('تاريخ الإرسال', 'Sent at')}</th>
                  </tr>
                </thead>
                <tbody>
                  {stats.recent.map((r, i) => (
                    <tr key={r.id} className={`border-b last:border-0 ${i % 2 === 0 ? '' : 'bg-muted/10'}`}>
                      <td className="px-4 py-3">
                        <p className="font-medium text-foreground">{r.userName}</p>
                        <p className="text-xs text-muted-foreground">{r.userEmail}</p>
                      </td>
                      <td className="px-4 py-3 text-muted-foreground">
                        {reminderTypeLabel(r.reminderType, t)}
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-1.5 flex-wrap">
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-blue-50 text-blue-700 border border-blue-200 rounded-full text-xs">
                            <Mail className="w-3 h-3" /> {t('بريد', 'Email')}
                          </span>
                          {r.hasPhone && (
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-green-50 text-green-700 border border-green-200 rounded-full text-xs">
                              <Phone className="w-3 h-3" /> WhatsApp
                            </span>
                          )}
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        {r.subStatus === 'active' ? (
                          <span className="inline-flex items-center gap-1 text-xs text-green-700 bg-green-50 border border-green-200 px-2 py-0.5 rounded-full">
                            <CheckCircle2 className="w-3 h-3" /> {t('فعّال', 'Active')}
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 text-xs text-red-700 bg-red-50 border border-red-200 px-2 py-0.5 rounded-full">
                            <AlertTriangle className="w-3 h-3" /> {t('منتهٍ', 'Expired')}
                          </span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-xs text-muted-foreground whitespace-nowrap">
                         {new Date(r.sentAt).toLocaleString(lang === 'ar' ? 'ar-SA' : 'en-US')}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

// ─── Broadcast panel ─────────────────────────────────────────────────────────
function BroadcastPanel() {
  const { toast } = useToast();
  const { t } = useLang();
  const [sending, setSending] = useState(false);
  const [result, setResult] = useState<{ sent: number; failed: number; total: number } | null>(null);

  const [form, setForm] = useState({
    subject: '',
    message: '',
    channels: ['email'] as string[],
    segment: 'all' as 'all' | 'active' | 'expired',
  });

  const toggleChannel = (ch: string) => {
    setForm(f => ({
      ...f,
      channels: f.channels.includes(ch) ? f.channels.filter(c => c !== ch) : [...f.channels, ch],
    }));
  };

  const handleSend = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.subject.trim() || !form.message.trim()) {
      toast({ variant: 'destructive', title: t('خطأ', 'Error'), description: t('العنوان والرسالة مطلوبان', 'Subject and message are required') });
      return;
    }
    if (form.channels.length === 0) {
      toast({ variant: 'destructive', title: t('خطأ', 'Error'), description: t('اختر قناة واحدة على الأقل', 'Select at least one channel') });
      return;
    }

    const segmentLabel = form.segment === 'all' ? t('جميع المستخدمين', 'all users') : form.segment === 'active' ? t('المشتركين الفعّالين', 'active subscribers') : t('المشتركين المنتهين', 'expired subscribers');
    if (!confirm(t(`سيتم إرسال الرسالة إلى ${segmentLabel}. هل تريدين المتابعة؟`, `The message will be sent to ${segmentLabel}. Continue?`))) return;

    setSending(true);
    setResult(null);
    try {
      const res = await fetch(`${API_BASE}/api/admin/broadcast`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? 'فشل الإرسال');
      setResult(data);
      toast({ title: `✅ ${t('اكتمل البث', 'Broadcast complete')}`, description: `${t('Sent to', 'Sent to')} ${data.sent} ${t('من', 'of')} ${data.total}` });
    } catch (err: any) {
      toast({ variant: 'destructive', title: t('خطأ', 'Error'), description: err.message });
    } finally {
      setSending(false);
    }
  };

  const SEGMENT_OPTS = [
    { value: 'all', ar: 'جميع المستخدمين', en: 'All users', icon: <Users className="w-4 h-4" /> },
    { value: 'active', ar: 'المشتركون الفعّالون', en: 'Active subscribers', icon: <CheckCircle2 className="w-4 h-4" /> },
    { value: 'expired', ar: 'الاشتراكات المنتهية', en: 'Expired subscriptions', icon: <Clock className="w-4 h-4" /> },
  ];

  return (
    <Card className="mb-6 border-amber-200">
      <CardHeader className="pb-3">
        <CardTitle className="text-lg flex items-center gap-2">
          <Megaphone className="w-5 h-5 text-amber-600" />
           {t('إرسال إشعار جماعي', 'Send a broadcast notification')}
        </CardTitle>
         <p className="text-sm text-muted-foreground">{t('إرسال بريد إلكتروني أو واتساب لشريحة من المستخدمين', 'Send email or WhatsApp to a user segment')}</p>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSend} className="space-y-4">
          {/* Segment */}
          <div>
             <label className="text-sm font-bold block mb-2">{t('الشريحة المستهدفة', 'Target segment')}</label>
            <div className="flex gap-2 flex-wrap">
              {SEGMENT_OPTS.map(opt => (
                <button
                  key={opt.value}
                  type="button"
                  onClick={() => setForm(f => ({ ...f, segment: opt.value as any }))}
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium border transition-colors ${
                    form.segment === opt.value
                      ? 'bg-primary text-primary-foreground border-primary'
                      : 'bg-background border-border hover:bg-muted'
                  }`}
                >
                  {opt.icon} {t(opt.ar, opt.en)}
                </button>
              ))}
            </div>
          </div>

          {/* Channels */}
          <div>
             <label className="text-sm font-bold block mb-2">{t('قنوات الإرسال', 'Delivery channels')}</label>
            <div className="flex gap-3">
              {[
                { id: 'email', ar: 'بريد إلكتروني', en: 'Email', icon: <Mail className="w-4 h-4" /> },
                { id: 'whatsapp', ar: 'واتساب', en: 'WhatsApp', icon: <MessageSquare className="w-4 h-4" /> },
              ].map(ch => (
                <label key={ch.id} className="flex items-center gap-2 cursor-pointer select-none">
                  <input
                    type="checkbox"
                    checked={form.channels.includes(ch.id)}
                    onChange={() => toggleChannel(ch.id)}
                    className="w-4 h-4 accent-primary"
                  />
                  <span className="flex items-center gap-1 text-sm font-medium">{ch.icon} {t(ch.ar, ch.en)}</span>
                </label>
              ))}
            </div>
            {form.channels.includes('whatsapp') && (
              <p className="text-xs text-muted-foreground mt-1">
                ⚠️ {t('يتطلب واتساب إعداد متغيرات TWILIO_ACCOUNT_SID و TWILIO_AUTH_TOKEN و TWILIO_WHATSAPP_FROM في الخادم', 'WhatsApp requires TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, and TWILIO_WHATSAPP_FROM server variables')}
              </p>
            )}
          </div>

          {/* Subject */}
          <div>
             <label className="text-sm font-bold block mb-1">{t('عنوان البريد الإلكتروني *', 'Email subject *')}</label>
            <input
              value={form.subject}
              onChange={e => setForm(f => ({ ...f, subject: e.target.value }))}
              className="w-full h-10 rounded-lg border border-input bg-background px-3 text-sm focus:outline-none focus:ring-2 focus:ring-primary/40"
              placeholder={t('مثال: إعلان مهم من منصة رباب', 'Example: Important announcement from Rabab')}
            />
          </div>

          {/* Message */}
          <div>
             <label className="text-sm font-bold block mb-1">{t('نص الرسالة *', 'Message *')} <span className="text-muted-foreground font-normal">{t('(يُستخدم للبريد والواتساب)', '(used for email and WhatsApp)')}</span></label>
            <textarea
              value={form.message}
              onChange={e => setForm(f => ({ ...f, message: e.target.value }))}
              rows={5}
              className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/40"
              placeholder={t('اكتبي نص الرسالة هنا...', 'Write the message here...')}
            />
          </div>

          {/* Result */}
          {result && (
            <div className={`flex items-center gap-3 px-4 py-3 rounded-lg text-sm font-medium border ${
              result.failed === 0 ? 'bg-green-50 border-green-200 text-green-800' : 'bg-amber-50 border-amber-200 text-amber-800'
            }`}>
              <CheckCircle2 className="w-4 h-4 shrink-0" />
              {t('أُرسل إلى', 'Sent to')} <strong>{result.sent}</strong> {t('من أصل', 'of')} <strong>{result.total}</strong>
              {result.failed > 0 && <span className="text-red-600"> · {t('فشل', 'Failed')} {result.failed}</span>}
            </div>
          )}

          <div className="flex gap-3 pt-1">
            <button
              type="submit"
              disabled={sending}
              className="flex items-center gap-2 px-5 py-2 bg-amber-600 text-white rounded-lg text-sm font-bold hover:bg-amber-700 disabled:opacity-50 shadow-sm"
            >
              {sending ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
               {sending ? t('جارٍ الإرسال…', 'Sending…') : t('إرسال الآن', 'Send now')}
            </button>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}

// ─── Main page ────────────────────────────────────────────────────────────────
export default function AdminNotifications() {
  const { toast } = useToast();
  const { lang, t } = useLang();
  const [notifs, setNotifs] = useState<Notification[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [activeTab, setActiveTab] = useState<'system' | 'broadcast' | 'stats'>('system');

  const [form, setForm] = useState({
    titleAr: '', titleEn: '', bodyAr: '', bodyEn: '',
    type: 'info' as Notification['type'], publish: false,
  });

  const fetchNotifs = async () => {
    setLoading(true);
    try {
      const res = await fetch(`${API_BASE}/api/admin/notifications`, { credentials: 'include' });
      const data = await res.json();
      setNotifs(Array.isArray(data) ? data : []);
    } finally { setLoading(false); }
  };

  useEffect(() => { fetchNotifs(); }, []);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.titleAr || !form.bodyAr) {
      toast({ variant: 'destructive', title: t('خطأ', 'Error'), description: t('العنوان بالعربي والنص مطلوبان', 'Arabic title and body are required') });
      return;
    }
    setSubmitting(true);
    try {
      const res = await fetch(`${API_BASE}/api/admin/notifications`, {
        method: 'POST', credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      });
      if (!res.ok) throw new Error(t('فشل الإنشاء', 'Creation failed'));
      toast({ title: `✅ ${t('تم', 'Done')}`, description: form.publish ? t('تم إنشاء الإشعار ونشره للمستخدمين', 'The notification was created and published') : t('تم إنشاء الإشعار كمسودة', 'The notification was created as a draft') });
      setForm({ titleAr: '', titleEn: '', bodyAr: '', bodyEn: '', type: 'info', publish: false });
      setShowForm(false);
      fetchNotifs();
    } catch (err: any) {
      toast({ variant: 'destructive', title: t('خطأ', 'Error'), description: err.message });
    } finally { setSubmitting(false); }
  };

  const handlePublish = async (id: number) => {
    await fetch(`${API_BASE}/api/admin/notifications/${id}/publish`, { method: 'POST', credentials: 'include' });
    toast({ title: `✅ ${t('تم النشر', 'Published')}`, description: t('تم إرسال الإشعار لجميع المستخدمين', 'The notification was sent to all users') });
    fetchNotifs();
  };

  const handleDelete = async (id: number) => {
    if (!confirm(t('هل تريدين حذف هذا الإشعار؟', 'Do you want to delete this notification?'))) return;
    await fetch(`${API_BASE}/api/admin/notifications/${id}`, { method: 'DELETE', credentials: 'include' });
    fetchNotifs();
  };

  return (
    <AdminSidebar>
      <div dir={lang === 'ar' ? 'rtl' : 'ltr'}>
      <div className="mb-6 flex items-center justify-between flex-wrap gap-4">
        <div>
           <h1 className="text-2xl font-bold text-primary">{t('الإشعارات', 'Notifications')}</h1>
           <p className="text-muted-foreground mt-1 text-sm">{t('إشعارات قانونية للمستخدمين والبث الجماعي عبر البريد والواتساب', 'Legal notifications and email/WhatsApp broadcasts')}</p>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 mb-6 bg-muted/50 rounded-xl p-1 w-fit flex-wrap">
        {[
          { id: 'system', ar: 'الإشعارات القانونية', en: 'Legal notifications', icon: <Bell className="w-4 h-4" /> },
          { id: 'broadcast', ar: 'إشعار جماعي', en: 'Broadcast', icon: <Megaphone className="w-4 h-4" /> },
          { id: 'stats', ar: 'إحصائيات التذكيرات', en: 'Reminder statistics', icon: <BarChart2 className="w-4 h-4" /> },
        ].map(tab => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id as any)}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
              activeTab === tab.id
                ? 'bg-background text-primary shadow-sm'
                : 'text-muted-foreground hover:text-foreground'
            }`}
          >
            {tab.icon} {t(tab.ar, tab.en)}
          </button>
        ))}
      </div>

      {/* Broadcast tab */}
      {activeTab === 'broadcast' && <BroadcastPanel />}

      {/* Reminder stats tab */}
      {activeTab === 'stats' && <ReminderStatsPanel />}

      {/* System notifications tab */}
      {activeTab === 'system' && (
        <>
          <div className="mb-4 flex justify-end">
            <button
              onClick={() => setShowForm(!showForm)}
              className="flex items-center gap-2 px-4 py-2 bg-primary text-primary-foreground rounded-lg text-sm font-bold hover:bg-primary/90 shadow"
            >
               <Plus className="w-4 h-4" /> {t('إشعار جديد', 'New notification')}
            </button>
          </div>

          {/* Create Form */}
          {showForm && (
            <Card className="mb-6 border-primary/30">
               <CardHeader><CardTitle className="text-lg">{t('إشعار جديد', 'New notification')}</CardTitle></CardHeader>
              <CardContent>
                <form onSubmit={handleCreate} className="space-y-4">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="space-y-1">
                       <label className="text-sm font-bold">{t('العنوان بالعربي *', 'Arabic title *')}</label>
                      <input value={form.titleAr} onChange={e => setForm(f => ({ ...f, titleAr: e.target.value }))}
                        className="w-full h-10 rounded-lg border border-input bg-background px-3 text-sm focus:outline-none focus:ring-2 focus:ring-primary/40"
                        placeholder={t('مثال: تعديل نظام العمل السعودي', 'Example: Saudi Labor Law amendment')} />
                    </div>
                    <div className="space-y-1">
                       <label className="text-sm font-bold">{t('العنوان بالإنجليزي', 'English title')}</label>
                      <input value={form.titleEn} onChange={e => setForm(f => ({ ...f, titleEn: e.target.value }))}
                        className="w-full h-10 rounded-lg border border-input bg-background px-3 text-sm focus:outline-none focus:ring-2 focus:ring-primary/40 text-left"
                        dir="ltr" placeholder="e.g. Saudi Labor Law Amendment" />
                    </div>
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="space-y-1">
                       <label className="text-sm font-bold">{t('النص بالعربي *', 'Arabic body *')}</label>
                      <textarea value={form.bodyAr} onChange={e => setForm(f => ({ ...f, bodyAr: e.target.value }))}
                        rows={3}
                        className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/40"
                        placeholder={t('وصف التعديل القانوني وتأثيره...', 'Describe the legal amendment and its impact...')} />
                    </div>
                    <div className="space-y-1">
                       <label className="text-sm font-bold">{t('النص بالإنجليزي', 'English body')}</label>
                      <textarea value={form.bodyEn} onChange={e => setForm(f => ({ ...f, bodyEn: e.target.value }))}
                        rows={3} dir="ltr"
                        className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/40 text-left"
                        placeholder="Describe the legal amendment..." />
                    </div>
                  </div>
                  <div className="flex items-center gap-4 flex-wrap">
                    <div className="space-y-1">
                       <label className="text-sm font-bold">{t('النوع', 'Type')}</label>
                      <select value={form.type} onChange={e => setForm(f => ({ ...f, type: e.target.value as any }))}
                        className="h-10 rounded-lg border border-input bg-background px-3 text-sm focus:outline-none">
                        <option value="legal_change">{t('تعديل قانوني 🔔', 'Legal change 🔔')}</option>
                        <option value="alert">{t('تنبيه ⚠️', 'Alert ⚠️')}</option>
                        <option value="update">{t('تحديث ℹ️', 'Update ℹ️')}</option>
                        <option value="info">{t('معلومة', 'Information')}</option>
                      </select>
                    </div>
                    <label className="flex items-center gap-2 cursor-pointer mt-5">
                      <input type="checkbox" checked={form.publish}
                        onChange={e => setForm(f => ({ ...f, publish: e.target.checked }))}
                        className="w-4 h-4 accent-primary" />
                      <span className="text-sm font-medium">{t('نشر فوري لجميع المستخدمين', 'Publish immediately to all users')}</span>
                    </label>
                  </div>
                  <div className="flex gap-3">
                    <button type="submit" disabled={submitting}
                      className="flex items-center gap-2 px-5 py-2 bg-primary text-primary-foreground rounded-lg text-sm font-bold hover:bg-primary/90 disabled:opacity-50">
                      {submitting ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
                       {t('إنشاء الإشعار', 'Create notification')}
                    </button>
                    <button type="button" onClick={() => setShowForm(false)}
                      className="px-4 py-2 rounded-lg border border-border text-sm hover:bg-muted">
                       {t('إلغاء', 'Cancel')}
                    </button>
                  </div>
                </form>
              </CardContent>
            </Card>
          )}

          {/* List */}
          {loading ? (
            <div className="flex items-center justify-center py-20"><RefreshCw className="w-6 h-6 animate-spin text-primary/50" /></div>
          ) : notifs.length === 0 ? (
            <div className="text-center py-20 text-muted-foreground">
              <Bell className="w-12 h-12 mx-auto mb-3 opacity-20" />
               <p>{t('لا توجد إشعارات بعد. أنشئي أول إشعار قانوني.', 'No notifications yet. Create the first legal notification.')}</p>
            </div>
          ) : (
            <div className="space-y-4">
              {notifs.map(n => {
                const cfg = TYPE_CONFIG[n.type];
                return (
                  <Card key={n.id} className={`border ${n.isPublished ? 'border-green-200' : 'border-border/50'}`}>
                    <CardContent className="p-5">
                      <div className="flex items-start justify-between gap-4">
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 mb-1 flex-wrap">
                            <span className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-bold border ${cfg.color}`}>
                               {cfg.icon} {t(cfg.ar, cfg.en)}
                            </span>
                            {n.isPublished ? (
                              <span className="inline-flex items-center gap-1 text-xs text-green-700 bg-green-50 border border-green-200 px-2 py-0.5 rounded-full">
                                 <CheckCircle2 className="w-3 h-3" /> {t('منشور', 'Published')}
                              </span>
                            ) : (
                              <span className="inline-flex items-center gap-1 text-xs text-amber-700 bg-amber-50 border border-amber-200 px-2 py-0.5 rounded-full">
                                 <Clock className="w-3 h-3" /> {t('مسودة', 'Draft')}
                              </span>
                            )}
                          </div>
                           <h3 className="font-bold text-primary text-base">{lang === 'ar' ? n.titleAr : (n.titleEn || n.titleAr)}</h3>
                           {lang === 'ar' && n.titleEn && <p className="text-sm text-muted-foreground" dir="ltr">{n.titleEn}</p>}
                           <p className="text-sm text-foreground mt-2 leading-relaxed">{lang === 'ar' ? n.bodyAr : (n.bodyEn || n.bodyAr)}</p>
                          <p className="text-xs text-muted-foreground mt-2">
                             {new Date(n.createdAt).toLocaleString(lang === 'ar' ? 'ar-SA' : 'en-US')}
                             {n.publishedAt && ` · ${t('نُشر:', 'Published:')} ${new Date(n.publishedAt).toLocaleString(lang === 'ar' ? 'ar-SA' : 'en-US')}`}
                          </p>
                        </div>
                        <div className="flex gap-2 shrink-0">
                          {!n.isPublished && (
                            <button onClick={() => handlePublish(n.id)}
                              className="flex items-center gap-1 px-3 py-1.5 bg-primary text-primary-foreground rounded-lg text-xs font-bold hover:bg-primary/90">
                               <Send className="w-3 h-3" /> {t('نشر', 'Publish')}
                            </button>
                          )}
                          <button onClick={() => handleDelete(n.id)}
                            className="flex items-center gap-1 px-3 py-1.5 border border-destructive/40 text-destructive rounded-lg text-xs hover:bg-destructive/10">
                            <Trash2 className="w-3 h-3" />
                          </button>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          )}
        </>
      )}
      </div>
    </AdminSidebar>
  );
}
