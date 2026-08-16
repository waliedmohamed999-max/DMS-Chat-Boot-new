"use server";

import { revalidatePath } from "next/cache";
import { requireSuperAdminSession } from "@/lib/session";
import { requirePermission } from "@/lib/rbac";
import { superAdminDb } from "@/lib/db";
import type { ChatbotNodeTypeKey } from "@/lib/planLimits";
import { ensureChartOfAccounts } from "@/lib/accounting/chartOfAccounts";
import { z } from "zod";

const ALL_NODE_TYPES: ChatbotNodeTypeKey[] = ["start", "message", "question", "condition", "ai_reply", "api_call", "handoff", "end"];

const planCoreSchema = z.object({
  name: z.string().min(2, "اسم الباقة قصير جداً"),
  priceMonthlySar: z.coerce.number().int().min(0),
  maxUsers: z.coerce.number().int().min(1),
  maxWhatsappNumbers: z.coerce.number().int().min(1),
  maxMessagesPerMonth: z.coerce.number().int().min(1),
  features: z.string().min(2),
  // النموذج يعرض/يُدخِل نسبة مئوية (0-100) للوضوح — تُحوَّل لنقاط أساس (×100) عند الكتابة على القاعدة.
  annualDiscountPercent: z.coerce.number().int().min(0).max(100),
  supportTier: z.enum(["email", "priority", "dedicated"]),
});

function slugifyPlanKey(name: string): string {
  return (
    name
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9\s-]/g, "")
      .replace(/\s+/g, "-")
      .slice(0, 30) || `plan-${Date.now()}`
  );
}

export async function createPlan(formData: FormData) {
  const session = await requireSuperAdminSession();
  requirePermission(session.user.role, "platform.plans.manage");

  const parsed = planCoreSchema.safeParse({
    name: formData.get("name"),
    priceMonthlySar: formData.get("priceMonthlySar"),
    maxUsers: formData.get("maxUsers"),
    maxWhatsappNumbers: formData.get("maxWhatsappNumbers"),
    maxMessagesPerMonth: formData.get("maxMessagesPerMonth"),
    features: formData.get("features"),
    annualDiscountPercent: formData.get("annualDiscountBps") || "20",
    supportTier: formData.get("supportTier") || "email",
  });
  if (!parsed.success) throw new Error(parsed.error.issues[0]?.message ?? "بيانات غير صالحة");

  let key = slugifyPlanKey(parsed.data.name);
  const existing = await superAdminDb.plan.findUnique({ where: { key } });
  if (existing) key = `${key}-${Math.random().toString(36).slice(2, 6)}`;

  const features = parsed.data.features.split("\n").map((f) => f.trim()).filter(Boolean);

  const plan = await superAdminDb.plan.create({
    data: {
      key, name: parsed.data.name, priceMonthlySar: parsed.data.priceMonthlySar,
      maxUsers: parsed.data.maxUsers, maxWhatsappNumbers: parsed.data.maxWhatsappNumbers,
      maxMessagesPerMonth: parsed.data.maxMessagesPerMonth, features, isActive: true,
      annualDiscountBps: parsed.data.annualDiscountPercent * 100, supportTier: parsed.data.supportTier,
    },
  });

  await superAdminDb.auditLog.create({
    data: { userId: session.user.id, action: "platform.plan_create", targetType: "Plan", targetId: plan.id, metaJson: { name: plan.name } },
  });

  await ensureChartOfAccounts();

  revalidatePath("/admin/plans");
}

export async function updatePlanCoreFields(planId: string, formData: FormData) {
  const session = await requireSuperAdminSession();
  requirePermission(session.user.role, "platform.plans.manage");

  const parsed = planCoreSchema.safeParse({
    name: formData.get("name"),
    priceMonthlySar: formData.get("priceMonthlySar"),
    maxUsers: formData.get("maxUsers"),
    maxWhatsappNumbers: formData.get("maxWhatsappNumbers"),
    maxMessagesPerMonth: formData.get("maxMessagesPerMonth"),
    features: formData.get("features"),
    annualDiscountPercent: formData.get("annualDiscountBps") || "20",
    supportTier: formData.get("supportTier") || "email",
  });
  if (!parsed.success) throw new Error(parsed.error.issues[0]?.message ?? "بيانات غير صالحة");

  const features = parsed.data.features.split("\n").map((f) => f.trim()).filter(Boolean);

  await superAdminDb.plan.update({
    where: { id: planId },
    data: {
      name: parsed.data.name, priceMonthlySar: parsed.data.priceMonthlySar,
      maxUsers: parsed.data.maxUsers, maxWhatsappNumbers: parsed.data.maxWhatsappNumbers,
      maxMessagesPerMonth: parsed.data.maxMessagesPerMonth, features,
      annualDiscountBps: parsed.data.annualDiscountPercent * 100, supportTier: parsed.data.supportTier,
    },
  });

  await superAdminDb.auditLog.create({
    data: { userId: session.user.id, action: "platform.plan_update", targetType: "Plan", targetId: planId },
  });

  await ensureChartOfAccounts();

  revalidatePath("/admin/plans");
  revalidatePath("/dashboard/billing");
}

