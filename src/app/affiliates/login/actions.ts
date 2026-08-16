"use server";

import bcrypt from "bcryptjs";
import { redirect } from "next/navigation";
import { rawDb } from "@/lib/db";
import { checkLoginRateLimit, resetLoginRateLimit } from "@/lib/rateLimit";
import { setAffiliateSession, clearAffiliateSession } from "@/lib/affiliates/session";

const DUMMY_HASH = "$2a$10$CwTycUXWue0Thq9StjUM0uJ8kQwtG0h/0zXA8k4qKm0mCqQjWtqXO";

export async function affiliateLogin(
  _prevState: { error: string | null },
  formData: FormData
): Promise<{ error: string | null }> {
  const email = String(formData.get("email") ?? "").toLowerCase().trim();
  const password = String(formData.get("password") ?? "");
  if (!email || !password) return { error: "أدخل البريد الإلكتروني وكلمة المرور" };

  const rateLimit = await checkLoginRateLimit(`affiliate:${email}`);
  if (!rateLimit.allowed) return { error: "محاولات دخول كثيرة جداً. حاول مرة أخرى بعد بضع دقائق." };

  const affiliate = await rawDb.affiliate.findUnique({ where: { email } });
  const valid = await bcrypt.compare(password, affiliate?.passwordHash ?? DUMMY_HASH);

  if (!affiliate || !valid) return { error: "البريد الإلكتروني أو كلمة المرور غير صحيحة" };
  if (affiliate.status === "PENDING") return { error: "طلبك لا يزال قيد المراجعة. سنعلمك بالبريد فور الموافقة." };
  if (affiliate.status === "REJECTED") return { error: "تعذّر قبول طلب انضمامك لبرنامج التسويق بالعمولة." };
  if (affiliate.status === "SUSPENDED") return { error: "تم تعليق حسابك مؤقتاً. تواصل مع فريق المنصة." };

  await resetLoginRateLimit(`affiliate:${email}`);
  await setAffiliateSession(affiliate.id);
  redirect("/affiliates/dashboard");
}

export async function affiliateLogout() {
  await clearAffiliateSession();
  redirect("/affiliates/login");
}
