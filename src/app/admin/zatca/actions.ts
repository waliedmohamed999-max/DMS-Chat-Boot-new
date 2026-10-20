"use server";

import bcrypt from "bcryptjs";
import { revalidatePath } from "next/cache";
import { requireSuperAdminSession } from "@/lib/session";
import { requireEffectivePermission } from "@/lib/rbac";
import { rawDb, superAdminDb } from "@/lib/db";
import { checkTenantRateLimit } from "@/lib/rateLimit";
import { onboardEgs, processZatcaQueue, retryZatcaDocument } from "@/lib/zatca/service";
import type { ZatcaEnvironment } from "@/lib/zatca/csr";

export type ActionResult = { ok: boolean; message: string } | null;

async function guard() {
  const session = await requireSuperAdminSession();
  requireEffectivePermission(session.user.permissions, "platform.settings.manage");
  return session;
}

const FIELDS = {
  sellerLegalName: { re: /^.{2,200}$/, label: "الاسم القانوني" },
  sellerVatNumber: { re: /^3\d{13}3$/, label: "الرقم الضريبي (15 رقماً يبدأ وينتهي بـ3)" },
  sellerCrn: { re: /^\d{10}$/, label: "السجل التجاري (10 أرقام)" },
  sellerStreet: { re: /^.{2,120}$/, label: "الشارع" },
  sellerBuildingNumber: { re: /^\d{4}$/, label: "رقم المبنى (4 أرقام)" },
  sellerDistrict: { re: /^.{2,120}$/, label: "الحي" },
  sellerCity: { re: /^.{2,80}$/, label: "المدينة" },
  sellerPostalCode: { re: /^\d{5}$/, label: "الرمز البريدي (5 أرقام)" },
} as const;

/** بيانات البائع (المنصة) المطلوبة في كل فاتورة إلكترونية. */
export async function saveSellerProfile(_prev: ActionResult, formData: FormData): Promise<ActionResult> {
  const session = await guard();
  const data: Record<string, string> = {};
  for (const [key, spec] of Object.entries(FIELDS)) {
    const value = String(formData.get(key) ?? "").trim();
    if (!spec.re.test(value)) return { ok: false, message: `${spec.label} غير صالح` };
    data[key] = value;
  }
  await rawDb.platformSettings.upsert({ where: { id: "singleton" }, update: data, create: { id: "singleton", ...data } });
  await superAdminDb.auditLog.create({ data: { userId: session.user.id, action: "platform.zatca_seller_update", targetType: "PlatformSettings", targetId: "singleton" } });
  revalidatePath("/admin/zatca");
  return { ok: true, message: "تم حفظ بيانات البائع" };
}

/**
 * تسجيل وحدة الإصدار لدى ZATCA (يستغرق ثوانٍ: شهادة امتثال + 6 فحوص + شهادة إنتاج). يتطلب كلمة مرور الأدمن —
 * المفتاح الخاص الناتج يوقّع كل فواتير المنصة.
 */
export async function onboardZatca(_prev: ActionResult, formData: FormData): Promise<ActionResult> {
  const session = await guard();
  if (!(await checkTenantRateLimit(session.user.id, "zatca-onboard", 10, 3600)).allowed) return { ok: false, message: "محاولات كثيرة — حاول بعد ساعة" };
  const me = await superAdminDb.user.findUnique({ where: { id: session.user.id }, select: { passwordHash: true } });
  if (!me || !(await bcrypt.compare(String(formData.get("confirmPassword") ?? ""), me.passwordHash))) {
    return { ok: false, message: "كلمة المرور غير صحيحة" };
  }
  const environment = String(formData.get("environment") ?? "") as ZatcaEnvironment;
  if (!["sandbox", "simulation", "production"].includes(environment)) return { ok: false, message: "بيئة غير معروفة" };
  const commonName = String(formData.get("commonName") ?? "").trim();
  const organizationUnit = String(formData.get("organizationUnit") ?? "").trim();
  const businessCategory = String(formData.get("businessCategory") ?? "").trim();
  if (!/^[A-Za-z0-9 _-]{2,60}$/.test(commonName)) return { ok: false, message: "اسم وحدة الإصدار بالإنجليزية (حروف وأرقام)" };
  if (organizationUnit.length < 2 || businessCategory.length < 2) return { ok: false, message: "الفرع والنشاط مطلوبان" };

  try {
    const { checks } = await onboardEgs({ environment, otp: String(formData.get("otp") ?? "").trim(), commonName, organizationUnit, businessCategory });
    await superAdminDb.auditLog.create({ data: { userId: session.user.id, action: "platform.zatca_onboard", targetType: "ZatcaEgs", targetId: environment, metaJson: { checks } } });
    revalidatePath("/admin/zatca");
    return { ok: true, message: `تم التسجيل والتفعيل — اجتاز ${checks.length} فحوص امتثال` };
  } catch (err) {
    await rawDb.zatcaEgs.upsert({
      where: { id: "singleton" },
      update: { lastError: err instanceof Error ? err.message.slice(0, 500) : "فشل" },
      create: { id: "singleton", lastError: err instanceof Error ? err.message.slice(0, 500) : "فشل" },
    });
    revalidatePath("/admin/zatca");
    return { ok: false, message: err instanceof Error ? err.message : "فشل التسجيل" };
  }
}

export async function processZatcaNow(): Promise<ActionResult> {
  await guard();
  const r = await processZatcaQueue();
  revalidatePath("/admin/zatca");
  return { ok: !r.skipped, message: r.skipped ?? `عولج ${r.processed} مستند — قُبل ${r.accepted}` };
}

export async function retryZatcaDoc(documentId: string) {
  const session = await guard();
  await retryZatcaDocument(documentId);
  await superAdminDb.auditLog.create({ data: { userId: session.user.id, action: "platform.zatca_retry", targetType: "ZatcaDocument", targetId: documentId } });
  revalidatePath("/admin/zatca");
}
