import { getSetupTokenInfo } from "./actions";
import { SetupForm } from "./SetupForm";
import { AuthShell } from "@/components/auth/AuthShell";
import { LogoFull } from "@/components/Logo";

export default async function PartnerSetupPage({ params }: { params: { token: string } }) {
  const info = await getSetupTokenInfo(params.token);

  if (!info.valid) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-navy-900 px-4">
        <div className="card max-w-md p-8 text-center">
          <div className="mb-3 text-4xl">⚠️</div>
          <h1 className="mb-2 text-lg font-bold text-white">رابط غير صالح أو منتهي الصلاحية</h1>
          <p className="text-sm text-slate-400">
            رابط إعداد الحساب هذا لم يعد صالحاً. تواصل مع فريق الدعم للحصول على رابط جديد.
          </p>
        </div>
      </div>
    );
  }

  return (
    <AuthShell
      tagline="أهلاً بك في عائلة DMS"
      bullets={[
        { icon: "🎉", text: "تم قبول طلب انضمامك بنجاح" },
        { icon: "🔑", text: "خطوة أخيرة: حدّد كلمة مرور حسابك" },
        { icon: "🚀", text: "بعدها يمكنك الدخول مباشرة للوحة تحكمك" },
      ]}
    >
      <div className="mx-auto w-full max-w-md">
        <div className="mb-8 text-center">
          <div className="mb-4 flex justify-center lg:hidden">
            <LogoFull size="md" light />
          </div>
          <h1 className="text-2xl font-bold text-white">أهلاً {info.ownerName} 👋</h1>
          <p className="mt-1 text-sm text-slate-400">
            {info.tenantName ? `حساب ${info.tenantName} جاهز` : "حسابك جاهز"} — أكمل الإعداد بتحديد كلمة مرور
          </p>
        </div>
        <SetupForm token={params.token} />
      </div>
    </AuthShell>
  );
}
