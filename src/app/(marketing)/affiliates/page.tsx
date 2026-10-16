import Link from "next/link";
import "./affiliates.css";
import { ArrowLeft, BadgeCheck, Clock3, CreditCard, Link2, TrendingUp, Users } from "lucide-react";
import { Reveal } from "@/components/marketing/Reveal";
import { TIER_RATE_PERCENT, TIER_LABELS_AR, TIER_THRESHOLDS } from "@/lib/affiliates/tiers";

export const metadata = {
  title: "برنامج التسويق بالعمولة — DMS Tech",
  description: "اربح عمولة متكررة حقيقية عن كل تاجر تُحيله لمنصة DMS Tech، لمدة 12 شهراً كاملة.",
};

const TIER_ORDER = ["STARTER", "GROWTH", "ELITE"] as const;

const STATS = [
  { icon: TrendingUp, value: "30%", label: "الحد الأقصى للعمولة" },
  { icon: Clock3, value: "12 شهر", label: "مدة العمولة لكل عميل" },
  { icon: CreditCard, value: "Net 30", label: "المدفوعات" },
  { icon: Link2, value: "90 يوم", label: "نافذة تتبّع الإحالة" },
];

const STEPS = [
  { n: "01", title: "قدّم طلبك واحصل على الموافقة", body: "أرسل طلب انضمام قصير. بعد الموافقة، تحصل على رابط إحالة خاص بك ولوحة تحكم كاملة." },
  { n: "02", title: "شارك رابطك مع جمهورك", body: "روّج لمنصة DMS Tech لأي نشاط تجاري يتواصل مع عملائه عبر واتساب — كوكيز التتبّع تعمل لمدة 90 يوماً." },
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
  { q: "هل يُدار البرنامج من فريق حقيقي؟", a: "نعم — كل طلب انضمام يُراجَع يدوياً من فريق منصة DMS Tech، وكل عمولة تُحسب آلياً من فواتيرك الحقيقية المدفوعة عبر لوحة تحكم مالك المنصة." },
];

export default function AffiliatesPage() {
  return (
    <div className="affiliate-page">
      <section className="affiliate-hero">
        <div className="affiliate-hero-grid">
          <div className="affiliate-hero-copy">
            <span className="affiliate-eyebrow"><Users size={16} aria-hidden="true" /> برنامج شركاء النجاح</span>
            <h1>رشّح منصة تثق بها.<br /><span>وابنِ دخلاً يتكرر.</span></h1>
            <p>ساعد الأعمال على تطوير تواصلها عبر واتساب، واربح حتى <strong>30% عمولة</strong> على كل دفعة يسدّدها العميل الذي أحلته، لمدة 12 شهراً كاملة.</p>
            <div className="affiliate-actions">
              <Link href="/affiliates/apply" className="affiliate-primary">قدّم للانضمام الآن <ArrowLeft size={18} aria-hidden="true" /></Link>
              <Link href="/affiliates/login" className="affiliate-secondary">دخول المسوّقين <ArrowLeft size={16} aria-hidden="true" /></Link>
            </div>
            <div className="affiliate-hero-note"><BadgeCheck size={17} aria-hidden="true" /> تقديم مجاني <span aria-hidden="true">·</span> رابط إحالة خاص <span aria-hidden="true">·</span> متابعة من لوحة واحدة</div>
          </div>
          <div className="affiliate-visual" role="img" aria-label="ثلاثة مستويات للعمولة، تبدأ من 20% وتصل إلى 30% لمدة 12 شهراً لكل عميل، وترتفع تلقائياً مع نمو إحالاتك">
            <div className="affiliate-visual-heading"><span className="affiliate-icon"><TrendingUp size={22} aria-hidden="true" /></span><div><strong>نجاحهم، فرصتك للنمو</strong><p>كل إحالة تفتح لك باباً جديداً</p></div></div>
            <div className="affiliate-commission"><span>عمولة متكررة تصل إلى</span><strong dir="ltr">30<span>%</span></strong><p>لمدة 12 شهراً لكل عميل</p></div>
            <div className="affiliate-growth" aria-hidden="true">{TIER_ORDER.map(tier => <div key={tier}><span>{TIER_RATE_PERCENT[tier]}%</span><i style={{ height: `${TIER_RATE_PERCENT[tier] * 3}px` }} /><small>{TIER_LABELS_AR[tier]}</small></div>)}</div>
            <div className="affiliate-visual-foot"><BadgeCheck size={17} aria-hidden="true" /> ترتفع نسبتك تلقائياً مع نمو إحالاتك</div>
          </div>
        </div>
        <div className="affiliate-stats">
          {STATS.map(({ icon: Icon, value, label }) => <div key={label}><span className="affiliate-icon"><Icon size={21} aria-hidden="true" /></span><div><strong>{value}</strong><p>{label}</p></div></div>)}
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
                    className={`affiliate-tier relative flex h-full flex-col rounded-2xl border p-6 text-center ${
                      featured ? "affiliate-tier-featured" : "border-slate-200 dark:border-white/10"
                    }`}
                  >
                    {featured && (
                      <span className="absolute -top-3 left-1/2 -translate-x-1/2 rounded-full bg-violet-600 px-3 py-1 text-xs font-bold text-white">
                        شريك نمو
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
                <div className="flex h-8 w-8 items-center justify-center rounded-full bg-violet-600 text-xs font-bold text-white">{s.n}</div>
                <h3 className="mt-4 font-bold text-slate-900 dark:text-white">{s.title}</h3>
                <p className="mt-2 text-sm leading-relaxed text-slate-500 dark:text-slate-400">{s.body}</p>
              </Reveal>
            ))}
          </div>
          <Reveal className="mt-10 text-center">
            <Link href="/affiliates/apply" className="rounded-lg bg-violet-600 px-8 py-3 text-base font-bold text-white shadow-card transition hover:bg-violet-700">
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
                <p className="mb-3 text-sm font-bold text-violet-600 dark:text-violet-400">مناسب تماماً لـ</p>
                <ul className="space-y-2.5 text-sm text-slate-600 dark:text-slate-300">
                  {SUITABLE_FOR.map((t) => (
                    <li key={t} className="flex items-start gap-2"><span className="mt-0.5 text-violet-500">✓</span>{t}</li>
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
          <div className="affiliate-bottom relative overflow-hidden rounded-3xl p-10 text-center sm:p-14">
            <div className="pointer-events-none absolute -left-20 -top-20 h-64 w-64 rounded-full bg-violet-600/20 blur-3xl" />
            <div className="relative z-10">
              <h2 className="text-2xl font-bold text-white sm:text-3xl">جاهز تبدأ تربح؟</h2>
              <p className="mx-auto mt-3 max-w-xl text-slate-300">التقديم مجاني ويستغرق دقائق — تُراجَع الطلبات خلال أيام عمل قليلة.</p>
              <Link href="/affiliates/apply" className="affiliate-primary mt-6">
                قدّم للانضمام الآن
              </Link>
            </div>
          </div>
        </Reveal>
      </section>

    </div>
  );
}
