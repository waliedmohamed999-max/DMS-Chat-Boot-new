"use server";

import { revalidatePath } from "next/cache";
import { requireAffiliateSession } from "@/lib/affiliates/session";
import { rawDb } from "@/lib/db";
import { MIN_PAYOUT_SAR } from "@/lib/affiliates/payout";

export async function requestPayout(_prevState: { error: string | null }, formData: FormData): Promise<{ error: string | null }> {
  const affiliate = await requireAffiliateSession();
  const method = String(formData.get("method") ?? "").trim();
  if (!method) return { error: "اكتب طريقة استلامك المفضّلة (تحويل بنكي/محفظة) أولاً" };

  const availableCommissions = await rawDb.commission.findMany({
    where: { affiliateId: affiliate.id, status: "APPROVED", payoutId: null },
  });
  const total = availableCommissions.reduce((sum, c) => sum + c.amountSar, 0);

  if (total < MIN_PAYOUT_SAR) {
    return { error: `رصيدك المعتمد الحالي ${total} ر.س، أقل من الحد الأدنى للصرف (${MIN_PAYOUT_SAR} ر.س).` };
  }

  await rawDb.$transaction(async (tx) => {
    const payout = await tx.payout.create({
      data: { affiliateId: affiliate.id, amountSar: total, method, status: "PENDING" },
    });
    // العمولات تبقى APPROVED حتى يعتمد مالك المنصة الصرف فعلياً (markPayoutPaid) — payoutId فقط
    // يمنعها من الظهور ضمن رصيد "متاح للصرف" في طلب جديد أثناء معالجة هذا الطلب.
    await tx.commission.updateMany({
      where: { id: { in: availableCommissions.map((c) => c.id) } },
      data: { payoutId: payout.id },
    });
  });

  revalidatePath("/affiliates/dashboard");
  return { error: null };
}
