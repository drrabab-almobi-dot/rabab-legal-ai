import React, { useEffect } from 'react';
import { Link, useLocation } from 'wouter';
import { useQueryClient } from '@tanstack/react-query';
import { getGetMySubscriptionQueryKey } from '@workspace/api-client-react';
import { Navbar, Footer } from '@/components/layout';
import { Button, Card, CardContent } from '@/components/ui';
import { CheckCircle, XCircle, FileText, Scale, RotateCcw } from 'lucide-react';

export function PaymentSuccess() {
  const [, setLocation] = useLocation();
  const queryClient = useQueryClient();
  const searchParams = new URLSearchParams(window.location.search);
  const packageId = searchParams.get('packageId');
  const paymentId = searchParams.get('paymentId');

  useEffect(() => {
    // Invalidate subscription cache so the consultation page shows fresh quota
    queryClient.invalidateQueries({ queryKey: getGetMySubscriptionQueryKey() });
  }, [queryClient]);

  return (
    <div className="min-h-screen flex flex-col bg-muted/20" dir="rtl">
      <Navbar />

      <main className="flex-1 flex items-center justify-center p-4">
        <Card className="w-full max-w-md text-center shadow-lg border-green-200">
          {/* Green top stripe */}
          <div className="h-2 bg-gradient-to-l from-green-400 to-green-600 rounded-t-xl" />

          <CardContent className="pt-10 pb-8 px-8">
            <div className="w-24 h-24 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-5">
              <CheckCircle className="w-12 h-12 text-green-600" />
            </div>

            <h1 className="text-3xl font-bold text-primary mb-2">تم الدفع بنجاح!</h1>
            <p className="text-muted-foreground mb-6 text-sm leading-relaxed">
              تم تفعيل باقتك فوراً. يمكنك الآن الاستفادة من استشاراتك القانونية مع رباب محاميتك الرقمية.
            </p>

            {/* Receipt summary */}
            <div className="bg-muted/50 rounded-xl p-4 mb-6 text-right space-y-2 text-sm">
              <div className="flex justify-between border-b border-border/50 pb-2">
                <span className="text-muted-foreground">رقم العملية</span>
                <span className="font-mono font-bold text-xs">
                  {paymentId ? `TXN-${paymentId}` : 'TXN-—'}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">حالة الباقة</span>
                <span className="text-green-600 font-bold">نشطة ✓</span>
              </div>
            </div>

            <div className="space-y-3">
              {/* Primary: go to consultation */}
              <Button
                onClick={() => setLocation('/consultation')}
                className="w-full h-12 text-base font-bold shadow-md gap-2"
              >
                <Scale className="w-4 h-4" />
                ابدأ استشارتك الآن
              </Button>

              {/* Secondary: view invoice */}
              <Link href="/dashboard" className="block">
                <Button variant="outline" className="w-full h-12 text-base gap-2">
                  <FileText className="w-4 h-4" /> لوحة التحكم والفواتير
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
  const searchParams = new URLSearchParams(window.location.search);
  const packageId = searchParams.get('packageId');

  return (
    <div className="min-h-screen flex flex-col bg-muted/20" dir="rtl">
      <Navbar />

      <main className="flex-1 flex items-center justify-center p-4">
        <Card className="w-full max-w-md text-center shadow-lg border-destructive/20">
          {/* Red top stripe */}
          <div className="h-2 bg-gradient-to-l from-red-400 to-red-600 rounded-t-xl" />

          <CardContent className="pt-10 pb-8 px-8">
            <div className="w-24 h-24 bg-red-100 rounded-full flex items-center justify-center mx-auto mb-5">
              <XCircle className="w-12 h-12 text-red-500" />
            </div>

            <h1 className="text-3xl font-bold text-destructive mb-2">فشلت عملية الدفع</h1>
            <p className="text-muted-foreground mb-4 text-sm leading-relaxed">
              لم نتمكن من إتمام الدفع. <strong>لم يتغير رصيدك</strong> ولم تُفعَّل أي باقة.
            </p>
            <p className="text-muted-foreground mb-8 text-sm">
              قد يكون ذلك بسبب رفض البطاقة أو مشكلة مؤقتة في الاتصال. يمكنك المحاولة مرة أخرى بأمان.
            </p>

            <div className="space-y-3">
              <Button
                onClick={() => setLocation(packageId ? `/payment?packageId=${packageId}` : '/pricing')}
                className="w-full h-12 text-base font-bold gap-2"
              >
                <RotateCcw className="w-4 h-4" />
                المحاولة مرة أخرى
              </Button>
              <Button
                variant="ghost"
                onClick={() => setLocation('/pricing')}
                className="w-full h-12 text-base text-muted-foreground hover:text-primary"
              >
                اختيار باقة أخرى
              </Button>
            </div>
          </CardContent>
        </Card>
      </main>

      <Footer />
    </div>
  );
}
