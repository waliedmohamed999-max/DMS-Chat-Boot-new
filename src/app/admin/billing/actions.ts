"use server";

import { revalidatePath } from "next/cache";
import { requireSuperAdminSession } from "@/lib/session";
import { requirePermission } from "@/lib/rbac";
import { superAdminDb } from "@/lib/db";
import { postRefundEntry, postInvoicePaymentEntry } from "@/lib/accounting/postings";
import { getPaymentProvider } from "@/lib/billing/payment-provider";
import { ensureChartOfAccounts } from "@/lib/accounting/chartOfAccounts";

export type IssueRefundResult = { success: true; creditNoteNumber: number } | { success: false; error: string };
export type RetryPaymentResult = { success: true } | { success: false; error: string };
export type AddAccountResult = { success: true } | { success: false; error: string };

/**
 * استرداد فاتورة مدفوعة بالكامل — يُنشئ إشعار دائن مرتبطاً بها (بند 5 في البرومنت)، **لا يُعدَّل أو
 * يُحذَف سجل الفاتورة الأصلية إطلاقاً** (فقط status → REFUNDED)، ويُسجَّل قيد محاسبي عكسي حقيقي.
 * استرداد جزئي غير مدعوم في هذه الجولة (قرار نطاق موثَّق في DECISIONS.md) — استرداد كامل فقط.
 */
export async function issueRefund(invoiceId: string, reason: string): Promise<IssueRefundResult> {
  const session = await requireSuperAdminSession();
  requirePermission(session.user.role, "platform.billing.manage");
  if (!reason.trim()) return { success: false, error: "سبب الاسترداد مطلوب" };

  const invoice = await superAdminDb.invoice.findUnique({ where: { id: invoiceId } });
  if (!invoice) return { success: false, error: "الفاتورة غير موجودة" };
  if (invoice.status !== "PAID") return { success: false, error: "لا يمكن استرداد فاتورة غير مدفوعة" };

  const subtotal = invoice.amountSar - invoice.vatAmountSar;

  const creditNote = await superAdminDb.$transaction(async (tx) => {
    const note = await tx.creditNote.create({
      data: { invoiceId, tenantId: invoice.tenantId, amountSar: subtotal, vatAmountSar: invoice.vatAmountSar, reason: reason.trim() },
    });
    await tx.invoice.update({ where: { id: invoiceId }, data: { status: "REFUNDED" } });
    return note;
  });

  await postRefundEntry(invoiceId, subtotal, invoice.vatAmountSar, invoice.currency);

  await superAdminDb.auditLog.create({
    data: {
      userId: session.user.id, tenantId: invoice.tenantId, action: "platform.invoice_refund",
      targetType: "Invoice", targetId: invoiceId, metaJson: { creditNoteNumber: creditNote.creditNoteNumber, reason, amountSar: invoice.amountSar },
    },
  });

  revalidatePath("/admin/billing");
  return { success: true, creditNoteNumber: creditNote.creditNoteNumber };
}

/**
 * إعادة محاولة تحصيل فاتورة فاشلة من لوحة مالك المنصة مباشرة (بند 2 في برومنت الإيرادات: "قسم مدفوعات
 * فاشلة حقيقي بزر إعادة محاولة") — نسخة مطابقة منطقياً لـ`retryFailedPayment` في dashboard/billing
 * لكن عبر `superAdminDb` مباشرة (بلا `withTenant`/RLS) لأن الجلسة هنا جلسة فريق منصة عابرة للتجار،
 * وليست جلسة تاجر واحد.
 */
export async function retryFailedPaymentAsAdmin(invoiceId: string): Promise<RetryPaymentResult> {
  const session = await requireSuperAdminSession();
  requirePermission(session.user.role, "platform.billing.manage");

  const invoice = await superAdminDb.invoice.findUnique({ where: { id: invoiceId } });
  if (!invoice || invoice.status !== "FAILED") return { success: false, error: "لا توجد فاتورة فاشلة بهذا المعرّف" };

  const charge = await getPaymentProvider().chargeSubscription(invoice.tenantId, invoice.amountSar, invoice.currency);

  if (charge.success) {
    await superAdminDb.invoice.update({ where: { id: invoiceId }, data: { status: "PAID", paidAt: new Date(), failureReason: null } });
    await superAdminDb.subscription.update({ where: { tenantId: invoice.tenantId }, data: { status: "ACTIVE" } });
    await postInvoicePaymentEntry({ id: invoice.id, amountSar: invoice.amountSar, vatAmountSar: invoice.vatAmountSar, planKey: invoice.planKey, currency: invoice.currency }).catch((err) =>
      console.error("❌ فشل تسجيل قيد محاسبي لإعادة محاولة الدفع (من لوحة المنصة):", err)
    );
  } else {
    await superAdminDb.invoice.update({ where: { id: invoiceId }, data: { failureReason: charge.failureReason ?? "فشلت إعادة المحاولة" } });
  }

  await superAdminDb.auditLog.create({
    data: {
      userId: session.user.id, tenantId: invoice.tenantId, action: "platform.invoice_retry_payment",
      targetType: "Invoice", targetId: invoiceId, metaJson: { success: charge.success },
    },
  });

  revalidatePath("/admin/billing");
  return charge.success ? { success: true } : { success: false, error: "فشلت إعادة محاولة التحصيل مرة أخرى." };
}

/**
 * إضافة حساب فرعي جديد يدوياً لدليل الحسابات (بند 4-أ: "السماح بإضافة حسابات فرعية جديدة يدوياً") —
 * تحت أحد الفروع الجذرية الخمسة الثابتة فقط (لا يمكن إضافة جذر جديد، ولا تعديل/حذف حساب نظامي).
 */
export async function addChartOfAccountsEntry(formData: FormData): Promise<AddAccountResult> {
  const session = await requireSuperAdminSession();
  requirePermission(session.user.role, "platform.billing.manage");

  const parentCode = String(formData.get("parentCode") ?? "").trim();
  const name = String(formData.get("name") ?? "").trim();
  if (!name) return { success: false, error: "اسم الحساب مطلوب" };

  const parent = await superAdminDb.account.findUnique({ where: { code: parentCode } });
  if (!parent) return { success: false, error: "الحساب الأب غير موجود" };

  await ensureChartOfAccounts();

  const siblingCount = await superAdminDb.account.count({ where: { parentId: parent.id } });
  const code = `${parentCode}.custom${siblingCount + 1}`;

  await superAdminDb.account.create({
    data: { code, name, type: parent.type, parentId: parent.id, isSystemAccount: false },
  });

  await superAdminDb.auditLog.create({
    data: { userId: session.user.id, action: "platform.account_create", targetType: "Account", targetId: code, metaJson: { name, parentCode } },
  });

  revalidatePath("/admin/billing/accounts");
  return { success: true };
}
