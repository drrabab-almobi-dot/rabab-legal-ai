/**
 * Mailer — invoice sender. It delegates delivery to the shared mail service so
 * invoices follow the same Gmail / Resend configuration as all notifications.
 */

import { sendEmail } from "./email";

// ── Invoice email ─────────────────────────────────────────────────────────────

export interface InvoiceEmailData {
  toEmail: string;
  toName: string;
  invoiceNumber: string;
  packageNameAr: string;
  amount: number;
  vatAmount: number;
  totalAmount: number;
  discountAmount: number;
  createdAt: Date;
}

function formatSAR(value: number): string {
  return value.toFixed(2) + " ر.س";
}

function buildInvoiceHtml(d: InvoiceEmailData): string {
  const dateStr = new Intl.DateTimeFormat("ar-SA", {
    year: "numeric", month: "long", day: "numeric",
  }).format(d.createdAt);

  const rows: { label: string; value: string }[] = [
    { label: "رقم الفاتورة", value: d.invoiceNumber },
    { label: "التاريخ", value: dateStr },
    { label: "الباقة", value: d.packageNameAr },
    { label: "السعر الأساسي", value: formatSAR(d.amount) },
  ];

  if (d.discountAmount > 0) {
    rows.push({ label: "الخصم", value: `- ${formatSAR(d.discountAmount)}` });
  }

  rows.push(
    { label: "ضريبة القيمة المضافة (15%)", value: formatSAR(d.vatAmount) },
    { label: "الإجمالي المدفوع", value: formatSAR(d.totalAmount) },
  );

  const tableRows = rows
    .map(
      (r) => `
        <tr>
          <td style="padding:10px 16px;border-bottom:1px solid #f0f0f0;color:#555;font-size:14px">${r.label}</td>
          <td style="padding:10px 16px;border-bottom:1px solid #f0f0f0;font-weight:600;text-align:left;font-size:14px">${r.value}</td>
        </tr>`,
    )
    .join("");

  return `<!DOCTYPE html>
<html dir="rtl" lang="ar">
<head>
  <meta charset="UTF-8"/>
  <meta name="viewport" content="width=device-width,initial-scale=1"/>
  <title>فاتورة ${d.invoiceNumber}</title>
</head>
<body style="margin:0;padding:0;background:#f4f6f9;font-family:'Segoe UI',Tahoma,Arial,sans-serif;direction:rtl">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f4f6f9;padding:32px 0">
    <tr>
      <td align="center">
        <table width="600" cellpadding="0" cellspacing="0" style="background:#ffffff;border-radius:12px;overflow:hidden;box-shadow:0 2px 8px rgba(0,0,0,.08)">

          <!-- Header -->
          <tr>
            <td style="background:linear-gradient(135deg,#1a3a6e,#2563eb);padding:32px 40px;text-align:center">
              <h1 style="margin:0;color:#ffffff;font-size:26px;letter-spacing:-0.5px">RABAB LEGAL AI</h1>
              <p style="margin:8px 0 0;color:#bfdbfe;font-size:14px">رباب محاميتك الرقمية</p>
            </td>
          </tr>

          <!-- Greeting -->
          <tr>
            <td style="padding:32px 40px 16px">
              <p style="margin:0;font-size:16px;color:#333">مرحباً ${d.toName}،</p>
              <p style="margin:12px 0 0;font-size:15px;color:#555;line-height:1.7">
                شكراً لاشتراكك في RABAB LEGAL AI! يُرجى الاحتفاظ بهذه الفاتورة الرسمية لسجلاتك المالية.
              </p>
            </td>
          </tr>

          <!-- Invoice table -->
          <tr>
            <td style="padding:8px 40px 32px">
              <table width="100%" cellpadding="0" cellspacing="0"
                     style="border:1px solid #e5e7eb;border-radius:8px;overflow:hidden">
                <thead>
                  <tr style="background:#f8fafc">
                    <th colspan="2" style="padding:14px 16px;text-align:right;font-size:13px;color:#6b7280;font-weight:600;border-bottom:1px solid #e5e7eb">
                      تفاصيل الفاتورة
                    </th>
                  </tr>
                </thead>
                <tbody>
                  ${tableRows}
                </tbody>
              </table>
            </td>
          </tr>

          <!-- Total highlight -->
          <tr>
            <td style="padding:0 40px 32px">
              <div style="background:#eff6ff;border-radius:8px;padding:16px 20px">
                <span style="font-size:16px;color:#1d4ed8;font-weight:700">إجمالي الدفع: </span>
                <span style="font-size:20px;color:#1d4ed8;font-weight:800">${formatSAR(d.totalAmount)}</span>
              </div>
            </td>
          </tr>

          <!-- Footer -->
          <tr>
            <td style="padding:24px 40px 32px;border-top:1px solid #f0f0f0;text-align:center">
              <p style="margin:0;font-size:13px;color:#9ca3af;line-height:1.6">
                هذه الفاتورة صادرة تلقائياً من منصة RABAB LEGAL AI.<br/>
                للاستفسار: <a href="mailto:info@rabablegal.com" style="color:#2563eb">info@rabablegal.com</a> |
                <a href="https://www.rabablegal.com" style="color:#2563eb">www.rabablegal.com</a>
              </p>
            </td>
          </tr>

        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
}

export async function sendInvoiceEmail(data: InvoiceEmailData): Promise<boolean> {
  return sendEmail({
    to: `${data.toName} <${data.toEmail}>`,
    subject: `فاتورتك من RABAB LEGAL AI — ${data.invoiceNumber}`,
    html: buildInvoiceHtml(data),
    text: `فاتورة ${data.invoiceNumber} من RABAB LEGAL AI. إجمالي الدفع: ${formatSAR(data.totalAmount)}.`,
  });
}
