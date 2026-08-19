import Link from "next/link";
import { getPublicPlans } from "@/app/partners/apply/actions";
import { LogoFull } from "@/components/Logo";
import { resolvePlanPrice } from "@/lib/planPricing";
import { formatMoney } from "@/lib/currency";

// الباقات تُقرأ من جدول Plan الحقيقي القابل للتعديل من لوحة مالك المنصة (admin/plans) — بدون هذا،
// كانت الصفحة تُبنى ثابتة وقت `next build` فقط وتُجمِّد الأسعار المعروضة للجمهور حتى إعادة نشر جديدة.
export const dynamic = "force-dynamic";

const BENEFITS = [
  { icon: "💬", title: "صندوق محادثات موحّد", body: "استقبل وأرسل رسائل واتساب حقيقية من لوحة تحكم واحدة لكل فريقك." },
  { icon: "🤖", title: "شات بوت بلا كود", body: "ابنِ تدفقات ردّ آلي واختبرها قبل النشر، بدون أي خبرة تقنية." },
  { icon: "📣", title: "حملات وشرائح ذكية", body: "استهدف عملاءك بحملات فورية أو آلية (مثل استرداد السلة المتروكة)." },
  { icon: "🔌", title: "ربط مباشر بمتجرك", body: "تكامل حقيقي مع Zid وسلة، أو ربط رقم واتساب Cloud API يدوياً." },
];

export default async function PartnersJoinPage() {
  const allPlans = await getPublicPlans();
  // صفحة تعريفية بلا مبدّل دولة (اختيار الدولة الفعلي يتم لاحقاً في /partners/apply نفسها) —
  // تُعرَض أسعار السعودية (الدولة الأساسية) هنا افتراضياً.
  const plans = allPlans.map((plan) => ({ plan, price: resolvePlanPrice(plan, { country: "SA" as const, exchangeRateFromSar: 1 }) }));

  return (
    <div className="min-h-screen bg-white dark:bg-slate-950">
      <header className="border-b border-slate-200 px-4 py-4 dark:border-white/10">
        <div className="mx-auto flex max-w-5xl items-center justify-between">
          <LogoFull size="sm" />
          <div className="flex items-center gap-3 text-sm">
            <Link href="/partners/status" className="text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-slate-200">
              تتبع حالة طلبك
            </Link>
            <Link href="/login" className="font-semibold text-wa-600 hover:underline dark:text-wa-400">
              تسجيل الدخول
            </Link>
          </div>
        </div>
      </header>

      <section className="mx-auto max-w-3xl px-4 py-16 text-center">
        <h1 className="text-3xl font-bold text-slate-900 sm:text-4xl dark:text-white">انضم كشريك أعمال على منصة DMS</h1>
        <p className="mt-4 text-lg text-slate-500 dark:text-slate-400">
          منصة CRM متكاملة لإدارة عملائك عبر واتساب — للمتاجر الإلكترونية، العيادات، الصالونات،
          والخدمات من كل الأنواع. قدّم طلبك الآن وسيراجعه فريقنا خلال وقت قصير.
        </p>
        <div className="mt-8 flex flex-col items-center justify-center gap-3 sm:flex-row">
          <Link href="/partners/apply" className="rounded-lg bg-wa-500 px-8 py-3 text-base font-bold text-white shadow-card transition hover:bg-wa-600">
            قدّم طلب الانضمام الآن
          </Link>
          <Link href="/register" className="rounded-lg border border-slate-300 px-8 py-3 text-base font-semibold text-slate-700 transition hover:bg-slate-50 dark:border-white/15 dark:text-slate-200 dark:hover:bg-white/5">
            أو ابدأ تجربة مجانية ذاتية
          </Link>
        </div>
      </section>

      <section className="mx-auto max-w-5xl px-4 py-8">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {BENEFITS.map((b) => (
            <div key={b.title} className="rounded-2xl border border-slate-200 bg-white p-5 text-center shadow-card dark:border-white/10 dark:bg-slate-900">
              <div className="mb-2 text-3xl">{b.icon}</div>
              <h3 className="mb-1 font-semibold text-slate-900 dark:text-white">{b.title}</h3>
              <p className="text-sm text-slate-500 dark:text-slate-400">{b.body}</p>
            </div>
          ))}
        </div>
      </section>

      {plans.length > 0 && (
        <section className="mx-auto max-w-5xl px-4 py-12">
          <h2 className="mb-6 text-center text-2xl font-bold text-slate-900 dark:text-white">باقاتنا</h2>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            {plans.map(({ plan, price }) => (
              <div key={plan.key} className="rounded-2xl border border-slate-200 bg-white p-6 text-center shadow-card dark:border-white/10 dark:bg-slate-900">
                <p className="font-semibold text-slate-900 dark:text-white">{plan.name}</p>
                <p className="mt-2 text-2xl font-bold text-wa-600 dark:text-wa-400" dir="ltr">
                  {formatMoney(price, "SAR")} <span className="text-sm font-normal text-slate-400">/ شهرياً</span>
                </p>
                <ul className="mt-4 space-y-1 text-right text-sm text-slate-500 dark:text-slate-400">
                  <li>حتى {plan.maxUsers} مستخدمين</li>
                  <li>حتى {plan.maxWhatsappNumbers} رقم واتساب</li>
                  <li>{plan.maxMessagesPerMonth.toLocaleString("ar-SA")} رسالة شهرياً</li>
                </ul>
              </div>
            ))}
          </div>
          <p className="mt-6 text-center">
            <Link href="/partners/apply" className="inline-block rounded-lg bg-wa-500 px-8 py-3 text-base font-bold text-white shadow-card transition hover:bg-wa-600">
              قدّم طلب الانضمام الآن
            </Link>
          </p>
        </section>
      )}

      <footer className="border-t border-slate-200 px-4 py-6 text-center text-xs text-slate-400 dark:border-white/10">
        © DMS — Digital Messaging System
      </footer>
    </div>
  );
}
