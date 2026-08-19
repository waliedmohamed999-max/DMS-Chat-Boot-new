"use server";

import { revalidatePath } from "next/cache";
import { requireSuperAdminSession } from "@/lib/session";
import { requirePermission } from "@/lib/rbac";
import { superAdminDb } from "@/lib/db";
import type { Country } from "@prisma/client";

/** تحديث نسبة الضريبة/التفعيل لدولة واحدة — العملة ورمزها ثابتان (SA=SAR/AE=AED/EG=EGP)، غير
 * قابلين للتعديل من هذه الصفحة (ربط عملة بدولة قرار بنيوي وليس إعداداً تشغيلياً). السعودية isDefault
 * ثابتة ولا يمكن تعطيلها (isActive) — الدولة الأساسية يجب أن تبقى متاحة دائماً في نماذج التسجيل. */
export async function updateCountryConfig(country: Country, formData: FormData) {
  const session = await requireSuperAdminSession();
  requirePermission(session.user.role, "platform.settings.manage");

  const vatRatePercent = Number(formData.get("vatRatePercent") ?? "0");
  const vatRateBps = Math.round(Math.max(0, Math.min(100, vatRatePercent)) * 100);
  const isActive = country === "SA" ? true : formData.get("isActive") === "on";

  await superAdminDb.countryConfig.update({
    where: { country },
    data: { vatRateBps, isActive },
  });

  await superAdminDb.auditLog.create({
    data: { userId: session.user.id, action: "platform.country_config_update", targetType: "CountryConfig", targetId: country, metaJson: { vatRateBps, isActive } },
  });

  revalidatePath("/admin/countries");
  revalidatePath("/pricing");
  revalidatePath("/register");
  revalidatePath("/partners/apply");
}
