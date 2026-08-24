import React, { useState, useEffect, useRef } from 'react';
import { useLocation } from 'wouter';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import {
  getGetMySubscriptionQueryKey,
  getGetPackageQueryKey,
  useGetPackage,
  useGetMySubscription,
} from '@workspace/api-client-react';
import { useAuth } from '@/hooks/use-auth';
import { Navbar, Footer } from '@/components/layout';
import { Button, Input, Label, Card, CardContent, CardHeader, CardTitle } from '@/components/ui';
import { CreditCard, Tag, ShieldCheck, Loader2, Info, AlertCircle, CheckCircle2, ArrowRight } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { useQueryClient } from '@tanstack/react-query';

declare global { interface Window { Moyasar: any } }

const MOYASAR_PUB_KEY = import.meta.env.VITE_MOYASAR_PUBLISHABLE_KEY as string | undefined;

const API_BASE = import.meta.env.BASE_URL.replace(/\/$/, '');

const paymentSchema = z.object({
  billingName: z.string().min(2, "الاسم مطلوب"),
  billingEmail: z.string().email("بريد إلكتروني غير صالح"),
  billingPhone: z.string().min(9, "رقم الجوال مطلوب"),
  gateway: z.enum(['moyasar', 'hyperpay', 'tap'], { required_error: "اختر طريقة الدفع" })
});

type PaymentFormValues = z.infer<typeof paymentSchema>;

