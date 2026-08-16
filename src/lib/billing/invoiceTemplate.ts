import fs from "fs";
import path from "path";
import type { Invoice } from "@prisma/client";
import type { SellerInfo } from "@/lib/billing/invoicePdf";

const STATUS_LABELS_AR: Record<string, string> = {
  PAID: "مدفوعة", PENDING: "قيد الانتظار", FAILED: "فشلت", REFUNDED: "مستردة", CANCELLED: "ملغاة", OVERDUE: "متأخرة",
};

type StatusColor = { bg: string; text: string; border: string };
const DEFAULT_STATUS_COLOR: StatusColor = { bg: "#fffbeb", text: "#b45309", border: "#fde68a" };
const STATUS_COLORS: Record<string, StatusColor> = {
  PAID: { bg: "#ecfdf5", text: "#059669", border: "#a7f3d0" },
  PENDING: DEFAULT_STATUS_COLOR,
  FAILED: { bg: "#fef2f2", text: "#dc2626", border: "#fecaca" },
  OVERDUE: { bg: "#fef2f2", text: "#dc2626", border: "#fecaca" },
  REFUNDED: { bg: "#f1f5f9", text: "#475569", border: "#e2e8f0" },
  CANCELLED: { bg: "#f1f5f9", text: "#475569", border: "#e2e8f0" },
};

/**
 * خطوط Cairo مضمَّنة كـBase64 مباشرة داخل الـHTML (بدل رابط Google Fonts خارجي، أو مسار ملف محلي
 * قد يفشل Puppeteer بالوصول إليه حسب سياق التشغيل) — هذا يضمن استقلالاً كاملاً عن الشبكة وقت توليد
 * الفاتورة فعلياً، وهو نفس خط العلامة التجارية المستخدَم أصلاً في كل الموقع (next/font/google في
 * layout.tsx). تُقرَأ الملفات وتُحوَّل مرة واحدة فقط عند أول استدعاء (memoized) بدل كل توليد فاتورة.
 */
let cachedFontFaces: string | null = null;
function loadFontFaces(): string {
  if (cachedFontFaces) return cachedFontFaces;
  const fontsDir = path.join(process.cwd(), "src/lib/billing/fonts");
  const weights: { file: string; weight: number }[] = [
    { file: "Cairo-Regular.ttf", weight: 400 },
    { file: "Cairo-SemiBold.ttf", weight: 600 },
    { file: "Cairo-Bold.ttf", weight: 700 },
    { file: "Cairo-ExtraBold.ttf", weight: 800 },
  ];
  cachedFontFaces = weights
    .map(({ file, weight }) => {
      const base64 = fs.readFileSync(path.join(fontsDir, file)).toString("base64");
      return `@font-face { font-family: 'Cairo'; font-weight: ${weight}; font-style: normal; src: url(data:font/ttf;base64,${base64}) format('truetype'); }`;
    })
    .join("\n");
  return cachedFontFaces;
}

// أرقام غربية (0-9) صراحة للمبالغ المالية — ليس فقط تفضيلاً بصرياً: المستندات المالية الرسمية
// (وتوجيهات ZATCA نفسها) تتوقّع أرقاماً غربية لضمان قراءة آلية/محاسبية متّسقة، بخلاف نص الفاتورة
// العادي (تواريخ/أوصاف) الذي يبقى عربياً بالكامل بلا أي مشكلة.
function formatSar(amountSar: number): string {
  return amountSar.toLocaleString("en-US");
}

function formatDate(date: Date): string {
  return date.toLocaleDateString("ar-SA-u-nu-latn", { year: "numeric", month: "long", day: "numeric" });
}

export type InvoiceTemplateInput = {
  invoice: Invoice;
  tenantName: string;
  tenantVatNumber?: string | null;
  tenantEmail?: string | null;
  planName?: string | null;
  seller: SellerInfo;
  qrDataUri: string;
  supportEmail?: string | null;
  supportPhone?: string | null;
};

/**
 * يبني صفحة HTML كاملة للفاتورة — تُحوَّل لاحقاً لـPDF عبر Puppeteer (محرك متصفح حقيقي)، فيضمن
 * تشكيلاً عربياً واتجاه RTL صحيحين تماماً كأي صفحة ويب عادية (بخلاف pdfkit السابق الذي يرسم الحروف
 * مباشرة بلا محرك تخطيط نص فيُنتج نصاً عربياً مشوَّهاً تماماً — راجع DECISIONS.md للتشخيص الكامل).
 */
