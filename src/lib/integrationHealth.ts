import type { IntegrationProvider, IntegrationStatus } from "@prisma/client";
import { superAdminDb } from "@/lib/db";

/**
 * المزوّدون الثلاثة المُحتسَبون في "اكتمال التكاملات" — WHATSAPP_QR بديل تجريبي مؤقت عن
 * META_WHATSAPP فلا يُحتسَب كقناة رابعة منفصلة (نفس منطق العدّاد N/3 الموجود أصلاً في الصفحة).
 */
export const CORE_PROVIDERS: IntegrationProvider[] = ["META_WHATSAPP", "ZID", "SALLA"];

export type IntegrationCompleteness = "full" | "partial" | "none";
export type HealthLevel = "green" | "yellow" | "red";

export function computeCompleteness(connectedCoreCount: number): IntegrationCompleteness {
  if (connectedCoreCount >= CORE_PROVIDERS.length) return "full";
  if (connectedCoreCount > 0) return "partial";
  return "none";
}

/**
 * أحمر = تكامل معطّل فعلياً (ERROR/NEEDS_REAUTH) — وليس فقط غير مربوط بعد (DISCONNECTED طبيعي
 * لتاجر لم يربط تكاملاً اختيارياً، ليس عطلاً). أصفر = اكتمال جزئي بلا أعطال. أخضر = اكتمال كامل بلا أعطال.
 */
export function computeHealthLevel(statuses: IntegrationStatus[], completeness: IntegrationCompleteness): HealthLevel {
  if (statuses.some((s) => s === "ERROR" || s === "NEEDS_REAUTH")) return "red";
  return completeness === "full" ? "green" : "yellow";
}

export type WebhookHealth = {
  lastSuccessAt: Date | null;
  lastFailureAt: Date | null;
  lastFailureReason: string | null;
};

/**
 * صحة Webhook فعلية لكل تكامل — الإصلاح الجوهري هنا: "نجاح" لا يعني فقط signatureValid=true، بل
 * أيضاً عدم وجود errorMessage (توقيع صحيح + لم يُطابَق حساب التاجر = ليس نجاحاً فعلياً رغم
 * signatureValid=true). كان الاستعلام القديم في صفحة تفاصيل التاجر يخلط بين الاثنين.
 */
export async function getIntegrationWebhookHealth(tenantId: string, provider: IntegrationProvider): Promise<WebhookHealth> {
  const [lastSuccess, lastFailure] = await Promise.all([
    superAdminDb.webhookLog.findFirst({
      where: { tenantId, provider, signatureValid: true, errorMessage: null },
      orderBy: { createdAt: "desc" },
      select: { createdAt: true },
    }),
    superAdminDb.webhookLog.findFirst({
      where: { tenantId, provider, OR: [{ signatureValid: false }, { errorMessage: { not: null } }] },
      orderBy: { createdAt: "desc" },
      select: { createdAt: true, errorMessage: true },
    }),
  ]);

  return {
    lastSuccessAt: lastSuccess?.createdAt ?? null,
    lastFailureAt: lastFailure?.createdAt ?? null,
    lastFailureReason: lastFailure?.errorMessage ?? null,
  };
}
