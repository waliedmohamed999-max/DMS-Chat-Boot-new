import { IntegrationProvider, Prisma, type TriggerEvent } from "@prisma/client";
import { withTenant } from "@/lib/db";

export type SallaAutomationKey = "abandonedCart" | "welcome";

export const AUTOMATION_TRIGGERS: Record<SallaAutomationKey, TriggerEvent> = {
  abandonedCart: "ABANDONED_CART",
  welcome: "NEW_CUSTOMER",
};

export type AutomationState = {
  key: SallaAutomationKey;
  campaignId: string | null;
  /** ACTIVE / PAUSED لحملة قائمة، أو null لو لم تُنشأ حملة بعد (تحتاج اختيار قالب واتساب معتمد). */
  status: "ACTIVE" | "PAUSED" | null;
  /** رغبة التاجر المسجَّلة من سلة (خطوات الإعداد أو إعدادات التطبيق) قبل وجود حملة. */
  requested: boolean | null;
};

type Meta = { requestedAutomations?: Partial<Record<SallaAutomationKey, boolean>> } & Record<string, unknown>;

export async function getAutomationStates(tenantId: string): Promise<AutomationState[]> {
  return withTenant(tenantId, async (tx) => {
    const [campaigns, integration] = await Promise.all([
      tx.campaign.findMany({
        where: { tenantId, type: "TRIGGERED", triggerEvent: { in: Object.values(AUTOMATION_TRIGGERS) }, status: { in: ["ACTIVE", "PAUSED"] } },
        orderBy: { createdAt: "desc" },
        select: { id: true, status: true, triggerEvent: true },
      }),
      tx.integration.findUnique({ where: { tenantId_provider: { tenantId, provider: IntegrationProvider.SALLA } }, select: { metadataJson: true } }),
    ]);
    const requested = ((integration?.metadataJson ?? {}) as Meta).requestedAutomations ?? {};
    return (Object.keys(AUTOMATION_TRIGGERS) as SallaAutomationKey[]).map((key) => {
      const c = campaigns.find((x) => x.triggerEvent === AUTOMATION_TRIGGERS[key]);
      return { key, campaignId: c?.id ?? null, status: (c?.status as "ACTIVE" | "PAUSED" | undefined) ?? null, requested: requested[key] ?? null };
    });
  });
}

/**
 * تشغيل/إيقاف رسالة تلقائية من سلة (إعدادات التطبيق أو صفحة DMS داخل لوحة سلة). يغيّر حالة الحملة
 * الآلية القائمة فقط (ACTIVE ↔ PAUSED) — لا يُنشئ حملة لأن ذلك يتطلب اختيار قالب واتساب معتمد من لوحة
 * DMS. الرغبة تُحفظ دائماً في metadata فتظهر للتاجر كـ"طلبت تفعيلها" حتى يُكمل الإعداد.
 */
export async function setAutomationEnabled(tenantId: string, key: SallaAutomationKey, enabled: boolean): Promise<AutomationState> {
  await withTenant(tenantId, async (tx) => {
    const campaign = await tx.campaign.findFirst({
      where: { tenantId, type: "TRIGGERED", triggerEvent: AUTOMATION_TRIGGERS[key], status: { in: ["ACTIVE", "PAUSED"] } },
      orderBy: { createdAt: "desc" },
    });
    if (campaign) await tx.campaign.update({ where: { id: campaign.id }, data: { status: enabled ? "ACTIVE" : "PAUSED" } });

    const integration = await tx.integration.findUnique({ where: { tenantId_provider: { tenantId, provider: IntegrationProvider.SALLA } } });
    if (integration) {
      const meta = ((integration.metadataJson ?? {}) as Meta) || {};
      await tx.integration.update({
        where: { id: integration.id },
        data: { metadataJson: { ...meta, requestedAutomations: { ...(meta.requestedAutomations ?? {}), [key]: enabled } } as Prisma.InputJsonValue },
      });
    }
  });
  return (await getAutomationStates(tenantId)).find((s) => s.key === key)!;
}
