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
import { useLang } from '@/hooks/use-language';

declare global { interface Window { Moyasar: any } }

const MOYASAR_PUB_KEY = import.meta.env.VITE_MOYASAR_PUBLISHABLE_KEY as string | undefined;

const API_BASE = import.meta.env.BASE_URL.replace(/\/$/, '');

type PaymentFormValues = {
  billingName: string;
  billingEmail: string;
  billingPhone: string;
  gateway: 'moyasar' | 'hyperpay' | 'tap';
};

export default function PaymentFlow() {
  const [, setLocation] = useLocation();
  const { user } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { lang, t } = useLang();
  const paymentSchema = z.object({
    billingName: z.string().min(2, t('الاسم مطلوب', 'Name is required')),
    billingEmail: z.string().email(t('بريد إلكتروني غير صالح', 'Invalid email address')),
    billingPhone: z.string().min(9, t('رقم الجوال مطلوب', 'Mobile number is required')),
    gateway: z.enum(['moyasar', 'hyperpay', 'tap'], { required_error: t('اختر طريقة الدفع', 'Choose a payment method') })
  });

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
        throw new Error(err.error || t('فشل تفعيل الباقة', 'Failed to activate the package'));
      }
      queryClient.invalidateQueries({ queryKey: getGetMySubscriptionQueryKey() });
      setLocation('/payment/success?paymentId=free&packageId=' + packageId);
    } catch (err: any) {
      toast({ variant: 'destructive', title: t('خطأ', 'Error'), description: err.message });
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
        toast({ title: t('✓ تم تطبيق الكوبون بنجاح', '✓ Coupon applied successfully') });
      } else {
        toast({ variant: "destructive", title: t('كوبون غير صالح', 'Invalid coupon'), description: data.error || t('هذا الكوبون غير صالح أو منتهي', 'This coupon is invalid or expired') });
        setAppliedCoupon(null);
      }
    } catch {
      toast({ variant: "destructive", title: t('خطأ', 'Error'), description: t('حدث خطأ أثناء التحقق من الكوبون', 'An error occurred while validating the coupon') });
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
        description: `RABAB LEGAL AI — ${lang === 'ar' ? pkg.nameAr : (pkg.nameEn || pkg.nameAr)}`,
        publishable_api_key: MOYASAR_PUB_KEY,
        callback_url: callbackUrl,
        methods: ['creditcard', 'stcpay'],
        apple_pay: {
          country: 'SA',
          label: lang === 'ar' ? pkg.nameAr : (pkg.nameEn || pkg.nameAr),
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
  }, [moyasarStep, pkg, pendingPaymentId, appliedCoupon, lang]);

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
        throw new Error(err.error || t('فشل تهيئة الدفع', 'Failed to initialize payment'));
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
          throw new Error(err.error || t('فشل تفعيل الباقة', 'Failed to activate the package'));
        }
        queryClient.invalidateQueries({ queryKey: getGetMySubscriptionQueryKey() });
        setLocation(`/payment/success?paymentId=${initiated.paymentId}&packageId=${packageId}`);
      }
    } catch (err: any) {
      toast({ variant: "destructive", title: t('خطأ في الدفع', 'Payment error'), description: err.message || t('يرجى المحاولة مرة أخرى.', 'Please try again.') });
    } finally {
      setIsSubmitting(false);
      setIsVerifying(false);
    }
  };

  if (pkgLoading) {
    return <div className="min-h-screen flex items-center justify-center" dir={lang === 'ar' ? 'rtl' : 'ltr'}><Loader2 className="w-8 h-8 animate-spin text-primary" /></div>;
  }

  if (!pkg) return null;

  // ── Step 2: Moyasar payment form ─────────────────────────────────────────
  if (moyasarStep && MOYASAR_PUB_KEY) {
    const basePrice = pkg.price || 0;
    const discount = appliedCoupon ? appliedCoupon.discountAmount : 0;
    const total = ((basePrice - discount) * 1.15).toFixed(2);
    return (
      <div className="min-h-screen flex flex-col bg-muted/20" dir={lang === 'ar' ? 'rtl' : 'ltr'}>
        <Navbar />
        <main className="flex-1 container mx-auto px-4 py-12 max-w-xl">
          <div className="text-center mb-8">
            <div className="inline-flex items-center gap-2 text-sm text-muted-foreground mb-3 bg-muted rounded-full px-4 py-1">
              <span className="text-primary font-bold">1</span> {t('البيانات', 'Details')}
              <ArrowRight className="w-3 h-3" />
              <span className="text-primary font-bold">2</span> {t('الدفع', 'Payment')}
            </div>
            <h1 className="text-2xl font-bold text-primary">{t('إدخال بيانات البطاقة', 'Enter card details')}</h1>
            <p className="text-muted-foreground text-sm mt-1">{lang === 'ar' ? pkg.nameAr : (pkg.nameEn || pkg.nameAr)} — {total} {t('ر.س شاملاً الضريبة', 'SAR incl. VAT')}</p>
          </div>

          <Card className="shadow-lg shadow-primary/10 border-2 border-primary/50">
            <div className="h-1.5 bg-gradient-to-l from-secondary to-primary rounded-t-xl" />
            <CardContent className="pt-6 pb-8">
              <div className="flex items-center gap-2 text-xs text-muted-foreground mb-6 bg-green-50 border border-green-200 rounded-lg p-3">
                <ShieldCheck className="w-4 h-4 text-green-600 shrink-0" />
                <span>{t('بيانات بطاقتك محمية بتشفير SSL — لا تُحفظ على خوادمنا', 'Your card details are protected by SSL encryption and are never stored on our servers.')}</span>
              </div>
              {/* Moyasar.js renders here */}
              <div className="mysr-form" />
            </CardContent>
          </Card>

          <button
            onClick={() => { setMoyasarStep(false); moyasarMounted.current = false; sessionStorage.removeItem('moyasar_local_payment_id'); }}
            className="mt-4 text-sm text-muted-foreground hover:text-primary underline block text-center w-full"
          >
            {t('← العودة لتعديل البيانات', '← Back to edit details')}
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
      <div className="min-h-screen flex flex-col bg-muted/20" dir={lang === 'ar' ? 'rtl' : 'ltr'}>
        <Navbar />
        <main className="flex-1 flex items-center justify-center p-4">
          <Card className="w-full max-w-md text-center shadow-lg shadow-primary/10 border-2 border-primary/50">
            <div className="h-2 bg-gradient-to-l from-secondary to-primary rounded-t-xl" />
            <CardContent className="pt-10 pb-8 px-8">
              <div className="w-20 h-20 bg-primary/10 rounded-full flex items-center justify-center mx-auto mb-5">
                <CheckCircle2 className="w-10 h-10 text-primary" />
              </div>
              <h1 className="text-2xl font-bold text-primary mb-2">{lang === 'ar' ? pkg.nameAr : (pkg.nameEn || pkg.nameAr)}</h1>
              <p className="text-muted-foreground mb-2 text-sm">
                {pkg.questionsAllowed} {t('استشارات مجانية — لا يُطلب أي بيانات دفع', 'free consultations — no payment details required')}
              </p>
              {hasActiveSub && !samePackage && (
                <div className="mb-4 p-3 bg-amber-50 border border-amber-200 rounded-lg text-sm text-amber-800">
                  <strong>{t('تنبيه:', 'Notice:')}</strong> {t('تفعيل هذه الباقة سيلغي اشتراكك الحالي', 'Activating this package will cancel your current subscription')} «{lang === 'ar' ? currentSub.package?.nameAr : (currentSub.package?.nameEn || currentSub.package?.nameAr)}».
                </div>
              )}
              {samePackage && (
                <div className="mb-4 p-3 bg-green-50 border border-green-200 rounded-lg text-sm text-green-800">
                  {t('أنت مشترك بالفعل في هذه الباقة — لديك', 'You are already subscribed to this package — you have')} {currentSub.questionsRemaining} {t('استشارة متبقية.', 'consultations remaining.')}
                </div>
              )}
              <Button
                className="w-full h-12 text-base font-bold"
                onClick={handleFreeActivation}
                disabled={freeActivating || !!samePackage}
              >
                {freeActivating ? <><Loader2 className="w-4 h-4 animate-spin ml-2" /> {t('جارٍ التفعيل...', 'Activating...')}</> : t('تفعيل الباقة المجانية', 'Activate free package')}
              </Button>
              <button onClick={() => setLocation('/pricing')} className="mt-3 text-sm text-muted-foreground hover:text-primary underline block w-full">
                {t('العودة للباقات', 'Back to packages')}
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
    <div className="min-h-screen flex flex-col bg-muted/20" dir={lang === 'ar' ? 'rtl' : 'ltr'}>
      <Navbar />

      <main className="flex-1 container mx-auto px-4 py-12 max-w-5xl">
        <h1 className="text-3xl font-bold text-primary mb-2 text-center">{t('إتمام عملية الدفع', 'Complete payment')}</h1>
        <p className="text-center text-muted-foreground mb-6 text-sm">{t('دفع آمن ومشفّر — لا تُفعَّل الباقة إلا بعد نجاح الدفع', 'Secure encrypted payment — your package activates only after payment succeeds.')}</p>

        {/* Active subscription warning */}
        {hasActiveSub && !samePackage && (
          <div className="mb-6 flex items-start gap-3 p-4 bg-amber-50 border border-amber-200 rounded-xl text-sm text-amber-900">
            <AlertCircle className="w-5 h-5 shrink-0 mt-0.5 text-amber-600" />
            <p>
              {t('لديك اشتراك نشط حالياً في', 'You currently have an active subscription to')} «<strong>{lang === 'ar' ? currentSub.package?.nameAr : (currentSub.package?.nameEn || currentSub.package?.nameAr)}</strong>» {t('بـ', 'with')} {currentSub.questionsRemaining} {t('استشارة متبقية. إتمام هذا الدفع سيلغي الاشتراك الحالي ويُفعّل الباقة الجديدة فوراً.', 'consultations remaining. Completing this payment will cancel the current subscription and activate the new package immediately.')}
            </p>
          </div>
        )}
        {samePackage && (
          <div className="mb-6 flex items-start gap-3 p-4 bg-blue-50 border border-blue-200 rounded-xl text-sm text-blue-900">
            <CheckCircle2 className="w-5 h-5 shrink-0 mt-0.5 text-blue-600" />
            <p>{t('أنت مشترك بالفعل في هذه الباقة — لديك', 'You are already subscribed to this package — you have')} <strong>{currentSub.questionsRemaining}</strong> {t('استشارة متبقية. يمكنك تجديد الباقة للحصول على رصيد إضافي.', 'consultations remaining. You can renew the package for additional credit.')}</p>
          </div>
        )}

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          {/* Right Col: Form */}
          <div className="lg:col-span-2 space-y-6">
            <Card className="border-2 border-primary/45 shadow-sm shadow-primary/10">
              <CardHeader>
                <CardTitle className="text-xl">{t('بيانات المشتري (للفاتورة الضريبية)', 'Buyer details (for the tax invoice)')}</CardTitle>
              </CardHeader>
              <CardContent>
                <form id="payment-form" onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
                  <div className="space-y-2">
                    <Label>{t('الاسم الكامل', 'Full name')}</Label>
                    <Input {...form.register('billingName')} placeholder={t('الاسم كما في الهوية', 'Name as shown on your ID')} />
                    {form.formState.errors.billingName && <p className="text-sm text-destructive">{form.formState.errors.billingName.message}</p>}
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label>{t('البريد الإلكتروني', 'Email address')}</Label>
                      <Input {...form.register('billingEmail')} dir="ltr" className="text-left" placeholder="email@example.com" />
                      {form.formState.errors.billingEmail && <p className="text-sm text-destructive">{form.formState.errors.billingEmail.message}</p>}
                    </div>
                    <div className="space-y-2">
                      <Label>{t('رقم الجوال', 'Mobile number')}</Label>
                      <Input {...form.register('billingPhone')} dir="ltr" className="text-left" placeholder="05XXXXXXXX" />
                      {form.formState.errors.billingPhone && <p className="text-sm text-destructive">{form.formState.errors.billingPhone.message}</p>}
                    </div>
                  </div>

                  <div className="pt-6">
                    <Label className="text-lg font-bold mb-4 block">{t('طريقة الدفع', 'Payment method')}</Label>
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                      {[
                        { value: 'moyasar', label: t('البطاقة الائتمانية', 'Credit card'), sub: 'Visa / Mastercard',
                          icon: <CreditCard className="w-8 h-8" /> },
                        { value: 'hyperpay', label: 'Apple Pay', sub: '',
                          icon: <div className="w-8 h-8 rounded-full bg-[#1A1A1A] text-white flex items-center justify-center font-bold text-xs"></div> },
                        { value: 'tap', label: t('مدى', 'Mada'), sub: '',
                          icon: <div className="w-8 h-8 bg-green-500 rounded text-white flex items-center justify-center font-bold text-xs">{t('مدى', 'Mada')}</div> },
                      ].map(gw => (
                        <label
                          key={gw.value}
                          className={`cursor-pointer border-2 rounded-xl p-4 flex flex-col items-center justify-center gap-2 transition-colors
                            ${form.watch('gateway') === gw.value ? 'border-primary bg-primary/5 ring-2 ring-primary/20' : 'border-blue-400/55 hover:border-primary/70 hover:shadow-sm'}`}
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
            <div className="flex items-start gap-3 text-sm text-muted-foreground bg-muted/50 rounded-xl p-4 border border-emerald-500/45 shadow-sm shadow-emerald-500/5">
              <ShieldCheck className="w-4 h-4 shrink-0 mt-0.5 text-green-600" />
              <p>
                {t('الدفع يتم عبر بوابة آمنة ومشفرة.', 'Payment is processed through a secure, encrypted gateway.')} <strong>{t('لا تُفعَّل الباقة ولا يُخصم أي مبلغ', 'Your package is not activated and no amount is charged')}</strong> {t('إلا بعد اكتمال العملية بنجاح. عند فشل الدفع أو إلغائه لا يتغير رصيدك.', 'until the transaction is completed successfully. Your credit remains unchanged if payment fails or is cancelled.')}
              </p>
            </div>
          </div>

          {/* Left Col: Summary */}
          <div className="space-y-6">
            <Card className="border-secondary/50 shadow-md sticky top-24">
              <CardHeader className="bg-primary text-primary-foreground rounded-t-xl pb-6">
                <CardTitle className="text-xl">{t('ملخص الطلب', 'Order summary')}</CardTitle>
              </CardHeader>
              <CardContent className="pt-6">
                <div className="flex justify-between items-center mb-6">
                  <div>
                    <h3 className="font-bold text-lg text-primary">{lang === 'ar' ? pkg.nameAr : (pkg.nameEn || pkg.nameAr)}</h3>
                    <p className="text-sm text-muted-foreground">
                      {pkg.questionsAllowed >= 999 ? t('أسئلة غير محدودة', 'Unlimited consultations') : `${pkg.questionsAllowed} ${t('استشارات', 'consultations')}`}
                      {pkg.type === 'monthly' && t(' / شهرياً', ' / monthly')}
                    </p>
                  </div>
                   <span className="font-bold text-lg">{basePrice.toFixed(2)} {t('ر.س', 'SAR')}</span>
                </div>

                {/* Coupon */}
                <div className="mb-6 pb-6 border-b border-border">
                  <Label className="text-sm mb-2 flex items-center gap-1">
                     <Tag className="w-3.5 h-3.5" /> {t('كود الخصم (اختياري)', 'Discount code (optional)')}
                  </Label>
                  <div className="flex gap-2">
                    <Input
                       placeholder={t('أدخل الكود', 'Enter code')}
                      value={couponCode}
                      onChange={e => setCouponCode(e.target.value.toUpperCase())}
                      disabled={!!appliedCoupon}
                      dir="ltr"
                      className="text-left font-mono"
                    />
                    {appliedCoupon ? (
                       <Button variant="outline" className="text-destructive border-destructive/50 shrink-0" onClick={() => { setAppliedCoupon(null); setCouponCode(''); }}>{t('إلغاء', 'Remove')}</Button>
                    ) : (
                      <Button variant="secondary" onClick={handleApplyCoupon} disabled={!couponCode || isCheckingCoupon} className="shrink-0">
                         {isCheckingCoupon ? <Loader2 className="w-4 h-4 animate-spin" /> : t('تطبيق', 'Apply')}
                      </Button>
                    )}
                  </div>
                </div>

                <div className="space-y-3 mb-6 text-sm">
                  <div className="flex justify-between">
                     <span className="text-muted-foreground">{t('المبلغ الأساسي', 'Subtotal')}</span>
                     <span>{basePrice.toFixed(2)} {t('ر.س', 'SAR')}</span>
                  </div>
                  {appliedCoupon && (
                    <div className="flex justify-between text-green-600 font-medium">
                       <span>{t('الخصم', 'Discount')} (<bdi dir="ltr">{appliedCoupon.code}</bdi>)</span>
                       <span>- {discount.toFixed(2)} {t('ر.س', 'SAR')}</span>
                    </div>
                  )}
                  <div className="flex justify-between">
                    <span className="text-muted-foreground flex items-center gap-1">
                       {t('ضريبة القيمة المضافة (15%)', 'VAT (15%)')} <Info className="w-3 h-3" />
                    </span>
                     <span>{vat.toFixed(2)} {t('ر.س', 'SAR')}</span>
                  </div>
                </div>

                <div className="flex justify-between items-center pt-4 border-t border-border mb-6">
                   <span className="font-bold text-lg text-primary">{t('الإجمالي', 'Total')}</span>
                  <span className="font-bold text-2xl text-primary">
                     {total.toFixed(2)} <span className="text-sm font-normal text-muted-foreground">{t('ر.س', 'SAR')}</span>
                  </span>
                </div>

                <div className="flex items-center gap-2 mb-4 text-xs text-muted-foreground justify-center">
                  <ShieldCheck className="w-4 h-4 text-green-600" />
                   <span>{t('دفع آمن ومشفر 100%', '100% secure encrypted payment')}</span>
                </div>

                <Button
                  type="submit"
                  form="payment-form"
                  className="w-full h-14 text-lg font-bold shadow-lg"
                  disabled={isPending}
                >
                  {isPending
                     ? <><Loader2 className="w-5 h-5 animate-spin ml-2" /> {t('جارٍ معالجة الدفع...', 'Processing payment...')}</>
                     : t(`ادفع ${total.toFixed(2)} ر.س`, `Pay ${total.toFixed(2)} SAR`)
                  }
                </Button>

                <p className="text-center text-[11px] text-muted-foreground/60 mt-3">
                   {t('بالضغط على «ادفع» توافقين على', 'By clicking “Pay”, you agree to the')} <a href="/terms" className="underline">{t('شروط الاستخدام', 'Terms of Use')}</a> {t('و', 'and')} <a href="/privacy" className="underline">{t('سياسة الخصوصية', 'Privacy Policy')}</a>
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