export default function PaymentFlow() {
  const [, setLocation] = useLocation();
  const { user } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const searchParams = new URLSearchParams(window.location.search);
  const packageIdParam = searchParams.get('packageId');
  const packageId = packageIdParam ? parseInt(packageIdParam, 10) : null;

  const { data: pkg, isLoading: pkgLoading } = useGetPackage(packageId as number, {
    query: { queryKey: getGetPackageQueryKey(packageId as number), enabled: !!packageId }
  });

  const { data: currentSub } = useGetMySubscription({
    query: { queryKey: getGetMySubscriptionQueryKey(), retry: false },
  });

  const [couponCode, setCouponCode] = useState('');
  const [appliedCoupon, setAppliedCoupon] = useState<any>(null);
  const [isCheckingCoupon, setIsCheckingCoupon] = useState(false);
  const [isVerifying, setIsVerifying] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [freeActivating, setFreeActivating] = useState(false);
  const [moyasarStep, setMoyasarStep] = useState(false);
  const [pendingPaymentId, setPendingPaymentId] = useState<number | null>(null);
  const moyasarMounted = useRef(false);

  const form = useForm<PaymentFormValues>({
    resolver: zodResolver(paymentSchema),
    defaultValues: {
      billingName: user?.name || '',
      billingEmail: user?.email || '',
      billingPhone: user?.phone || '',
      gateway: 'moyasar'
    }
  });

  useEffect(() => {
    if (!packageId) setLocation('/pricing');
  }, [packageId, setLocation]);

  // Free package: activate directly without payment
  const handleFreeActivation = async () => {
    if (!packageId) return;
    setFreeActivating(true);
    try {
      const res = await fetch(`${API_BASE}/api/subscriptions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ packageId }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || 'فشل تفعيل الباقة');
      }
      queryClient.invalidateQueries({ queryKey: getGetMySubscriptionQueryKey() });
      setLocation('/payment/success?paymentId=free&packageId=' + packageId);
    } catch (err: any) {
      toast({ variant: 'destructive', title: 'خطأ', description: err.message });
    } finally {
      setFreeActivating(false);
    }
  };

  const handleApplyCoupon = async () => {
    if (!couponCode || !packageId) return;
    setIsCheckingCoupon(true);
    try {
      const res = await fetch(`${API_BASE}/api/coupons/validate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ code: couponCode, packageId })
      });
      const data = await res.json();
      if (res.ok && data.valid) {
        setAppliedCoupon(data);
        toast({ title: "✓ تم تطبيق الكوبون بنجاح" });
      } else {
        toast({ variant: "destructive", title: "كوبون غير صالح", description: data.error || "هذا الكوبون غير صالح أو منتهي" });
        setAppliedCoupon(null);
      }
    } catch {
      toast({ variant: "destructive", title: "خطأ", description: "حدث خطأ أثناء التحقق من الكوبون" });
    } finally {
      setIsCheckingCoupon(false);
    }
  };

  // ── Load Moyasar.js + CSS when entering step 2 ───────────────────────────
  useEffect(() => {
    if (!moyasarStep || !MOYASAR_PUB_KEY || !pkg || !pendingPaymentId) return;
    if (moyasarMounted.current) return;
    moyasarMounted.current = true;

    // Load CSS
    if (!document.getElementById('moyasar-css')) {
      const link = document.createElement('link');
      link.id = 'moyasar-css';
      link.rel = 'stylesheet';
      link.href = 'https://cdn.moyasar.com/mpf/1.14.0/moyasar.css';
      document.head.appendChild(link);
    }

    const initForm = () => {
      const basePrice = pkg.price || 0;
      const discount = appliedCoupon ? appliedCoupon.discountAmount : 0;
      const total = Math.round(((basePrice - discount) * 1.15) * 100); // halalas

      // Store local payment ID so callback page can retrieve it
      sessionStorage.setItem('moyasar_local_payment_id', String(pendingPaymentId));

      const callbackUrl = window.location.origin +
        import.meta.env.BASE_URL.replace(/\/$/, '') + '/payment/callback';

      window.Moyasar.init({
        element: '.mysr-form',
        amount: total,
        currency: 'SAR',
        description: `RABAB LEGAL AI — ${pkg.nameAr}`,
        publishable_api_key: MOYASAR_PUB_KEY,
        callback_url: callbackUrl,
        methods: ['creditcard', 'stcpay'],
        apple_pay: {
          country: 'SA',
          label: pkg.nameAr,
          validate_merchant_url: 'https://api.moyasar.com/v1/applepay/initiate',
        },
      });
    };

    if (window.Moyasar) {
      initForm();
    } else {
      const script = document.createElement('script');
      script.src = 'https://cdn.moyasar.com/mpf/1.14.0/moyasar.js';
      script.onload = initForm;
      document.body.appendChild(script);
    }
  }, [moyasarStep, pkg, pendingPaymentId, appliedCoupon]);

  const onSubmit = async (data: PaymentFormValues) => {
    if (!packageId) return;
    setIsSubmitting(true);
    try {
      const initiateRes = await fetch(`${API_BASE}/api/payments/initiate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          packageId,
          billingName: data.billingName,
          billingEmail: data.billingEmail,
          billingPhone: data.billingPhone,
          gateway: 'moyasar',
          couponCode: appliedCoupon?.code ?? undefined,
        }),
      });
      if (!initiateRes.ok) {
        const err = await initiateRes.json().catch(() => ({}));
        throw new Error(err.error || 'فشل تهيئة الدفع');
      }
      const initiated = await initiateRes.json();

      if (MOYASAR_PUB_KEY) {
        // Real Moyasar: show JS form widget
        setPendingPaymentId(initiated.paymentId);
        setMoyasarStep(true);
      } else {
        // Sandbox simulation (no key configured yet)
        setIsVerifying(true);
        const verifyRes = await fetch(`${API_BASE}/api/payments/verify`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
          body: JSON.stringify({ paymentId: initiated.paymentId }),
        });
        if (!verifyRes.ok) {
          const err = await verifyRes.json().catch(() => ({}));
          throw new Error(err.error || 'فشل تفعيل الباقة');
        }
        queryClient.invalidateQueries({ queryKey: getGetMySubscriptionQueryKey() });
        setLocation(`/payment/success?paymentId=${initiated.paymentId}&packageId=${packageId}`);
      }
    } catch (err: any) {
      toast({ variant: "destructive", title: "خطأ في الدفع", description: err.message || "يرجى المحاولة مرة أخرى." });
    } finally {
      setIsSubmitting(false);
      setIsVerifying(false);
    }
  };

  if (pkgLoading) {
    return <div className="min-h-screen flex items-center justify-center"><Loader2 className="w-8 h-8 animate-spin text-primary" /></div>;
  }

  if (!pkg) return null;

  // ── Step 2: Moyasar payment form ─────────────────────────────────────────
  if (moyasarStep && MOYASAR_PUB_KEY) {
    const basePrice = pkg.price || 0;
    const discount = appliedCoupon ? appliedCoupon.discountAmount : 0;
    const total = ((basePrice - discount) * 1.15).toFixed(2);
    return (
      <div className="min-h-screen flex flex-col bg-muted/20" dir="rtl">
        <Navbar />
        <main className="flex-1 container mx-auto px-4 py-12 max-w-xl">
          <div className="text-center mb-8">
            <div className="inline-flex items-center gap-2 text-sm text-muted-foreground mb-3 bg-muted rounded-full px-4 py-1">
              <span className="text-primary font-bold">١</span> البيانات
              <ArrowRight className="w-3 h-3" />
              <span className="text-primary font-bold">٢</span> الدفع
            </div>
            <h1 className="text-2xl font-bold text-primary">إدخال بيانات البطاقة</h1>
            <p className="text-muted-foreground text-sm mt-1">{pkg.nameAr} — {total} ر.س شاملاً الضريبة</p>
          </div>

          <Card className="shadow-lg border-border/50">
            <div className="h-1.5 bg-gradient-to-l from-secondary to-primary rounded-t-xl" />
            <CardContent className="pt-6 pb-8">
              <div className="flex items-center gap-2 text-xs text-muted-foreground mb-6 bg-green-50 border border-green-200 rounded-lg p-3">
                <ShieldCheck className="w-4 h-4 text-green-600 shrink-0" />
                <span>بيانات بطاقتك محمية بتشفير SSL — لا تُحفظ على خوادمنا</span>
              </div>
              {/* Moyasar.js renders here */}
              <div className="mysr-form" />
            </CardContent>
          </Card>

          <button
            onClick={() => { setMoyasarStep(false); moyasarMounted.current = false; sessionStorage.removeItem('moyasar_local_payment_id'); }}
            className="mt-4 text-sm text-muted-foreground hover:text-primary underline block text-center w-full"
          >
            ← العودة لتعديل البيانات
          </button>
        </main>
        <Footer />
      </div>
    );
  }

  const isFree = pkg.type === 'free';
  const hasActiveSub = currentSub && currentSub.status === 'active';
  const samePackage = hasActiveSub && currentSub.packageId === pkg.id;

  // ── FREE PACKAGE: skip payment entirely ───────────────────────────────────
  if (isFree) {
    return (
      <div className="min-h-screen flex flex-col bg-muted/20" dir="rtl">
        <Navbar />
        <main className="flex-1 flex items-center justify-center p-4">
          <Card className="w-full max-w-md text-center shadow-lg">
            <div className="h-2 bg-gradient-to-l from-secondary to-primary rounded-t-xl" />
            <CardContent className="pt-10 pb-8 px-8">
              <div className="w-20 h-20 bg-primary/10 rounded-full flex items-center justify-center mx-auto mb-5">
                <CheckCircle2 className="w-10 h-10 text-primary" />
              </div>
              <h1 className="text-2xl font-bold text-primary mb-2">{pkg.nameAr}</h1>
              <p className="text-muted-foreground mb-2 text-sm">
                {pkg.questionsAllowed} استشارات مجانية — لا يُطلب أي بيانات دفع
              </p>
              {hasActiveSub && !samePackage && (
                <div className="mb-4 p-3 bg-amber-50 border border-amber-200 rounded-lg text-sm text-amber-800">
                  <strong>تنبيه:</strong> تفعيل هذه الباقة سيلغي اشتراكك الحالي «{currentSub.package?.nameAr}».
                </div>
              )}
              {samePackage && (
                <div className="mb-4 p-3 bg-green-50 border border-green-200 rounded-lg text-sm text-green-800">
                  أنت مشترك بالفعل في هذه الباقة — لديك {currentSub.questionsRemaining} استشارة متبقية.
                </div>
              )}
              <Button
                className="w-full h-12 text-base font-bold"
                onClick={handleFreeActivation}
                disabled={freeActivating || !!samePackage}
              >
                {freeActivating ? <><Loader2 className="w-4 h-4 animate-spin ml-2" /> جارٍ التفعيل...</> : 'تفعيل الباقة المجانية'}
              </Button>
              <button onClick={() => setLocation('/pricing')} className="mt-3 text-sm text-muted-foreground hover:text-primary underline block w-full">
                العودة للباقات
              </button>
            </CardContent>
          </Card>
        </main>
        <Footer />
      </div>
    );
  }

  // ── PAID PACKAGE ──────────────────────────────────────────────────────────
  const basePrice = pkg?.price || 0;
  const discount = appliedCoupon ? appliedCoupon.discountAmount : 0;
  const priceAfterDiscount = basePrice - discount;
  const vat = priceAfterDiscount * 0.15;
  const total = priceAfterDiscount + vat;
  const isPending = isSubmitting || isVerifying;

  return (
    <div className="min-h-screen flex flex-col bg-muted/20" dir="rtl">
      <Navbar />

      <main className="flex-1 container mx-auto px-4 py-12 max-w-5xl">
        <h1 className="text-3xl font-bold text-primary mb-2 text-center">إتمام عملية الدفع</h1>
        <p className="text-center text-muted-foreground mb-6 text-sm">دفع آمن ومشفّر — لا تُفعَّل الباقة إلا بعد نجاح الدفع</p>

        {/* Active subscription warning */}
        {hasActiveSub && !samePackage && (
          <div className="mb-6 flex items-start gap-3 p-4 bg-amber-50 border border-amber-200 rounded-xl text-sm text-amber-900">
            <AlertCircle className="w-5 h-5 shrink-0 mt-0.5 text-amber-600" />
            <p>
              لديك اشتراك نشط حالياً في «<strong>{currentSub.package?.nameAr}</strong>» بـ {currentSub.questionsRemaining} استشارة متبقية.
              إتمام هذا الدفع سيلغي الاشتراك الحالي ويُفعّل الباقة الجديدة فوراً.
            </p>
          </div>
        )}
        {samePackage && (
          <div className="mb-6 flex items-start gap-3 p-4 bg-blue-50 border border-blue-200 rounded-xl text-sm text-blue-900">
            <CheckCircle2 className="w-5 h-5 shrink-0 mt-0.5 text-blue-600" />
            <p>أنت مشترك بالفعل في هذه الباقة — لديك <strong>{currentSub.questionsRemaining}</strong> استشارة متبقية. يمكنك تجديد الباقة للحصول على رصيد إضافي.</p>
          </div>
        )}

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          {/* Right Col: Form */}
          <div className="lg:col-span-2 space-y-6">
            <Card className="border-border/50 shadow-sm">
              <CardHeader>
                <CardTitle className="text-xl">بيانات المشتري (للفاتورة الضريبية)</CardTitle>
              </CardHeader>
              <CardContent>
                <form id="payment-form" onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
                  <div className="space-y-2">
                    <Label>الاسم الكامل</Label>
                    <Input {...form.register('billingName')} placeholder="الاسم كما في الهوية" />
                    {form.formState.errors.billingName && <p className="text-sm text-destructive">{form.formState.errors.billingName.message}</p>}
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label>البريد الإلكتروني</Label>
                      <Input {...form.register('billingEmail')} dir="ltr" className="text-left" placeholder="email@example.com" />
                      {form.formState.errors.billingEmail && <p className="text-sm text-destructive">{form.formState.errors.billingEmail.message}</p>}
                    </div>
                    <div className="space-y-2">
                      <Label>رقم الجوال</Label>
                      <Input {...form.register('billingPhone')} dir="ltr" className="text-left" placeholder="05XXXXXXXX" />
                      {form.formState.errors.billingPhone && <p className="text-sm text-destructive">{form.formState.errors.billingPhone.message}</p>}
                    </div>
                  </div>

                  <div className="pt-6">
                    <Label className="text-lg font-bold mb-4 block">طريقة الدفع</Label>
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                      {[
                        { value: 'moyasar', label: 'البطاقة الائتمانية', sub: 'Visa / Mastercard',
                          icon: <CreditCard className="w-8 h-8" /> },
                        { value: 'hyperpay', label: 'Apple Pay', sub: '',
                          icon: <div className="w-8 h-8 rounded-full bg-[#1A1A1A] text-white flex items-center justify-center font-bold text-xs"></div> },
                        { value: 'tap', label: 'مدى', sub: '',
                          icon: <div className="w-8 h-8 bg-green-500 rounded text-white flex items-center justify-center font-bold text-xs">مدى</div> },
                      ].map(gw => (
                        <label
                          key={gw.value}
                          className={`cursor-pointer border-2 rounded-xl p-4 flex flex-col items-center justify-center gap-2 transition-colors
                            ${form.watch('gateway') === gw.value ? 'border-primary bg-primary/5' : 'border-border hover:border-primary/50'}`}
                        >
                          <input type="radio" value={gw.value} {...form.register('gateway')} className="sr-only" />
                          <span className={form.watch('gateway') === gw.value ? 'text-primary' : 'text-muted-foreground'}>
                            {gw.icon}
                          </span>
                          <span className="font-bold text-sm">{gw.label}</span>
                          {gw.sub && <span className="text-[11px] text-muted-foreground">{gw.sub}</span>}
                        </label>
                      ))}
                    </div>
                    {form.formState.errors.gateway && (
                      <p className="text-sm text-destructive mt-2">{form.formState.errors.gateway.message}</p>
                    )}
                  </div>
                </form>
              </CardContent>
            </Card>

            {/* Security note */}
            <div className="flex items-start gap-3 text-sm text-muted-foreground bg-muted/50 rounded-xl p-4 border border-border/40">
              <ShieldCheck className="w-4 h-4 shrink-0 mt-0.5 text-green-600" />
              <p>
                الدفع يتم عبر بوابة آمنة ومشفرة. <strong>لا تُفعَّل الباقة ولا يُخصم أي مبلغ</strong> إلا بعد اكتمال العملية بنجاح.
                عند فشل الدفع أو إلغائه لا يتغير رصيدك.
              </p>
            </div>
          </div>

          {/* Left Col: Summary */}
          <div className="space-y-6">
            <Card className="border-secondary/50 shadow-md sticky top-24">
              <CardHeader className="bg-primary text-primary-foreground rounded-t-xl pb-6">
                <CardTitle className="text-xl">ملخص الطلب</CardTitle>
              </CardHeader>
              <CardContent className="pt-6">
                <div className="flex justify-between items-center mb-6">
                  <div>
                    <h3 className="font-bold text-lg text-primary">{pkg.nameAr}</h3>
                    <p className="text-sm text-muted-foreground">
                      {pkg.questionsAllowed >= 999 ? 'أسئلة غير محدودة' : `${pkg.questionsAllowed} استشارات`}
                      {pkg.type === 'monthly' && ' / شهرياً'}
                    </p>
                  </div>
                  <span className="font-bold text-lg">{basePrice.toFixed(2)} ر.س</span>
                </div>

                {/* Coupon */}
                <div className="mb-6 pb-6 border-b border-border">
                  <Label className="text-sm mb-2 flex items-center gap-1">
                    <Tag className="w-3.5 h-3.5" /> كود الخصم (اختياري)
                  </Label>
                  <div className="flex gap-2">
                    <Input
                      placeholder="أدخل الكود"
                      value={couponCode}
                      onChange={e => setCouponCode(e.target.value.toUpperCase())}
                      disabled={!!appliedCoupon}
                      dir="ltr"
                      className="text-left font-mono"
                    />
                    {appliedCoupon ? (
                      <Button variant="outline" className="text-destructive border-destructive/50 shrink-0" onClick={() => { setAppliedCoupon(null); setCouponCode(''); }}>إلغاء</Button>
                    ) : (
                      <Button variant="secondary" onClick={handleApplyCoupon} disabled={!couponCode || isCheckingCoupon} className="shrink-0">
                        {isCheckingCoupon ? <Loader2 className="w-4 h-4 animate-spin" /> : "تطبيق"}
                      </Button>
                    )}
                  </div>
                </div>

                <div className="space-y-3 mb-6 text-sm">
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">المبلغ الأساسي</span>
                    <span>{basePrice.toFixed(2)} ر.س</span>
                  </div>
                  {appliedCoupon && (
                    <div className="flex justify-between text-green-600 font-medium">
                      <span>الخصم ({appliedCoupon.code})</span>
                      <span>- {discount.toFixed(2)} ر.س</span>
                    </div>
                  )}
                  <div className="flex justify-between">
                    <span className="text-muted-foreground flex items-center gap-1">
                      ضريبة القيمة المضافة (15%) <Info className="w-3 h-3" />
                    </span>
                    <span>{vat.toFixed(2)} ر.س</span>
                  </div>
                </div>

                <div className="flex justify-between items-center pt-4 border-t border-border mb-6">
                  <span className="font-bold text-lg text-primary">الإجمالي</span>
                  <span className="font-bold text-2xl text-primary">
                    {total.toFixed(2)} <span className="text-sm font-normal text-muted-foreground">ر.س</span>
                  </span>
                </div>

                <div className="flex items-center gap-2 mb-4 text-xs text-muted-foreground justify-center">
                  <ShieldCheck className="w-4 h-4 text-green-600" />
                  <span>دفع آمن ومشفر 100%</span>
                </div>

                <Button
                  type="submit"
                  form="payment-form"
                  className="w-full h-14 text-lg font-bold shadow-lg"
                  disabled={isPending}
                >
                  {isPending
                    ? <><Loader2 className="w-5 h-5 animate-spin ml-2" /> جارٍ معالجة الدفع...</>
                    : `ادفع ${total.toFixed(2)} ر.س`
                  }
                </Button>

                <p className="text-center text-[11px] text-muted-foreground/60 mt-3">
                  بالضغط على «ادفع» توافقين على <a href="/terms" className="underline">شروط الاستخدام</a> و<a href="/privacy" className="underline">سياسة الخصوصية</a>
                </p>
              </CardContent>
            </Card>
          </div>
        </div>
      </main>

      <Footer />
    </div>
  );
}
