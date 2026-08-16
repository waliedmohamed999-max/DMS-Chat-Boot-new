import type { Metadata } from "next";
import { Reveal } from "@/components/marketing/Reveal";

export const metadata: Metadata = {
  title: "الشروط والأحكام — DMS",
  description: "الشروط والأحكام الخاصة باستخدام منصة DMS.",
};

export default function TermsPage() {
  return (
    <div className="mx-auto max-w-3xl px-4 py-16">
      <Reveal>
        <h1 className="text-3xl font-extrabold text-slate-900 sm:text-4xl dark:text-white">الشروط والأحكام</h1>
        <p className="mt-3 text-sm text-slate-400">آخر تحديث: يوليو 2026</p>
      </Reveal>

      <Reveal delay={100} className="mt-8 space-y-5 text-slate-600 dark:text-slate-300">
        <p>باستخدامك منصة DMS، فإنك توافق على الشروط التالية. يرجى قراءتها بعناية قبل التسجيل.</p>
        <div>
          <h2 className="mb-2 font-semibold text-slate-900 dark:text-white">1. استخدام الخدمة</h2>
          <p>يُسمح باستخدام المنصة لأغراض تجارية مشروعة فقط، وفق سياسات WhatsApp Business Platform وشروط استخدامها الرسمية.</p>
        </div>
        <div>
          <h2 className="mb-2 font-semibold text-slate-900 dark:text-white">2. الاشتراك والفوترة</h2>
          <p>تُفوتَر الاشتراكات وفق الباقة المختارة، ويمكن ترقيتها أو إلغاؤها في أي وقت من لوحة التحكم دون التزام بعقد طويل الأجل.</p>
        </div>
        <div>
          <h2 className="mb-2 font-semibold text-slate-900 dark:text-white">3. بيانات العملاء</h2>
          <p>يبقى التاجر مسؤولاً عن الحصول على موافقة عملائه لاستقبال الرسائل التسويقية وفق الأنظمة المعمول بها.</p>
        </div>
        <div>
          <h2 className="mb-2 font-semibold text-slate-900 dark:text-white">4. إنهاء الخدمة</h2>
          <p>تحتفظ المنصة بحق تعليق أي حساب يخالف هذه الشروط أو سياسات واتساب الرسمية.</p>
        </div>
        <p className="text-sm text-slate-400">لأي استفسار حول هذه الشروط، تواصل معنا عبر صفحة "تواصل معنا".</p>
      </Reveal>
    </div>
  );
}
