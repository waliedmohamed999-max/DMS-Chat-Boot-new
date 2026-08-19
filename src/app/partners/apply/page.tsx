import Link from "next/link";
import { Suspense } from "react";
import { cookies } from "next/headers";
import { getPublicPlans } from "@/app/partners/apply/actions";
import { getCountryConfigs } from "@/lib/billing/countryConfig";
import { PartnersApplyWizard } from "@/components/partners/PartnersApplyWizard";
import { AuthShell } from "@/components/auth/AuthShell";
import { LogoFull } from "@/components/Logo";

// نفس السبب الموثَّق في partners/join/page.tsx: الباقات حقيقية وقابلة للتعديل من لوحة مالك المنصة.
export const dynamic = "force-dynamic";

export default async function PartnersApplyPage() {
  const [plans, countryConfigs] = await Promise.all([getPublicPlans(), getCountryConfigs()]);
  const countries = countryConfigs
    .filter((c) => c.isActive)
    .map((c) => ({ country: c.country, currency: c.currency, isDefault: c.isDefault }));

  // هذه الصفحة خارج تخطيط (marketing) (بلا Navbar/CountryProvider) — تقرأ نفس كوكي dms_country
  // مباشرة حتى تبقى الدولة المختارة من زر 🌍 في الموقع العام متسقة هنا أيضاً.
  const storedCountry = cookies().get("dms_country")?.value;
  const initialCountry = countries.find((c) => c.country === storedCountry)?.country
    ?? countries.find((c) => c.isDefault)?.country
    ?? "SA";

  return (
    <AuthShell
      tagline="انضم كشريك أعمال على منصة DMS"
      bullets={[
        { icon: "📝", text: "طلب انضمام بسيط بخطوات واضحة" },
        { icon: "⏱️", text: "مراجعة سريعة من فريقنا" },
        { icon: "🧩", text: "باقات حقيقية تناسب حجم نشاطك" },
        { icon: "🔐", text: "حدّد كلمة مرور حسابك مباشرة، وسجّل الدخول فور الموافقة" },
      ]}
    >
      <div className="mx-auto flex w-full max-w-lg flex-col items-center">
        <div className="mb-8 text-center">
          <div className="mb-4 flex justify-center lg:hidden">
            <LogoFull size="md" light />
          </div>
          <h1 className="text-2xl font-bold text-white">طلب انضمام شريك</h1>
          <p className="mt-1 text-sm text-slate-400">أكمل الخطوات التالية، وسيراجع فريقنا طلبك قريباً</p>
        </div>

        {plans.length === 0 ? (
          <div className="card max-w-lg p-8 text-center text-slate-400">
            لا توجد باقات متاحة حالياً للانضمام. يرجى المحاولة لاحقاً أو التواصل مع الدعم.
          </div>
        ) : (
          <Suspense>
            <PartnersApplyWizard plans={plans} countries={countries} initialCountry={initialCountry} />
          </Suspense>
        )}

        <p className="mt-6 text-center text-xs text-slate-500">
          لديك حساب بالفعل؟{" "}
          <Link href="/login" className="text-wa-400 hover:underline">
            تسجيل الدخول
          </Link>
        </p>
      </div>
    </AuthShell>
  );
}
