import Link from "next/link";
import { Suspense } from "react";
import { getPublicPlans } from "@/app/partners/apply/actions";
import { PartnersApplyWizard } from "@/components/partners/PartnersApplyWizard";
import { AuthShell } from "@/components/auth/AuthShell";
import { LogoFull } from "@/components/Logo";

// نفس السبب الموثَّق في partners/join/page.tsx: الباقات حقيقية وقابلة للتعديل من لوحة مالك المنصة.
export const dynamic = "force-dynamic";

export default async function PartnersApplyPage() {
  const plans = await getPublicPlans();

  return (
    <AuthShell
      tagline="انضم كشريك أعمال على منصة DMS"
      bullets={[
        { icon: "📝", text: "طلب انضمام بسيط بخطوات واضحة" },
        { icon: "⏱️", text: "مراجعة سريعة من فريقنا" },
        { icon: "🧩", text: "باقات حقيقية تناسب حجم نشاطك" },
        { icon: "🔐", text: "رابط آمن لإعداد حسابك بعد الموافقة" },
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
            <PartnersApplyWizard plans={plans} />
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
