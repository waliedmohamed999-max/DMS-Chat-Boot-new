"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { completePartnerSetup } from "./actions";

export function SetupForm({ token }: { token: string }) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function handleSubmit(formData: FormData) {
    startTransition(async () => {
      const res = await completePartnerSetup(token, formData);
      if (!res.success) {
        setError(res.error);
        return;
      }
      router.push("/login?setup=1");
    });
  }

  return (
    <form action={handleSubmit} className="card space-y-4 p-6">
      {error && (
        <div className="rounded-lg border border-danger-500/30 bg-danger-500/10 px-3 py-2 text-sm text-danger-500">
          {error}
        </div>
      )}
      <div>
        <label className="label-field">كلمة المرور</label>
        <input name="password" type="password" required minLength={8} className="input-field" dir="ltr" />
      </div>
      <div>
        <label className="label-field">تأكيد كلمة المرور</label>
        <input name="confirmPassword" type="password" required minLength={8} className="input-field" dir="ltr" />
      </div>
      <button
        type="submit"
        disabled={isPending}
        className="w-full rounded-lg bg-wa-500 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-wa-600 disabled:opacity-50"
      >
        {isPending ? "جارٍ الحفظ..." : "تفعيل الحساب وتسجيل الدخول"}
      </button>
    </form>
  );
}
