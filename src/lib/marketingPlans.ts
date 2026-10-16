import type { Prisma } from "@prisma/client";
import { rawDb } from "@/lib/db";
import { COMPANY_WHATSAPP_PLANS } from "@/components/marketing/companyPlans";

export type MarketingPlanData = {
  key: string;
  name: string;
  monthlySar: number;
  annualSar: number;
  popular: boolean;
  startingFrom: boolean;
  summary: string;
  audience: string;
  delivery: string;
  features: string[];
  exclusions: string[];
};

export async function getMarketingPlans(db: Pick<Prisma.TransactionClient, "marketingPlan"> = rawDb): Promise<MarketingPlanData[]> {
  let plans;
  try {
    plans = await db.marketingPlan.findMany({ where: { isActive: true }, orderBy: [{ monthlySar: "asc" }, { key: "asc" }] });
  } catch (err) {
    // الرئيسية وصفحة الأسعار تعتمدان على هذا الجدول — لو لم تُطبَّق migration الخاصة به بعد على بيئة
    // نشر ما (أو تعذّر الاتصال)، تُعرض الباقات المنشورة الثابتة بدل إسقاط الصفحتين بالكامل.
    console.error("getMarketingPlans: falling back to static plans:", err);
    return COMPANY_WHATSAPP_PLANS.map(plan => ({ ...plan, features: [...plan.features], exclusions: [...plan.exclusions] }));
  }
  return plans.map(plan => ({
    key: plan.key, name: plan.name, monthlySar: plan.monthlySar, annualSar: plan.annualSar,
    popular: plan.popular, startingFrom: plan.startingFrom, summary: plan.summary,
    audience: plan.audience, delivery: plan.delivery,
    features: Array.isArray(plan.features) ? plan.features.filter((f): f is string => typeof f === "string") : [],
    exclusions: Array.isArray(plan.exclusions) ? plan.exclusions.filter((f): f is string => typeof f === "string") : [],
  }));
}
