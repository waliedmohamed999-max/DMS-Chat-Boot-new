import type { Metadata } from "next";
import { Reveal } from "@/components/marketing/Reveal";
import { PricingClient } from "./PricingClient";

// الباقات حقيقية وقابلة للتعديل من لوحة مالك المنصة (admin/plans) — يجب أن تُقرأ حياً وليس وقت البناء.
export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "الباقات والأسعار — DMS Tech",
  description: "قارن باقات منصة DMS Tech واختر الأنسب لحجم نشاطك — أسعار شفافة بلا رسوم مخفية.",
};

const FAQS = [
  { q: "هل يمكن تخصيص الباقة لنشاطي؟", a: "يمكنك طلب عرض سعر مخصص من فريق DMS Tech، ويُحدَّد النطاق والمستخدمون والتكاملات المطلوبة قبل البدء." },
  { q: "كيف أطلب الباقة أو أحصل على العرض الحالي؟", a: "اختر الباقة لزيارة صفحة طلبها في موقع DMS Tech الرئيسي. يمكنك أيضاً مراجعة صفحة العروض لمعرفة العروض الحالية وشروطها قبل إرسال الطلب." },
  { q: "هل رسوم رسائل ميتا مشمولة؟", a: "رسوم رسائل ميتا والاستخدام الإضافي للذكاء الاصطناعي تُحسب منفصلة حسب الاستخدام. تفاصيل ما تشمله كل باقة موضحة في بطاقتها وصفحة الطلب." },
  { q: "هل الأسعار تشمل ضريبة القيمة المضافة؟", a: "الأسعار المعروضة قبل الضريبة، وتُضاف ضريبة القيمة المضافة وفق الأنظمة المعمول بها عند إصدار الفاتورة." },
  { q: "متى يبدأ تنفيذ الباقة؟", a: "تبدأ المدة بعد استلام الصلاحيات والمعلومات المطلوبة واعتماد الحساب لدى ميتا. تختلف المدة حسب الباقة ونطاق العمل المعتمد." },
];

export default async function PricingPage() {

  return (
    <div className="mx-auto max-w-6xl px-4 py-16">
      <div className="mx-auto max-w-2xl text-center">
        <h1 className="text-3xl font-extrabold text-slate-900 sm:text-4xl dark:text-white">باقات تناسب كل حجم نشاط</h1>
        <p className="mt-4 text-lg text-slate-500 dark:text-slate-400">باقات واتساب للأعمال من DMS Tech — نفس التفاصيل والأسعار المنشورة في الموقع الرئيسي.</p>
      </div>

      <PricingClient />

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
