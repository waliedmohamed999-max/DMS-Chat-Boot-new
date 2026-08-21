"use server";

import { revalidatePath } from "next/cache";
import { requireSuperAdminSession } from "@/lib/session";
import { requireEffectivePermission } from "@/lib/rbac";
import { rawDb } from "@/lib/db";
import { sendEmail } from "@/lib/email/send";
import { payoutPaidEmail } from "@/lib/email/affiliateTemplates";
import type { AffiliateTier } from "@prisma/client";

export async function approveAffiliate(affiliateId: string) {
  const session = await requireSuperAdminSession();
  requireEffectivePermission(session.user.permissions, "platform.affiliates.manage");
  await rawDb.affiliate.update({ where: { id: affiliateId }, data: { status: "ACTIVE", rejectionReason: null } });
  revalidatePath("/admin/affiliates");
}

export async function rejectAffiliate(affiliateId: string, reason: string) {
  const session = await requireSuperAdminSession();
  requireEffectivePermission(session.user.permissions, "platform.affiliates.manage");
  await rawDb.affiliate.update({ where: { id: affiliateId }, data: { status: "REJECTED", rejectionReason: reason || null } });
  revalidatePath("/admin/affiliates");
}

export async function suspendAffiliate(affiliateId: string) {
  const session = await requireSuperAdminSession();
  requireEffectivePermission(session.user.permissions, "platform.affiliates.manage");
  await rawDb.affiliate.update({ where: { id: affiliateId }, data: { status: "SUSPENDED" } });
  revalidatePath("/admin/affiliates");
}

export async function reactivateAffiliate(affiliateId: string) {
  const session = await requireSuperAdminSession();
  requireEffectivePermission(session.user.permissions, "platform.affiliates.manage");
  await rawDb.affiliate.update({ where: { id: affiliateId }, data: { status: "ACTIVE" } });
  revalidatePath("/admin/affiliates");
}

/** تعديل يدوي استثنائي للمستوى (ترقية تقديرية، أو تصحيح خطأ) — الترقية التلقائية العادية تتم عبر
 * lib/affiliates/commissionSync.ts، هذا فقط لتدخّل مالك المنصة اليدوي المباشر. */
export async function setAffiliateTier(affiliateId: string, tier: AffiliateTier) {
  const session = await requireSuperAdminSession();
  requireEffectivePermission(session.user.permissions, "platform.affiliates.manage");
  await rawDb.affiliate.update({ where: { id: affiliateId }, data: { tier } });
  revalidatePath("/admin/affiliates");
}

export async function markPayoutPaid(payoutId: string, reference: string) {
  const session = await requireSuperAdminSession();
  requireEffectivePermission(session.user.permissions, "platform.affiliates.manage");

  const payout = await rawDb.$transaction(async (tx) => {
    const updated = await tx.payout.update({
      where: { id: payoutId },
      data: { status: "PAID", paidAt: new Date(), reference: reference || null },
      include: { affiliate: { select: { email: true, name: true } } },
    });
    await tx.commission.updateMany({ where: { payoutId }, data: { status: "PAID" } });
    return updated;
  });

  await sendEmail(
    payoutPaidEmail({ to: payout.affiliate.email, name: payout.affiliate.name, amountSar: payout.amountSar, reference: payout.reference })
  ).catch((err) => {
    console.error(`❌ فشل إرسال بريد تأكيد الصرف للمسوّق ${payout.affiliateId}:`, err);
  });

  revalidatePath("/admin/affiliates");
}

/** فشل الصرف الفعلي (تحويل بنكي مرفوض مثلاً) — يُعيد العمولات لحالة "معتمدة ومتاحة" من جديد
 * (payoutId يُصفَّر) بدل أن تبقى عالقة داخل طلب صرف فاشل للأبد. */
export async function markPayoutFailed(payoutId: string) {
  const session = await requireSuperAdminSession();
  requireEffectivePermission(session.user.permissions, "platform.affiliates.manage");

  await rawDb.$transaction(async (tx) => {
    await tx.payout.update({ where: { id: payoutId }, data: { status: "FAILED" } });
    await tx.commission.updateMany({ where: { payoutId }, data: { payoutId: null } });
  });

  revalidatePath("/admin/affiliates");
}