export function buildInvoiceHtml(input: InvoiceTemplateInput): string {
  const { invoice, tenantName, tenantVatNumber, tenantEmail, planName, seller, qrDataUri, supportEmail, supportPhone } = input;

  const subtotal = invoice.amountSar - invoice.vatAmountSar;
  const invoiceLabel = `INV-${invoice.createdAt.getFullYear()}-${String(invoice.invoiceNumber).padStart(5, "0")}`;
  const vatPercent = (invoice.vatRateBps / 100).toLocaleString("en-US");
  const statusColor = STATUS_COLORS[invoice.status] ?? DEFAULT_STATUS_COLOR;
  const statusLabel = STATUS_LABELS_AR[invoice.status] ?? invoice.status;

  const periodLabel = `${formatDate(invoice.periodStart)} — ${formatDate(invoice.periodEnd)}`;
  const lineItemDescription = planName ? `اشتراك باقة ${planName} — ${periodLabel}` : `اشتراك — ${periodLabel}`;

  // تاريخ استحقاق منطقي فقط للفواتير غير المكتملة السداد بعد (لا معنى له لفاتورة مدفوعة أو مستردة).
  const showDueDate = invoice.status === "PENDING" || invoice.status === "FAILED" || invoice.status === "OVERDUE";

  return `<!DOCTYPE html>
<html lang="ar" dir="rtl">
<head>
<meta charset="UTF-8" />
<style>
${loadFontFaces()}

* { margin: 0; padding: 0; box-sizing: border-box; }
@page { size: A4; margin: 0; }
body {
  font-family: 'Cairo', sans-serif;
  color: #1e293b;
  background: #ffffff;
  font-size: 11pt;
  line-height: 1.6;
  padding: 40px 48px;
}
.header { display: flex; justify-content: space-between; align-items: flex-start; border-bottom: 3px solid #6D5EF8; padding-bottom: 20px; margin-bottom: 24px; }
.brand { font-size: 22pt; font-weight: 800; color: #6D5EF8; }
.brand-sub { font-size: 9.5pt; color: #64748b; margin-top: 4px; }
.invoice-meta { text-align: left; }
.invoice-title { font-size: 16pt; font-weight: 800; color: #1e293b; }
.invoice-number { font-size: 10.5pt; color: #64748b; margin-top: 4px; direction: ltr; text-align: right; }
.status-badge {
  display: inline-block; margin-top: 10px; padding: 5px 16px; border-radius: 999px;
  font-size: 10pt; font-weight: 700;
  background: ${statusColor.bg}; color: ${statusColor.text}; border: 1px solid ${statusColor.border};
}

.parties { display: flex; gap: 24px; margin-bottom: 28px; }
.party { flex: 1; background: #f8fafc; border-radius: 10px; padding: 16px 18px; page-break-inside: avoid; }
.party-label { font-size: 9pt; font-weight: 700; color: #6D5EF8; text-transform: uppercase; letter-spacing: 0.5px; margin-bottom: 8px; }
.party-name { font-size: 12pt; font-weight: 700; margin-bottom: 4px; }
.party-detail { font-size: 9.5pt; color: #475569; margin-top: 2px; }

.dates-row { display: flex; gap: 24px; margin-bottom: 24px; font-size: 9.5pt; }
.date-item strong { display: block; color: #1e293b; font-size: 10pt; margin-bottom: 2px; }
.date-item span { color: #64748b; }

/* عناصر واردة كصفوف/أقسام تُفصَل بينها بأمان عبر صفحات متعددة (بند 5 في التحقق الذاتي: فاتورة طويلة
   تنتقل بشكل منظم بلا قطع بند في المنتصف) — كل عنصر جدول أو قسم لا يُقطَع بمنتصفه. */
table.items { width: 100%; border-collapse: collapse; margin-bottom: 8px; }
table.items thead { display: table-header-group; } /* يتكرر رأس الجدول أعلى كل صفحة جديدة تلقائياً */
table.items thead th {
  background: #6D5EF8; color: #fff; font-weight: 700; font-size: 9.5pt;
  padding: 10px 14px; text-align: right;
}
table.items thead th:last-child, table.items tbody td:last-child { text-align: left; direction: ltr; }
table.items tbody tr { page-break-inside: avoid; }
table.items tbody td { padding: 12px 14px; border-bottom: 1px solid #e2e8f0; font-size: 10pt; }
table.items tbody tr:last-child td { border-bottom: none; }

.totals { display: flex; justify-content: flex-end; margin-top: 12px; margin-bottom: 32px; page-break-inside: avoid; }
.totals-box { width: 280px; }
.totals-row { display: flex; justify-content: space-between; padding: 6px 0; font-size: 10pt; color: #475569; }
.totals-row.grand { border-top: 2px solid #1e293b; margin-top: 6px; padding-top: 10px; font-size: 13pt; font-weight: 800; color: #1e293b; }
.totals-row span:last-child { direction: ltr; }

.qr-section { display: flex; align-items: center; gap: 16px; padding: 18px; background: #f8fafc; border-radius: 10px; margin-bottom: 28px; page-break-inside: avoid; }
.qr-section img { width: 100px; height: 100px; }
.qr-caption { font-size: 9pt; color: #64748b; max-width: 340px; }
.qr-caption strong { display: block; color: #1e293b; font-size: 10pt; margin-bottom: 3px; }

.failure-note { background: #fef2f2; border: 1px solid #fecaca; color: #dc2626; border-radius: 8px; padding: 12px 16px; font-size: 9.5pt; margin-bottom: 24px; page-break-inside: avoid; }

.footer { border-top: 1px solid #e2e8f0; padding-top: 18px; font-size: 8.5pt; color: #94a3b8; text-align: center; }
.footer p { margin-bottom: 4px; }
.thank-you { font-size: 10.5pt; font-weight: 700; color: #6D5EF8; margin-bottom: 8px; }
</style>
</head>
<body>

  <div class="header">
    <div>
      <div class="brand">${escapeHtml(seller.sellerLegalName)}</div>
      <div class="brand-sub">فاتورة ضريبية</div>
    </div>
    <div class="invoice-meta">
      <div class="invoice-title">فاتورة ضريبية</div>
      <div class="invoice-number">${invoiceLabel}</div>
      <div><span class="status-badge">${statusLabel}</span></div>
    </div>
  </div>

  <div class="parties">
    <div class="party">
      <div class="party-label">من (البائع)</div>
      <div class="party-name">${escapeHtml(seller.sellerLegalName)}</div>
      ${seller.sellerVatNumber ? `<div class="party-detail">الرقم الضريبي: ${escapeHtml(seller.sellerVatNumber)}</div>` : ""}
      ${seller.sellerAddress ? `<div class="party-detail">${escapeHtml(seller.sellerAddress)}</div>` : ""}
    </div>
    <div class="party">
      <div class="party-label">إلى (المشتري)</div>
      <div class="party-name">${escapeHtml(tenantName)}</div>
      ${tenantVatNumber ? `<div class="party-detail">الرقم الضريبي: ${escapeHtml(tenantVatNumber)}</div>` : ""}
      ${tenantEmail ? `<div class="party-detail" style="direction:ltr; text-align:right;">${escapeHtml(tenantEmail)}</div>` : ""}
    </div>
  </div>

  <div class="dates-row">
    <div class="date-item"><strong>تاريخ الإصدار</strong><span>${formatDate(invoice.createdAt)}</span></div>
    ${invoice.paidAt ? `<div class="date-item"><strong>تاريخ السداد</strong><span>${formatDate(invoice.paidAt)}</span></div>` : ""}
    ${showDueDate ? `<div class="date-item"><strong>تاريخ الاستحقاق</strong><span>${formatDate(invoice.periodEnd)}</span></div>` : ""}
  </div>

  ${invoice.failureReason ? `<div class="failure-note">سبب فشل التحصيل: ${escapeHtml(invoice.failureReason)}</div>` : ""}

  <table class="items">
    <thead>
      <tr><th>الوصف</th><th>الكمية</th><th>السعر قبل الضريبة</th><th>الإجمالي</th></tr>
    </thead>
    <tbody>
      <tr>
        <td>${escapeHtml(lineItemDescription)}</td>
        <td>1</td>
        <td>${formatSar(subtotal)} ر.س</td>
        <td>${formatSar(subtotal)} ر.س</td>
      </tr>
    </tbody>
  </table>

  <div class="totals">
    <div class="totals-box">
      <div class="totals-row"><span>المجموع الفرعي</span><span>${formatSar(subtotal)} ر.س</span></div>
      <div class="totals-row"><span>ضريبة القيمة المضافة (${vatPercent}%)</span><span>${formatSar(invoice.vatAmountSar)} ر.س</span></div>
      <div class="totals-row grand"><span>الإجمالي</span><span>${formatSar(invoice.amountSar)} ر.س</span></div>
    </div>
  </div>

  <div class="qr-section">
    <img src="${qrDataUri}" alt="ZATCA QR" />
    <div class="qr-caption">
      <strong>رمز التحقق (ZATCA)</strong>
      امسح الرمز للتحقق من صحة الفاتورة وفق متطلبات هيئة الزكاة والضريبة والجمارك — المرحلة الأولى للفوترة الإلكترونية.
    </div>
  </div>

  <div class="footer">
    <p class="thank-you">شكراً لاستخدامك منصتنا</p>
    <p>شروط الدفع: التحصيل تلقائي عند بداية كل دورة اشتراك — الاسترجاع وفق سياسة المنصة المعلنة.</p>
    <p>
      ${supportEmail ? `الدعم: ${escapeHtml(supportEmail)}` : ""}
      ${supportEmail && supportPhone ? " · " : ""}
      ${supportPhone ? `واتساب: ${escapeHtml(supportPhone)}` : ""}
    </p>
  </div>

</body>
</html>`;
}

function escapeHtml(input: string): string {
  return input.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");
}
