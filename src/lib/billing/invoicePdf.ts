import type { Invoice } from "@prisma/client";
import { generateZatcaQrDataUri } from "@/lib/billing/zatcaQr";
import { buildInvoiceHtml } from "@/lib/billing/invoiceTemplate";
import { renderHtmlToPdfBuffer } from "@/lib/billing/htmlToPdf";
import QRCode from "qrcode";
import { acceptedZatcaQr } from "@/lib/zatca/service";

export type SellerInfo = { sellerLegalName: string; sellerVatNumber: string | null; sellerAddress: string | null };

/**
 * فاتورة ضريبية متوافقة مع متطلبات ZATCA المرحلة الأولى — تُستخدَم من كل من مسار التنزيل الخاص
 * بالتاجر ومسار مالك المنصة معاً (منطق واحد، بلا تكرار). مبنية عبر HTML→PDF حقيقي (Puppeteer) بدل
 * pdfkit القديم (كان يُنتج نصاً عربياً مشوَّهاً تماماً — عطل جذري في محرك الرسم نفسه، مفصَّل في
 * DECISIONS.md). **لا رقم ضريبي للمشتري نفسه إلزامياً** — التجار أفراد/أنشطة صغيرة غير مسجَّلين
 * بالضريبة غالباً، فهذه فاتورة B2B مبسَّطة تجاه المنصة كمورّد خدمة.
 */
export type InvoiceDocInput = {
  invoice: Invoice;
  tenantName: string;
  tenantVatNumber?: string | null;
  tenantEmail?: string | null;
  planName?: string | null;
  seller: SellerInfo;
  supportEmail?: string | null;
  supportPhone?: string | null;
};

async function invoiceHtml(input: InvoiceDocInput): Promise<string> {
  const { invoice, seller } = input;

  // رمز ZATCA متطلب قانوني سعودي تحديداً (المرحلة الأولى للفوترة الإلكترونية) — لا معنى له ولا يجب
  // ظهوره على فاتورة تاجر إماراتي/مصري إطلاقاً (لن يكون رمزاً حقيقياً/صحيحاً لأي جهة تلك الدولة).
  // invoice.currency === "SAR" مكافئ فعلياً لـ"تاجر سعودي" (SAR مقصورة على دولة SA فقط).
  // فاتورة قُبلت لدى ZATCA (المرحلة الثانية) ⇒ رمزها الموقّع الصادر (بصمة + توقيع + مفتاح عام)، وإلا رمز المرحلة الأولى.
  const phase2Qr = invoice.currency === "SAR" ? await acceptedZatcaQr(invoice.id).catch(() => null) : null;
  const qrDataUri = phase2Qr
    ? await QRCode.toDataURL(phase2Qr, { margin: 1, width: 180 })
    : invoice.currency === "SAR"
    ? await generateZatcaQrDataUri({
        sellerName: seller.sellerLegalName,
        vatNumber: seller.sellerVatNumber ?? "",
        timestampIso: invoice.createdAt.toISOString(),
        invoiceTotal: invoice.amountSar.toFixed(2),
        vatTotal: invoice.vatAmountSar.toFixed(2),
      })
    : null;

  return buildInvoiceHtml({ ...input, qrDataUri });
}

export async function generateInvoicePdfBuffer(input: InvoiceDocInput): Promise<Buffer> {
  return renderHtmlToPdfBuffer(await invoiceHtml(input));
}

/**
 * استجابة تنزيل الفاتورة: PDF، وإن تعذّر تشغيل متصفح على الخادم (استضافة بلا Chromium) تُعرض نفس الفاتورة HTML
 * قابلة للطباعة/الحفظ كـPDF من المتصفح — بدل خطأ 500 يحرم التاجر من فاتورته.
 */
export async function invoiceDownloadResponse(input: InvoiceDocInput): Promise<Response> {
  const filename = `invoice-${input.invoice.invoiceNumber}`;
  try {
    const buffer = await generateInvoicePdfBuffer(input);
    return new Response(new Uint8Array(buffer), {
      headers: { "Content-Type": "application/pdf", "Content-Disposition": `attachment; filename="${filename}.pdf"` },
    });
  } catch (err) {
    console.error("⚠️ تعذّر توليد PDF — عرض الفاتورة HTML:", err instanceof Error ? err.message.split("\n")[0] : err);
    return new Response(await invoiceHtml(input), {
      headers: {
        "Content-Type": "text/html; charset=utf-8",
        "Content-Disposition": `inline; filename="${filename}.html"`,
      },
    });
  }
}
