import React, { useState, useEffect, useCallback } from 'react';
import { AdminSidebar } from '@/components/layout';
import { Card, CardContent, Skeleton } from '@/components/ui';
import { DollarSign, CheckCircle, Clock, XCircle, ShieldCheck, X, Send } from 'lucide-react';

const BASE = import.meta.env.BASE_URL.replace(/\/$/, '');

interface PaymentRow {
  id: number;
  userId: number;
  package?: { nameAr: string };
  amount: number;
  vatAmount: number;
  totalAmount: number;
  discountAmount: number;
  couponCode: string | null;
  status: 'pending' | 'paid' | 'failed' | 'refunded';
  gateway: string | null;
  gatewayRef: string | null;
  billingName: string | null;
  billingEmail: string | null;
  userName: string | null;
  userEmail: string | null;
  createdAt: string;
}

const STATUS_CONFIG: Record<string, { label: string; icon: React.ReactNode; color: string }> = {
  paid:     { label: 'مدفوع',    icon: <CheckCircle className="w-3.5 h-3.5" />, color: 'bg-green-100 text-green-700' },
  pending:  { label: 'معلق',     icon: <Clock className="w-3.5 h-3.5" />,        color: 'bg-yellow-100 text-yellow-700' },
  failed:   { label: 'فشل',      icon: <XCircle className="w-3.5 h-3.5" />,      color: 'bg-red-100 text-red-700' },
  refunded: { label: 'مُسترد',   icon: <DollarSign className="w-3.5 h-3.5" />,   color: 'bg-muted text-muted-foreground border border-border' },
};

interface VerifyModalProps {
  payment: PaymentRow;
  onClose: () => void;
  onSuccess: () => void;
}

function ManualVerifyModal({ payment, onClose, onSuccess }: VerifyModalProps) {
  const [moyasarId, setMoyasarId] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleVerify = async () => {
    if (!moyasarId.trim()) { setError('يرجى إدخال معرّف ميسّر'); return; }
    setLoading(true);
    setError(null);
    try {
      const r = await fetch(`${BASE}/api/admin/payments/manual-verify`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ moyasarId: moyasarId.trim(), paymentId: payment.id }),
      });
      const data = await r.json();
      if (!r.ok) { setError(data.error ?? 'فشل التحقق'); return; }
      onSuccess();
      onClose();
    } catch {
      setError('حدث خطأ في الاتصال بالخادم');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40" onClick={onClose}>
      <div className="bg-card rounded-xl shadow-xl p-6 w-full max-w-md mx-4 border border-border" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-bold text-primary">التحقق اليدوي من الدفعة</h2>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground"><X className="w-5 h-5" /></button>
        </div>

        <div className="mb-4 p-3 bg-muted rounded-lg text-sm space-y-1">
          <p><span className="text-muted-foreground">المستخدم:</span> <span className="font-medium">{payment.userName ?? payment.billingName ?? `#${payment.userId}`}</span></p>
          <p><span className="text-muted-foreground">الباقة:</span> <span className="font-medium">{payment.package?.nameAr ?? '—'}</span></p>
          <p><span className="text-muted-foreground">المبلغ:</span> <span className="font-medium">{payment.totalAmount.toFixed(2)} ر.س</span></p>
        </div>

        <label className="block text-sm font-medium mb-1.5">معرّف الدفعة في ميسّر</label>
        <input
          type="text"
          dir="ltr"
          value={moyasarId}
          onChange={e => setMoyasarId(e.target.value)}
          placeholder="مثال: pay_xxxxxxxxxxxxxxxx"
          className="w-full border border-border rounded-lg px-3 py-2 text-sm font-mono mb-3 focus:outline-none focus:ring-2 focus:ring-primary/30"
        />

        {error && <p className="text-sm text-red-600 mb-3">{error}</p>}

        <div className="flex gap-2 justify-end">
          <button onClick={onClose} className="px-4 py-2 rounded-lg border text-sm hover:bg-muted">إلغاء</button>
          <button
            onClick={handleVerify}
            disabled={loading}
            className="px-4 py-2 rounded-lg bg-primary text-white text-sm font-medium hover:bg-primary/90 disabled:opacity-60 flex items-center gap-2"
          >
            <ShieldCheck className="w-4 h-4" />
            {loading ? 'جارٍ التحقق...' : 'تحقق وفعّل'}
          </button>
        </div>
      </div>
    </div>
  );
}

