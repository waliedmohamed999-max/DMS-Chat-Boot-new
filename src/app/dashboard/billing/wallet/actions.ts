"use server";

import crypto from "crypto";
import { revalidatePath } from "next/cache";
import { requireTenantSession } from "@/lib/session";
import { requirePermission } from "@/lib/rbac";
import { getPlatformSettings } from "@/lib/platformSettings";
import { redisConnection } from "@/lib/queue/connection";
import { checkTenantRateLimit } from "@/lib/rateLimit";
import { writeAuditLog } from "@/lib/audit";
import { createRechargeInvoice, isMoyasarConfigured } from "@/lib/billing/moyasar";
import { setWalletMinAlert } from "@/lib/billing/wallet";

const MAX_RECHARGE_SAR = 50_000;
const RECHARGE_REF_TTL_SECONDS = 7 * 24 * 3600;

export type RechargeResult = { ok: true; paymentUrl: string } | { ok: false; message: string; amount?: string };

/** بدء شحن المحفظة: إنشاء فاتورة Moyasar وإرجاع رابط صفحة الدفع (التاجر يُحوَّل إليها من المتصفح). */
export async function startWalletRecharge(_prev: RechargeResult | null, formData: FormData): Promise<RechargeResult> {
  const session = await requireTenantSession();
  requirePermission(session.user.role, "billing.manage");
  const tenantId = session.user.tenantId;
  const raw = String(formData.get("amount") ?? "");
  const amount = Math.round(Number(raw) * 100) / 100;
  const { walletMinRechargeSar } = await getPlatformSettings();

  if (!isMoyasarConfigured()) return { ok: false, message: "الدفع الإلكتروني غير مفعّل بعد — تواصل مع الدعم للشحن بتحويل بنكي.", amount: raw };
  if (!(amount >= walletMinRechargeSar)) return { ok: false, message: `الحد الأدنى للشحن ${walletMinRechargeSar} ر.س`, amount: raw };
  if (amount > MAX_RECHARGE_SAR) return { ok: false, message: `الحد الأقصى للشحنة الواحدة ${MAX_RECHARGE_SAR.toLocaleString("en-US")} ر.س`, amount: raw };
  if (!(await checkTenantRateLimit(tenantId, "wallet-recharge-start", 10, 3600)).allowed) {
    return { ok: false, message: "محاولات شحن كثيرة — حاول بعد ساعة.", amount: raw };
  }

  const base = process.env.NEXTAUTH_URL || "http://localhost:3000";
  const ref = crypto.randomBytes(16).toString("hex");
  try {
    const invoice = await createRechargeInvoice({
      tenantId, amountSar: amount, ref,
      description: `شحن محفظة رسائل واتساب — DMS Tech (${amount.toFixed(2)} ر.س)`,
      successUrl: `${base}/api/billing/wallet/moyasar/return?ref=${ref}`,
      backUrl: `${base}/dashboard/billing/wallet?recharge=cancelled`,
      callbackUrl: `${base}/api/billing/wallet/moyasar/callback`,
    });
    if (!invoice.url) throw new Error("لم تُرجع بوابة الدفع رابط الدفع");
    // ربط مرجع رابط العودة بالفاتورة والحساب — رابط العودة نفسه لا يحمل أي بيانات موثوقة.
    await redisConnection.set(`wallet-recharge:${ref}`, JSON.stringify({ tenantId, invoiceId: invoice.id }), "EX", RECHARGE_REF_TTL_SECONDS);
    await writeAuditLog({ tenantId, userId: session.user.id, action: "wallet.recharge_started", targetType: "WalletBalance", targetId: invoice.id, metaJson: { amount } });
    return { ok: true, paymentUrl: invoice.url };
  } catch (err) {
    return { ok: false, message: err instanceof Error ? err.message : "تعذّر بدء الدفع", amount: raw };
  }
}

export async function updateMyMinAlert(_prev: { ok: boolean; message: string } | null, formData: FormData) {
  const session = await requireTenantSession();
  requirePermission(session.user.role, "billing.manage");
  try {
    await setWalletMinAlert(session.user.tenantId, Number(formData.get("minAlert")));
    revalidatePath("/dashboard/billing/wallet");
    return { ok: true, message: "تم حفظ حد التنبيه" };
  } catch (err) {
    return { ok: false, message: err instanceof Error ? err.message : "فشل الحفظ" };
  }
}
