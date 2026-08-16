"use server";

import bcrypt from "bcryptjs";
import { redirect } from "next/navigation";
import { superAdminDb } from "@/lib/db";
import { checkLoginRateLimit, resetLoginRateLimit } from "@/lib/rateLimit";
import { isPlatformRole } from "@/lib/rbac";
import { setPlatformSession, clearPlatformSession } from "@/lib/platformAuth";

// تجزئة وهمية ثابتة لتقريب زمن الاستجابة بين "بريد غير موجود" و"كلمة مرور خاطئة" — نفس أسلوب
// src/lib/auth.ts (authorize) لمنع استكشاف البريد المسجَّل عبر فروق التوقيت.
const DUMMY_HASH = "$2a$10$CwTycUXWue0Thq9StjUM0uJ8kQwtG0h/0zXA8k4qKm0mCqQjWtqXO";

export async function platformLogin(
  _prevState: { error: string | null },
  formData: FormData
): Promise<{ error: string | null }> {
  const email = String(formData.get("email") ?? "").toLowerCase().trim();
  const password = String(formData.get("password") ?? "");
  if (!email || !password) return { error: "أدخل البريد الإلكتروني وكلمة المرور" };

  // مفتاح حد معدَّل مسبقاً بادئة "platform:" بحيث لا يتشارك عدّاد المحاولات مع نموذج /login العادي
  // لنفس البريد (حسابان مختلفان منطقياً من حيث سطح الهجوم رغم كونهما نفس صف المستخدم).
  const rateLimit = await checkLoginRateLimit(`platform:${email}`);
  if (!rateLimit.allowed) {
    return { error: "محاولات دخول كثيرة جداً. حاول مرة أخرى بعد بضع دقائق." };
  }

  const user = await superAdminDb.user.findUnique({ where: { email } });
  const valid = await bcrypt.compare(password, user?.passwordHash ?? DUMMY_HASH);

  if (!user || !valid) return { error: "البريد الإلكتروني أو كلمة المرور غير صحيحة" };
  if (!user.isActive) return { error: "هذا الحساب معطَّل. تواصل مع مالك المنصة." };
  if (!isPlatformRole(user.role)) {
    return { error: "هذا حساب تاجر عادي — استخدم صفحة تسجيل الدخول الرئيسية بدلاً من هذه الصفحة." };
  }

  await resetLoginRateLimit(`platform:${email}`);
  await superAdminDb.user.update({ where: { id: user.id }, data: { lastLoginAt: new Date() } });
  await setPlatformSession({
    id: user.id,
    role: user.role as "SUPER_ADMIN" | "PLATFORM_SUPPORT" | "PLATFORM_BILLING",
    name: user.name,
    email: user.email,
  });
  redirect("/admin");
}

export async function platformLogout() {
  await clearPlatformSession();
  redirect("/admin-login");
}
