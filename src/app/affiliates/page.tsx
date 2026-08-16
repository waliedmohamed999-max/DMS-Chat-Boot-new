import Link from "next/link";
import { LogoFull } from "@/components/Logo";
import { Reveal } from "@/components/marketing/Reveal";
import { TIER_RATE_PERCENT, TIER_LABELS_AR, TIER_THRESHOLDS } from "@/lib/affiliates/tiers";

export const metadata = {
  title: "برنامج التسويق بالعمولة — DMS",
  description: "اربح عمولة متكررة حقيقية عن كل تاجر تُحيله لمنصة DMS، لمدة 12 شهراً كاملة.",
};

const TIER_ORDER = ["STARTER", "GROWTH", "ELITE"] as const;

const STATS = [
  { icon: "📈", value: "30%", label: "الحد الأقصى للعمولة" },
  { icon: "⏱️", value: "12 شهر", label: "مدة العمولة لكل عميل" },
  { icon: "💳", value: "Net 30", label: "المدفوعات" },
  { icon: "🍪", value: "90 يوم", label: "نافذة تتبّع الإحالة" },
];

const STEPS = [
  { n: "01", title: "قدّم طلبك واحصل على الموافقة", body: "أرسل طلب انضمام قصير. بعد الموافقة، تحصل على رابط إحالة خاص بك ولوحة تحكم كاملة." },
  { n: "02", title: "شارك رابطك مع جمهورك", body: "روّج لمنصة DMS لأي نشاط تجاري يتواصل مع عملائه عبر واتساب — كوكيز التتبّع تعمل لمدة 90 يوماً." },
  { n: "03", title: "اربح عمولة على كل دفعة", body: "عندما يتحول رابطك لعميل مدفوع، تربح عمولة على كل دفعة يسدّدها طوال 12 شهراً — وليس على الدفعة الأولى فقط." },
];

const SUITABLE_FOR = [
  "صنّاع المحتوى والمراجعات التقنية في أدوات الأعمال وخدمة العملاء",
  "الوكالات والمستشارون الذين يتعاملون مباشرة مع تجّار يديرون واتساب بزنس",
  "قادة المجتمعات والمجموعات المهتمة بالتجارة الإلكترونية والتقنية",
];

const CONSIDERATIONS = [
  "يجب أن يكون الترويج صادقاً وموجّهاً لجمهور سيستفيد فعلياً من المنصة",
  "الإحالة الذاتية (تسجيل حسابك الخاص عبر رابطك) غير مؤهّلة للعمولة",
  "العمولة تُحتسب فقط على فواتير مدفوعة فعلياً، وتُعكَس تلقائياً عند أي استرداد",
];

const FAQ = [
  { q: "متى تتم ترقية نسبتي للمستوى التالي؟", a: `فور وصولك لعدد العملاء المدفوعين المطلوب للمستوى التالي، تُرفع نسبتك تلقائياً على جميع العمولات الجديدة من تلك اللحظة — دون الحاجة لأي طلب من جانبك. مستواك لا يُخفَّض تلقائياً أبداً.` },
  { q: "هل تُحتسب دفعات تجديد الاشتراك ضمن عمولتي؟", a: "نعم — أي فاتورة مدفوعة فعلياً لعميل أحلته خلال أول 12 شهراً من تسجيله، بما فيها التجديدات الشهرية، تُنتج عمولة." },
  { q: "متى أستلم أرباحي؟", a: `العمولة تدخل حالة "قيد الانتظار" فور دفع العميل فاتورته، ثم تصبح "معتمدة" وجاهزة للصرف بعد 30 يوماً (Net 30) — لضمان استقرار الدفعة الأصلية وعدم استردادها. الحد الأدنى للصرف 375 ر.س.` },
  { q: "ماذا يحدث إذا ألغى العميل المُحال اشتراكه أو استرجع مدفوعاته؟", a: "أي عمولة مرتبطة بفاتورة مستردة تُعكَس تلقائياً ولا تُصرف. عمولاتك عن الفترة التي بقي فيها العميل مشتركاً فعلياً تبقى كما هي." },
  { q: "إلى متى يبقى رابط التتبّع فعّالاً بعد النقرة الأولى؟", a: "90 يوماً من أول زيارة لرابطك على نفس المتصفح. لو سجّل العميل خلال هذه المدة، يُنسَب لك تلقائياً." },
  { q: "هل يُدار البرنامج من فريق حقيقي؟", a: "نعم — كل طلب انضمام يُراجَع يدوياً من فريق منصة DMS، وكل عمولة تُحسب آلياً من فواتيرك الحقيقية المدفوعة عبر لوحة تحكم مالك المنصة." },
];