export async function togglePlanActive(planId: string, isActive: boolean) {
  const session = await requireSuperAdminSession();
  requirePermission(session.user.role, "platform.plans.manage");

  await superAdminDb.plan.update({ where: { id: planId }, data: { isActive } });

  await superAdminDb.auditLog.create({
    data: { userId: session.user.id, action: "platform.plan_toggle_active", targetType: "Plan", targetId: planId, metaJson: { isActive } },
  });

  revalidatePath("/admin/plans");
}

/** "الأكثر طلباً" علم حصري — باقة واحدة فقط تحمله في نفس الوقت (شارة مفردة على صفحة الفوترة/الأسعار). */
export async function setPlanAsPopular(planId: string) {
  const session = await requireSuperAdminSession();
  requirePermission(session.user.role, "platform.plans.manage");

  await superAdminDb.$transaction([
    superAdminDb.plan.updateMany({ where: { isPopular: true }, data: { isPopular: false } }),
    superAdminDb.plan.update({ where: { id: planId }, data: { isPopular: true } }),
  ]);

  await superAdminDb.auditLog.create({
    data: { userId: session.user.id, action: "platform.plan_set_popular", targetType: "Plan", targetId: planId },
  });

  revalidatePath("/admin/plans");
  revalidatePath("/dashboard/billing");
  revalidatePath("/pricing");
}

export async function unsetPlanPopular(planId: string) {
  const session = await requireSuperAdminSession();
  requirePermission(session.user.role, "platform.plans.manage");

  await superAdminDb.plan.update({ where: { id: planId }, data: { isPopular: false } });

  await superAdminDb.auditLog.create({
    data: { userId: session.user.id, action: "platform.plan_unset_popular", targetType: "Plan", targetId: planId },
  });

  revalidatePath("/admin/plans");
  revalidatePath("/dashboard/billing");
  revalidatePath("/pricing");
}

export async function updatePlanCampaignLimits(planId: string, formData: FormData) {
  const session = await requireSuperAdminSession();
  requirePermission(session.user.role, "platform.plans.manage");

  const campaignsUnlimited = formData.get("campaignsUnlimited") === "on";
  const maxCampaignsPerMonth = campaignsUnlimited ? -1 : Math.max(0, parseInt(String(formData.get("maxCampaignsPerMonth") ?? "4"), 10) || 0);

  const audienceUnlimited = formData.get("audienceUnlimited") === "on";
  const maxAudiencePerCampaign = audienceUnlimited ? -1 : Math.max(0, parseInt(String(formData.get("maxAudiencePerCampaign") ?? "200"), 10) || 0);

  const abTestingEnabled = formData.get("abTestingEnabled") === "on";

  await superAdminDb.plan.update({
    where: { id: planId },
    data: { campaignLimitsJson: { maxCampaignsPerMonth, maxAudiencePerCampaign, abTestingEnabled } },
  });

  await superAdminDb.auditLog.create({
    data: { userId: session.user.id, action: "platform.plan_campaign_limits_update", targetType: "Plan", targetId: planId },
  });

  revalidatePath("/admin/plans");
  revalidatePath("/dashboard/campaigns");
}

export async function updatePlanChatbotLimits(planId: string, formData: FormData) {
  const session = await requireSuperAdminSession();
  requirePermission(session.user.role, "platform.plans.manage");

  const maxActiveFlowsRaw = String(formData.get("maxActiveFlows") ?? "2");
  const unlimited = formData.get("unlimited") === "on";
  const maxActiveFlows = unlimited ? -1 : Math.max(0, parseInt(maxActiveFlowsRaw, 10) || 0);

  const allowedNodeTypes = ALL_NODE_TYPES.filter((t) => t === "start" || t === "end" || formData.get(`node_${t}`) === "on");

  const templatesTier = formData.get("templatesTier") === "full" ? "full" : "basic";
  const analyticsTier = ["basic", "advanced", "export"].includes(String(formData.get("analyticsTier")))
    ? (formData.get("analyticsTier") as string)
    : "basic";
  const multiLanguage = formData.get("multiLanguage") === "on";

  const aiTokensUnlimited = formData.get("aiTokensUnlimited") === "on";
  const maxAiTokensPerMonth = aiTokensUnlimited ? -1 : Math.max(0, parseInt(String(formData.get("maxAiTokensPerMonth") ?? "0"), 10) || 0);

  await superAdminDb.plan.update({
    where: { id: planId },
    data: {
      chatbotLimitsJson: { maxActiveFlows, allowedNodeTypes, templatesTier, analyticsTier, multiLanguage, maxAiTokensPerMonth },
    },
  });

  await superAdminDb.auditLog.create({
    data: { userId: session.user.id, action: "platform.plan_chatbot_limits_update", targetType: "Plan", targetId: planId },
  });

  revalidatePath("/admin/plans");
}
