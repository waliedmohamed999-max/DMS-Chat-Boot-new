import { superAdminDb } from "@/lib/db";
import { postRevenueRecognitionEntry } from "@/lib/accounting/postings";

/**
 * الاعتراف بالإيراد التدريجي (Revenue Recognition) — بند 4-ب في البرومنت. الاشتراك يُدفع مقدماً عن
 * فترة كاملة (شهر/سنة)، فالدفعة تُسجَّل أولاً كإيراد مؤجل بالكامل (postInvoicePaymentEntry) ثم
 * "تُكتسَب" تدريجياً هنا بمقدار الوقت الفعلي المنقضي من فترة الفاتورة — وليست ربحاً فورياً بالكامل
 * لحظة الدفع. تعمل بمنطق تناسبي بسيط (وليس جدول توزيع يومي مفصَّل مُخزَّن) — تكفي لحجم بيانات SaaS
 * من هذا النوع دون تعقيد جدولة زمنية إضافية.
 *
 * فاتورة انتهت فترتها بالكامل (periodEnd في الماضي) تُعترَف بإيرادها كاملاً فوراً في أول تشغيلة —
 * صحيح رياضياً (نسبة الوقت المنقضي = 100%) دون أي حالة خاصة إضافية مطلوبة.
 */
export async function recognizeRevenueForActiveInvoices(): Promise<void> {
  const invoices = await superAdminDb.invoice.findMany({
    where: { status: "PAID" },
    select: { id: true, amountSar: true, vatAmountSar: true, planKey: true, periodStart: true, periodEnd: true, recognizedRevenueSar: true },
  });

  const now = Date.now();

  for (const invoice of invoices) {
    const subtotal = invoice.amountSar - invoice.vatAmountSar;
    if (invoice.recognizedRevenueSar >= subtotal) continue;

    const totalMs = Math.max(1, invoice.periodEnd.getTime() - invoice.periodStart.getTime());
    const elapsedMs = Math.min(totalMs, Math.max(0, now - invoice.periodStart.getTime()));
    const targetRecognized = Math.round(subtotal * (elapsedMs / totalMs));

    const delta = targetRecognized - invoice.recognizedRevenueSar;
    if (delta <= 0) continue;

    try {
      await postRevenueRecognitionEntry(invoice.id, delta, invoice.planKey);
      await superAdminDb.invoice.update({ where: { id: invoice.id }, data: { recognizedRevenueSar: invoice.recognizedRevenueSar + delta } });
    } catch (err) {
      console.error(`❌ فشل الاعتراف بإيراد الفاتورة ${invoice.id}:`, err);
    }
  }
}
