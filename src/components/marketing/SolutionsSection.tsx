import { Reveal } from "@/components/marketing/Reveal";
import {
  GraduationCapIcon, BuildingIcon, PlaneIcon, HeartPulseIcon, ShoppingCartIcon, CoffeeCupIcon,
  TrendUpIcon, TargetIcon, HeadsetIcon,
} from "@/components/marketing/ServiceIcons";

const INDUSTRIES = [
  { icon: GraduationCapIcon, title: "التعليم", body: "تواصل مع الطلاب وأولياء الأمور عبر واتساب" },
  { icon: BuildingIcon, title: "العقارات", body: "أرسل تفاصيل العقارات ونظّم مواعيد المعاينة" },
  { icon: PlaneIcon, title: "السفر والضيافة", body: "حوّل الاستفسارات إلى حجوزات مؤكدة" },
  { icon: HeartPulseIcon, title: "الرعاية الصحية", body: "ذكّر المرضى بالمواعيد ونظّم المتابعات" },
  { icon: ShoppingCartIcon, title: "التجزئة والتجارة الإلكترونية", body: "استرجع السلال المتروكة وزد المبيعات" },
  { icon: CoffeeCupIcon, title: "الأطعمة والمشروبات", body: "استقبل الطلبات والحجوزات عبر واتساب" },
];

const TEAMS = [
  { icon: TrendUpIcon, title: "المبيعات", body: "أغلق صفقات أكثر عبر محادثات منظّمة" },
  { icon: TargetIcon, title: "التسويق", body: "نفّذ حملاتك بشرائح عملاء دقيقة" },
  { icon: HeadsetIcon, title: "الدعم الفني", body: "ردّ أسرع على استفسارات العملاء عبر قناة واحدة" },
];

function Card({ icon: Icon, title, body }: { icon: (p: { className?: string }) => React.ReactNode; title: string; body: string }) {
  return (
    <div className="flex items-start gap-2.5 rounded-xl border border-slate-200 bg-white p-3 transition hover:-translate-y-0.5 hover:shadow-card sm:gap-3 sm:p-4 dark:border-white/10 dark:bg-slate-900">
      <div className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-lg bg-wa-50 text-wa-600 sm:h-10 sm:w-10 dark:bg-wa-500/10 dark:text-wa-400">
        <Icon className="h-4 w-4 sm:h-5 sm:w-5" />
      </div>
      <div className="min-w-0">
        <p className="text-xs font-semibold text-slate-900 sm:text-sm dark:text-white">{title}</p>
        <p className="mt-0.5 text-[11px] leading-relaxed text-slate-500 sm:text-xs dark:text-slate-400">{body}</p>
      </div>
    </div>
  );
}

export function SolutionsSection() {
  return (
    <section className="border-y border-slate-100 bg-slate-50/60 py-16 dark:border-white/5 dark:bg-white/[0.02]">
      <div className="mx-auto max-w-6xl px-4">
        <Reveal className="mx-auto max-w-2xl text-center">
          <h2 className="text-2xl font-bold text-slate-900 sm:text-3xl dark:text-white">حلول تناسب نشاطك وفريقك</h2>
          <p className="mt-3 text-slate-500 dark:text-slate-400">منصة واحدة تتكيّف مع طبيعة عملك، أياً كان قطاعك أو حجم فريقك.</p>
        </Reveal>

        <div className="mt-10 grid grid-cols-1 gap-8 lg:grid-cols-[1.7fr_1fr]">
          <Reveal>
            <h3 className="mb-4 text-sm font-bold uppercase tracking-wide text-wa-600 dark:text-wa-400">حسب القطاع</h3>
            <div className="grid grid-cols-2 gap-2.5 sm:gap-3">
              {INDUSTRIES.map((i) => <Card key={i.title} {...i} />)}
            </div>
          </Reveal>
          <Reveal delay={100}>
            <h3 className="mb-4 text-sm font-bold uppercase tracking-wide text-wa-600 dark:text-wa-400">حسب الفريق</h3>
            <div className="grid grid-cols-1 gap-3">
              {TEAMS.map((t) => <Card key={t.title} {...t} />)}
            </div>
          </Reveal>
        </div>
      </div>
    </section>
  );
}
