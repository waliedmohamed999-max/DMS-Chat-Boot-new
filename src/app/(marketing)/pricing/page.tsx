import type { Metadata } from "next";
import { getPublicPlans } from "@/app/partners/apply/actions";
import { getCountryConfigs } from "@/lib/billing/countryConfig";
import { Reveal } from "@/components/marketing/Reveal";
import { PricingClient } from "./PricingClient";

// الباقات حقيقية وقابلة للتعديل من لوحة مالك المنصة (admin/plans) — يجب أن تُقرأ حياً وليس وقت البناء.
export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "الباقات والأسعار — DMS",
  description: "قارن باقات منصة DMS واختر الأنسب لحجم نشاطك — أسعار شفافة بلا رسوم مخفية.",
};

const FAQS = [
  { q: "هل يمكنني تغيير باقتي لاحقاً؟", a: "نعم، يمكنك الترقية أو التخفيض في أي وقت من لوحة التحكم، ويُحتسب الفرق تلقائياً في فاتورتك التالية." },
  { q: "هل توجد فترة تجريبية مجانية؟", a: "نعم، كل باقة تبدأ بفترة تجريبية مجانية تتيح لك تجربة المنصة كاملة قبل أي التزام مالي." },
  { q: "ماذا يحدث إذا تجاوزت حد الرسائل الشهري؟", a: "سنُشعرك عند اقترابك من الحد، ويمكنك الترقية لباقة أعلى فوراً من لوحة الفوترة لتفادي أي انقطاع." },
  { q: "هل الأسعار تشمل ضريبة القيمة المضافة؟", a: "الأسعار المعروضة قبل الضريبة، وتُضاف ضريبة القيمة المضافة وفق الأنظمة المعمول بها عند إصدار الفاتورة." },
  { q: "هل يمكنني إلغاء اشتراكي في أي وقت؟", a: "نعم، لا يوجد التزام بعقد طويل الأجل — يمكنك إلغاء الاشتراك من لوحة الفوترة مباشرة." },
];

export default async function PricingPage() {
  const [plans, countryConfigs] = await Promise.all([getPublicPlans(), getCountryConfigs()]);
  const countries = countryConfigs
    .filter((c) => c.isActive)
    .map((c) => ({ country: c.country, currency: c.currency, isDefault: c.isDefault }));

  return (
    <div className="mx-auto max-w-6xl px-4 py-16">
      <div className="mx-auto max-w-2xl text-center">
        <h1 className="text-3xl font-extrabold text-slate-900 sm:text-4xl dark:text-white">باقات تناسب كل حجم نشاط</h1>
        <p className="mt-4 text-lg text-slate-500 dark:text-slate-400">أسعار شفافة بلا رسوم مخفية — ابدأ بتجربة مجانية بلا بطاقة ائتمانية.</p>
      </div>

      {plans.length === 0 ? (
        <p className="mt-12 text-center text-slate-400">لا توجد باقات متاحة حالياً.</p>
      ) : (
        <PricingClient plans={plans} countries={countries} />
      )}

      <div className="mx-auto mt-24 max-w-2xl">
        <Reveal>
          <h2 className="text-center text-2xl font-bold text-slate-900 dark:text-white">الأسئلة الشائعة</h2>
        </Reveal>
        <div className="mt-8 space-y-3">
          {FAQS.map((f, i) => (
            <Reveal key={f.q} delay={i * 60}>
              <details className="group rounded-xl border border-slate-200 bg-white p-4 dark:border-white/10 dark:bg-slate-900">
                <summary className="flex cursor-pointer items-center justify-between text-sm font-semibold text-slate-800 dark:text-slate-100">
                  {f.q}
                  <span className="mr-2 text-slate-400 transition group-open:rotate-45">+</span>
                </summary>
                <p className="mt-3 text-sm text-slate-500 dark:text-slate-400">{f.a}</p>
              </details>
            </Reveal>
          ))}
        </div>
      </div>
    </div>
  );
}
