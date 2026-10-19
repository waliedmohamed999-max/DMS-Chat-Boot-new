"use server";

import { revalidatePath } from "next/cache";
import { requireSuperAdminSession } from "@/lib/session";
import { requireEffectivePermission } from "@/lib/rbac";
import { adjustWallet, setWalletMinAlert } from "@/lib/billing/wallet";

/** fields: القيم المُرسلة تُعاد عند الفشل ليبقى النموذج معبّأ (React يعيد ضبط النموذج بعد كل إرسال). */
export type WalletActionResult = { ok: boolean; message: string; fields?: { direction: string; amount: string; reason: string } };

async function guard() {
  const session = await requireSuperAdminSession();
  // يحرّك أموالاً فعلية في رصيد التاجر ⇐ نفس صلاحية الاسترداد وإجراءات الفوترة (مالك المنصة فقط).
  requireEffectivePermission(session.user.permissions, "platform.billing.manage");
  return session;
}

export async function adjustWalletAction(tenantId: string, _prev: WalletActionResult | null, formData: FormData): Promise<WalletActionResult> {
  const session = await guard();
  const direction = formData.get("direction") === "debit" ? -1 : 1;
  const amount = Number(formData.get("amount"));
  const reason = String(formData.get("reason") ?? "");
  const fields = { direction: direction < 0 ? "debit" : "credit", amount: String(formData.get("amount") ?? ""), reason };
  if (!(amount > 0)) return { ok: false, message: "أدخل مبلغاً موجباً", fields };
  try {
    const balance = await adjustWallet(tenantId, direction * amount, reason, session.user.id);
    revalidatePath(`/admin/wallets/${tenantId}`);
    revalidatePath("/admin/wallets");
    return { ok: true, message: `تم — الرصيد الجديد ${balance.toFixed(2)} ر.س` };
  } catch (err) {
    return { ok: false, message: err instanceof Error ? err.message : "فشل التعديل", fields };
  }
}

export async function setMinAlertAction(tenantId: string, _prev: WalletActionResult | null, formData: FormData): Promise<WalletActionResult> {
  await guard();
  try {
    await setWalletMinAlert(tenantId, Number(formData.get("minAlert")));
    revalidatePath(`/admin/wallets/${tenantId}`);
    return { ok: true, message: "تم تحديث حد التنبيه" };
  } catch (err) {
    return { ok: false, message: err instanceof Error ? err.message : "فشل التحديث" };
  }
}
