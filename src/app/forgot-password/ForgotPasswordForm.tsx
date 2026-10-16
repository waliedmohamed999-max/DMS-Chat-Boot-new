"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import { requestPasswordReset } from "./actions";

export function ForgotPasswordForm() {
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState(false);
  const [isPending, startTransition] = useTransition();

  function handleSubmit(formData: FormData) {
    setError(null);
    startTransition(async () => {
      const res = await requestPasswordReset(formData);
      if (!res.success) {
        setError(res.error);
        return;
      }
      setSent(true);
    });
  }

  if (sent) {
    return (
      <div className="card space-y-4 p-6 text-center">
        <div className="text-4xl">📧</div>
        <p className="text-sm text-slate-300">
          لو البريد مسجَّل لدينا، ستصلك رسالة خلال دقائق فيها رابط تعيين كلمة مرور جديدة (صالح لمدة ساعة).
          تفقّد مجلد الرسائل غير المرغوب فيها (Spam) أيضاً.
        </p>
        <Link href="/login" className="inline-block text-sm text-wa-400 hover:underline">
          الرجوع لتسجيل الدخول
        </Link>
      </div>
    );
  }

  return (
    <form action={handleSubmit} className="card space-y-4 p-6">
      {error && (
        <div className="rounded-lg border border-danger-500/30 bg-danger-500/10 px-3 py-2 text-sm text-danger-500">
          {error}
        </div>
      )}
      <div>
        <label className="label-field">البريد الإلكتروني</label>
        <input name="email" type="email" required className="input-field" placeholder="name@example.com" dir="ltr" />
      </div>
      <button
        type="submit"
        disabled={isPending}
        className="w-full rounded-lg bg-wa-500 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-wa-600 disabled:opacity-50"
      >
        {isPending ? "جارٍ الإرسال..." : "أرسل رابط الاستعادة"}
      </button>
      <p className="text-center text-xs text-slate-500">
        تذكّرت كلمة المرور؟{" "}
        <Link href="/login" className="text-wa-400 hover:underline">
          سجّل الدخول
        </Link>
      </p>
    </form>
  );
}
