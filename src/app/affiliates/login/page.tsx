"use client";

import { useFormState, useFormStatus } from "react-dom";
import Link from "next/link";
import { AuthShell } from "@/components/auth/AuthShell";
import { LogoFull } from "@/components/Logo";
import { affiliateLogin } from "./actions";

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className="w-full rounded-lg bg-wa-500 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-wa-600 disabled:opacity-50"
    >
      {pending ? "جاري الدخول..." : "تسجيل الدخول"}
    </button>
  );
}

export default function AffiliateLoginPage() {
  const [state, formAction] = useFormState(affiliateLogin, { error: null });

  return (
    <AuthShell tagline="لوحة تحكم المسوّق بالعمولة">
      <div className="mx-auto w-full max-w-md">
        <div className="mb-8 text-center">
          <div className="mb-4 flex justify-center lg:hidden">
            <LogoFull size="md" light />
          </div>
          <h1 className="text-2xl font-bold text-white">دخول المسوّقين</h1>
          <p className="mt-1 text-sm text-slate-400">تابع إحالاتك وعمولاتك ومدفوعاتك من هنا</p>
        </div>

        <form action={formAction} className="card space-y-4 p-6">
          {state.error && (
            <div className="rounded-lg border border-danger-500/30 bg-danger-500/10 px-3 py-2 text-sm text-danger-500">{state.error}</div>
          )}
          <div>
            <label className="label-field">البريد الإلكتروني</label>
            <input name="email" type="email" required className="input-field" dir="ltr" />
          </div>
          <div>
            <label className="label-field">كلمة المرور</label>
            <input name="password" type="password" required className="input-field" dir="ltr" />
          </div>
          <SubmitButton />
          <p className="text-center text-xs text-slate-500">
            جديد على البرنامج؟{" "}
            <Link href="/affiliates/apply" className="text-wa-400 hover:underline">
              قدّم كمسوّق الآن
            </Link>
          </p>
        </form>
      </div>
    </AuthShell>
  );
}