export default function AffiliatesPage() {
  return (
    <div className="min-h-screen bg-white dark:bg-slate-950">
      <header className="border-b border-white/10 bg-navy-950 px-4 py-4">
        <div className="mx-auto flex max-w-5xl items-center justify-between">
          <LogoFull size="sm" light />
          <div className="flex items-center gap-4 text-sm">
            <Link href="/affiliates/login" className="text-slate-300 hover:text-white">
              دخول المسوّقين
            </Link>
            <Link href="/affiliates/apply" className="rounded-lg bg-wa-500 px-4 py-2 font-semibold text-white hover:bg-wa-600">
              قدّم للانضمام
            </Link>
          </div>
        </div>
      </header>

      {/* Hero */}
      <section className="relative overflow-hidden bg-gradient-to-br from-navy-950 via-navy-900 to-wa-700/30 px-4 py-20">
        <div className="pointer-events-none absolute -left-24 -top-24 h-72 w-72 rounded-full bg-wa-500/20 blur-3xl" />
        <div className="pointer-events-none absolute -bottom-24 -right-24 h-72 w-72 rounded-full bg-accent-500/10 blur-3xl" />
        <div className="relative mx-auto max-w-3xl text-center">
          <span className="inline-flex items-center gap-1.5 rounded-full bg-white/10 px-3 py-1 text-xs font-semibold text-wa-300">
            <span className="h-1.5 w-1.5 rounded-full bg-wa-400" /> برنامج التسويق بالعمولة
          </span>
          <h1 className="mt-5 text-3xl font-extrabold leading-tight text-white sm:text-5xl">
            اربح حتى <span className="text-wa-400">30%</span> عمولة متكررة
          </h1>
          <p className="mx-auto mt-5 max-w-xl text-lg text-slate-300">
            حَوِّل معرفتك بالأعمال التي تتواصل مع عملائها عبر واتساب إلى دخل حقيقي — عمولة على كل دفعة
            يسدّدها التاجر الذي أحلته، لمدة 12 شهراً كاملة.
          </p>
          <div className="mt-8">
            <Link href="/affiliates/apply" className="rounded-lg bg-wa-500 px-8 py-3 text-base font-bold text-white shadow-card transition hover:bg-wa-600">
              قدّم للانضمام الآن
            </Link>
          </div>
        </div>

        <div className="relative mx-auto mt-14 grid max-w-3xl grid-cols-2 gap-4 sm:grid-cols-4">
          {STATS.map((s) => (
            <div key={s.label} className="rounded-2xl border border-white/10 bg-white/5 p-4 text-center backdrop-blur">
              <div className="text-xl">{s.icon}</div>
              <p className="mt-2 text-xl font-bold text-white">{s.value}</p>
              <p className="mt-0.5 text-xs text-slate-400">{s.label}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Tiers */}
      <section className="px-4 py-16">
        <div className="mx-auto max-w-5xl">
          <Reveal className="mx-auto max-w-2xl text-center">
            <h2 className="text-2xl font-bold text-slate-900 sm:text-3xl dark:text-white">ثلاثة مستويات. كلما زاد حجم إحالاتك، ارتفعت نسبتك.</h2>
            <p className="mt-3 text-slate-500 dark:text-slate-400">
              تبدأ بنسبة 20% وترتفع تلقائياً كلما زاد عدد عملائك المدفوعين — بلا أي طلب ترقية.
            </p>
          </Reveal>

          <div className="mt-10 grid grid-cols-1 gap-6 sm:grid-cols-3">
            {TIER_ORDER.map((tier, i) => {
              const range = TIER_THRESHOLDS[tier];
              const featured = tier === "GROWTH";
              return (
                <Reveal key={tier} delay={i * 100}>
                  <div
                    className={`relative flex h-full flex-col rounded-2xl border p-6 text-center ${
                      featured ? "border-wa-500 shadow-lg ring-2 ring-wa-500/30" : "border-slate-200 dark:border-white/10"
                    }`}
                  >
                    {featured && (
                      <span className="absolute -top-3 left-1/2 -translate-x-1/2 rounded-full bg-wa-500 px-3 py-1 text-xs font-bold text-white">
                        الأكثر شيوعاً
                      </span>
                    )}
                    <p className="text-sm text-slate-400">{TIER_LABELS_AR[tier]}</p>
                    <p className="mt-2 text-4xl font-extrabold text-slate-900 dark:text-white">{TIER_RATE_PERCENT[tier]}%</p>
                    <p className="text-xs text-slate-400">من كل دفعة</p>
                    <div className="mt-5 space-y-2 border-t border-slate-100 pt-4 text-sm text-slate-500 dark:border-white/10 dark:text-slate-400">
                      <p>12 شهراً لكل عميل</p>
                      <p>
                        {range.max ? `من ${range.min} إلى ${range.max} عميلاً محالاً` : `${range.min} عميلاً محالاً فأكثر`}
                      </p>
                    </div>
                  </div>
                </Reveal>
              );
            })}
          </div>

          <Reveal className="mt-6 rounded-xl border border-slate-200 bg-slate-50 p-4 text-center text-sm text-slate-500 dark:border-white/10 dark:bg-white/5 dark:text-slate-400">
            ترتفع نسبتك تلقائياً فور وصولك لعدد العملاء المطلوب — تُطبَّق على كل عمولة جديدة من تلك اللحظة، ولا تُخفَّض تلقائياً أبداً.
          </Reveal>
        </div>
      </section>

      {/* Payout details */}
      <section className="border-y border-slate-100 bg-slate-50/60 px-4 py-16 dark:border-white/5 dark:bg-white/[0.02]">
        <div className="mx-auto max-w-5xl">
          <Reveal className="mx-auto max-w-2xl text-center">
            <h2 className="text-2xl font-bold text-slate-900 sm:text-3xl dark:text-white">اعرف بدقة متى وكيف تستلم أرباحك</h2>
          </Reveal>
          <div className="mt-10 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {[
              { label: "مدة التتبّع", value: "90 يوماً", body: "يُنسَب العميل لك لمدة 90 يوماً من أول نقرة على رابطك." },
              { label: "مواعيد الدفع", value: "Net 30", body: "تُعتمَد العمولة للصرف بعد 30 يوماً من تأكيد الدفعة." },
              { label: "الحد الأدنى للصرف", value: "375 ر.س", body: "تتراكم العمولات المعتمدة حتى تصل رصيدك إلى 375 ر.س." },
              { label: "طريقة الدفع", value: "حسب اختيارك", body: "تحويل بنكي أو محفظة إلكترونية، وفق الخيارات المتاحة." },
            ].map((c) => (
              <Reveal key={c.label}>
                <div className="h-full rounded-xl border border-slate-200 bg-white p-5 dark:border-white/10 dark:bg-slate-900">
                  <p className="text-xs text-slate-400">{c.label}</p>
                  <p className="mt-1 text-2xl font-bold text-slate-900 dark:text-white">{c.value}</p>
                  <p className="mt-2 text-xs leading-relaxed text-slate-500 dark:text-slate-400">{c.body}</p>
                </div>
              </Reveal>
            ))}
          </div>
        </div>
      </section>

      {/* How it works */}
      <section className="px-4 py-16">
        <div className="mx-auto max-w-4xl">
          <Reveal className="mx-auto max-w-2xl text-center">
            <h2 className="text-2xl font-bold text-slate-900 sm:text-3xl dark:text-white">ثلاث خطوات نحو أول عمولة لك</h2>
          </Reveal>
          <div className="mt-10 grid grid-cols-1 gap-8 sm:grid-cols-3">
            {STEPS.map((s, i) => (
              <Reveal key={s.n} delay={i * 100}>
                <div className="flex h-8 w-8 items-center justify-center rounded-full bg-wa-500 text-xs font-bold text-white">{s.n}</div>
                <h3 className="mt-4 font-bold text-slate-900 dark:text-white">{s.title}</h3>
                <p className="mt-2 text-sm leading-relaxed text-slate-500 dark:text-slate-400">{s.body}</p>
              </Reveal>
            ))}
          </div>
          <Reveal className="mt-10 text-center">
            <Link href="/affiliates/apply" className="rounded-lg bg-wa-500 px-8 py-3 text-base font-bold text-white shadow-card transition hover:bg-wa-600">
              انضم إلى البرنامج
            </Link>
          </Reveal>
        </div>
      </section>

      {/* Who is this for */}
      <section className="border-y border-slate-100 bg-slate-50/60 px-4 py-16 dark:border-white/5 dark:bg-white/[0.02]">
        <div className="mx-auto max-w-4xl">
          <Reveal className="mx-auto max-w-2xl text-center">
            <h2 className="text-2xl font-bold text-slate-900 sm:text-3xl dark:text-white">مصمَّم لكل من يتحدث لغة عملاء واتساب</h2>
            <p className="mt-3 text-slate-500 dark:text-slate-400">يناسب البرنامج كل من يمتلك علاقة أو جمهوراً حقيقياً مع أصحاب أعمال يعتمدون على واتساب للتواصل.</p>
          </Reveal>

          <div className="mt-10 grid grid-cols-1 gap-6 sm:grid-cols-2">
            <Reveal>
              <div className="h-full rounded-xl border border-slate-200 bg-white p-5 dark:border-white/10 dark:bg-slate-900">
                <p className="mb-3 text-sm font-bold text-wa-600 dark:text-wa-400">مناسب تماماً لـ</p>
                <ul className="space-y-2.5 text-sm text-slate-600 dark:text-slate-300">
                  {SUITABLE_FOR.map((t) => (
                    <li key={t} className="flex items-start gap-2"><span className="mt-0.5 text-wa-500">✓</span>{t}</li>
                  ))}
                </ul>
              </div>
            </Reveal>
            <Reveal delay={100}>
              <div className="h-full rounded-xl border border-slate-200 bg-white p-5 dark:border-white/10 dark:bg-slate-900">
                <p className="mb-3 text-sm font-bold text-warning-500">نقاط ينبغي مراعاتها</p>
                <ul className="space-y-2.5 text-sm text-slate-600 dark:text-slate-300">
                  {CONSIDERATIONS.map((t) => (
                    <li key={t} className="flex items-start gap-2"><span className="mt-0.5 text-warning-500">•</span>{t}</li>
                  ))}
                </ul>
              </div>
            </Reveal>
          </div>
        </div>
      </section>

      {/* FAQ */}
      <section className="px-4 py-16">
        <div className="mx-auto max-w-3xl">
          <Reveal className="mx-auto max-w-2xl text-center">
            <h2 className="text-2xl font-bold text-slate-900 sm:text-3xl dark:text-white">أسئلتك وإجاباتها</h2>
          </Reveal>
          <div className="mt-10 space-y-3">
            {FAQ.map((f) => (
              <Reveal key={f.q}>
                <details className="group rounded-xl border border-slate-200 bg-white p-4 dark:border-white/10 dark:bg-slate-900">
                  <summary className="flex cursor-pointer list-none items-center justify-between text-sm font-semibold text-slate-900 dark:text-white">
                    {f.q}
                    <span className="text-slate-400 transition group-open:rotate-45">+</span>
                  </summary>
                  <p className="mt-3 text-sm leading-relaxed text-slate-500 dark:text-slate-400">{f.a}</p>
                </details>
              </Reveal>
            ))}
          </div>
        </div>
      </section>

      {/* Bottom CTA */}
      <section className="px-4 pb-20">
        <Reveal className="mx-auto max-w-4xl">
          <div className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-navy-950 via-navy-900 to-wa-600/40 p-10 text-center sm:p-14">
            <div className="pointer-events-none absolute -left-20 -top-20 h-64 w-64 rounded-full bg-wa-500/20 blur-3xl" />
            <div className="relative z-10">
              <h2 className="text-2xl font-bold text-white sm:text-3xl">جاهز تبدأ تربح؟</h2>
              <p className="mx-auto mt-3 max-w-xl text-slate-300">التقديم مجاني ويستغرق دقائق — راجعة الطلبات خلال أيام عمل قليلة.</p>
              <Link href="/affiliates/apply" className="mt-6 inline-block rounded-lg bg-wa-500 px-8 py-3 text-base font-bold text-white shadow-card transition hover:bg-wa-600">
                قدّم للانضمام الآن
              </Link>
            </div>
          </div>
        </Reveal>
      </section>

      <footer className="border-t border-slate-100 px-4 py-8 text-center text-xs text-slate-400 dark:border-white/10">
        <Link href="/" className="hover:underline">DMS — Digital Messaging System</Link> © {new Date().getFullYear()}
      </footer>
    </div>
  );
}
