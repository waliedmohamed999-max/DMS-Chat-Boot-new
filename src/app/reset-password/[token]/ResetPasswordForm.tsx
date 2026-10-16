"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { completePartnerSetup } from "@/app/partners/setup/[token]/actions";
import { PasswordInput } from "@/components/auth/PasswordInput";

export function ResetPasswordForm({ token }: { token: string }) {
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
      router.push("/login?reset=1");
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
        <label className="label-field">كلمة المرور الجديدة</label>
        <PasswordInput name="password" required minLength={8} placeholder="8 أحرف على الأقل" dir="ltr" />
      </div>
      <div>
        <label className="label-field">تأكيد كلمة المرور</label>
        <PasswordInput name="confirmPassword" required minLength={8} placeholder="••••••••" dir="ltr" />
      </div>
      <button
        type="submit"
        disabled={isPending}
        className="w-full rounded-lg bg-wa-500 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-wa-600 disabled:opacity-50"
      >
        {isPending ? "جارٍ الحفظ..." : "حفظ كلمة المرور"}
      </button>
    </form>
  );
}
