import { AuthShell } from "@/components/auth/AuthShell";
import { LogoFull } from "@/components/Logo";
import { ForgotPasswordForm } from "./ForgotPasswordForm";

export const metadata = { title: "نسيت كلمة المرور — DMS Tech" };

export default function ForgotPasswordPage() {
  return (
    <AuthShell>
      <div className="mx-auto w-full max-w-md">
        <div className="mb-8 text-center">
          <div className="mb-4 flex justify-center lg:hidden">
            <LogoFull size="md" light />
          </div>
          <h1 className="text-2xl font-bold text-white">نسيت كلمة المرور؟</h1>
          <p className="mt-1 text-sm text-slate-400">أدخل بريدك وسنرسل لك رابطاً لتعيين كلمة مرور جديدة</p>
        </div>
        <ForgotPasswordForm />
      </div>
    </AuthShell>
  );
}
