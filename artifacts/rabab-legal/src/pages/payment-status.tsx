import React, { useEffect } from 'react';
import { Link, useLocation } from 'wouter';
import { useQueryClient } from '@tanstack/react-query';
import { getGetMySubscriptionQueryKey } from '@workspace/api-client-react';
import { Navbar, Footer } from '@/components/layout';
import { Button, Card, CardContent } from '@/components/ui';
import { CheckCircle, XCircle, FileText, Scale, RotateCcw } from 'lucide-react';
import { useLang } from '@/hooks/use-language';

export function PaymentSuccess() {
  const [, setLocation] = useLocation();
  const queryClient = useQueryClient();
  const { lang, t } = useLang();
  const searchParams = new URLSearchParams(window.location.search);
  const packageId = searchParams.get('packageId');
  const paymentId = searchParams.get('paymentId');

  useEffect(() => {
    // Invalidate subscription cache so the consultation page shows fresh quota
    queryClient.invalidateQueries({ queryKey: getGetMySubscriptionQueryKey() });
  }, [queryClient]);

  return (
    <div className="min-h-screen flex flex-col bg-muted/20" dir={lang === 'ar' ? 'rtl' : 'ltr'}>
      <Navbar />

      <main className="flex-1 flex items-center justify-center p-4">
        <Card className="w-full max-w-md text-center shadow-lg border-green-200">
          {/* Green top stripe */}
          <div className="h-2 bg-gradient-to-l from-green-400 to-green-600 rounded-t-xl" />

          <CardContent className="pt-10 pb-8 px-8">
            <div className="w-24 h-24 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-5">
              <CheckCircle className="w-12 h-12 text-green-600" />
            </div>

            <h1 className="text-3xl font-bold text-primary mb-2">{t('تم الدفع بنجاح!', 'Payment successful!')}</h1>
            <p className="text-muted-foreground mb-6 text-sm leading-relaxed">
              {t('تم تفعيل باقتك فوراً. يمكنك الآن الاستفادة من استشاراتك القانونية مع رباب محاميتك الرقمية.', 'Your package has been activated immediately. You can now use your legal consultations with Rabab, your digital lawyer.')}
            </p>

            {/* Receipt summary */}
            <div className="bg-muted/50 rounded-xl p-4 mb-6 text-start space-y-2 text-sm">
              <div className="flex justify-between border-b border-border/50 pb-2">
                <span className="text-muted-foreground">{t('رقم العملية', 'Transaction ID')}</span>
                <bdi dir="ltr" className="font-mono font-bold text-xs">
                  {paymentId ? `TXN-${paymentId}` : 'TXN-—'}
                </bdi>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">{t('حالة الباقة', 'Package status')}</span>
                <span className="text-green-600 font-bold">{t('نشطة ✓', 'Active ✓')}</span>
              </div>
            </div>

            <div className="space-y-3">
              {/* Primary: go to consultation */}
              <Button
                onClick={() => setLocation('/consultation')}
                className="w-full h-12 text-base font-bold shadow-md gap-2"
              >
                <Scale className="w-4 h-4" />
                {t('ابدأ استشارتك الآن', 'Start your consultation')}
              </Button>

              {/* Secondary: view invoice */}
              <Link href="/dashboard" className="block">
                <Button variant="outline" className="w-full h-12 text-base gap-2">
                  <FileText className="w-4 h-4" /> {t('لوحة التحكم والفواتير', 'Dashboard and invoices')}
                </Button>
              </Link>
            </div>
          </CardContent>
        </Card>
      </main>

      <Footer />
    </div>
  );
}

export function PaymentFailed() {
  const [, setLocation] = useLocation();
  const { lang, t } = useLang();
  const searchParams = new URLSearchParams(window.location.search);
  const packageId = searchParams.get('packageId');

  return (
    <div className="min-h-screen flex flex-col bg-muted/20" dir={lang === 'ar' ? 'rtl' : 'ltr'}>
      <Navbar />

      <main className="flex-1 flex items-center justify-center p-4">
        <Card className="w-full max-w-md text-center shadow-lg border-destructive/20">
          {/* Red top stripe */}
          <div className="h-2 bg-gradient-to-l from-red-400 to-red-600 rounded-t-xl" />

          <CardContent className="pt-10 pb-8 px-8">
            <div className="w-24 h-24 bg-red-100 rounded-full flex items-center justify-center mx-auto mb-5">
              <XCircle className="w-12 h-12 text-red-500" />
            </div>

            <h1 className="text-3xl font-bold text-destructive mb-2">{t('فشلت عملية الدفع', 'Payment failed')}</h1>
            <p className="text-muted-foreground mb-4 text-sm leading-relaxed">
              {t('لم نتمكن من إتمام الدفع.', 'We could not complete the payment.')} <strong>{t('لم يتغير رصيدك', 'Your credit has not changed')}</strong> {t('ولم تُفعَّل أي باقة.', 'and no package has been activated.')}
            </p>
            <p className="text-muted-foreground mb-8 text-sm">
              {t('قد يكون ذلك بسبب رفض البطاقة أو مشكلة مؤقتة في الاتصال. يمكنك المحاولة مرة أخرى بأمان.', 'This may be due to a card decline or temporary connection issue. You can safely try again.')}
            </p>

            <div className="space-y-3">
              <Button
                onClick={() => setLocation(packageId ? `/payment?packageId=${packageId}` : '/pricing')}
                className="w-full h-12 text-base font-bold gap-2"
              >
                <RotateCcw className="w-4 h-4" />
                {t('المحاولة مرة أخرى', 'Try again')}
              </Button>
              <Button
                variant="ghost"
                onClick={() => setLocation('/pricing')}
                className="w-full h-12 text-base text-muted-foreground hover:text-primary"
              >
                {t('اختيار باقة أخرى', 'Choose another package')}
              </Button>
            </div>
          </CardContent>
        </Card>
      </main>

      <Footer />
    </div>
  );
}
