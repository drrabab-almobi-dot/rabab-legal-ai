import React from 'react';
import { useParams } from 'wouter';
import { useGetInvoice } from '@workspace/api-client-react';
import { Navbar, Footer } from '@/components/layout';
import { Button, Card, CardContent, Skeleton } from '@/components/ui';
import { Scale, Printer, Download, ArrowRight } from 'lucide-react';
import { format } from 'date-fns';
import { arSA } from 'date-fns/locale';

export default function InvoiceDetail() {
  const params = useParams();
  const id = params.id === 'latest' ? 1 : parseInt(params.id || '1', 10); // Fallback for 'latest' mock
  
  const { data: invoice, isLoading, isError } = useGetInvoice(id, {
    query: { enabled: !!id }
  });

  const handlePrint = () => {
    window.print();
  };

  if (isLoading) {
    return (
      <div className="min-h-screen flex flex-col bg-muted/20">
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
    <div className="min-h-screen flex flex-col bg-muted/20 print:bg-white print:m-0">
      <div className="print:hidden"><Navbar /></div>
      
      <main className="flex-1 container mx-auto px-4 py-12 max-w-4xl print:py-0 print:px-0">
        <div className="flex justify-between items-center mb-8 print:hidden">
          <Button variant="ghost" onClick={() => window.history.back()} className="gap-2">
            <ArrowRight className="w-4 h-4" /> عودة
          </Button>
          <div className="flex gap-3">
            <Button variant="outline" onClick={handlePrint} className="gap-2">
              <Printer className="w-4 h-4" /> طباعة
            </Button>
            <Button
              className="gap-2"
              onClick={() => window.open(`${import.meta.env.BASE_URL.replace(/\/$/, '')}/api/invoices/${inv.id}/pdf`, '_blank')}
            >
              <Download className="w-4 h-4" /> تحميل PDF
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
                  <h1 className="font-bold text-xl text-primary leading-tight">رباب محاميتك الرقمية</h1>
                  <p className="text-xs text-muted-foreground">في الأنظمة السعودية والخليجية RABAB LEGAL AI</p>
                </div>
              </div>
              <div className="text-right">
                <h2 className="text-4xl font-bold text-primary/10 tracking-widest uppercase">فاتورة ضريبية</h2>
                <div className="mt-2 text-sm text-muted-foreground">
                  <p>الرقم الضريبي: 300000000000000</p>
                  <p>الرياض، المملكة العربية السعودية</p>
                </div>
              </div>
            </div>

            {/* Invoice Details */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-12 mb-12">
              <div>
                <h3 className="text-sm font-bold text-muted-foreground uppercase tracking-wider mb-3 border-b border-border pb-2 inline-block">فاتورة إلى</h3>
                <p className="font-bold text-lg text-primary">{inv.billingName}</p>
                <p className="text-muted-foreground text-sm mt-1">{inv.billingEmail}</p>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <h3 className="text-sm font-bold text-muted-foreground uppercase tracking-wider mb-2">رقم الفاتورة</h3>
                  <p className="font-bold font-mono text-primary">{inv.invoiceNumber}</p>
                </div>
                <div>
                  <h3 className="text-sm font-bold text-muted-foreground uppercase tracking-wider mb-2">تاريخ الإصدار</h3>
                  <p className="font-bold text-primary">
                    {format(new Date(inv.createdAt), 'dd MMMM yyyy', { locale: arSA })}
                  </p>
                </div>
                <div>
                  <h3 className="text-sm font-bold text-muted-foreground uppercase tracking-wider mb-2">حالة الدفع</h3>
                  <p className="font-bold text-green-600">مدفوعة</p>
                </div>
                <div>
                  <h3 className="text-sm font-bold text-muted-foreground uppercase tracking-wider mb-2">طريقة الدفع</h3>
                  <p className="font-bold text-primary">{inv.payment?.gateway || 'بوابة دفع'}</p>
                </div>
              </div>
            </div>

            {/* Line Items */}
            <div className="mb-12">
              <table className="w-full text-right border-collapse">
                <thead>
                  <tr className="bg-primary/5 text-primary text-sm">
                    <th className="py-3 px-4 rounded-r-lg">الوصف</th>
                    <th className="py-3 px-4 w-32">السعر</th>
                    <th className="py-3 px-4 w-32">الضريبة</th>
                    <th className="py-3 px-4 w-32 rounded-l-lg">الإجمالي</th>
                  </tr>
                </thead>
                <tbody className="text-sm">
                  <tr className="border-b border-border/50">
                    <td className="py-5 px-4 font-bold text-primary">{inv.packageNameAr}</td>
                    <td className="py-5 px-4">{inv.amount} ر.س</td>
                    <td className="py-5 px-4">15%</td>
                    <td className="py-5 px-4 font-bold">{inv.amount} ر.س</td>
                  </tr>
                </tbody>
              </table>
            </div>

            {/* Totals */}
            <div className="flex justify-end mb-16">
              <div className="w-full max-w-sm space-y-3 text-sm">
                <div className="flex justify-between px-4">
                  <span className="text-muted-foreground">المبلغ الخاضع للضريبة</span>
                  <span>{inv.amount} ر.س</span>
                </div>
                {inv.discountAmount > 0 && (
                  <div className="flex justify-between px-4 text-green-600">
                    <span>الخصم</span>
                    <span>- {inv.discountAmount} ر.س</span>
                  </div>
                )}
                <div className="flex justify-between px-4">
                  <span className="text-muted-foreground">ضريبة القيمة المضافة (15%)</span>
                  <span>{inv.vatAmount} ر.س</span>
                </div>
                <div className="flex justify-between px-4 py-4 bg-primary text-primary-foreground rounded-lg mt-2 font-bold text-lg">
                  <span>الإجمالي (شامل الضريبة)</span>
                  <span>{inv.totalAmount} ر.س</span>
                </div>
              </div>
            </div>

            {/* Footer */}
            <div className="text-center pt-8 border-t border-border text-sm text-muted-foreground">
              <p className="mb-2 font-bold text-primary">شكراً لاختياركم رباب محاميتك الرقمية في الأنظمة السعودية والخليجية RABAB LEGAL AI</p>
              <p>هذه الفاتورة مصدرة إلكترونياً ولا تحتاج إلى توقيع.</p>
            </div>
          </CardContent>
        </Card>
      </main>

      <div className="print:hidden"><Footer /></div>
    </div>
  );
}
