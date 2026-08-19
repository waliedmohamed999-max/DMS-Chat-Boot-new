"use client";

import { useFormState, useFormStatus } from "react-dom";
import Link from "next/link";
import { useMemo, useState } from "react";
import { registerTenant } from "./actions";
import { AuthShell } from "@/components/auth/AuthShell";
import { LogoFull } from "@/components/Logo";
import { useCaptureReferral } from "@/lib/affiliates/useReferralCapture";
import { resolvePlanPrice } from "@/lib/planPricing";
import { COUNTRY_LABELS_AR, CURRENCY_SYMBOLS } from "@/lib/currency";

type Country = "SA" | "AE" | "EG";

type PublicPlan = {
  key: string;
  name: string;
  priceMonthlySar: number;
  pricingJson: unknown;
  isPopular: boolean;
};

type CountryOption = { country: Country; currency: string; isDefault: boolean };

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className="w-full rounded-lg bg-wa-500 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-wa-600 disabled:opacity-50"
    >
      {pending ? "جاري إنشاء الحساب..." : "إنشاء الحساب وبدء التجربة المجانية"}
    </button>
  );
}

export function RegisterForm({ plans, countries }: { plans: PublicPlan[]; countries: CountryOption[] }) {
  useCaptureReferral();
  const [state, formAction] = useFormState(registerTenant, { error: null });
  const defaultCountry = countries.find((c) => c.isDefault)?.country ?? "SA";
  const [country, setCountry] = useState<Country>(defaultCountry);

  // الباقات المعروضة تتغيّر حسب الدولة المختارة — باقة بلا سعر محدَّد لتلك الدولة تُخفى تماماً
  // (لا تحويل عملة تلقائي مُخترَع، راجع lib/planPricing.ts).
  const availablePlans = useMemo(
    () =>
      plans
        .map((p) => ({ plan: p, price: resolvePlanPrice(p, country) }))
        .filter((x): x is { plan: PublicPlan; price: number } => x.price !== null),
    [plans, country]
  );
  const [selectedPlan, setSelectedPlan] = useState<string>(() => availablePlans.find((p) => p.plan.isPopular)?.plan.key ?? availablePlans[0]?.plan.key ?? "");

  function handleCountryChange(next: Country) {
    setCountry(next);
    const nextAvailable = plans.map((p) => ({ plan: p, price: resolvePlanPrice(p, next) })).filter((x) => x.price !== null);
    if (!nextAvailable.some((x) => x.plan.key === selectedPlan)) {
      setSelectedPlan(nextAvailable.find((x) => x.plan.isPopular)?.plan.key ?? nextAvailable[0]?.plan.key ?? "");
    }
  }

  const currency = countries.find((c) => c.country === country)?.currency ?? "SAR";

  return (
    <AuthShell>
      <div className="mx-auto w-full max-w-2xl">
        <div className="mb-8 text-center">
          <div className="mb-4 flex justify-center lg:hidden">
            <LogoFull size="md" light />
          </div>
          <h1 className="text-2xl font-bold text-white">ابدأ تجربتك المجانية 14 يوماً</h1>
          <p className="mt-1 text-sm text-slate-400">أنشئ مساحة عمل متجرك على منصة DMS</p>
        </div>

        <form action={formAction} className="card space-y-5 p-6">
          {state.error && (
            <div className="rounded-lg border border-danger-500/30 bg-danger-500/10 px-3 py-2 text-sm text-danger-500">
              {state.error}
            </div>
          )}

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div>
              <label className="label-field">اسم المتجر</label>
              <input name="storeName" required className="input-field" placeholder="متجر الأناقة" />
            </div>
            <div>
              <label className="label-field">اسمك</label>
              <input name="ownerName" required className="input-field" placeholder="اسمك الكامل" />
            </div>
            <div>
              <label className="label-field">البريد الإلكتروني</label>
              <input name="email" type="email" required className="input-field" dir="ltr" />
            </div>
            <div>
              <label className="label-field">كلمة المرور</label>
              <input name="password" type="password" required minLength={8} className="input-field" dir="ltr" />
            </div>
            <div>
              <label className="label-field">الدولة</label>
              <select
                name="country"
                value={country}
                onChange={(e) => handleCountryChange(e.target.value as Country)}
                className="input-field"
              >
                {countries.map((c) => (
                  <option key={c.country} value={c.country}>{COUNTRY_LABELS_AR[c.country]}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="label-field">نشاطك التجاري</label>
              <input name="businessActivity" required className="input-field" placeholder="مثال: متجر عطور وتجميل" />
            </div>
          </div>

          <div>
            <label className="label-field mb-2">اختر باقتك</label>
            {availablePlans.length === 0 ? (
              <p className="text-sm text-slate-400">لا توجد باقات مُسعَّرة لهذه الدولة بعد — تواصل مع الدعم.</p>
            ) : (
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                {availablePlans.map(({ plan, price }) => (
                  <label
                    key={plan.key}
                    className={`cursor-pointer rounded-lg border p-3 transition ${
                      selectedPlan === plan.key ? "border-wa-500 bg-wa-500/10" : "border-white/10 hover:bg-white/5"
                    }`}
                  >
                    <input
                      type="radio"
                      name="planKey"
                      value={plan.key}
                      checked={selectedPlan === plan.key}
                      onChange={() => setSelectedPlan(plan.key)}
                      className="sr-only"
                    />
                    <p className="text-sm font-semibold text-white">{plan.name}</p>
                    <p className="text-lg font-bold text-wa-400" dir="ltr">{price} {CURRENCY_SYMBOLS[currency] ?? currency}</p>
                    {plan.isPopular && <p className="text-xs text-slate-500">الأكثر شيوعاً</p>}
                  </label>
                ))}
              </div>
            )}
          </div>

          <SubmitButton />
          <p className="text-center text-xs text-slate-500">
            لديك حساب بالفعل؟{" "}
            <Link href="/login" className="text-wa-400 hover:underline">
              تسجيل الدخول
            </Link>
          </p>
        </form>
      </div>
    </AuthShell>
  );
}
