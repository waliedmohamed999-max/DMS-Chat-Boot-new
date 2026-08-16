"use client";

import { useState } from "react";
import Link from "next/link";

type PublicPlan = {
  key: string;
  name: string;
  priceMonthlySar: number;
  maxUsers: number;
  maxWhatsappNumbers: number;
  maxMessagesPerMonth: number;
  features: unknown;
  isPopular: boolean;
  annualDiscountBps: number;
};

export function PricingClient({ plans }: { plans: PublicPlan[] }) {
  const [annual, setAnnual] = useState(false);
  // "الأكثر طلباً" علم حقيقي من Plan.isPopular (يُضبط من Super Admin) — لم يعد استنتاجاً بصرياً
  // بموضع الباقة في المصفوفة كما كان سابقاً (راجع DECISIONS.md).
  const featuredKey = plans.find((p) => p.isPopular)?.key ?? null;

  return (
    <>
      <div className="mt-8 flex items-center justify-center gap-3">
        <span className={`text-sm font-medium ${!annual ? "text-slate-900 dark:text-white" : "text-slate-400"}`}>شهري</span>
        <button
          type="button"
          role="switch"
          aria-checked={annual}
          onClick={() => setAnnual((a) => !a)}
          className={`relative h-7 w-12 rounded-full transition ${annual ? "bg-wa-500" : "bg-slate-300 dark:bg-slate-700"}`}
        >
          <span className={`absolute top-0.5 h-6 w-6 rounded-full bg-white shadow transition ${annual ? "right-0.5" : "right-[22px]"}`} />
        </button>
        <span className={`text-sm font-medium ${annual ? "text-slate-900 dark:text-white" : "text-slate-400"}`}>سنوي</span>
      </div>

      {/* موبايل: شريط أفقي قابل للسحب يُظهر بطاقتين فقط في العرض مع Scroll Snap (لا تكديس صفوف فوق
          بعضها) — بدءاً من lg يتحول لشبكة عادية بكل الباقات ظاهرة معاً بلا سحب. */}
      <div
        className="mt-10 flex snap-x snap-mandatory gap-4 overflow-x-auto pb-2 [-ms-overflow-style:none] [scrollbar-width:none] sm:gap-6 lg:grid lg:grid-cols-4 lg:overflow-visible [&::-webkit-scrollbar]:hidden"
      >
        {plans.map((plan) => {
          const isFeatured = plan.key === featuredKey;
          // نسبة خصم حقيقية لكل باقة على حدة (Plan.annualDiscountBps، تُضبط من Super Admin) — بدل
          // ثابت 20% موحَّد كان مكتوباً مباشرة في هذا الملف بلا أي علاقة بنظام الباقات الفعلي.
          const discountFraction = plan.annualDiscountBps / 10000;
          const displayPrice = annual ? Math.round(plan.priceMonthlySar * (1 - discountFraction)) : plan.priceMonthlySar;
          const features = Array.isArray(plan.features) ? (plan.features as string[]) : [];
          return (
            <div
              key={plan.key}
              className={`relative flex h-full w-[calc(50%-0.5rem)] flex-none snap-start flex-col rounded-2xl border p-4 sm:w-[calc(50%-0.75rem)] sm:rounded-3xl sm:p-7 lg:w-auto ${
                isFeatured
                  ? "border-wa-500 bg-white shadow-lg ring-2 ring-wa-500/30 dark:bg-slate-900"
                  : "border-slate-200 bg-white shadow-card dark:border-white/10 dark:bg-slate-900"
              }`}
            >
              {isFeatured && (
                <span className="absolute -top-3 right-4 rounded-full bg-wa-500 px-2.5 py-1 text-[11px] font-bold text-white sm:right-6 sm:px-3 sm:text-xs">الأكثر شيوعاً</span>
              )}
              <h3 className="text-base font-bold text-slate-900 sm:text-lg dark:text-white">{plan.name}</h3>
              <p className="mt-3">
                <span className="text-2xl font-extrabold text-slate-900 sm:text-3xl dark:text-white">{displayPrice}</span>
                <span className="mr-1 text-xs text-slate-400 sm:text-sm">ر.س/شهرياً</span>
              </p>
              {annual && (
                <p className="mt-1 text-xs text-wa-600 dark:text-wa-400">
                  سنوياً: {displayPrice * 12} ر.س — وفّر {plan.annualDiscountBps / 100}%
                </p>
              )}

              <ul className="mt-4 space-y-2 text-xs text-slate-600 sm:mt-6 sm:space-y-2.5 sm:text-sm dark:text-slate-300">
                <li className="flex items-center gap-2"><span className="text-wa-500">✓</span> حتى {plan.maxUsers} مستخدمين</li>
                <li className="flex items-center gap-2"><span className="text-wa-500">✓</span> {plan.maxWhatsappNumbers} رقم واتساب</li>
                <li className="flex items-center gap-2"><span className="text-wa-500">✓</span> {plan.maxMessagesPerMonth.toLocaleString("ar-SA")} رسالة شهرياً</li>
                {features.map((f) => (
                  <li key={f} className="flex items-center gap-2"><span className="text-wa-500">✓</span> {f}</li>
                ))}
              </ul>

              <Link
                href="/partners/join"
                className={`mt-6 rounded-lg px-4 py-2.5 text-center text-sm font-bold transition sm:mt-8 ${
                  isFeatured ? "bg-wa-500 text-white hover:bg-wa-600" : "border border-slate-300 text-slate-700 hover:bg-slate-50 dark:border-white/15 dark:text-slate-200 dark:hover:bg-white/5"
                }`}
              >
                ابدأ بهذه الباقة
              </Link>
            </div>
          );
        })}
      </div>
    </>
  );
}
