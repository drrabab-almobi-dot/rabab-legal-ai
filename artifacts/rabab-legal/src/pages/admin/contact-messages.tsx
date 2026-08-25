import React, { useState, useEffect } from 'react';
import { AdminSidebar } from '@/components/layout';
import { Card, CardContent, FramedState } from '@/components/ui';
import { Mail, CheckCircle2, AlertTriangle, RefreshCw, Inbox } from 'lucide-react';
import { useLang } from '@/hooks/use-language';

const API_BASE = import.meta.env.BASE_URL.replace(/\/$/, '');

interface ContactMessage {
  id: number;
  name: string;
  email: string;
  message: string;
  emailSent: boolean;
  createdAt: string;
}

function formatDate(iso: string, lang: 'ar' | 'en') {
  return new Date(iso).toLocaleString(lang === 'ar' ? 'ar-SA' : 'en-US', {
    year: 'numeric', month: 'short', day: 'numeric',
    hour: '2-digit', minute: '2-digit',
  });
}

export default function AdminContactMessages() {
  const { lang, t } = useLang();
  const [messages, setMessages] = useState<ContactMessage[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchMessages = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`${API_BASE}/api/admin/contact-messages`, { credentials: 'include' });
      if (!res.ok) throw new Error('فشل تحميل الرسائل');
      const data = await res.json();
      setMessages(Array.isArray(data) ? data : []);
    } catch (err: any) {
      setError(err.message ?? 'خطأ غير متوقع');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchMessages(); }, []);

  const emailSentCount = messages.filter(m => m.emailSent).length;
  const emailFailedCount = messages.length - emailSentCount;

  return (
    <AdminSidebar><div dir={lang === 'ar' ? 'rtl' : 'ltr'}>
      {/* Header */}
      <div className="mb-6 flex items-center justify-between flex-wrap gap-4">
        <div>
          <h1 className="text-2xl font-bold text-primary flex items-center gap-2">
            <Inbox className="w-6 h-6" />
            {t('رسائل التواصل', 'Contact messages')}
          </h1>
          <p className="text-muted-foreground mt-1 text-sm">
            {t('الرسائل الواردة من نموذج التواصل في الموقع', 'Messages received from the website contact form')}
          </p>
        </div>
        <button
          onClick={fetchMessages}
          className="flex items-center gap-2 px-4 py-2 border border-border rounded-lg text-sm hover:bg-muted transition-colors"
        >
          <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
          {t('تحديث', 'Refresh')}
        </button>
      </div>

      {/* Summary cards */}
      {!loading && messages.length > 0 && (
        <div className="grid grid-cols-1 gap-4 mb-6 sm:grid-cols-3">
          <div className="bg-card border border-border rounded-xl p-4 text-center">
            <p className="text-3xl font-bold text-primary">{messages.length}</p>
            <p className="text-sm text-muted-foreground mt-1">{t('إجمالي الرسائل', 'Total messages')}</p>
          </div>
          <div className="bg-green-50 border border-green-200 rounded-xl p-4 text-center">
            <p className="text-3xl font-bold text-green-700">{emailSentCount}</p>
            <p className="text-sm text-green-600 mt-1">{t('أُرسل إشعار بريدي', 'Email notification sent')}</p>
          </div>
          <div className={`border rounded-xl p-4 text-center ${emailFailedCount > 0 ? 'bg-red-50 border-red-200' : 'bg-card border-border'}`}>
            <p className={`text-3xl font-bold ${emailFailedCount > 0 ? 'text-red-700' : 'text-muted-foreground'}`}>{emailFailedCount}</p>
            <p className={`text-sm mt-1 ${emailFailedCount > 0 ? 'text-red-600' : 'text-muted-foreground'}`}>{t('فشل إرسال الإشعار', 'Notification failed')}</p>
          </div>
        </div>
      )}

      {/* Content */}
      {loading ? (
        <FramedState tone="loading" icon={<RefreshCw className="h-7 w-7 animate-spin text-secondary" />} title={t('جارٍ تحميل الرسائل...', 'Loading messages…')} className="min-h-52" />
      ) : error ? (
        <div className="flex items-center gap-3 px-4 py-3 rounded-lg bg-red-50 border border-red-200 text-red-800 text-sm">
          <AlertTriangle className="w-4 h-4 shrink-0" />
          {error}
        </div>
      ) : messages.length === 0 ? (
        <FramedState
          icon={<Inbox className="h-8 w-8 text-secondary/70" />}
          title={t('لا توجد رسائل بعد.', 'No messages yet.')}
          description={t('ستظهر هنا الرسائل الواردة من نموذج التواصل.', 'Messages from the contact form will appear here.')}
          className="min-h-52"
        />
      ) : (
        <div className="space-y-4">
          {messages.map(msg => (
            <Card key={msg.id} className="border border-border/60">
              <CardContent className="p-5">
                <div className="flex items-start justify-between gap-4 flex-wrap">
                  {/* Sender info */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-3 mb-2 flex-wrap">
                      <span dir="auto" className="font-bold text-base text-foreground">{msg.name}</span>
                      <a
                        href={`mailto:${msg.email}`}
                        className="flex items-center gap-1 text-sm text-primary hover:underline"
                        dir="ltr"
                      >
                        <Mail className="w-3.5 h-3.5" />
                        {msg.email}
                      </a>
                    </div>

                    {/* Message body */}
                    <p dir="auto" className="text-sm text-foreground leading-relaxed whitespace-pre-wrap bg-muted/40 rounded-lg px-4 py-3 border border-border/40">
                      {msg.message}
                    </p>

                    <p className="text-xs text-muted-foreground mt-2">
                      {formatDate(msg.createdAt, lang)}
                    </p>
                  </div>

                  {/* Email sent badge */}
                  <div className="shrink-0">
                    {msg.emailSent ? (
                      <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold bg-green-50 text-green-700 border border-green-200">
                        <CheckCircle2 className="w-3.5 h-3.5" />
                        {t('أُرسل إشعار', 'Notification sent')}
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold bg-red-50 text-red-700 border border-red-200">
                        <AlertTriangle className="w-3.5 h-3.5" />
                        {t('فشل الإشعار', 'Notification failed')}
                      </span>
                    )}
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div></AdminSidebar>
  );
}
