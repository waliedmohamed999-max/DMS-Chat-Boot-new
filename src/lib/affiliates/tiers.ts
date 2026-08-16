import type { AffiliateTier } from "@prisma/client";

/** مصدر واحد لكل نِسَب ومستويات برنامج العمولة — لا تُكرَّر هذه الأرقام في أي ملف آخر. */
export const TIER_RATE_PERCENT: Record<AffiliateTier, number> = {
  STARTER: 20,
  GROWTH: 25,
  ELITE: 30,
};

export const TIER_LABELS_AR: Record<AffiliateTier, string> = {
  STARTER: "شريك",
  GROWTH: "شريك نمو",
  ELITE: "شريك نخبة",
};

/** حد أدنى/أقصى (شامل) لعدد التجّار المُحالين الفعليين (لديهم فاتورة مدفوعة واحدة على الأقل)
 * المطلوب للوصول لكل مستوى. `max: null` = بلا حد أعلى. */
export const TIER_THRESHOLDS: Record<AffiliateTier, { min: number; max: number | null }> = {
  STARTER: { min: 0, max: 9 },
  GROWTH: { min: 10, max: 24 },
  ELITE: { min: 25, max: null },
};

/** يحدد المستوى المستحق فعلياً بناءً على عدد التجّار المُحالين المدفوعين — تُستخدَم دورياً
 * (commissionSync.ts) لترقية المسوّق تلقائياً، أبداً للتخفيض التلقائي (راجع DECISIONS.md). */
export function tierForReferredCount(paidReferredCount: number): AffiliateTier {
  if (paidReferredCount >= TIER_THRESHOLDS.ELITE.min) return "ELITE";
  if (paidReferredCount >= TIER_THRESHOLDS.GROWTH.min) return "GROWTH";
  return "STARTER";
}

export function nextTierInfo(tier: AffiliateTier): { tier: AffiliateTier; neededCount: number } | null {
  if (tier === "STARTER") return { tier: "GROWTH", neededCount: TIER_THRESHOLDS.GROWTH.min };
  if (tier === "GROWTH") return { tier: "ELITE", neededCount: TIER_THRESHOLDS.ELITE.min };
  return null;
}
