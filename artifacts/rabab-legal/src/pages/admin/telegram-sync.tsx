import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useLocation } from 'wouter';
import { AdminSidebar } from '@/components/layout';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui';
import { useLang } from '@/hooks/use-language';

const BASE = import.meta.env.BASE_URL.replace(/\/$/, '');

// ── Category definitions ──────────────────────────────────────────────────────
const CATEGORIES = [
  { value: 'judicial', ar: 'أحكام قضائية', en: 'Judicial decisions', emoji: '⚖️', color: 'purple' },
  { value: 'circular', ar: 'تعاميم', en: 'Circulars', emoji: '📋', color: 'blue' },
  { value: 'regulation', ar: 'مدونات وأنظمة', en: 'Codices and laws', emoji: '📚', color: 'green' },
  { value: 'general', ar: 'عام', en: 'General', emoji: '📄', color: 'gray' },
] as const;

type Category = typeof CATEGORIES[number]['value'];

interface ChannelEntry {
  link: string;
  category: Category;
  label?: string;
}

// ── Default channels with pre-assigned categories ─────────────────────────────
const DEFAULT_CHANNEL_ENTRIES: ChannelEntry[] = [
  { link: 'https://t.me/+P8ChJlncd1sNkmon', category: 'circular',   label: 'تعميمات وزارة العدل (خاص)' },
  { link: 'https://t.me/Diwanalmuhamah',     category: 'judicial',   label: 'ديوان المظالم' },
  { link: 'https://t.me/qada_a',             category: 'judicial',   label: 'قضاء' },
  { link: 'https://t.me/JusticeBlogs',       category: 'regulation', label: 'مدونات العدالة' },
  { link: 'https://t.me/Lawrabab',           category: 'general',    label: 'قناة رباب' },
  { link: 'https://t.me/SaudiLawyer2030',    category: 'general',    label: 'المحامي السعودي 2030' },
  { link: 'https://t.me/law150',             category: 'regulation', label: 'نظام القانون' },
  { link: 'https://t.me/mshary_bn_saud_011', category: 'general',    label: 'مشاري بن سعود' },
  { link: 'https://t.me/Saudilaw2030t',      category: 'regulation', label: 'القانون السعودي 2030' },
  { link: 'https://t.me/LEGALGUIDE1',        category: 'general',    label: 'الدليل القانوني' },
  { link: 'https://t.me/aldrees_partners',   category: 'general',    label: 'الدريس وشركاه' },
  { link: 'https://t.me/saudiattorneys17',   category: 'judicial',   label: 'محامون سعوديون 17' },
  { link: 'https://t.me/almuhamealfaqih',    category: 'general',    label: 'المحامي الفقيه' },
  { link: 'https://t.me/saudiattorneys34',   category: 'judicial',   label: 'محامون سعوديون 34' },
  { link: 'https://t.me/saudiattorneys19',   category: 'judicial',   label: 'محامون سعوديون 19' },
  { link: 'https://t.me/saudiattorneys22',   category: 'judicial',   label: 'محامون سعوديون 22' },
  { link: 'https://t.me/Ymtaz5',             category: 'general',    label: 'إمتياز' },
  { link: 'https://t.me/Lawlooksgeneral',    category: 'general',    label: 'نظرة قانونية' },
  { link: 'https://t.me/muath_alyahya',      category: 'general',    label: 'معاذ اليحيى' },
];

type AuthStatus = 'idle' | 'connected' | 'waiting_code' | 'waiting_2fa' | 'authenticated' | 'error';
type SyncMode = 'full' | 'incremental';

interface SyncJobInfo {
  running: boolean;
  total: number;
  indexed: number;
  skipped: number;
  failed: number;
  log: string[];
  startedAt: string;
  finishedAt: string | null;
  mode: SyncMode;
}

interface ChannelState {
  lastMessageId: number;
  lastSyncAt: string;
  filesIndexed: number;
}

interface AutoSyncConfig {
  enabled: boolean;
  intervalHours: number;
  channels: ChannelEntry[];
  lastAutoSyncAt?: string;
}

interface StatusResponse {
  credentialsConfigured: boolean;
  authStatus: AuthStatus;
  authError: string | null;
  syncJob: SyncJobInfo | null;
  channelState: Record<string, ChannelState>;
  autoSync: AutoSyncConfig;
}

// ── Category helpers ──────────────────────────────────────────────────────────
function getCatMeta(value: string) {
  return CATEGORIES.find(c => c.value === value) ?? CATEGORIES[3];
}

function catBadgeClass(value: string) {
  const meta = getCatMeta(value);
  const map: Record<string, string> = {
    purple: 'bg-purple-100 text-purple-700 border-purple-200',
    blue:   'bg-blue-100 text-blue-700 border-blue-200',
    green:  'bg-green-100 text-green-700 border-green-200',
    gray:   'bg-gray-100 text-gray-600 border-gray-200',
  };
  return map[meta.color] ?? map.gray;
}

