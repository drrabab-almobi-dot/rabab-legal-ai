import React from 'react';
import { useParams } from 'wouter';
import { getGetInvoiceQueryKey, useGetInvoice } from '@workspace/api-client-react';
import { Navbar, Footer } from '@/components/layout';
import { Button, Card, CardContent, Skeleton } from '@/components/ui';
import { Scale, Printer, Download, ArrowRight } from 'lucide-react';
import { format } from 'date-fns';
import { arSA, enUS } from 'date-fns/locale';
import { useLang } from '@/hooks/use-language';

export default function InvoiceDetail() {
  const { lang, t } = useLang();
  const params = useParams();
  const id = params.id === 'latest' ? 1 : parseInt(params.id || '1', 10); // Fallback for 'latest' mock
  
  const { data: invoice, isLoading, isError } = useGetInvoice(id, {
    query: { queryKey: getGetInvoiceQueryKey(id), enabled: !!id }
  });

  const handlePrint = () => {
    window.print();
  };

  if (isLoading) {
    return (
      <div dir={lang === 'ar' ? 'rtl' : 'ltr'} className="min-h-screen flex flex-col bg-muted/20">
        <Navbar />
        <main className="flex-1 container mx-auto px-4 py-12 flex justify-center">
          <Card className="w-full max-w-3xl"><CardContent className="p-12"><Skeleton className="h-96 w-full" /></CardContent></Card>
        </main>
      </div>
    );
  }

  // Use real data or mock for UI demo
  const inv = invoice || {
    id: 1,
    invoiceNumber: "INV-2023-001",
    billingName: "أحمد العميل",
    billingEmail: "ahmed@example.com",
    packageNameAr: "الاشتراك الشهري",
    amount: 260.00,
    vatAmount: 39.00,
    discountAmount: 0,
    totalAmount: 299.00,
    status: "issued",
    createdAt: new Date().toISOString(),
    payment: {
      gateway: "Moyasar",
      gatewayRef: "txn_123456"
    }
  };

  return (
    <div dir={lang === 'ar' ? 'rtl' : 'ltr'} className="min-h-screen flex flex-col bg-muted/20 print:bg-white print:m-0">
      <div className="print:hidden"><Navbar /></div>
      
      <main className="flex-1 container mx-auto px-4 py-12 max-w-4xl print:py-0 print:px-0">
        <div className="flex justify-between items-center mb-8 print:hidden">
          <Button variant="ghost" onClick={() => window.history.back()} className="gap-2">
            <ArrowRight className={`w-4 h-4 ${lang === 'en' ? 'rotate-180' : ''}`} /> {t('عودة', 'Back')}
          </Button>
          <div className="flex gap-3">
            <Button variant="outline" onClick={handlePrint} className="gap-2">
              <Printer className="w-4 h-4" /> {t('طباعة', 'Print')}
            </Button>
            <Button
              className="gap-2"
              onClick={() => window.open(`${import.meta.env.BASE_URL.replace(/\/$/, '')}/api/invoices/${inv.id}/pdf`, '_blank')}
            >
              <Download className="w-4 h-4" /> {t('تحميل PDF', 'Download PDF')}
            </Button>
          </div>
        </div>

        <Card className="shadow-lg border-border/50 print:shadow-none print:border-none print:rounded-none">
          <CardContent className="p-10 md:p-16">
            {/* Invoice Header */}
            <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-6 mb-12 border-b border-border pb-8">
              <div className="flex items-center gap-3">
                <div className="w-12 h-12 bg-primary rounded-lg flex items-center justify-center text-secondary">
                  <Scale className="w-8 h-8" />
                </div>
                <div>
                  <h1 className="font-bold text-xl text-primary leading-tight">{t('رباب محاميتك الرقمية', 'Rabab, Your Digital Lawyer')}</h1>
                  <p className="text-xs text-muted-foreground">{t('في الأنظمة السعودية والخليجية RABAB LEGAL AI', 'For Saudi and Gulf legal systems · RABAB LEGAL AI')}</p>
                </div>
              </div>
              <div className="text-right">
                  <h2 className="text-4xl font-bold text-primary/10 tracking-widest uppercase">{t('فاتورة ضريبية', 'Tax Invoice')}</h2>
                <div className="mt-2 text-sm text-muted-foreground">
                   <p>{t('الرقم الضريبي:', 'Tax number:')} <span dir="ltr">300000000000000</span></p>
                  <p>الرياض، المملكة العربية السعودية</p>
                </div>
              </div>
            </div>

            {/* Invoice Details */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-12 mb-12">
              <div>
                <h3 className="text-sm font-bold text-muted-foreground uppercase tracking-wider mb-3 border-b border-border pb-2 inline-block">{t('فاتورة إلى', 'Invoice to')}</h3>
                <p className="font-bold text-lg text-primary">{inv.billingName}</p>
                <p dir="ltr" className="text-muted-foreground text-sm mt-1">{inv.billingEmail}</p>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <h3 className="text-sm font-bold text-muted-foreground uppercase tracking-wider mb-2">{t('رقم الفاتورة', 'Invoice number')}</h3>
                  <p dir="ltr" className="font-bold font-mono text-primary">{inv.invoiceNumber}</p>
                </div>
                <div>
                  <h3 className="text-sm font-bold text-muted-foreground uppercase tracking-wider mb-2">{t('تاريخ الإصدار', 'Issue date')}</h3>
                  <p dir={lang === 'ar' ? 'rtl' : 'ltr'} className="font-bold text-primary">
                    {format(new Date(inv.createdAt), 'dd MMMM yyyy', { locale: lang === 'ar' ? arSA : enUS })}
                  </p>
                </div>
                <div>
                  <h3 className="text-sm font-bold text-muted-foreground uppercase tracking-wider mb-2">{t('حالة الدفع', 'Payment status')}</h3>
                  <p className="font-bold text-green-600">{t('مدفوعة', 'Paid')}</p>
                </div>
                <div>
                  <h3 className="text-sm font-bold text-muted-foreground uppercase tracking-wider mb-2">{t('طريقة الدفع', 'Payment method')}</h3>
                  <p dir="ltr" className="font-bold text-primary">{inv.payment?.gateway || t('بوابة دفع', 'Payment gateway')}</p>
                </div>
              </div>
            </div>

            {/* Line Items */}
            <div className="mb-12">
              <table className={`w-full border-collapse ${lang === 'ar' ? 'text-right' : 'text-left'}`}>
                <thead>
                  <tr className="bg-primary/5 text-primary text-sm">
                    <th className={`py-3 px-4 ${lang === 'ar' ? 'rounded-r-lg' : 'rounded-l-lg'}`}>{t('الوصف', 'Description')}</th>
                    <th className="py-3 px-4 w-32">{t('السعر', 'Price')}</th>
                    <th className="py-3 px-4 w-32">{t('الضريبة', 'Tax')}</th>
                    <th className={`py-3 px-4 w-32 ${lang === 'ar' ? 'rounded-l-lg' : 'rounded-r-lg'}`}>{t('الإجمالي', 'Total')}</th>
                  </tr>
                </thead>
                <tbody className="text-sm">
                  <tr className="border-b border-border/50">
                    <td className="py-5 px-4 font-bold text-primary">{inv.packageNameAr}</td>
                    <td dir="ltr" className="py-5 px-4">{inv.amount} {t('ر.س', 'SAR')}</td>
                    <td className="py-5 px-4">15%</td>
                    <td dir="ltr" className="py-5 px-4 font-bold">{inv.amount} {t('ر.س', 'SAR')}</td>
                  </tr>
                </tbody>
              </table>
            </div>

            {/* Totals */}
            <div className="flex justify-end mb-16">
              <div className="w-full max-w-sm space-y-3 text-sm">
                <div className="flex justify-between px-4">
                  <span className="text-muted-foreground">{t('المبلغ الخاضع للضريبة', 'Taxable amount')}</span>
                  <span dir="ltr">{inv.amount} {t('ر.س', 'SAR')}</span>
                </div>
                {(inv.discountAmount ?? 0) > 0 && (
                  <div className="flex justify-between px-4 text-green-600">
                    <span>{t('الخصم', 'Discount')}</span>
                    <span dir="ltr">- {inv.discountAmount} {t('ر.س', 'SAR')}</span>
                  </div>
                )}
                <div className="flex justify-between px-4">
                  <span className="text-muted-foreground">{t('ضريبة القيمة المضافة (15%)', 'VAT (15%)')}</span>
                  <span dir="ltr">{inv.vatAmount} {t('ر.س', 'SAR')}</span>
                </div>
                <div className="flex justify-between px-4 py-4 bg-primary text-primary-foreground rounded-lg mt-2 font-bold text-lg">
                  <span>{t('الإجمالي (شامل الضريبة)', 'Total (including tax)')}</span>
                  <span dir="ltr">{inv.totalAmount} {t('ر.س', 'SAR')}</span>
                </div>
              </div>
            </div>

            {/* Footer */}
            <div className="text-center pt-8 border-t border-border text-sm text-muted-foreground">
               <p className="mb-2 font-bold text-primary">{t('شكراً لاختياركم رباب محاميتك الرقمية في الأنظمة السعودية والخليجية RABAB LEGAL AI', 'Thank you for choosing RABAB LEGAL AI, your digital lawyer for Saudi and Gulf legal systems.')}</p>
               <p>{t('هذه الفاتورة مصدرة إلكترونياً ولا تحتاج إلى توقيع.', 'This invoice is issued electronically and does not require a signature.')}</p>
            </div>
          </CardContent>
        </Card>
      </main>

      <div className="print:hidden"><Footer /></div>
    </div>
  );
}
