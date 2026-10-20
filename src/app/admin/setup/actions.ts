"use server";

import { requireSuperAdminSession } from "@/lib/session";
import { requireEffectivePermission } from "@/lib/rbac";
import { superAdminDb } from "@/lib/db";
import { redisConnection } from "@/lib/queue/connection";
import { isD360Configured, pingD360Partner } from "@/lib/integrations/d360/client";
import { isMoyasarConfigured, pingMoyasar } from "@/lib/billing/moyasar";
import bcrypt from "bcryptjs";
import { revalidatePath } from "next/cache";
import { checkTenantRateLimit } from "@/lib/rateLimit";
import { diagnoseEmail } from "@/lib/email/send";
import { savePlatformSecrets, type SecretField } from "@/lib/platformSecrets";

export type TestResult = { ok: boolean; detail: string };

/** اختبار اتصال فعلي بحساب خارجي من صفحة جاهزية الربط — بلا كشف أي مفتاح، وبلا إنشاء أي شيء. */
export async function testSetupConnection(kind: "core" | "d360" | "moyasar" | "email"): Promise<TestResult> {
  const session = await requireSuperAdminSession();
  requireEffectivePermission(session.user.permissions, "platform.settings.manage");
  try {
    if (kind === "core") {
      await superAdminDb.$queryRaw`SELECT 1`;
      const pong = await Promise.race([
        redisConnection.ping(),
        new Promise<string>((_, reject) => setTimeout(() => reject(new Error("مهلة Redis انتهت")), 5000)),
      ]);
      return { ok: pong === "PONG", detail: `قاعدة البيانات ✓ · Redis ${pong === "PONG" ? "✓" : pong}` };
    }
    if (kind === "d360") {
      if (!(await isD360Configured())) return { ok: false, detail: "أضف D360_PARTNER_ID وD360_API_KEY أولاً" };
      const { channels } = await pingD360Partner();
      return { ok: true, detail: `حساب الشريك يعمل ✓${channels !== null ? ` · ${channels} قناة` : ""}` };
    }
    if (kind === "email") {
      const me = await superAdminDb.user.findUnique({ where: { id: session.user.id }, select: { email: true } });
      if (!me?.email) return { ok: false, detail: "لا بريد لحسابك" };
      return diagnoseEmail(me.email);
    }
    if (kind === "moyasar") {
      if (!(await isMoyasarConfigured())) return { ok: false, detail: "أضف MOYASAR_SECRET_KEY أولاً" };
      const { mode } = await pingMoyasar();
      return { ok: true, detail: `المفتاح صحيح ✓ · ${mode === "live" ? "وضع حقيقي" : mode === "test" ? "وضع اختبار" : "وضع غير معروف"}` };
    }
    return { ok: false, detail: "نوع غير معروف" };
  } catch (err) {
    return { ok: false, detail: err instanceof Error ? err.message : "فشل الاختبار" };
  }
}

export type SaveAccountsResult = { ok: boolean; message: string } | null;
export type AccountSection = "d360" | "moyasar" | "email";

const SECTION_FIELDS: Record<AccountSection, { text: SecretField[]; secret: SecretField[] }> = {
  d360: { text: ["D360_PARTNER_ID"], secret: ["D360_API_KEY", "D360_WEBHOOK_SECRET"] },
  moyasar: { text: [], secret: ["MOYASAR_SECRET_KEY", "MOYASAR_WEBHOOK_SECRET"] },
  email: { text: ["EMAIL_PROVIDER", "SMTP_HOST", "SMTP_PORT", "SMTP_USER", "EMAIL_FROM"], secret: ["SMTP_PASS"] },
};

function validate(field: SecretField, value: string): string | null {
  switch (field) {
    case "D360_PARTNER_ID":
      return /^[A-Za-z0-9_-]{2,64}$/.test(value) ? null : "Partner ID غير صالح";
    case "MOYASAR_SECRET_KEY":
      return /^sk_(test|live)_[A-Za-z0-9]+$/.test(value) ? null : "المفتاح السري لـ Moyasar يبدأ بـ sk_test_ أو sk_live_";
    case "EMAIL_PROVIDER":
      return value === "smtp" || value === "console" ? null : "مزوّد بريد غير معروف";
    case "SMTP_HOST":
      return /^[A-Za-z0-9.-]{3,253}$/.test(value) ? null : "خادم SMTP غير صالح";
    case "SMTP_PORT":
      return /^\d{2,5}$/.test(value) && Number(value) <= 65535 ? null : "منفذ SMTP غير صالح";
    case "SMTP_USER":
      return value.length <= 254 ? null : "اسم المستخدم طويل جداً";
    case "EMAIL_FROM":
      return /@/.test(value) && value.length <= 254 ? null : "عنوان المُرسِل يجب أن يحتوي بريداً";
    default:
      return value.length >= 6 && value.length <= 500 ? null : "قيمة سرية غير صالحة";
  }
}

/**
 * ربط حساب خارجي من لوحة الأدمن. حماية: صلاحية إعدادات المنصة + **إعادة إدخال كلمة مرور الأدمن** (جلسة
 * مسروقة وحدها لا تكفي لتغيير مفاتيح الدفع/الرسائل) + حد محاولات. الأسرار تُشفَّر ولا تُعاد للمتصفح أبداً؛
 * حقل سرّي فارغ = إبقاء القيمة، و"مسح" = حذفها. سجل التدقيق يحفظ أسماء الحقول المتغيّرة فقط.
 */
export async function saveAccountSecrets(_prev: SaveAccountsResult, formData: FormData): Promise<SaveAccountsResult> {
  const session = await requireSuperAdminSession();
  requireEffectivePermission(session.user.permissions, "platform.settings.manage");
  const section = String(formData.get("section") ?? "") as AccountSection;
  const spec = SECTION_FIELDS[section];
  if (!spec) return { ok: false, message: "قسم غير معروف" };

  if (!(await checkTenantRateLimit(session.user.id, "save-account-secrets", 10, 3600)).allowed) {
    return { ok: false, message: "محاولات كثيرة — حاول بعد ساعة" };
  }
  const password = String(formData.get("confirmPassword") ?? "");
  const me = await superAdminDb.user.findUnique({ where: { id: session.user.id }, select: { passwordHash: true } });
  if (!password || !me || !(await bcrypt.compare(password, me.passwordHash))) {
    return { ok: false, message: "كلمة المرور غير صحيحة — مطلوبة لتأكيد تغيير مفاتيح الحسابات" };
  }

  const patch: Partial<Record<SecretField, string | null>> = {};
  for (const field of spec.text) {
    const value = String(formData.get(field) ?? "").trim();
    if (!value) {
      patch[field] = null;
      continue;
    }
    const err = validate(field, value);
    if (err) return { ok: false, message: err };
    patch[field] = value;
  }
  for (const field of spec.secret) {
    if (formData.get(`${field}__clear`) === "on") {
      patch[field] = null;
      continue;
    }
    const value = String(formData.get(field) ?? "").trim();
    if (!value) continue; // فارغ = إبقاء القيمة الحالية
    const err = validate(field, value);
    if (err) return { ok: false, message: err };
    patch[field] = value;
  }

  const changed = await savePlatformSecrets(patch);
  await superAdminDb.auditLog.create({
    data: { userId: session.user.id, action: "platform.account_secrets_update", targetType: "PlatformSettings", targetId: section, metaJson: { changed } },
  });
  revalidatePath("/admin/setup");
  return { ok: true, message: changed.length ? `تم الحفظ (${changed.length} حقل) — يسري فوراً بلا إعادة نشر` : "لا تغييرات" };
}