// ── Main component ─────────────────────────────────────────────────────────────
export default function TelegramSync() {
  const { lang, t } = useLang();
  const [status, setStatus] = useState<StatusResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [phone, setPhone] = useState('');
  const [code, setCode] = useState('');
  const [password, setPassword] = useState('');
  const [actionLoading, setActionLoading] = useState(false);
  const [msg, setMsg] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  // ── Channel state (ChannelEntry[]) ────────────────────────────────────────
  const [channels, setChannels] = useState<ChannelEntry[]>(() => {
    try {
      const saved = localStorage.getItem('tg_channel_entries');
      if (saved) {
        const parsed = JSON.parse(saved) as ChannelEntry[];
        if (Array.isArray(parsed) && parsed.length > 0) {
          // Merge: keep saved entries, add any new defaults not yet present
          const merged = [...parsed];
          for (const def of DEFAULT_CHANNEL_ENTRIES) {
            if (!merged.find(c => c.link === def.link)) merged.push(def);
          }
          return merged;
        }
      }
    } catch { /* ignore */ }
    return DEFAULT_CHANNEL_ENTRIES;
  });

  const [newChannel, setNewChannel] = useState('');
  const [newChannelCat, setNewChannelCat] = useState<Category>('judicial');
  const [newChannelLabel, setNewChannelLabel] = useState('');
  const [syncMode, setSyncMode] = useState<SyncMode>('incremental');

  // ── Auto-sync settings ────────────────────────────────────────────────────
  const [autoEnabled, setAutoEnabled] = useState(false);
  const [autoInterval, setAutoInterval] = useState(12);
  const [autoLoading, setAutoLoading] = useState(false);
  const [, setLocation] = useLocation();

  // ── Additional indexing ───────────────────────────────────────────────────
  const [newUrl, setNewUrl] = useState('');
  const [newUrlTitle, setNewUrlTitle] = useState('');
  const [urlLoading, setUrlLoading] = useState(false);
  const [pasteTitle, setPasteTitle] = useState('');
  const [pasteText, setPasteText] = useState('');
  const [pasteLoading, setPasteLoading] = useState(false);

  // ── Quick-add state ───────────────────────────────────────────────────────
  const [quickLink, setQuickLink] = useState('');
  const [quickCat, setQuickCat] = useState<Category>('judicial');
  const [quickLabel, setQuickLabel] = useState('');

  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const fetchStatus = useCallback(async () => {
    try {
      const r = await fetch(`${BASE}/api/admin/telegram-sync/status`, { credentials: 'include' });
      if (!r.ok) return;
      const data: StatusResponse = await r.json();
      setStatus(data);
      if (data.autoSync) {
        setAutoEnabled(data.autoSync.enabled);
        setAutoInterval(data.autoSync.intervalHours || 12);
      }
    } catch { /* ignore */ }
    finally { setLoading(false); }
  }, []);

  useEffect(() => {
    fetchStatus();
    pollRef.current = setInterval(fetchStatus, 3000);
    return () => { if (pollRef.current) clearInterval(pollRef.current); };
  }, [fetchStatus]);

  // Persist channels to localStorage
  useEffect(() => {
    try { localStorage.setItem('tg_channel_entries', JSON.stringify(channels)); } catch { /* ignore */ }
  }, [channels]);

  const post = async (path: string, body: object) => {
    const r = await fetch(`${BASE}/api${path}`, {
      method: 'POST', credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    const data = await r.json();
    if (!r.ok) throw new Error(data.error ?? t('خطأ غير معروف', 'Unknown error'));
    return data;
  };

  // ── Auth ─────────────────────────────────────────────────────────────────
  const sendCode = async () => {
    if (!phone) return;
    setActionLoading(true); setMsg(null);
    try {
      await post('/admin/telegram-sync/auth/start', { phone });
      setMsg({ type: 'success', text: t('تم إرسال رمز التحقق إلى هاتفك', 'Verification code sent to your phone') });
      await fetchStatus();
    } catch (e: any) { setMsg({ type: 'error', text: e.message }); }
    finally { setActionLoading(false); }
  };

  const verifyCode = async () => {
    if (!code && !password) return;
    setActionLoading(true); setMsg(null);
    try {
      const data = await post('/admin/telegram-sync/auth/verify', { code, password: password || undefined });
      if (data.status === 'waiting_2fa') {
        setMsg({ type: 'error', text: t('يجب إدخال كلمة مرور التحقق الثنائي (2FA)', 'Enter your two-factor authentication (2FA) password') });
      } else {
        setMsg({ type: 'success', text: `✅ ${t('تم تسجيل الدخول بنجاح!', 'Signed in successfully!')}` });
        setCode(''); setPassword('');
      }
      await fetchStatus();
    } catch (e: any) { setMsg({ type: 'error', text: e.message }); }
    finally { setActionLoading(false); }
  };

  // ── Sync ──────────────────────────────────────────────────────────────────
  const startSync = async () => {
    const validChannels = channels.filter(c => c.link.trim());
    if (!validChannels.length) return;
    setActionLoading(true); setMsg(null);
    try {
      await post('/admin/telegram-sync/start', { channels: validChannels, mode: syncMode });
      const modeLabel = syncMode === 'incremental' ? t('تدريجية (الجديد فقط)', 'incremental (new only)') : t('كاملة (كل الملفات)', 'full (all files)');
      setMsg({ type: 'success', text: `🚀 ${t('بدأت المزامنة', 'Started')} ${modeLabel} ${t('لـ', 'for')} ${validChannels.length} ${t('قناة', 'channels')}` });
      await fetchStatus();
    } catch (e: any) { setMsg({ type: 'error', text: e.message }); }
    finally { setActionLoading(false); }
  };

  const stopSync = async () => {
    setActionLoading(true);
    try {
      await post('/admin/telegram-sync/stop', {});
      setMsg({ type: 'success', text: t('تم إيقاف المزامنة', 'Sync stopped') });
      await fetchStatus();
    } catch { /* ignore */ }
    finally { setActionLoading(false); }
  };

  const saveAutoSync = async () => {
    setAutoLoading(true); setMsg(null);
    try {
      if (!autoEnabled) {
        await post('/admin/telegram-sync/schedule', { enabled: false });
        setMsg({ type: 'success', text: `✅ ${t('تم إيقاف المزامنة التلقائية', 'Automatic sync disabled')}` });
      } else {
        const validChannels = channels.filter(c => c.link.trim());
        await post('/admin/telegram-sync/schedule', {
          enabled: true,
          intervalHours: autoInterval,
          channels: validChannels,
        });
        setMsg({ type: 'success', text: `✅ ${t('ستُزامن تلقائياً كل', 'Will sync automatically every')} ${autoInterval} ${t('ساعة', 'hours')}` });
      }
      await fetchStatus();
    } catch (e: any) { setMsg({ type: 'error', text: e.message }); }
    finally { setAutoLoading(false); }
  };

  // ── Channel management ────────────────────────────────────────────────────
  const addChannel = () => {
    const trimmed = newChannel.trim();
    if (!trimmed || channels.find(c => c.link === trimmed)) return;
    setChannels(prev => [...prev, { link: trimmed, category: newChannelCat, label: newChannelLabel.trim() || undefined }]);
    setNewChannel(''); setNewChannelLabel('');
  };

  const quickAdd = () => {
    const trimmed = quickLink.trim();
    if (!trimmed || channels.find(c => c.link === trimmed)) { setMsg({ type: 'error', text: t('الرابط موجود بالفعل أو فارغ', 'The link already exists or is empty') }); return; }
    setChannels(prev => [...prev, { link: trimmed, category: quickCat, label: quickLabel.trim() || undefined }]);
    setQuickLink(''); setQuickLabel('');
    const category = getCatMeta(quickCat);
    setMsg({ type: 'success', text: `✅ ${t('أُضيفت القناة بتصنيف', 'Channel added with category')} "${t(category.ar, category.en)}"` });
  };

  const removeChannel = (link: string) => {
    setChannels(prev => prev.filter(c => c.link !== link));
  };

  const updateChannelCategory = (link: string, category: Category) => {
    setChannels(prev => prev.map(c => c.link === link ? { ...c, category } : c));
  };

  // ── Additional indexing ───────────────────────────────────────────────────
  const pasteAndIndex = async () => {
    if (!pasteText.trim()) return;
    setPasteLoading(true); setMsg(null);
    try {
      const blob = new Blob([pasteText], { type: 'text/plain' });
      const form = new FormData();
      form.append('file', blob, (pasteTitle.trim() || t('محتوى ملصق', 'Pasted content')) + '.txt');
      const r = await fetch(`${BASE}/api/admin/knowledge/upload`, {
        method: 'POST', credentials: 'include', body: form,
      });
      const data = await r.json();
      if (!r.ok) throw new Error(data.error ?? t('خطأ غير معروف', 'Unknown error'));
      setMsg({ type: 'success', text: `✅ ${t('تم فهرسة', 'Indexed')} "${pasteTitle.trim() || t('المحتوى الملصق', 'pasted content')}" ${t('بنجاح', 'successfully')}` });
      setPasteText(''); setPasteTitle('');
    } catch (e: any) { setMsg({ type: 'error', text: e.message }); }
    finally { setPasteLoading(false); }
  };

  const addUrl = async () => {
    const url = newUrl.trim();
    if (!url) return;
    setUrlLoading(true); setMsg(null);
    try {
      await post('/admin/knowledge/url', { url, title: newUrlTitle.trim() || undefined });
      setMsg({ type: 'success', text: `✅ ${t('تمت الإضافة والفهرسة:', 'Added and indexed:')} ${newUrlTitle.trim() || url}` });
      setNewUrl(''); setNewUrlTitle('');
    } catch (e: any) { setMsg({ type: 'error', text: e.message }); }
    finally { setUrlLoading(false); }
  };

  const formatDate = (iso: string) =>
    new Date(iso).toLocaleString(lang === 'ar' ? 'ar-SA' : 'en-US', { dateStyle: 'short', timeStyle: 'short' });

  const job = status?.syncJob;
  const authStatus = status?.authStatus ?? 'idle';
  const isAuthenticated = authStatus === 'authenticated';
  const waitingCode = authStatus === 'waiting_code';
  const waiting2fa = authStatus === 'waiting_2fa';
  const channelState = status?.channelState ?? {};

  const progress = job && job.total > 0
    ? Math.round(((job.indexed + job.failed + job.skipped) / Math.max(job.total, 1)) * 100)
    : 0;

  // Group channels by category for display
  const grouped = CATEGORIES.map(cat => ({
    ...cat,
    entries: channels.filter(c => c.category === cat.value),
  })).filter(g => g.entries.length > 0);

  return (
    <AdminSidebar>
      <div dir={lang === 'ar' ? 'rtl' : 'ltr'}>
      <div className="mb-8">
         <h1 className="text-2xl font-bold text-primary">{t('مزامنة قنوات تيليجرام', 'Telegram channel sync')}</h1>
        <p className="text-muted-foreground mt-1">
           {t('ربط مباشر بالقنوات عبر MTProto — يدعم تصنيف كل قناة (أحكام / تعاميم / مدونات) مع فهرسة كاملة وتدريجية وجدولة تلقائية', 'Direct MTProto channel integration with per-channel categorization, full/incremental indexing, and automatic scheduling')}
        </p>
      </div>

       {loading && <div className="flex items-center justify-center rounded-2xl border-2 border-secondary/45 bg-secondary/5 py-8 text-center text-muted-foreground">{t('جارٍ التحميل...', 'Loading...')}</div>}

      {!loading && status && (
        <div className="space-y-6">

          {/* ── Credentials check ── */}
          {!status.credentialsConfigured && (
            <Card className="border-red-200 bg-red-50">
              <CardContent className="p-5">
                 <p className="font-bold text-red-800 mb-2">⚠️ {t('بيانات الاعتماد غير مضبوطة', 'Credentials are not configured')}</p>
                <p className="text-sm text-red-700">
                   {t('أضيفي TELEGRAM_API_ID و TELEGRAM_API_HASH في Secrets من my.telegram.org', 'Add TELEGRAM_API_ID and TELEGRAM_API_HASH in Secrets from my.telegram.org')}
                </p>
              </CardContent>
            </Card>
          )}

          {/* ── Auth section ── */}
          {status.credentialsConfigured && !isAuthenticated && (
            <Card className="border-blue-200">
              <CardHeader className="pb-3">
                <CardTitle className="text-base">
                   {waitingCode || waiting2fa ? `🔐 ${t('أدخلي رمز التحقق', 'Enter verification code')}` : `📱 ${t('تسجيل الدخول لتيليجرام', 'Sign in to Telegram')}`}
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                {!waitingCode && !waiting2fa && (
                  <>
                     <p className="text-sm text-muted-foreground">{t('سيصلك رمز تحقق على تطبيق تيليجرام أو برسالة SMS', 'You will receive a verification code in Telegram or by SMS')}</p>
                    <div className="flex gap-3">
                      <input
                        type="tel" value={phone}
                        onChange={e => setPhone(e.target.value)}
                        placeholder="+966XXXXXXXXX"
                        dir="ltr"
                        className="flex-1 border border-border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 bg-background"
                        onKeyDown={e => e.key === 'Enter' && sendCode()}
                      />
                      <button
                        onClick={sendCode} disabled={actionLoading || !phone}
                        className="px-5 py-2 bg-primary text-primary-foreground rounded-lg text-sm font-medium hover:bg-primary/90 disabled:opacity-50"
                      >
                         {actionLoading ? '...' : t('إرسال الرمز', 'Send code')}
                      </button>
                    </div>
                  </>
                )}
                {(waitingCode || waiting2fa) && (
                  <>
                    <p className="text-sm text-muted-foreground">
      {waitingCode ? `${t('أُرسل رمز تحقق إلى', 'A verification code was sent to')} ${phone || t('هاتفك', 'your phone')}` : t('حسابك محمي بالتحقق الثنائي — أدخلي كلمة المرور', 'Your account is protected by two-factor authentication — enter your password')}
                    </p>
                    <div className="space-y-3">
                      {waitingCode && (
                        <input
                          type="text" value={code}
                          onChange={e => setCode(e.target.value.replace(/\D/g, ''))}
                          placeholder="12345" dir="ltr" maxLength={6} autoFocus
                          className="w-full border border-border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 bg-background text-center text-xl tracking-widest"
                        />
                      )}
                      {waiting2fa && (
                        <input
                          type="password" value={password}
                          onChange={e => setPassword(e.target.value)}
                          placeholder={t('كلمة مرور 2FA', '2FA password')}
                          className="w-full border border-border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 bg-background"
                        />
                      )}
                      <div className="flex gap-3">
                        <button
                          onClick={verifyCode} disabled={actionLoading || (!code && !password)}
                          className="flex-1 py-2 bg-primary text-primary-foreground rounded-lg text-sm font-medium hover:bg-primary/90 disabled:opacity-50"
                        >
                          {actionLoading ? '...' : t('تحقق وادخلي', 'Verify and sign in')}
                        </button>
                        <button
                          onClick={() => { setCode(''); setPassword(''); fetchStatus(); }}
                          className="px-4 py-2 border border-border rounded-lg text-sm text-muted-foreground hover:bg-muted"
                        >
                           {t('إلغاء', 'Cancel')}
                        </button>
                      </div>
                    </div>
                  </>
                )}
              </CardContent>
            </Card>
          )}

          {/* ── Quick Add section (always shown when authenticated) ── */}
          {isAuthenticated && (
            <Card className="border-yellow-300 bg-yellow-50/50">
              <CardHeader className="pb-3">
                <CardTitle className="text-base">⚡ {t('إضافة قناة جديدة بتصنيف محدد', 'Add a new channel with a category')}</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <p className="text-xs text-yellow-800">
                  {t('أدخلي رابط قناة تيليجرام واختاري نوع محتواها — سيُطبَّق التصنيف تلقائياً على كل وثيقة تُجلب منها', 'Enter a Telegram channel link and select its content type — the category will be applied automatically to every retrieved document')}
                </p>

                {/* Category quick-select buttons */}
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                  {CATEGORIES.map(cat => (
                    <button
                      key={cat.value}
                      onClick={() => setQuickCat(cat.value as Category)}
                      className={`py-2 px-3 rounded-lg border text-xs font-semibold transition-all ${
                        quickCat === cat.value
                          ? 'ring-2 ring-offset-1 ring-primary bg-primary text-primary-foreground border-primary'
                          : 'bg-card border-border hover:border-primary/50'
                      }`}
                    >
                      {cat.emoji} {t(cat.ar, cat.en)}
                    </button>
                  ))}
                </div>

                <div className="flex gap-2">
                  <input
                    type="text" value={quickLabel}
                    onChange={e => setQuickLabel(e.target.value)}
                    placeholder={t('الاسم (اختياري)', 'Name (optional)')}
                    className="w-32 border border-border rounded-lg px-3 py-2 text-xs focus:outline-none focus:ring-2 focus:ring-yellow-300 bg-background"
                  />
                  <input
                    type="text" value={quickLink}
                    onChange={e => setQuickLink(e.target.value)}
                    placeholder={t('https://t.me/channel أو رابط الدعوة', 'https://t.me/channel or invite link')}
                    dir="ltr"
                    className="flex-1 border border-border rounded-lg px-3 py-2 text-xs focus:outline-none focus:ring-2 focus:ring-yellow-300 bg-background"
                    onKeyDown={e => e.key === 'Enter' && quickAdd()}
                  />
                  <button
                    onClick={quickAdd} disabled={!quickLink.trim()}
                    className="px-4 py-2 bg-yellow-500 text-white rounded-lg text-xs font-bold hover:bg-yellow-600 disabled:opacity-50 shrink-0"
                  >
                    + {t('أضيفي', 'Add')}
                  </button>
                </div>
              </CardContent>
            </Card>
          )}

          {/* ── Channels + Sync controls ── */}
          {isAuthenticated && (
            <Card className="border-green-200 bg-green-50/40">
              <CardHeader className="pb-3">
                <CardTitle className="text-base flex items-center justify-between">
                  <span>✅ {t('متصل —', 'Connected —')} {channels.length} {t('قناة مصنّفة', 'categorized channels')}</span>
                  {job?.running ? (
                    <button
                      onClick={stopSync} disabled={actionLoading}
                      className="px-5 py-2 bg-red-500 text-white rounded-lg text-sm font-bold hover:bg-red-600 disabled:opacity-50"
                    >
                      ⏹ {t('إيقاف', 'Stop')}
                    </button>
                  ) : (
                    <button
                      onClick={startSync} disabled={actionLoading || channels.length === 0}
                      className="px-5 py-2 bg-primary text-primary-foreground rounded-lg text-sm font-bold hover:bg-primary/90 disabled:opacity-50"
                    >
                      {actionLoading ? '...' : `🚀 ${t('ابدأي المزامنة', 'Start sync')}`}
                    </button>
                  )}
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">

                {/* ── Sync mode toggle ── */}
                <div className="bg-card border border-border rounded-xl p-3 space-y-2">
                  <p className="text-xs font-semibold text-green-900">{t('نوع المزامنة', 'Sync type')}</p>
                  <div className="grid grid-cols-2 gap-2">
                    <button
                      onClick={() => setSyncMode('incremental')}
                      className={`py-2.5 px-3 rounded-lg border text-sm font-medium transition-all text-right ${
                        syncMode === 'incremental'
                          ? 'bg-green-600 text-white border-green-600'
                          : 'bg-card text-foreground border-border hover:border-green-500'
                      }`}
                    >
                      <span className="block text-base">🆕 {t('تدريجية', 'Incremental')}</span>
                      <span className="block text-xs opacity-75 mt-0.5">{t('الجديد فقط منذ آخر مزامنة', 'New content only since the last sync')}</span>
                    </button>
                    <button
                      onClick={() => setSyncMode('full')}
                      className={`py-2.5 px-3 rounded-lg border text-sm font-medium transition-all text-right ${
                        syncMode === 'full'
                          ? 'bg-blue-600 text-white border-blue-600'
                          : 'bg-card text-foreground border-border hover:border-blue-500'
                      }`}
                    >
                      <span className="block text-base">🔄 {t('كاملة', 'Full')}</span>
                      <span className="block text-xs opacity-75 mt-0.5">{t('إعادة فهرسة كل الملفات', 'Reindex all files')}</span>
                    </button>
                  </div>
                </div>

                {/* ── Category summary badges ── */}
                <div className="flex flex-wrap gap-2">
                  {CATEGORIES.map(cat => {
                    const count = channels.filter(c => c.category === cat.value).length;
                    if (count === 0) return null;
                    return (
                      <span key={cat.value} className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full border text-xs font-semibold ${catBadgeClass(cat.value)}`}>
                        {cat.emoji} {t(cat.ar, cat.en)} ({count})
                      </span>
                    );
                  })}
                </div>

                {/* ── Channel list grouped by category ── */}
                <div className="space-y-4">
                  {grouped.map(group => (
                    <div key={group.value}>
                      <p className={`text-xs font-bold mb-1.5 flex items-center gap-1 ${catBadgeClass(group.value)} px-2 py-1 rounded-md w-fit border`}>
                        {group.emoji} {t(group.ar, group.en)} ({group.entries.length})
                      </p>
                      <div className="space-y-1.5">
                        {group.entries.map((entry) => {
                          const cs = channelState[entry.link];
                          return (
                            <div key={entry.link} className="bg-card rounded-lg px-3 py-2 border border-border">
                              <div className="flex items-center gap-2">
                                <div className="flex-1 min-w-0">
                                  {entry.label && (
                                    <p className="text-xs font-semibold text-foreground truncate">{entry.label}</p>
                                  )}
                                  <p className="text-[10px] text-muted-foreground font-mono truncate">{entry.link}</p>
                                </div>
                                {/* Category change dropdown */}
                                {!job?.running && (
                                  <select
                                    value={entry.category}
                                    onChange={e => updateChannelCategory(entry.link, e.target.value as Category)}
                                    className="text-[10px] border border-border rounded px-1 py-0.5 bg-background shrink-0"
                                  >
                                    {CATEGORIES.map(cat => (
                                      <option key={cat.value} value={cat.value}>{cat.emoji} {t(cat.ar, cat.en)}</option>
                                    ))}
                                  </select>
                                )}
                                {!job?.running && (
                                  <button
                                    onClick={() => removeChannel(entry.link)}
                                    className="text-red-400 hover:text-red-600 text-xs shrink-0"
                                  >✕</button>
                                )}
                              </div>
                              {cs ? (
                                <p className="text-[10px] text-muted-foreground mt-0.5">
                                   {t('آخر مزامنة:', 'Last sync:')} {formatDate(cs.lastSyncAt)} · {cs.filesIndexed} {t('ملف', 'files')} · {t('رسالة', 'message')} #{cs.lastMessageId}
                                </p>
                              ) : (
                                 <p className="text-[10px] text-amber-500 mt-0.5">{t('لم تُزامَن بعد', 'Not synced yet')}</p>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  ))}
                </div>

                {/* ── Add channel (advanced) ── */}
                <details className="border border-border rounded-lg">
                  <summary className="px-3 py-2 text-xs font-medium cursor-pointer text-muted-foreground hover:text-foreground">
                    + {t('إضافة قناة يدوياً (متقدم)', 'Add a channel manually (advanced)')}
                  </summary>
                  <div className="p-3 space-y-2 border-t border-border">
                    <div className="flex gap-2 flex-wrap">
                      {CATEGORIES.map(cat => (
                        <button
                          key={cat.value}
                          onClick={() => setNewChannelCat(cat.value as Category)}
                          className={`px-2 py-1 rounded text-xs font-semibold border transition-all ${
                            newChannelCat === cat.value
                              ? 'bg-primary text-primary-foreground border-primary'
                              : 'bg-card border-border'
                          }`}
                        >
                          {cat.emoji} {t(cat.ar, cat.en)}
                        </button>
                      ))}
                    </div>
                    <input
                      type="text" value={newChannelLabel}
                      onChange={e => setNewChannelLabel(e.target.value)}
                      placeholder={t('اسم القناة (اختياري)', 'Channel name (optional)')}
                      className="w-full border border-border rounded-lg px-3 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-primary/30 bg-background"
                    />
                    <div className="flex gap-2">
                      <input
                        type="text" value={newChannel}
                        onChange={e => setNewChannel(e.target.value)}
                        placeholder="https://t.me/channelname"
                        dir="ltr"
                        className="flex-1 border border-border rounded-lg px-3 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-primary/30 bg-background"
                        onKeyDown={e => e.key === 'Enter' && addChannel()}
                      />
                      <button
                        onClick={addChannel} disabled={!newChannel.trim()}
                        className="px-3 py-1.5 bg-green-600 text-white rounded-lg text-xs font-medium hover:bg-green-700 disabled:opacity-50"
                      >
                        + {t('أضيفي', 'Add')}
                      </button>
                    </div>
                  </div>
                </details>
              </CardContent>
            </Card>
          )}

          {/* ── Auto-sync schedule ── */}
          {isAuthenticated && (
            <Card className={`border-2 transition-colors ${autoEnabled ? 'border-purple-300 bg-purple-50/40' : 'border-gray-200'}`}>
              <CardHeader className="pb-3">
                <CardTitle className="text-base flex items-center justify-between">
                  <span>⏰ {t('المزامنة التلقائية الدورية', 'Scheduled automatic sync')}</span>
                  <label className="flex items-center gap-2 cursor-pointer">
                    <span className="text-sm font-normal text-muted-foreground">
                      {autoEnabled ? t('مفعّلة', 'Enabled') : t('معطّلة', 'Disabled')}
                    </span>
                    <div
                      onClick={() => setAutoEnabled(v => !v)}
                      className={`w-11 h-6 rounded-full transition-colors relative cursor-pointer ${autoEnabled ? 'bg-purple-600' : 'bg-gray-300'}`}
                    >
                      <span className={`absolute top-0.5 w-5 h-5 rounded-full bg-white shadow transition-transform ${autoEnabled ? 'translate-x-5' : 'translate-x-0.5'}`} />
                    </div>
                  </label>
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <p className="text-xs text-muted-foreground">
                  {t('تُشغّل مزامنة تدريجية تلقائية في الخلفية — تجلب فقط الوثائق الجديدة مع احترام تصنيف كل قناة', 'Runs an automatic incremental sync in the background, retrieving only new documents while preserving each channel category')}
                </p>
                {autoEnabled && (
                  <div className="space-y-3">
                    <div>
                      <p className="text-xs font-medium mb-2">{t('الفترة الزمنية بين كل مزامنة', 'Time between syncs')}</p>
                      <div className="grid grid-cols-4 gap-2">
                        {[6, 12, 24, 48].map(h => (
                          <button
                            key={h}
                            onClick={() => setAutoInterval(h)}
                            className={`py-2 rounded-lg border text-sm font-medium transition-all ${
                              autoInterval === h
                                ? 'bg-purple-600 text-white border-purple-600'
                                : 'bg-card text-foreground border-border hover:border-purple-500'
                            }`}
                          >
                            {h}{t('س', 'h')}
                          </button>
                        ))}
                      </div>
                    </div>
                    {status?.autoSync?.lastAutoSyncAt && (
                      <p className="text-xs text-purple-700 bg-purple-100 rounded-lg px-3 py-2">
                        🕐 {t('آخر تشغيل تلقائي:', 'Last automatic run:')} {formatDate(status.autoSync.lastAutoSyncAt)}
                      </p>
                    )}
                  </div>
                )}
                <button
                  onClick={saveAutoSync} disabled={autoLoading}
                  className="w-full py-2 bg-purple-600 text-white rounded-lg text-sm font-bold hover:bg-purple-700 disabled:opacity-50"
                >
                  {autoLoading ? `⏳ ${t('جارٍ الحفظ...', 'Saving...')}` : autoEnabled ? `💾 ${t('حفظ', 'Save')} (${t('every', 'every')} ${autoInterval} ${t('ساعة', 'hours')})` : `💾 ${t('حفظ (إيقاف الجدولة)', 'Save (disable schedule)')}`}
                </button>
              </CardContent>
            </Card>
          )}

          {/* ── Sync progress ── */}
          {job && (
            <Card className="border-blue-200 bg-blue-50/60">
              <CardHeader className="pb-2">
                <CardTitle className="text-base flex items-center justify-between">
                  <span>
                    {job.running ? `⏳ ${t('جارٍ الفهرسة...', 'Indexing...')}` : `🎉 ${t('اكتملت المزامنة', 'Sync completed')}`}
                    <span className={`mr-2 text-xs font-normal px-2 py-0.5 rounded-full ${
                      job.mode === 'incremental' ? 'bg-green-100 text-green-700' : 'bg-blue-100 text-blue-700'
                    }`}>
                      {job.mode === 'incremental' ? `🆕 ${t('تدريجية', 'Incremental')}` : `🔄 ${t('كاملة', 'Full')}`}
                    </span>
                  </span>
                  <span className="text-sm font-normal text-blue-600">
                    {job.indexed + job.failed + job.skipped} / {job.total} {t('رسالة', 'messages')}
                  </span>
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="w-full bg-blue-100 rounded-full h-3 overflow-hidden">
                  <div
                    className={`h-3 rounded-full transition-all duration-700 ${job.running ? 'bg-blue-500' : 'bg-green-500'}`}
                    style={{ width: `${progress}%` }}
                  />
                </div>
                <div className="grid grid-cols-4 gap-3 text-center">
                  <div className="bg-card rounded-lg p-2 border border-blue-500/30">
                    <p className="text-xl font-bold text-blue-600">{job.total}</p>
                    <p className="text-xs text-muted-foreground">{t('رسالة فُحصت', 'Messages checked')}</p>
                  </div>
                  <div className="bg-card rounded-lg p-2 border border-green-500/30">
                    <p className="text-xl font-bold text-green-600">{job.indexed}</p>
                    <p className="text-xs text-muted-foreground">{t('ملف مفهرَس', 'Files indexed')}</p>
                  </div>
                  <div className="bg-card rounded-lg p-2 border border-yellow-500/30">
                    <p className="text-xl font-bold text-yellow-600">{job.skipped}</p>
                    <p className="text-xs text-muted-foreground">{t('تخطّى', 'Skipped')}</p>
                  </div>
                  <div className="bg-card rounded-lg p-2 border border-red-500/30">
                    <p className="text-xl font-bold text-red-500">{job.failed}</p>
                    <p className="text-xs text-muted-foreground">{t('فشل', 'Failed')}</p>
                  </div>
                </div>
                {job.log.length > 0 && (
                  <div className="bg-muted rounded-lg p-3 max-h-48 overflow-y-auto text-xs font-mono space-y-0.5" dir="rtl">
                    {job.log.slice(-15).map((l, i) => (
                      <p key={i} className={
                        l.startsWith('✅') ? 'text-green-700' :
                        l.startsWith('❌') ? 'text-red-600' :
                        l.startsWith('⚠️') ? 'text-yellow-700' :
                        l.startsWith('🏷️') ? 'text-purple-700 font-semibold' :
                        l.startsWith('📡') || l.startsWith('🔄') || l.startsWith('🆕') ? 'text-blue-800 font-bold' :
                        l.startsWith('🎉') || l.startsWith('📊') || l.startsWith('📚') ? 'text-blue-800 font-bold' :
                        'text-gray-600'
                      }>{l}</p>
                    ))}
                  </div>
                )}
                {job.finishedAt && (
                  <p className="text-xs text-muted-foreground text-center">
                    {t('انتهت في', 'Finished at')} {formatDate(job.finishedAt)}
                  </p>
                )}
              </CardContent>
            </Card>
          )}

          {/* ── Paste text section ── */}
          <Card className="border-amber-200 bg-amber-50/40">
            <CardHeader className="pb-2">
              <CardTitle className="text-base">📋 {t('لصق محتوى من موقع حكومي', 'Paste content from a government website')}</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <p className="text-xs text-amber-800">
                {t('افتحي صفحة الأحكام القضائية أو تعاميم وزارة العدل من متصفحك، ثم اضغطي', 'Open a judicial decisions or Ministry of Justice circulars page in your browser, then press')}
                {' '}<kbd className="px-1 py-0.5 bg-muted border border-border rounded text-xs">Ctrl+A</kbd> {t('ثم', 'then')}
                {' '}<kbd className="px-1 py-0.5 bg-muted border border-border rounded text-xs">Ctrl+C</kbd> {t('والصقي النص أدناه', 'and paste the text below')}
              </p>
              <input
                type="text" value={pasteTitle}
                onChange={e => setPasteTitle(e.target.value)}
                placeholder={t('اسم المصدر — مثال: تعميم وزارة العدل رقم 123', 'Source name — e.g. Ministry of Justice circular no. 123')}
                className="w-full border border-border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-amber-300 bg-background"
              />
              <textarea
                value={pasteText}
                onChange={e => setPasteText(e.target.value)}
                placeholder={t('الصقي النص المنسوخ من الصفحة هنا...', 'Paste the copied page text here...')}
                rows={5}
                className="w-full border border-border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-amber-300 bg-background resize-y"
                dir="auto"
              />
              <button
                onClick={pasteAndIndex}
                disabled={pasteLoading || !pasteText.trim()}
                className="w-full py-2 bg-amber-500 text-white rounded-lg text-sm font-bold hover:bg-amber-600 disabled:opacity-50"
              >
                {pasteLoading ? `⏳ ${t('جارٍ الفهرسة...', 'Indexing...')}` : `📥 ${t('فهرسة النص الملصق', 'Index pasted text')}`}
              </button>
            </CardContent>
          </Card>

          {/* ── PDF Upload shortcut ── */}
          <Card className="border-orange-200 bg-orange-50/40">
            <CardHeader className="pb-2">
              <CardTitle className="text-base">📄 {t('رفع ملفات PDF / Word مباشرة', 'Upload PDF / Word files directly')}</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-xs text-orange-700 mb-3">
                {t('للمواقع الحكومية التي لا تقبل الفهرسة التلقائية — حملي الصفحة كـ PDF من متصفحك ثم ارفعيها هنا', 'For government sites that do not allow automatic indexing, download the page as a PDF from your browser and upload it here')}
              </p>
              <button
                onClick={() => setLocation('/admin/knowledge-base')}
                className="inline-flex items-center gap-2 px-4 py-2 bg-orange-500 text-white rounded-lg text-sm font-medium hover:bg-orange-600 transition-colors"
              >
                📂 {t('فتح قاعدة المعرفة لرفع الملفات', 'Open knowledge base to upload files')}
              </button>
            </CardContent>
          </Card>

          {/* ── Website URLs section ── */}
          <Card className="border-purple-200 bg-purple-50/40">
            <CardHeader className="pb-3">
              <CardTitle className="text-base">🌐 {t('إضافة مواقع للفهرسة', 'Add websites for indexing')}</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <p className="text-xs text-purple-700">{t('أضيفي رابط أي موقع وسيُفهرَس فوراً في قاعدة المعرفة', 'Add any website URL and it will be indexed immediately in the knowledge base')}</p>
              <div className="space-y-2">
                <input
                  type="text" value={newUrlTitle}
                  onChange={e => setNewUrlTitle(e.target.value)}
                  placeholder={t('الاسم (اختياري) — مثال: وزارة العدل - الأنظمة', 'Name (optional) — e.g. Ministry of Justice - laws')}
                  className="w-full border border-border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-purple-300 bg-background"
                />
                <div className="flex gap-2">
                  <input
                    type="text" value={newUrl}
                    onChange={e => setNewUrl(e.target.value)}
                    placeholder="https://moj.gov.sa/..."
                    dir="ltr"
                    className="flex-1 border border-border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-purple-300 bg-background"
                    onKeyDown={e => e.key === 'Enter' && addUrl()}
                  />
                  <button
                    onClick={addUrl} disabled={urlLoading || !newUrl.trim()}
                    className="px-4 py-2 bg-purple-600 text-white rounded-lg text-sm font-medium hover:bg-purple-700 disabled:opacity-50 shrink-0"
                  >
                    {urlLoading ? '⏳' : `+ ${t('فهرسة', 'Index')}`}
                  </button>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Message */}
          {msg && (
            <div className={`p-3 rounded-lg text-sm flex items-center gap-2 ${msg.type === 'success' ? 'bg-green-50 text-green-800 border border-green-200' : 'bg-red-50 text-red-700 border border-red-200'}`}>
              <span>{msg.type === 'success' ? '✅' : '❌'}</span>
              <span className="flex-1">{msg.text}</span>
              <button onClick={() => setMsg(null)} className="underline shrink-0 text-xs">{t('إغلاق', 'Close')}</button>
            </div>
          )}

        </div>
      )}
      </div>
    </AdminSidebar>
  );
}
