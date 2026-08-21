"use client";

import { Suspense, useState } from "react";
import { signIn, getSession } from "next-auth/react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { AuthShell } from "@/components/auth/AuthShell";
import { PasswordInput } from "@/components/auth/PasswordInput";
import { LogoFull } from "@/components/Logo";
import { isPlatformRole } from "@/lib/rbac";

const ERROR_MESSAGES_AR: Record<string, string> = {
  tenant_suspended: "تم تعليق حساب متجرك مؤقتاً. تواصل مع الدعم لمزيد من التفاصيل.",
  tenant_cancelled: "تم إلغاء اشتراك هذا المتجر. تواصل مع الدعم لإعادة التفعيل.",
  tenant_rejected: "تم رفض طلب تسجيل هذا المتجر. تواصل مع الدعم لمعرفة السبب.",
  too_many_attempts: "محاولات دخول كثيرة جداً على هذا الحساب. حاول مرة أخرى بعد بضع دقائق.",
};

export default function LoginPage() {
  return (
    <Suspense>
      <LoginForm />
    </Suspense>
  );
}

function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const justRegistered = searchParams.get("registered") === "1";
  const justSetup = searchParams.get("setup") === "1";
  const redirectReason = searchParams.get("reason");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(redirectReason ? (ERROR_MESSAGES_AR[redirectReason] ?? null) : null);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    const res = await signIn("credentials", { email, password, redirect: false });
    if (res?.error) {
      setLoading(false);
      setError(ERROR_MESSAGES_AR[res.error] ?? "البريد الإلكتروني أو كلمة المرور غير صحيحة");
      return;
    }
    // الصفحة الرئيسية العامة (/) لم تعد تُحوِّل تلقائياً حسب الجلسة (أصبحت صفحة عامة عادية بلا أي
    // منطق دخول) — لازم نحدّد الوجهة هنا صراحة بدل الاعتماد عليها كخطوة وسيطة كما كان سابقاً.
    const session = await getSession();
    router.push(session?.user && isPlatformRole(session.user.role) ? "/admin" : "/dashboard");
    router.refresh();
  }

  return (
    <AuthShell>
      <div className="mx-auto w-full max-w-md">
      <div className="mb-8 text-center">
        <div className="mb-4 flex justify-center lg:hidden">
          <LogoFull size="md" light />
        </div>
        <h1 className="text-2xl font-bold text-white">مرحباً بعودتك</h1>
        <p className="mt-1 text-sm text-slate-400">سجّل الدخول للوصول إلى لوحة تحكم متجرك</p>
      </div>

      {justRegistered && (
          <div className="mb-4 rounded-lg border border-success-500/30 bg-success-500/10 px-3 py-2 text-sm text-success-500">
            تم إنشاء حسابك بنجاح! طلبك الآن بانتظار مراجعة فريقنا، سنُفعّله في أقرب وقت.
          </div>
        )}
        {justSetup && (
          <div className="mb-4 rounded-lg border border-success-500/30 bg-success-500/10 px-3 py-2 text-sm text-success-500">
            تم إعداد حسابك بنجاح! سجّل الدخول الآن بكلمة المرور التي اخترتها.
          </div>
        )}
        <form onSubmit={handleSubmit} className="card space-y-4 p-6">
          {error && (
            <div className="rounded-lg border border-danger-500/30 bg-danger-500/10 px-3 py-2 text-sm text-danger-500">
              {error}
            </div>
          )}
          <div>
            <label className="label-field">البريد الإلكتروني</label>
            <input
              type="email"
              required
              className="input-field"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="name@example.com"
              dir="ltr"
            />
          </div>
          <div>
            <label className="label-field">كلمة المرور</label>
            <PasswordInput
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••"
              dir="ltr"
            />
          </div>
          <button
            type="submit"
            disabled={loading}
            className="w-full rounded-lg bg-wa-500 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-wa-600 disabled:opacity-50"
          >
            {loading ? "جاري الدخول..." : "تسجيل الدخول"}
          </button>
          <p className="text-center text-xs text-slate-500">
            تاجر جديد؟{" "}
            <Link href="/register" className="text-wa-400 hover:underline">
              أنشئ حساباً وابدأ تجربتك المجانية
            </Link>
          </p>
          <p className="text-center text-xs text-slate-500">
            صاحب متجر أو نشاط؟{" "}
            <Link href="/partners/join" className="text-wa-400 hover:underline">
              انضم كشريك
            </Link>
          </p>
          <p className="text-center text-xs text-slate-500">
            موظف فريق المنصة؟{" "}
            <Link href="/admin-login" className="text-wa-400 hover:underline">
              سجّل دخولك من هنا
            </Link>
          </p>
        </form>
      </div>
    </AuthShell>
  );
}
