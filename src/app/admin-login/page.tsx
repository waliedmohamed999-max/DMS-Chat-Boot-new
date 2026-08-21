"use client";

import { useFormState, useFormStatus } from "react-dom";
import { AuthShell } from "@/components/auth/AuthShell";
import { PasswordInput } from "@/components/auth/PasswordInput";
import { LogoFull } from "@/components/Logo";
import { platformLogin } from "./actions";

const BULLETS = [
  { icon: "🔐", text: "جلسة مستقلة تماماً عن حساب أي تاجر" },
  { icon: "🧑‍💼", text: "مخصّصة لفريق المنصة الداخلي فقط" },
  { icon: "🧩", text: "الموافقات، الفوترة، وصحة المنصة في مكان واحد" },
];

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className="w-full rounded-lg bg-accent-500 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-accent-600 disabled:opacity-50"
    >
      {pending ? "جاري الدخول..." : "تسجيل دخول فريق المنصة"}
    </button>
  );
}

export default function PlatformLoginPage() {
  const [state, formAction] = useFormState(platformLogin, { error: null });

  return (
    <AuthShell bullets={BULLETS} tagline="لوحة تحكم فريق المنصة الداخلي">
      <div className="mx-auto w-full max-w-md">
        <div className="mb-8 text-center">
          <div className="mb-4 flex justify-center lg:hidden">
            <LogoFull size="md" light />
          </div>
          <h1 className="text-2xl font-bold text-white">دخول فريق المنصة</h1>
          <p className="mt-1 text-sm text-slate-400">
            هذه الجلسة منفصلة تماماً عن جلسة أي حساب تاجر مسجَّل دخوله في هذا المتصفح — يمكنك
            استخدامهما معاً في نفس الوقت.
          </p>
        </div>

        <form action={formAction} className="card space-y-4 p-6">
          {state.error && (
            <div className="rounded-lg border border-danger-500/30 bg-danger-500/10 px-3 py-2 text-sm text-danger-500">
              {state.error}
            </div>
          )}
          <div>
            <label className="label-field">البريد الإلكتروني</label>
            <input name="email" type="email" required className="input-field" placeholder="name@platform.sa" dir="ltr" />
          </div>
          <div>
            <label className="label-field">كلمة المرور</label>
            <PasswordInput name="password" required placeholder="••••••••" dir="ltr" />
          </div>
          <SubmitButton />
          <p className="text-center text-xs text-slate-500">
            صاحب متجر؟{" "}
            <a href="/login" className="text-wa-400 hover:underline">
              سجّل دخولك من هنا
            </a>
          </p>
        </form>
      </div>
    </AuthShell>
  );
}
