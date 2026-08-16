"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { checkPartnerApplicationStatus, type PartnerStatusResult } from "./actions";
import { AuthShell } from "@/components/auth/AuthShell";
import { LogoFull } from "@/components/Logo";

const STATUS_LABELS: Record<"PENDING" | "APPROVED" | "REJECTED" | "NEEDS_INFO", { label: string; className: string }> = {
  PENDING: { label: "قيد المراجعة", className: "bg-warning-500/10 text-warning-500" },
  NEEDS_INFO: { label: "بانتظار معلومات إضافية منك", className: "bg-warning-500/10 text-warning-500" },
  APPROVED: { label: "تمت الموافقة ✅", className: "bg-success-500/10 text-success-500" },
  REJECTED: { label: "تم الرفض", className: "bg-danger-500/10 text-danger-500" },
};

export default function PartnerStatusPage() {
  const [result, setResult] = useState<PartnerStatusResult | null>(null);
  const [isPending, startTransition] = useTransition();

  function handleSubmit(formData: FormData) {
    startTransition(async () => {
      setResult(await checkPartnerApplicationStatus(formData));
    });
  }

  return (
    <AuthShell
      tagline="تابع حالة طلب انضمامك خطوة بخطوة"
      bullets={[
        { icon: "📩", text: "تصلك رسالة فور تحديث حالة طلبك" },
        { icon: "🔍", text: "تتبّع فوري برقم الطلب والبريد الإلكتروني" },
        { icon: "🔐", text: "رابط إعداد آمن يصلك بعد الموافقة" },
      ]}
    >
      <div className="mx-auto w-full max-w-md">
        <div className="mb-8 text-center">
          <div className="mb-4 flex justify-center lg:hidden">
            <LogoFull size="md" light />
          </div>
          <h1 className="text-2xl font-bold text-white">تتبع حالة طلب الانضمام</h1>
          <p className="mt-1 text-sm text-slate-400">أدخل رقم طلبك والبريد الإلكتروني المستخدم عند التقديم</p>
        </div>

        <form action={handleSubmit} className="card space-y-4 p-6">
          <div>
            <label className="label-field">رقم الطلب</label>
            <input name="referenceId" required className="input-field" dir="ltr" placeholder="cl..." />
          </div>
          <div>
            <label className="label-field">البريد الإلكتروني</label>
            <input name="email" type="email" required className="input-field" dir="ltr" />
          </div>
          <button
            type="submit"
            disabled={isPending}
            className="w-full rounded-lg bg-wa-500 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-wa-600 disabled:opacity-50"
          >
            {isPending ? "جارٍ البحث..." : "عرض الحالة"}
          </button>
        </form>

        {result && (
          <div className="card mt-4 p-5">
            {result.found ? (
              <>
                <div className="mb-2 flex items-center justify-between">
                  <p className="font-semibold text-white">{result.storeName}</p>
                  <span className={`badge ${STATUS_LABELS[result.status].className}`}>{STATUS_LABELS[result.status].label}</span>
                </div>
                <p className="text-xs text-slate-500">
                  تاريخ التقديم: {new Date(result.createdAt).toLocaleDateString("ar-SA")}
                </p>
                {result.reviewerNote && (
                  <div className="mt-3 rounded-lg bg-navy-900 p-3 text-sm text-slate-300">{result.reviewerNote}</div>
                )}
                {result.status === "APPROVED" && (
                  <p className="mt-3 text-sm text-slate-400">
                    تحقق من بريدك الإلكتروني — أرسلنا لك رابط إعداد الحساب.
                  </p>
                )}
              </>
            ) : (
              <p className="text-sm text-danger-500">{result.error}</p>
            )}
          </div>
        )}

        <p className="mt-6 text-center text-xs text-slate-500">
          <Link href="/partners/join" className="text-wa-400 hover:underline">
            العودة لصفحة الشركاء
          </Link>
        </p>
      </div>
    </AuthShell>
  );
}
