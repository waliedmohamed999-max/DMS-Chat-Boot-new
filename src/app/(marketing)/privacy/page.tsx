import type { Metadata } from "next";
import { Reveal } from "@/components/marketing/Reveal";

export const metadata: Metadata = {
  title: "سياسة الخصوصية — DMS",
  description: "سياسة الخصوصية الخاصة بمنصة DMS وكيفية تعاملنا مع بياناتك.",
};

export default function PrivacyPage() {
  return (
    <div className="mx-auto max-w-3xl px-4 py-16">
      <Reveal>
        <h1 className="text-3xl font-extrabold text-slate-900 sm:text-4xl dark:text-white">سياسة الخصوصية</h1>
        <p className="mt-3 text-sm text-slate-400">آخر تحديث: يوليو 2026</p>
      </Reveal>

      <Reveal delay={100} className="mt-8 space-y-5 text-slate-600 dark:text-slate-300">
        <p>نحترم خصوصيتك ونلتزم بحماية بياناتك الشخصية وبيانات عملائك المخزَّنة عبر المنصة.</p>
        <div>
          <h2 className="mb-2 font-semibold text-slate-900 dark:text-white">البيانات التي نجمعها</h2>
          <p>بيانات حساب التاجر (الاسم، البريد، رقم الهاتف)، وبيانات جهات الاتصال التي يُدخلها التاجر لإدارة تواصله مع عملائه.</p>
        </div>
        <div>
          <h2 className="mb-2 font-semibold text-slate-900 dark:text-white">كيف نستخدم بياناتك</h2>
          <p>لتشغيل الخدمة فقط: إرسال الرسائل، تشغيل الشات بوت، وعرض التقارير. لا نبيع بياناتك لأي طرف ثالث.</p>
        </div>
        <div>
          <h2 className="mb-2 font-semibold text-slate-900 dark:text-white">أمان البيانات</h2>
          <p>تُخزَّن مفاتيح الربط الحساسة (مثل مفاتيح واتساب) مشفَّرة، وتُعزَل بيانات كل تاجر تماماً عن بقية التجار على مستوى قاعدة البيانات نفسها.</p>
        </div>
        <div>
          <h2 className="mb-2 font-semibold text-slate-900 dark:text-white">حقوقك</h2>
          <p>يمكنك طلب تصدير أو حذف بياناتك في أي وقت بالتواصل مع فريق الدعم.</p>
        </div>
      </Reveal>
    </div>
  );
}
