import Link from "next/link";
import { getSetupTokenInfo } from "@/app/partners/setup/[token]/actions";
import { AuthShell } from "@/components/auth/AuthShell";
import { LogoFull } from "@/components/Logo";
import { ResetPasswordForm } from "./ResetPasswordForm";

export const metadata = { title: "تعيين كلمة مرور جديدة — DMS" };

// نفس رموز AccountSetupToken ونفس منطق الإكمال الآمن (مُجزَّأ + صلاحية + استخدام واحد) الخاص بـ
// partners/setup — صفحة منفصلة فقط لأن نصوص "إعداد حساب جديد" لا تناسب سياق استعادة كلمة المرور.
export default async function ResetPasswordPage({ params }: { params: { token: string } }) {
  const info = await getSetupTokenInfo(params.token);

  if (!info.valid) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-navy-900 px-4">
        <div className="card max-w-md p-8 text-center">
          <div className="mb-3 text-4xl">⚠️</div>
          <h1 className="mb-2 text-lg font-bold text-white">رابط غير صالح أو منتهي الصلاحية</h1>
          <p className="mb-4 text-sm text-slate-400">رابط استعادة كلمة المرور صالح لمدة ساعة ولاستخدام واحد فقط.</p>
          <Link href="/forgot-password" className="text-sm text-wa-400 hover:underline">
            اطلب رابطاً جديداً
          </Link>
        </div>
      </div>
    );
  }

  return (
    <AuthShell>
      <div className="mx-auto w-full max-w-md">
        <div className="mb-8 text-center">
          <div className="mb-4 flex justify-center lg:hidden">
            <LogoFull size="md" light />
          </div>
          <h1 className="text-2xl font-bold text-white">تعيين كلمة مرور جديدة</h1>
          <p className="mt-1 text-sm text-slate-400">أهلاً {info.ownerName} — اختر كلمة مرور جديدة لحسابك</p>
        </div>
        <ResetPasswordForm token={params.token} />
      </div>
    </AuthShell>
  );
}
