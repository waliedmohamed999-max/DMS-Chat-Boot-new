import { withTenant } from "@/lib/db";

export type CampaignLimits = {
  maxCampaignsPerMonth: number; // -1 = غير محدود
  maxAudiencePerCampaign: number; // -1 = غير محدود
  // علم بيانات محجوز لترقية مستقبلية (A/B Testing) — لا واجهة فعلية مبنية عليه بعد، انظر DECISIONS.md
  abTestingEnabled: boolean;
};

// حدود Starter الافتراضية — fallback آمن (الأكثر تقييداً) إن كانت الباقة بدون campaignLimitsJson مضبوط صراحة.
export const DEFAULT_STARTER_CAMPAIGN_LIMITS: CampaignLimits = {
  maxCampaignsPerMonth: 4,
  maxAudiencePerCampaign: 200,
  abTestingEnabled: false,
};

/** يُصدَّر ليُستخدَم أيضاً لتحليل حدود باقة أخرى (مثال: جدول مقارنة الباقات في صفحة الفوترة). */
export function parseCampaignLimits(raw: unknown): CampaignLimits {
  if (!raw || typeof raw !== "object") return DEFAULT_STARTER_CAMPAIGN_LIMITS;
  const r = raw as Partial<CampaignLimits>;
  return {
    maxCampaignsPerMonth: typeof r.maxCampaignsPerMonth === "number" ? r.maxCampaignsPerMonth : DEFAULT_STARTER_CAMPAIGN_LIMITS.maxCampaignsPerMonth,
    maxAudiencePerCampaign: typeof r.maxAudiencePerCampaign === "number" ? r.maxAudiencePerCampaign : DEFAULT_STARTER_CAMPAIGN_LIMITS.maxAudiencePerCampaign,
    abTestingEnabled: Boolean(r.abTestingEnabled),
  };
}

export function isUnlimited(n: number): boolean {
  return n < 0;
}

/** يجلب حدود الحملات الفعلية لمستأجر معيّن بناءً على باقته الحالية، بالإضافة لحصة الرسائل الشهرية العامة. */
export async function getTenantCampaignLimits(tenantId: string): Promise<
  CampaignLimits & { planKey: string; planName: string; maxMessagesPerMonth: number; messagesUsedThisPeriod: number; subscriptionStatus: string }
> {
  // Subscription جدول مستأجر خاضع لـ RLS — يجب المرور عبر withTenant() وإلا يُرجع فارغاً بصمت
  // (نفس فئة الخطأ المكتشفة مراراً في جولات سابقة: getTenantChatbotLimits، dashboard/layout.tsx، إلخ).
  const subscription = await withTenant(tenantId, (tx) =>
    tx.subscription.findUnique({ where: { tenantId }, include: { plan: true } })
  );

  if (!subscription) {
    return { ...DEFAULT_STARTER_CAMPAIGN_LIMITS, planKey: "starter", planName: "البداية", maxMessagesPerMonth: 500, messagesUsedThisPeriod: 0, subscriptionStatus: "ACTIVE" };
  }

  return {
    ...parseCampaignLimits(subscription.plan.campaignLimitsJson),
    planKey: subscription.plan.key,
    planName: subscription.plan.name,
    maxMessagesPerMonth: subscription.plan.maxMessagesPerMonth,
    messagesUsedThisPeriod: subscription.messagesUsedThisPeriod,
    subscriptionStatus: subscription.status,
  };
}