export default function AdminPayments() {
  const [payments, setPayments] = useState<PaymentRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<'all' | 'paid' | 'pending' | 'failed'>('all');
  const [verifyTarget, setVerifyTarget] = useState<PaymentRow | null>(null);
  const [resendingId, setResendingId] = useState<number | null>(null);
  const [resendMsg, setResendMsg] = useState<{ id: number; ok: boolean; text: string } | null>(null);

  const handleResend = useCallback(async (p: PaymentRow) => {
    setResendingId(p.id);
    setResendMsg(null);
    try {
      const r = await fetch(`${BASE}/api/admin/payments/${p.id}/resend-email`, {
        method: 'POST',
        credentials: 'include',
      });
      const data = await r.json();
      setResendMsg({ id: p.id, ok: r.ok, text: r.ok ? (data.message ?? 'تم الإرسال بنجاح') : (data.error ?? 'فشل الإرسال') });
    } catch {
      setResendMsg({ id: p.id, ok: false, text: 'حدث خطأ في الاتصال بالخادم' });
    } finally {
      setResendingId(null);
    }
  }, []);

  const fetchPayments = useCallback(async () => {
    try {
      const r = await fetch(`${BASE}/api/admin/payments`, { credentials: 'include' });
      if (!r.ok) throw new Error('فشل تحميل المدفوعات');
      setPayments(await r.json());
    } catch (e: any) { setError(e.message); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { fetchPayments(); }, [fetchPayments]);

  const filtered = filter === 'all' ? payments : payments.filter(p => p.status === filter);
  const totalRevenue = payments.filter(p => p.status === 'paid').reduce((s, p) => s + p.totalAmount, 0);
  const pending = payments.filter(p => p.status === 'pending').length;
  const paidCount = payments.filter(p => p.status === 'paid').length;

  return (
    <AdminSidebar>
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-primary">المدفوعات</h1>
        <p className="text-muted-foreground mt-1">سجل كامل بجميع المعاملات المالية</p>
      </div>

      {error && <div className="mb-4 p-3 bg-red-50 text-red-700 rounded-lg text-sm">{error}</div>}

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
        <Card><CardContent className="p-4 text-center"><p className="text-2xl font-bold text-primary">{payments.length}</p><p className="text-sm text-muted-foreground">إجمالي</p></CardContent></Card>
        <Card><CardContent className="p-4 text-center"><p className="text-2xl font-bold text-green-600">{paidCount}</p><p className="text-sm text-muted-foreground">مدفوع</p></CardContent></Card>
        <Card><CardContent className="p-4 text-center"><p className="text-2xl font-bold text-yellow-600">{pending}</p><p className="text-sm text-muted-foreground">معلق</p></CardContent></Card>
        <Card><CardContent className="p-4 text-center"><p className="text-xl font-bold text-blue-600">{totalRevenue.toLocaleString()} <span className="text-xs">ر.س</span></p><p className="text-sm text-muted-foreground">الإيرادات</p></CardContent></Card>
      </div>

      {/* Filter */}
      <div className="flex gap-2 mb-4 flex-wrap">
        {(['all', 'paid', 'pending', 'failed'] as const).map(f => (
          <button key={f} onClick={() => setFilter(f)}
            className={`px-4 py-1.5 rounded-full text-sm font-medium transition-colors ${filter === f ? 'bg-primary text-white' : 'bg-muted hover:bg-muted/70 text-foreground'}`}>
            {f === 'all' ? 'الكل' : STATUS_CONFIG[f]?.label}
          </button>
        ))}
      </div>

      <Card>
        <CardContent className="p-0">
          {loading ? (
            <div className="p-6 space-y-3">{[1,2,3,4].map(i => <Skeleton key={i} className="h-12 w-full" />)}</div>
          ) : filtered.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground">لا توجد مدفوعات</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm text-right">
                <thead className="bg-muted text-xs text-muted-foreground border-b">
                  <tr>
                    <th className="py-3 px-4 font-semibold">#</th>
                    <th className="py-3 px-4 font-semibold">المستخدم</th>
                    <th className="py-3 px-4 font-semibold">الباقة</th>
                    <th className="py-3 px-4 font-semibold">المبلغ</th>
                    <th className="py-3 px-4 font-semibold">الكوبون</th>
                    <th className="py-3 px-4 font-semibold">الحالة</th>
                    <th className="py-3 px-4 font-semibold">التاريخ</th>
                    <th className="py-3 px-4 font-semibold">إجراء</th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map(p => {
                    const cfg = STATUS_CONFIG[p.status] ?? STATUS_CONFIG.pending;
                    return (
                      <tr key={p.id} className="border-b border-border/50 hover:bg-muted/20">
                        <td className="py-3 px-4 text-muted-foreground font-mono">{p.id}</td>
                        <td className="py-3 px-4">
                          <p className="font-medium">{p.userName ?? p.billingName ?? `مستخدم ${p.userId}`}</p>
                          {(p.userEmail ?? p.billingEmail) && <p className="text-xs text-muted-foreground">{p.userEmail ?? p.billingEmail}</p>}
                        </td>
                        <td className="py-3 px-4">{p.package?.nameAr ?? '—'}</td>
                        <td className="py-3 px-4">
                          <p className="font-semibold">{p.totalAmount.toFixed(2)} ر.س</p>
                          {p.discountAmount > 0 && <p className="text-xs text-green-600">- {p.discountAmount.toFixed(2)} خصم</p>}
                        </td>
                        <td className="py-3 px-4">{p.couponCode ? <span className="font-mono text-xs bg-muted px-1.5 py-0.5 rounded">{p.couponCode}</span> : '—'}</td>
                        <td className="py-3 px-4">
                          <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-medium ${cfg.color}`}>
                            {cfg.icon}{cfg.label}
                          </span>
                        </td>
                        <td className="py-3 px-4 text-muted-foreground">{new Date(p.createdAt).toLocaleDateString('ar-SA')}</td>
                        <td className="py-3 px-4">
                          <div className="flex flex-col gap-1.5">
                            {p.status === 'pending' && (
                              <button
                                onClick={() => setVerifyTarget(p)}
                                className="inline-flex items-center gap-1 px-2.5 py-1 rounded text-xs font-medium bg-blue-50 text-blue-700 hover:bg-blue-100 transition-colors"
                              >
                                <ShieldCheck className="w-3.5 h-3.5" />
                                تحقق
                              </button>
                            )}
                            {p.status === 'paid' && (p.billingEmail ?? p.userEmail) && (
                              <button
                                onClick={() => handleResend(p)}
                                disabled={resendingId === p.id}
                                className="inline-flex items-center gap-1 px-2.5 py-1 rounded text-xs font-medium bg-emerald-50 text-emerald-700 hover:bg-emerald-100 transition-colors disabled:opacity-60"
                              >
                                <Send className="w-3.5 h-3.5" />
                                {resendingId === p.id ? 'جارٍ الإرسال...' : 'إعادة إرسال الفاتورة'}
                              </button>
                            )}
                            {resendMsg?.id === p.id && (
                              <span className={`text-xs ${resendMsg.ok ? 'text-emerald-600' : 'text-red-600'}`}>
                                {resendMsg.text}
                              </span>
                            )}
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      {verifyTarget && (
        <ManualVerifyModal
          payment={verifyTarget}
          onClose={() => setVerifyTarget(null)}
          onSuccess={fetchPayments}
        />
      )}
    </AdminSidebar>
  );
}
