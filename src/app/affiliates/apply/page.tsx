"use client";

import { useRef, useState, useTransition } from "react";
import Link from "next/link";
import { AuthShell } from "@/components/auth/AuthShell";
import { LogoFull } from "@/components/Logo";
import { submitAffiliateApplication, type SubmitAffiliateApplicationResult } from "./actions";

export default function AffiliateApplyPage() {
  const [result, setResult] = useState<SubmitAffiliateApplicationResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const renderedAtRef = useRef(Date.now());

  function handleSubmit(formData: FormData) {
    setError(null);
    formData.set("formRenderedAt", String(renderedAtRef.current));
    startTransition(async () => {
      const res = await submitAffiliateApplication(formData);
      if (res.success) setResult(res);
      else setError(res.error);
    });
  }

  if (result?.success) {
    return (
      <AuthShell tagline="طلبك قيد المراجعة الآن">
        <div className="mx-auto max-w-md text-center">
          <div className="mb-4 flex justify-center lg:hidden">
            <LogoFull size="md" light />
          </div>
          <div className="card space-y-4 p-8">
            <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-wa-500/10 text-3xl">✅</div>
            <h1 className="text-xl font-bold text-white">تم إرسال طلبك بنجاح</h1>
            <p className="text-sm text-slate-400">
              سيراجع فريقنا طلبك خلال أيام عمل قليلة. بمجرد الموافقة، ستقدر تسجّل الدخول بنفس البريد
              وكلمة المرور من صفحة{" "}
              <Link href="/affiliates/login" className="text-wa-400 hover:underline">
                دخول المسوّقين
              </Link>
              .
            </p>
          </div>
        </div>
      </AuthShell>
    );
  }

  return (
    <AuthShell
      tagline="انضم لبرنامج التسويق بالعمولة"
      bullets={[
        { icon: "💰", text: "عمولة حقيقية متكررة من كل دفعة، لمدة 12 شهراً" },
        { icon: "📈", text: "نسبتك ترتفع تلقائياً كلما زاد عدد عملائك" },
        { icon: "🔗", text: "رابط إحالة خاص بك، وداشبورد لمتابعة كل شيء" },
      ]}
    >
      <div className="mx-auto w-full max-w-lg">
        <div className="mb-8 text-center">
          <div className="mb-4 flex justify-center lg:hidden">
            <LogoFull size="md" light />
          </div>
          <h1 className="text-2xl font-bold text-white">قدّم كمسوّق بالعمولة</h1>
          <p className="mt-1 text-sm text-slate-400">التقديم مجاني، تُراجَع الطلبات خلال أيام عمل قليلة</p>
        </div>

        <form action={handleSubmit} className="card space-y-4 p-6">
          {error && (
            <div className="rounded-lg border border-danger-500/30 bg-danger-500/10 px-3 py-2 text-sm text-danger-500">{error}</div>
          )}

          {/* حقل فخّ مخفي بصرياً — نفس أسلوب partners/apply */}
          <input type="text" name="website" tabIndex={-1} autoComplete="off" className="absolute -left-[9999px] h-0 w-0 opacity-0" />

          <div>
            <label className="label-field">الاسم الكامل</label>
            <input name="name" required className="input-field" placeholder="اسمك الكامل" />
          </div>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div>
              <label className="label-field">البريد الإلكتروني</label>
              <input name="email" type="email" required className="input-field" dir="ltr" />
            </div>
            <div>
              <label className="label-field">رقم الهاتف</label>
              <input name="phone" required className="input-field" dir="ltr" placeholder="+9665xxxxxxxx" />
            </div>
          </div>
          <div>
            <label className="label-field">كلمة المرور</label>
            <input name="password" type="password" required minLength={8} className="input-field" dir="ltr" />
            <p className="mt-1 text-xs text-slate-500">تُستخدَم لدخول لوحتك الخاصة كمسوّق بعد الموافقة على طلبك.</p>
          </div>
          <div>
            <label className="label-field">كيف تنوي الترويج للمنصة؟</label>
            <textarea
              name="promotionPlan"
              required
              rows={3}
              className="input-field"
              placeholder="مثال: قناة يوتيوب لصنّاع المحتوى التقني، أو أدير وكالة تسويق أتعامل معها تجّار واتساب بزنس بشكل يومي..."
            />
          </div>
          <label className="flex items-start gap-2 text-xs text-slate-400">
            <input type="checkbox" name="termsAccepted" required className="mt-0.5" />
            أوافق على شروط وأحكام برنامج التسويق بالعمولة
          </label>

          <button
            type="submit"
            disabled={isPending}
            className="w-full rounded-lg bg-wa-500 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-wa-600 disabled:opacity-50"
          >
            {isPending ? "جاري الإرسال..." : "إرسال طلب الانضمام"}
          </button>
          <p className="text-center text-xs text-slate-500">
            لديك حساب مسوّق بالفعل؟{" "}
            <Link href="/affiliates/login" className="text-wa-400 hover:underline">
              سجّل دخولك من هنا
            </Link>
          </p>
        </form>
      </div>
    </AuthShell>
  );
}
