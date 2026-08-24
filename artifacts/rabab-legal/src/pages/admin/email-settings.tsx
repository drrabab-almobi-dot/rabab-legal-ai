/**
 * صفحة إعدادات البريد الإلكتروني — Admin Email Settings
 * تعرض حالة البريد الحالية وتسمح بضبط مفتاح Resend API وعنوان المُرسِل
 * مع زر اختبار الإرسال للتحقق من الضبط.
 */
import React, { useState, useEffect } from 'react';
import { AdminSidebar } from '@/components/layout';
import { useToast } from '@/hooks/use-toast';
import {
  Mail, CheckCircle2, XCircle, Loader2, Save, Send, Eye, EyeOff, Info,
} from 'lucide-react';
import { cn } from '@/lib/utils';

const API_BASE = import.meta.env.BASE_URL.replace(/\/$/, '');

interface EmailSettings {
  configured: boolean;
  maskedApiKey: string | null;
  fromAddress: string;
  source: 'db' | 'env' | 'default';
}

interface TestResult {
  success: boolean;
  message: string;
}

export default function AdminEmailSettings() {
  const { toast } = useToast();

  const [settings, setSettings] = useState<EmailSettings | null>(null);
  const [loading, setLoading] = useState(true);

  const [apiKey, setApiKey] = useState('');
  const [fromAddress, setFromAddress] = useState('');
  const [showKey, setShowKey] = useState(false);
  const [saving, setSaving] = useState(false);

  const [testEmail, setTestEmail] = useState('');
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<TestResult | null>(null);

  // ── Load current settings ──────────────────────────────────────────────────
  useEffect(() => {
    (async () => {
      try {
        const res = await fetch(`${API_BASE}/api/admin/email-settings`, {
          credentials: 'include',
        });
        if (!res.ok) throw new Error('فشل جلب الإعدادات');
        const data: EmailSettings = await res.json();
        setSettings(data);
        setFromAddress(data.fromAddress);
      } catch (err: any) {
        toast({ variant: 'destructive', title: 'خطأ', description: err.message });
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  // ── Save settings ──────────────────────────────────────────────────────────
  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!fromAddress.trim()) {
      toast({ variant: 'destructive', title: 'خطأ', description: 'عنوان المُرسِل مطلوب' });
      return;
    }

    setSaving(true);
    try {
      const body: Record<string, string> = { fromAddress: fromAddress.trim() };
      if (apiKey.trim()) body.apiKey = apiKey.trim();

      const res = await fetch(`${API_BASE}/api/admin/email-settings`, {
        method: 'PUT',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? 'فشل الحفظ');

      setSettings(data.settings);
      setApiKey(''); // clear plaintext key from memory
      setTestResult(null);
      toast({ title: '✅ تم الحفظ', description: 'تم تحديث إعدادات البريد بنجاح' });
    } catch (err: any) {
      toast({ variant: 'destructive', title: 'خطأ', description: err.message });
    } finally {
      setSaving(false);
    }
  };

  // ── Test email ─────────────────────────────────────────────────────────────
  const handleTest = async () => {
    if (!testEmail.trim()) {
      toast({ variant: 'destructive', title: 'خطأ', description: 'أدخلي عنوان بريدك الإلكتروني' });
      return;
    }

    setTesting(true);
    setTestResult(null);
    try {
      const res = await fetch(`${API_BASE}/api/admin/email-settings/test`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ to: testEmail.trim() }),
      });
      const data = await res.json();
      setTestResult({
        success: res.ok && data.success,
        message: data.message ?? (res.ok ? 'تم إرسال البريد التجريبي بنجاح' : 'فشل الإرسال'),
      });
    } catch (err: any) {
      setTestResult({ success: false, message: err.message });
    } finally {
      setTesting(false);
    }
  };

  // ── Source badge ───────────────────────────────────────────────────────────
  const sourceBadge = (src: EmailSettings['source']) => {
    if (src === 'db') return <span className="text-xs bg-blue-100 text-blue-700 px-2 py-0.5 rounded-full">من قاعدة البيانات</span>;
    if (src === 'env') return <span className="text-xs bg-amber-100 text-amber-700 px-2 py-0.5 rounded-full">من المتغيرات البيئية</span>;
    return <span className="text-xs bg-muted text-muted-foreground px-2 py-0.5 rounded-full">القيمة الافتراضية</span>;
  };

  return (
    <AdminSidebar>
      <main className="flex-1 p-6 md:p-8 overflow-y-auto" dir="rtl">
        {/* Page header */}
        <div className="flex items-center gap-3 mb-8">
          <div className="w-10 h-10 rounded-xl bg-blue-600 flex items-center justify-center">
            <Mail className="w-5 h-5 text-white" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-foreground">إعدادات البريد الإلكتروني</h1>
            <p className="text-sm text-muted-foreground">ضبط Resend API لإرسال الفواتير والإشعارات</p>
          </div>
        </div>

        {loading ? (
          <div className="flex items-center justify-center h-48">
            <Loader2 className="w-8 h-8 animate-spin text-blue-600" />
          </div>
        ) : (
          <div className="max-w-2xl space-y-6">

            {/* Status card */}
            {settings && (
              <div className={cn(
                'rounded-xl border p-5 flex items-start gap-4',
                settings.configured
                  ? 'bg-green-50 border-green-200'
                  : 'bg-red-50 border-red-200',
              )}>
                {settings.configured
                  ? <CheckCircle2 className="w-6 h-6 text-green-600 mt-0.5 shrink-0" />
                  : <XCircle className="w-6 h-6 text-red-500 mt-0.5 shrink-0" />}
                <div className="flex-1 min-w-0">
                  <p className={cn('font-semibold', settings.configured ? 'text-green-800' : 'text-red-700')}>
                    {settings.configured ? 'البريد مفعّل' : 'البريد غير مفعّل'}
                  </p>
                  <p className="text-sm text-muted-foreground mt-1">
                    {settings.configured
                      ? `مفتاح API: ${settings.maskedApiKey ?? '••••••••'}`
                      : 'لم يُضبط مفتاح Resend API بعد — الفواتير والإشعارات لن تُرسَل.'}
                  </p>
                  <div className="flex items-center gap-2 mt-2 flex-wrap">
                    <span className="text-xs text-muted-foreground">المصدر:</span>
                    {sourceBadge(settings.source)}
                    <span className="text-xs text-muted-foreground mr-2">المُرسِل:</span>
                    <span className="text-xs font-mono text-foreground">{settings.fromAddress}</span>
                  </div>
                </div>
              </div>
            )}

            {/* Info note */}
            <div className="flex gap-3 bg-blue-50 border border-blue-200 rounded-xl p-4 text-sm text-blue-800">
              <Info className="w-4 h-4 mt-0.5 shrink-0" />
              <div>
                المنصة تستخدم <strong>Resend</strong> لإرسال الفواتير والإشعارات.
                احصلي على مفتاح API مجاني من{' '}
                <a href="https://resend.com" target="_blank" rel="noopener noreferrer"
                   className="underline font-medium">resend.com</a>
                {' '}ثم أدخليه أدناه.
              </div>
            </div>

            {/* Settings form */}
            <form onSubmit={handleSave} className="bg-card rounded-xl border border-border p-6 space-y-5">
              <h2 className="text-base font-semibold text-foreground">تحديث الإعدادات</h2>

              {/* API Key */}
              <div>
                <label className="block text-sm font-medium text-foreground mb-1.5">
                  مفتاح Resend API
                  <span className="text-muted-foreground font-normal mr-1">(اتركيه فارغاً للإبقاء على الحالي)</span>
                </label>
                <div className="relative">
                  <input
                    type={showKey ? 'text' : 'password'}
                    value={apiKey}
                    onChange={e => setApiKey(e.target.value)}
                    placeholder="re_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx"
                    className="w-full border border-border bg-input rounded-lg px-4 py-2.5 text-sm font-mono text-foreground focus:outline-none focus:ring-2 focus:ring-ring focus:border-transparent pr-10"
                    dir="ltr"
                  />
                  <button
                    type="button"
                    onClick={() => setShowKey(v => !v)}
                    className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                    tabIndex={-1}
                  >
                    {showKey ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
              </div>

              {/* From address */}
              <div>
                <label className="block text-sm font-medium text-foreground mb-1.5">
                  عنوان المُرسِل (From)
                </label>
                <input
                  type="email"
                  value={fromAddress}
                  onChange={e => setFromAddress(e.target.value)}
                  placeholder="info@rabablegal.com"
                  required
                  className="w-full border border-border bg-input rounded-lg px-4 py-2.5 text-sm font-mono text-foreground focus:outline-none focus:ring-2 focus:ring-ring focus:border-transparent"
                  dir="ltr"
                />
                <p className="text-xs text-muted-foreground mt-1">
                  يجب أن يكون نطاقاً موثّقاً في Resend، أو يمكن استخدام البريد الافتراضي onboarding@resend.dev للاختبار.
                </p>
              </div>

              <div className="flex justify-end pt-1">
                <button
                  type="submit"
                  disabled={saving}
                  className="flex items-center gap-2 bg-blue-600 hover:bg-blue-700 disabled:opacity-60 text-white px-5 py-2.5 rounded-lg text-sm font-medium transition-colors"
                >
                  {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                  {saving ? 'جارٍ الحفظ…' : 'حفظ الإعدادات'}
                </button>
              </div>
            </form>

            {/* Test send */}
            <div className="bg-card rounded-xl border border-border p-6 space-y-4">
              <h2 className="text-base font-semibold text-foreground">اختبار الإرسال</h2>
              <p className="text-sm text-muted-foreground">
                أرسلي بريداً تجريبياً للتحقق من أن الإعداد يعمل بشكل صحيح.
              </p>

              <div className="flex gap-3">
                <input
                  type="email"
                  value={testEmail}
                  onChange={e => setTestEmail(e.target.value)}
                  placeholder="admin@example.com"
                  className="flex-1 border border-border bg-input rounded-lg px-4 py-2.5 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-ring focus:border-transparent"
                  dir="ltr"
                />
                <button
                  type="button"
                  onClick={handleTest}
                  disabled={testing || !settings?.configured}
                  title={!settings?.configured ? 'يجب ضبط مفتاح API أولاً' : undefined}
                  className="flex items-center gap-2 bg-gray-800 hover:bg-gray-900 disabled:opacity-50 text-white px-5 py-2.5 rounded-lg text-sm font-medium transition-colors"
                >
                  {testing ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
                  {testing ? 'جارٍ الإرسال…' : 'إرسال تجريبي'}
                </button>
              </div>

              {testResult && (
                <div className={cn(
                  'flex items-start gap-3 rounded-lg p-4 text-sm',
                  testResult.success
                    ? 'bg-green-50 border border-green-200 text-green-800'
                    : 'bg-red-50 border border-red-200 text-red-700',
                )}>
                  {testResult.success
                    ? <CheckCircle2 className="w-4 h-4 mt-0.5 shrink-0" />
                    : <XCircle className="w-4 h-4 mt-0.5 shrink-0" />}
                  <span>{testResult.message}</span>
                </div>
              )}
            </div>

          </div>
        )}
      </main>
    </AdminSidebar>
  );
}
