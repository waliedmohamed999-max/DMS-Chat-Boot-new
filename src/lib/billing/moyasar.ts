import { superAdminDb } from "@/lib/db";
import { creditWallet } from "@/lib/billing/wallet";
import { sendEmail } from "@/lib/email/send";
import { walletRechargeReceiptEmail } from "@/lib/email/walletTemplates";

/**
 * شحن محفظة الرسائل عبر Moyasar (فواتير Invoices): ننشئ فاتورة بصفحة دفع مستضافة لدى Moyasar، ثم
 * نُضيف الرصيد فقط بعد سؤال Moyasar مباشرة بالمفتاح السري عن حالة الفاتورة (paid) ومبلغها وصاحبها —
 * لا نثق أبداً في أي قيمة واردة من المتصفح أو من جسم الإشعار. الإضافة آمنة للتكرار (مفتاح الفاتورة)،
 * فوصول التأكيد من رابط العودة ومن إشعار Moyasar معاً يضيف الرصيد مرة واحدة فقط.
 * docs.moyasar.com/creating-invoices
 */

function config() {
  return {
    secretKey: process.env.MOYASAR_SECRET_KEY?.trim() || null,
    baseUrl: (process.env.MOYASAR_BASE_URL || "https://api.moyasar.com/v1").replace(/\/$/, ""),
  };
}

export function isMoyasarConfigured(): boolean {
  return Boolean(config().secretKey);
}

async function moyasarFetch<T = any>(path: string, init: RequestInit = {}): Promise<T> {
  const { secretKey, baseUrl } = config();
  if (!secretKey) throw new Error("بوابة الدفع Moyasar غير مضبوطة (MOYASAR_SECRET_KEY)");
  const res = await fetch(`${baseUrl}${path}`, {
    ...init,
    headers: {
      Authorization: `Basic ${Buffer.from(`${secretKey}:`).toString("base64")}`,
      "Content-Type": "application/json", Accept: "application/json", ...(init.headers ?? {}),
    },
    signal: AbortSignal.timeout(20_000),
  });
  const body = await res.json().catch(() => null);
  if (!res.ok) {
    console.error(`❌ Moyasar ${path} (${res.status}):`, JSON.stringify(body)?.slice(0, 400));
    throw new Error(body?.message ?? `فشل طلب بوابة الدفع (${res.status})`);
  }
  return body as T;
}

/** فحص صحة المفتاح السري (لصفحة جاهزية الربط) — طلب قراءة فقط لا ينشئ شيئاً. */
export async function pingMoyasar(): Promise<{ mode: "test" | "live" | "unknown" }> {
  await moyasarFetch(`/invoices?per=1`);
  const key = config().secretKey ?? "";
  return { mode: key.startsWith("sk_test_") ? "test" : key.startsWith("sk_live_") ? "live" : "unknown" };
}

export type MoyasarInvoice = { id: string; status: string; amount: number; currency: string; url?: string; metadata?: Record<string, string> | null };

export async function createRechargeInvoice(input: {
  tenantId: string; amountSar: number; description: string; successUrl: string; backUrl: string; callbackUrl: string; ref: string;
}): Promise<MoyasarInvoice> {
  return moyasarFetch<MoyasarInvoice>("/invoices", {
    method: "POST",
    body: JSON.stringify({
      amount: Math.round(input.amountSar * 100), // هللات
      currency: "SAR",
      description: input.description,
      success_url: input.successUrl,
      back_url: input.backUrl,
      callback_url: input.callbackUrl,
      metadata: { purpose: "wallet_recharge", tenant_id: input.tenantId, ref: input.ref },
    }),
  });
}

export type ApplyResult =
  | { status: "credited" | "already_credited"; tenantId: string; amountSar: number; balance: number }
  | { status: "not_paid"; invoiceStatus: string }
  | { status: "invalid"; reason: string };

/** يتحقق من الفاتورة لدى Moyasar نفسها ثم يضيف الرصيد (مرة واحدة). expectedTenantId يمنع تطبيق فاتورة على حساب آخر. */
export async function applyPaidRechargeInvoice(invoiceId: string, expectedTenantId?: string): Promise<ApplyResult> {
  if (!/^[\w-]{6,80}$/.test(invoiceId)) return { status: "invalid", reason: "معرّف فاتورة غير صالح" };
  const invoice = await moyasarFetch<MoyasarInvoice>(`/invoices/${encodeURIComponent(invoiceId)}`);
  const tenantId = invoice.metadata?.tenant_id;
  if (invoice.metadata?.purpose !== "wallet_recharge" || !tenantId) return { status: "invalid", reason: "الفاتورة ليست شحن محفظة" };
  if (expectedTenantId && tenantId !== expectedTenantId) return { status: "invalid", reason: "الفاتورة لا تخص هذا الحساب" };
  if (invoice.currency !== "SAR" || !(invoice.amount > 0)) return { status: "invalid", reason: "عملة أو مبلغ غير متوقع" };
  if (invoice.status !== "paid") return { status: "not_paid", invoiceStatus: invoice.status };

  const amountSar = invoice.amount / 100;
  const result = await creditWallet(tenantId, amountSar, {
    type: "RECHARGE", idempotencyKey: `moyasar:${invoice.id}`, reference: invoice.id,
    description: `شحن عبر Moyasar (فاتورة ${invoice.id})`,
  });
  if (result.applied) {
    const owner = await superAdminDb.user.findFirst({ where: { tenantId, role: "OWNER", isActive: true }, orderBy: { createdAt: "asc" } });
    if (owner) {
      await sendEmail(walletRechargeReceiptEmail({ to: owner.email, name: owner.name, amount: amountSar, balance: result.balance, reference: invoice.id }))
        .catch((err) => console.error("recharge receipt email failed:", err));
    }
  }
  return { status: result.applied ? "credited" : "already_credited", tenantId, amountSar, balance: result.balance };
}
