"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireSuperAdminSession } from "@/lib/session";
import { requireEffectivePermission } from "@/lib/rbac";
import { superAdminDb } from "@/lib/db";

const CATEGORIES = ["MARKETING", "UTILITY", "AUTHENTICATION"] as const;

export type ActionResult = { ok: true; message: string } | { ok: false; message: string; fields?: Record<string, string> };

async function guard() {
  const session = await requireSuperAdminSession();
  requireEffectivePermission(session.user.permissions, "platform.billing.manage");
  return session;
}

const settingsSchema = z.object({
  markupPercent: z.coerce.number().min(0).max(500),
  minRechargeSar: z.coerce.number().int().min(1).max(100000),
});

export async function saveWalletSettings(_prev: ActionResult | null, formData: FormData): Promise<ActionResult> {
  const session = await guard();
  const parsed = settingsSchema.safeParse({ markupPercent: formData.get("markupPercent"), minRechargeSar: formData.get("minRechargeSar") });
  if (!parsed.success) return { ok: false, message: "قيم غير صالحة: الهامش 0–500%، والحد الأدنى للشحن رقم صحيح موجب" };
  const walletMarkupBps = Math.round(parsed.data.markupPercent * 100);
  await superAdminDb.platformSettings.update({ where: { id: "singleton" }, data: { walletMarkupBps, walletMinRechargeSar: parsed.data.minRechargeSar } });
  await superAdminDb.auditLog.create({
    data: { userId: session.user.id, action: "platform.wallet_settings_update", targetType: "PlatformSettings", targetId: "singleton", metaJson: { walletMarkupBps, walletMinRechargeSar: parsed.data.minRechargeSar } },
  });
  revalidatePath("/admin/messaging");
  return { ok: true, message: "تم حفظ الهامش والحد الأدنى للشحن" };
}

const rateSchema = z.object({
  country: z.string().trim().toUpperCase().regex(/^(\*|[A-Z]{2})$/, "رمز الدولة حرفان (SA) أو * للافتراضي"),
  category: z.enum(CATEGORIES),
  baseRateSar: z.coerce.number().min(0).max(100),
});

export async function upsertMessageRate(_prev: ActionResult | null, formData: FormData): Promise<ActionResult> {
  const session = await guard();
  const parsed = rateSchema.safeParse({ country: formData.get("country"), category: formData.get("category"), baseRateSar: formData.get("baseRateSar") });
  if (!parsed.success) {
    const fields = { country: String(formData.get("country") ?? ""), category: String(formData.get("category") ?? ""), baseRateSar: String(formData.get("baseRateSar") ?? "") };
    return { ok: false, message: parsed.error.issues[0]?.message ?? "بيانات غير صالحة", fields };
  }
  const { country, category, baseRateSar } = parsed.data;
  await superAdminDb.messageRate.upsert({
    where: { country_category: { country, category } },
    update: { baseRateSar: baseRateSar.toFixed(4) },
    create: { country, category, baseRateSar: baseRateSar.toFixed(4) },
  });
  await superAdminDb.auditLog.create({
    data: { userId: session.user.id, action: "platform.message_rate_upsert", targetType: "MessageRate", targetId: `${country}:${category}`, metaJson: { baseRateSar } },
  });
  revalidatePath("/admin/messaging");
  return { ok: true, message: `تم حفظ سعر ${category} لـ ${country}` };
}

export async function deleteMessageRate(id: string) {
  const session = await guard();
  const rate = await superAdminDb.messageRate.delete({ where: { id } });
  await superAdminDb.auditLog.create({
    data: { userId: session.user.id, action: "platform.message_rate_delete", targetType: "MessageRate", targetId: `${rate.country}:${rate.category}` },
  });
  revalidatePath("/admin/messaging");
}
