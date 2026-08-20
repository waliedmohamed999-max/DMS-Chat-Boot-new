"use server";

import { revalidatePath } from "next/cache";
import { requireSuperAdminSession } from "@/lib/session";
import { requireEffectivePermission } from "@/lib/rbac";
import { superAdminDb } from "@/lib/db";
import type { Country } from "@prisma/client";

/** تحديث نسبة الضريبة/التفعيل/سعر الصرف لدولة واحدة — العملة ورمزها ثابتان (SA=SAR/AE=AED/EG=EGP)، غير
 * قابلين للتعديل من هذه الصفحة (ربط عملة بدولة قرار بنيوي وليس إعداداً تشغيلياً). السعودية isDefault
 * ثابتة ولا يمكن تعطيلها (isActive)، وسعر صرفها ثابت دائماً على 1 (هي العملة الأساسية التي تُسعَّر بها
 * كل الباقات في lib/planPricing.ts). */
export async function updateCountryConfig(country: Country, formData: FormData) {
  const session = await requireSuperAdminSession();
  requireEffectivePermission(session.user.permissions, "platform.settings.manage");

  const vatRatePercent = Number(formData.get("vatRatePercent") ?? "0");
  const vatRateBps = Math.round(Math.max(0, Math.min(100, vatRatePercent)) * 100);
  const isActive = country === "SA" ? true : formData.get("isActive") === "on";
  const exchangeRateFromSar = country === "SA" ? 1 : Math.max(0, Number(formData.get("exchangeRateFromSar") ?? "1"));

  await superAdminDb.countryConfig.update({
    where: { country },
    data: { vatRateBps, isActive, exchangeRateFromSar },
  });

  await superAdminDb.auditLog.create({
    data: { userId: session.user.id, action: "platform.country_config_update", targetType: "CountryConfig", targetId: country, metaJson: { vatRateBps, isActive, exchangeRateFromSar } },
  });

  revalidatePath("/admin/countries");
  revalidatePath("/pricing");
  revalidatePath("/register");
  revalidatePath("/partners/apply");
}
