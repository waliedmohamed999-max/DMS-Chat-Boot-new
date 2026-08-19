import type { Invoice } from "@prisma/client";
import { generateZatcaQrDataUri } from "@/lib/billing/zatcaQr";
import { buildInvoiceHtml } from "@/lib/billing/invoiceTemplate";
import { renderHtmlToPdfBuffer } from "@/lib/billing/htmlToPdf";

export type SellerInfo = { sellerLegalName: string; sellerVatNumber: string | null; sellerAddress: string | null };

/**
 * فاتورة ضريبية متوافقة مع متطلبات ZATCA المرحلة الأولى — تُستخدَم من كل من مسار التنزيل الخاص
 * بالتاجر ومسار مالك المنصة معاً (منطق واحد، بلا تكرار). مبنية عبر HTML→PDF حقيقي (Puppeteer) بدل
 * pdfkit القديم (كان يُنتج نصاً عربياً مشوَّهاً تماماً — عطل جذري في محرك الرسم نفسه، مفصَّل في
 * DECISIONS.md). **لا رقم ضريبي للمشتري نفسه إلزامياً** — التجار أفراد/أنشطة صغيرة غير مسجَّلين
 * بالضريبة غالباً، فهذه فاتورة B2B مبسَّطة تجاه المنصة كمورّد خدمة.
 */
export async function generateInvoicePdfBuffer(input: {
  invoice: Invoice;
  tenantName: string;
  tenantVatNumber?: string | null;
  tenantEmail?: string | null;
  planName?: string | null;
  seller: SellerInfo;
  supportEmail?: string | null;
  supportPhone?: string | null;
}): Promise<Buffer> {
  const { invoice, seller } = input;

  // رمز ZATCA متطلب قانوني سعودي تحديداً (المرحلة الأولى للفوترة الإلكترونية) — لا معنى له ولا يجب
  // ظهوره على فاتورة تاجر إماراتي/مصري إطلاقاً (لن يكون رمزاً حقيقياً/صحيحاً لأي جهة تلك الدولة).
  // invoice.currency === "SAR" مكافئ فعلياً لـ"تاجر سعودي" (SAR مقصورة على دولة SA فقط).
  const qrDataUri = invoice.currency === "SAR"
    ? await generateZatcaQrDataUri({
        sellerName: seller.sellerLegalName,
        vatNumber: seller.sellerVatNumber ?? "",
        timestampIso: invoice.createdAt.toISOString(),
        invoiceTotal: invoice.amountSar.toFixed(2),
        vatTotal: invoice.vatAmountSar.toFixed(2),
      })
    : null;

  const html = buildInvoiceHtml({ ...input, qrDataUri });
  return renderHtmlToPdfBuffer(html);
}
