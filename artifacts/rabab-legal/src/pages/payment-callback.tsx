import React, { useEffect, useRef, useState } from 'react';
import { useLocation } from 'wouter';
import { Loader2, CheckCircle2, XCircle, RefreshCw } from 'lucide-react';
import { useQueryClient } from '@tanstack/react-query';
import { getGetMySubscriptionQueryKey } from '@workspace/api-client-react';

const API_BASE = import.meta.env.BASE_URL.replace(/\/$/, '');

type Phase = 'verifying' | 'failed' | 'success';

export default function PaymentCallback() {
  const [, setLocation] = useLocation();
  const queryClient = useQueryClient();
  const ran = useRef(false);
  const [phase, setPhase] = useState<Phase>('verifying');
  const [errorMsg, setErrorMsg] = useState('');

  useEffect(() => {
    if (ran.current) return;
    ran.current = true;
    verify();
  }, []);

  async function verify() {
    try {
      const params = new URLSearchParams(window.location.search);
      const moyasarId = params.get('id');
      const status    = params.get('status');

      // ── 1. Quick checks ──────────────────────────────────────────────────
      if (!moyasarId) {
        setPhase('failed');
        setErrorMsg('لم يُرسل معرّف الدفعة من بوابة الدفع');
        return;
      }
      if (status !== 'paid') {
        setPhase('failed');
        setErrorMsg('تم إلغاء الدفع أو رفضه من بوابة الدفع');
        return;
      }

      // ── 2. Recover paymentId (sessionStorage first, fallback to API) ─────
      let localPaymentId = sessionStorage.getItem('moyasar_local_payment_id');
      sessionStorage.removeItem('moyasar_local_payment_id');

      if (!localPaymentId) {
        // sessionStorage was lost (redirect cleared it) — ask the server for the pending payment
        const fallbackRes = await fetch(`${API_BASE}/api/payments/by-gateway/${encodeURIComponent(moyasarId)}`, {
          credentials: 'include',
        });
        if (fallbackRes.ok) {
          const fallback = await fallbackRes.json();
          if (fallback.found && fallback.payment?.id) {
            // If already paid via this gateway ref — redirect to success directly
            if (fallback.payment.status === 'paid') {
              queryClient.invalidateQueries({ queryKey: getGetMySubscriptionQueryKey() });
              setPhase('success');
              setTimeout(() => setLocation(`/payment/success?paymentId=${fallback.payment.id}&packageId=${fallback.payment.packageId ?? ''}`), 1500);
              return;
            }
            localPaymentId = String(fallback.payment.id);
          }
        }
      }

      if (!localPaymentId) {
        setPhase('failed');
        setErrorMsg('تعذّر الربط بسجل الدفعة — يرجى التواصل مع الدعم مع الاحتفاظ برقم المرجع: ' + moyasarId);
        return;
      }

      // ── 3. Verify with backend ───────────────────────────────────────────
      const res = await fetch(`${API_BASE}/api/payments/verify`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ paymentId: parseInt(localPaymentId, 10), gatewayRef: moyasarId }),
      });

      if (!res.ok) {
        const e = await res.json().catch(() => ({}));
        throw new Error(e.error || 'فشل التحقق من الدفعة');
      }

      const data = await res.json();
      queryClient.invalidateQueries({ queryKey: getGetMySubscriptionQueryKey() });
      setPhase('success');
      setTimeout(() => setLocation(`/payment/success?paymentId=${localPaymentId}&packageId=${data.payment?.packageId ?? ''}`), 1500);

    } catch (err: any) {
      setPhase('failed');
      setErrorMsg(err.message || 'حدث خطأ غير متوقع');
    }
  }

  if (phase === 'verifying') {
    return (
      <div className="min-h-screen flex items-center justify-center flex-col gap-4" dir="rtl">
        <Loader2 className="w-12 h-12 animate-spin text-primary" />
        <p className="text-lg font-medium text-primary">جارٍ التحقق من الدفع…</p>
        <p className="text-sm text-muted-foreground">لا تغلق هذه الصفحة</p>
      </div>
    );
  }

  if (phase === 'success') {
    return (
      <div className="min-h-screen flex items-center justify-center flex-col gap-4" dir="rtl">
        <CheckCircle2 className="w-14 h-14 text-green-500" />
        <p className="text-xl font-bold text-primary">تم التحقق بنجاح! جارٍ التوجيه…</p>
      </div>
    );
  }

  // failed
  return (
    <div className="min-h-screen flex items-center justify-center flex-col gap-5 px-4" dir="rtl">
      <XCircle className="w-14 h-14 text-destructive" />
      <div className="text-center">
        <p className="text-xl font-bold text-destructive mb-2">تعذّر اكتمال التحقق</p>
        <p className="text-sm text-muted-foreground max-w-md leading-relaxed">{errorMsg}</p>
      </div>
      <div className="flex gap-3 flex-wrap justify-center">
        <button
          onClick={() => { ran.current = false; setPhase('verifying'); setErrorMsg(''); verify(); }}
          className="flex items-center gap-2 px-4 py-2 bg-primary text-primary-foreground rounded-xl font-semibold text-sm"
        >
          <RefreshCw className="w-4 h-4" /> إعادة المحاولة
        </button>
        <button
          onClick={() => setLocation('/payment/failed?reason=' + encodeURIComponent(errorMsg))}
          className="px-4 py-2 border border-border rounded-xl text-sm text-muted-foreground hover:bg-muted/40"
        >
          الذهاب لصفحة الخطأ
        </button>
      </div>
      <p className="text-xs text-muted-foreground/60 text-center max-w-sm">
        إذا تم خصم المبلغ من حسابك، تواصل معنا وسنفعّل اشتراكك يدوياً.
      </p>
    </div>
  );
}
