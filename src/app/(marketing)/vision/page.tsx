import type { Metadata } from "next";
import { Reveal } from "@/components/marketing/Reveal";

export const metadata: Metadata = {
  title: "رؤيتنا ومنهجيتنا — DMS",
  description: "رؤية DMS لمستقبل أتمتة التواصل التجاري عبر واتساب، ومنهجيتنا في مرافقة كل تاجر من التسجيل حتى النتائج القابلة للقياس.",
};

const METHOD_STEPS = [
  { icon: "📝", title: "التسجيل", body: "قدّم طلب انضمامك عبر صفحة الشركاء، واختر الباقة المناسبة لحجم نشاطك." },
  { icon: "🔌", title: "ربط المتجر وواتساب", body: "اربط رقم واتساب بيزنس الرسمي، ومتجرك الإلكتروني إن وُجد (زد أو سلة)." },
  { icon: "🤖", title: "إعداد الشات بوت", body: "صمّم تدفق الرد الآلي الأول لأسئلتك المتكررة، واختبره قبل النشر." },
  { icon: "📣", title: "إطلاق الحملات", body: "أرسل أول حملة مستهدفة لعملائك، أو فعّل حملة آلية لاسترداد السلة المتروكة." },
  { icon: "📊", title: "نتائج قابلة للقياس", body: "تابع معدلات الرد والتحويل والمبيعات الناتجة من كل حملة وتدفق بوت، وحسّن باستمرار." },
];

export default function VisionPage() {
  return (
    <div className="mx-auto max-w-4xl px-4 py-16">
      <h1 className="text-3xl font-extrabold text-slate-900 sm:text-4xl dark:text-white">رؤيتنا ومنهجيتنا</h1>

      <div className="mt-8">
        <h2 className="text-xl font-bold text-wa-600 dark:text-wa-400">رؤيتنا</h2>
        <p className="mt-3 leading-relaxed text-slate-600 dark:text-slate-300">
          نؤمن أن واتساب سيبقى القناة الأولى للتواصل التجاري في منطقتنا لسنوات قادمة، وأن الفارق
          الحقيقي بين الأنشطة التجارية لن يكون في وجودها على واتساب، بل في مدى تنظيم وأتمتة هذا
          التواصل. رؤيتنا أن يصبح كل تاجر — من صاحب متجر صغير إلى سلسلة متاجر كبيرة — قادراً على إدارة
          آلاف المحادثات بنفس جودة الرد على أول عميل، عبر أتمتة ذكية لا تُفقد فيها اللمسة الإنسانية.
        </p>
      </div>

      <div className="mt-12">
        <h2 className="text-xl font-bold text-wa-600 dark:text-wa-400">منهجيتنا</h2>
        <p className="mt-3 leading-relaxed text-slate-600 dark:text-slate-300">
          نرافق كل تاجر عبر مسار واضح من أول يوم حتى تحقيق نتائج فعلية قابلة للقياس:
        </p>

        <div className="relative mt-10">
          <div className="absolute right-6 top-0 hidden h-full w-0.5 bg-slate-200 sm:block dark:bg-white/10" />
          <div className="space-y-8">
            {METHOD_STEPS.map((step, i) => (
              <Reveal key={step.title} delay={i * 100} className="relative flex items-start gap-5">
                <div className="relative z-10 flex h-12 w-12 flex-shrink-0 items-center justify-center rounded-full bg-wa-500 text-xl text-white shadow-card">
                  {step.icon}
                </div>
                <div className="pt-1">
                  <h3 className="font-semibold text-slate-900 dark:text-white">
                    {i + 1}. {step.title}
                  </h3>
                  <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">{step.body}</p>
                </div>
              </Reveal>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
