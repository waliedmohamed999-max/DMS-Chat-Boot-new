import { superAdminDb } from "@/lib/db";
import type { AnnouncementAudience } from "@prisma/client";

/**
 * معرّفات التجّار المستهدفين فعلياً حسب نوع الجمهور — مصدر حقيقة واحد لحساب حجم الجمهور (قبل
 * الإرسال) وتحليلات الوصول (بعد الإرسال) معاً. Subscription جدول مستأجَر خاضع لـRLS، فالقراءة عبر
 * تينانتات متعددة تتطلب superAdminDb وليس rawDb — نفس السبب الموثَّق بالضبط في قراءة Invoice عبر
 * superAdminDb في affiliates/dashboard/page.tsx.
 */
export async function resolveAudienceTenantIds(
  audienceType: AnnouncementAudience,
  audiencePlanId: string | null,
  audienceTenantIdsJson: unknown
): Promise<string[]> {
  if (audienceType === "SPECIFIC_TENANTS") {
    return Array.isArray(audienceTenantIdsJson) ? (audienceTenantIdsJson as string[]) : [];
  }
  if (audienceType === "SPECIFIC_PLAN" && audiencePlanId) {
    const subs = await superAdminDb.subscription.findMany({ where: { planId: audiencePlanId }, select: { tenantId: true } });
    return subs.map((s) => s.tenantId);
  }
  const tenants = await superAdminDb.tenant.findMany({ select: { id: true } });
  return tenants.map((t) => t.id);
}

/** عدد التجّار لكل باقة — لعرضه بجانب كل خيار في قائمة "باقة محددة" وقت التأليف (معاينة حجم الجمهور
 * قبل الإرسال، بلا حاجة لـJS/استعلام حي). */
export async function countTenantsPerPlan(): Promise<Map<string, number>> {
  const grouped = await superAdminDb.subscription.groupBy({ by: ["planId"], _count: { _all: true } });
  return new Map(grouped.map((g) => [g.planId, g._count._all]));
}
