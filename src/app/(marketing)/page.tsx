import type { Metadata } from "next";
import Link from "next/link";
import { Reveal } from "@/components/marketing/Reveal";
import { ProductPreview } from "@/components/marketing/ProductPreview";
import { ChannelsToolsSection } from "@/components/marketing/ChannelsToolsSection";
import { SolutionsSection } from "@/components/marketing/SolutionsSection";
import { LogoMarquee } from "@/components/marketing/LogoMarquee";
import { CampaignIcon, ChatbotIcon, CrmIcon, IntegrationIcon } from "@/components/marketing/ServiceIcons";
import { getPublicPlans } from "@/app/partners/apply/actions";
import { PricingClient } from "@/app/(marketing)/pricing/PricingClient";
import { getSiteContent } from "@/lib/siteContent";
import { getPlatformSettings } from "@/lib/platformSettings";
import { ChatWidget } from "@/components/marketing/ChatWidget";

// الباقات حقيقية وقابلة للتعديل من لوحة مالك المنصة — يجب أن تُقرأ حياً وليس وقت البناء (نفس السبب
// الموثَّق في partners/apply و partners/join). محتوى الصفحة نفسه أصبح أيضاً قابلاً للتعديل حياً من
// admin/content (SiteContent)، لنفس السبب.
export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "DMS — منصة CRM لإدارة عملائك عبر واتساب",
  description: "منصة عربية متكاملة لإدارة محادثات عملائك عبر واتساب: حملات، شات بوت ذكي، CRM موحّد، وربط رسمي مع WhatsApp Business Platform.",
};

// الأيقونات ثابتة بالكود بترتيبها (غير قابلة للتعديل من لوحة المحتوى) — العنوان/الوصف فقط قابلان للتعديل.
const FEATURE_ICONS = [CampaignIcon, ChatbotIcon, CrmIcon, IntegrationIcon];

export default async function HomePage() {
  const [plans, content, settings] = await Promise.all([getPublicPlans(), getSiteContent(), getPlatformSettings()]);

  return (
    <div>
      {/* مقصورة على الصفحة الرئيسية فقط (وليس كل صفحات الموقع التسويقي عبر MarketingLayout) — قرار
          صريح: يظهر فقط في الواجهة اللي بيتعرض فيها الخدمات، وليس في about/terms/privacy إلخ. */}
      <ChatWidget enabled={settings.platformChatEnabled} />
      {/* Hero — أعلى الصفحة مباشرة (above the fold)، لذلك بلا أي انيميشن Reveal مبني على التمرير:
          المحتوى مرئي فوراً منذ أول رسم بدل أي وميض ظهور مؤجَّل يضر بأول انطباع وبسرعة العرض المُدرَكة. */}
      <section className="mx-auto max-w-6xl px-4 py-16 sm:py-24">
        <div className="grid grid-cols-1 items-center gap-10 lg:grid-cols-2">
          <div>
            <h1 className="text-3xl font-extrabold leading-tight text-slate-900 sm:text-4xl lg:text-5xl dark:text-white">
              {content.heroHeadline}
            </h1>
            <p className="mt-5 text-lg text-slate-600 dark:text-slate-300">{content.heroSubheadline}</p>
            <div className="mt-8 flex flex-col gap-3 sm:flex-row">
              <Link href="/partners/join" className="rounded-lg bg-wa-500 px-6 py-3 text-center text-base font-bold text-white shadow-card transition hover:bg-wa-600">
                {content.heroCtaPrimary}
              </Link>
              <Link href="/services" className="rounded-lg border border-slate-300 px-6 py-3 text-center text-base font-semibold text-slate-700 transition hover:bg-slate-50 dark:border-white/15 dark:text-slate-200 dark:hover:bg-white/5">
                {content.heroCtaSecondary}
              </Link>
            </div>
          </div>
          <ProductPreview />
        </div>
      </section>

      {/* Features */}
      <section className="border-y border-slate-100 bg-slate-50/60 py-16 dark:border-white/5 dark:bg-white/[0.02]">
        <div className="mx-auto max-w-6xl px-4">
          <Reveal>
            <h2 className="text-center text-2xl font-bold text-slate-900 sm:text-3xl dark:text-white">{content.featuresHeading}</h2>
          </Reveal>
          <div className="mt-10 grid grid-cols-2 gap-3 sm:gap-5 lg:grid-cols-4">
            {content.features.map((f, i) => {
              const Icon = FEATURE_ICONS[i % FEATURE_ICONS.length]!;
              const wide = i === content.features.length - 1 && content.features.length % 2 === 1;
              return (
                <Reveal key={f.title} delay={i * 100} className={wide ? "col-span-2" : ""}>
                  <div className="h-full rounded-2xl border border-slate-200 bg-white p-3.5 shadow-card transition hover:-translate-y-1 hover:shadow-lg sm:p-6 dark:border-white/10 dark:bg-slate-900">
                    <div className="mb-2.5 flex h-10 w-10 items-center justify-center rounded-xl bg-wa-50 text-wa-600 sm:mb-3 sm:h-12 sm:w-12 dark:bg-wa-500/10 dark:text-wa-400">
                      <Icon className="h-5 w-5 sm:h-6 sm:w-6" />
                    </div>
                    <h3 className="mb-1 text-sm font-semibold text-slate-900 sm:mb-1.5 sm:text-base dark:text-white">{f.title}</h3>
                    <p className="text-xs text-slate-500 sm:text-sm dark:text-slate-400">{f.body}</p>
                  </div>
                </Reveal>
              );
            })}
          </div>
        </div>
      </section>

      <ChannelsToolsSection />

      <SolutionsSection />

      {/* Stats */}
      <section className="py-16">
        <div className="mx-auto max-w-6xl px-4">
          <div className="grid grid-cols-3 gap-4 divide-x divide-x-reverse divide-slate-100 sm:gap-6 dark:divide-white/10">
            {content.stats.map((s, i) => (
              <Reveal key={s.label} delay={i * 100}>
                <div className="text-center">
                  <p className="text-2xl font-extrabold text-wa-600 sm:text-4xl dark:text-wa-400">{s.value}</p>
                  <p className="mt-1 text-xs text-slate-500 sm:text-sm dark:text-slate-400">{s.label}</p>
                </div>
              </Reveal>
            ))}
          </div>
        </div>
      </section>

      {/* Testimonials */}
      <section className="border-y border-slate-100 bg-slate-50/60 py-16 dark:border-white/5 dark:bg-white/[0.02]">
        <div className="mx-auto max-w-6xl px-4">
          <Reveal>
            <h2 className="text-center text-2xl font-bold text-slate-900 sm:text-3xl dark:text-white">{content.testimonialsHeading}</h2>
          </Reveal>
          <div className="mt-10 grid grid-cols-3 gap-2.5 sm:gap-5">
            {content.testimonials.map((t, i) => (
              <Reveal key={t.name} delay={i * 100}>
                <div className="h-full rounded-2xl border border-slate-200 bg-white p-3 shadow-card sm:p-6 dark:border-white/10 dark:bg-slate-900">
                  <p className="mb-2.5 text-[11px] leading-relaxed text-slate-600 sm:mb-4 sm:text-sm dark:text-slate-300">"{t.quote}"</p>
                  <p className="text-xs font-semibold text-slate-900 sm:text-sm dark:text-white">{t.name}</p>
                  <p className="text-[10px] text-slate-400 sm:text-xs">{t.role}</p>
                </div>
              </Reveal>
            ))}
          </div>
        </div>
      </section>

      {/* Pricing — نفس المكوّن ونفس بيانات الباقات الحقيقية المستخدمة في صفحة /pricing الكاملة،
          معروضة هنا أيضاً حتى لا يضطر الزائر لمغادرة الرئيسية ليرى الأسعار. */}
      <section className="py-16">
        <div className="mx-auto max-w-6xl px-4">
          <Reveal className="mx-auto max-w-2xl text-center">
            <h2 className="text-2xl font-bold text-slate-900 sm:text-3xl dark:text-white">باقات تناسب كل حجم نشاط</h2>
            <p className="mt-3 text-slate-500 dark:text-slate-400">أسعار شفافة بلا رسوم مخفية — ابدأ بتجربة مجانية بلا بطاقة ائتمانية.</p>
          </Reveal>

          {plans.length > 0 && <PricingClient plans={plans} />}

          <Reveal className="mt-8 text-center">
            <Link href="/pricing" className="text-sm font-semibold text-wa-600 hover:underline dark:text-wa-400">
              قارن كل تفاصيل الباقات والأسئلة الشائعة ←
            </Link>
          </Reveal>
        </div>
      </section>

      {/* عملاء مميزون — قابل للتعديل من admin/content (SiteContent.clientLogos)، راجع DECISIONS.md */}
      <section className="border-y border-slate-100 bg-slate-50/60 py-14 dark:border-white/5 dark:bg-white/[0.02]">
        <Reveal className="mx-auto max-w-6xl px-4 text-center">
          <h2 className="text-xl font-bold text-slate-900 sm:text-2xl dark:text-white">{content.clientsHeading}</h2>
          <p className="mt-2 text-sm text-slate-500 dark:text-slate-400">{content.clientsSubtext}</p>
        </Reveal>
        <div className="mt-8">
          <LogoMarquee clients={content.clientLogos} />
        </div>
      </section>

      {/* تواصل معنا — بنر دعوة يوجّه لصفحة /contact الكاملة (المطوَّرة بأدوات إضافية: نوع
          الاستفسار، نسخ سريع لبيانات التواصل، أسئلة شائعة) بدل تكرار النموذج كاملاً هنا. */}
      <section className="py-16">
        <Reveal className="mx-auto max-w-5xl px-4">
          <div className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-navy-950 via-navy-900 to-wa-600/40 p-10 text-center sm:p-16">
            <div className="pointer-events-none absolute -left-20 -top-20 h-64 w-64 rounded-full bg-wa-500/20 blur-3xl" />
            <div className="pointer-events-none absolute -bottom-20 -right-20 h-64 w-64 rounded-full bg-wa-500/10 blur-3xl" />
            <div className="relative z-10">
              <h2 className="text-2xl font-bold text-white sm:text-3xl">{content.contactHeading}</h2>
              <p className="mx-auto mt-3 max-w-xl text-slate-300">{content.contactBody}</p>
              <Link
                href="/contact"
                className="mt-6 inline-block rounded-lg bg-wa-500 px-8 py-3 text-base font-bold text-white shadow-card transition hover:bg-wa-600"
              >
                {content.contactCtaLabel}
              </Link>
            </div>
          </div>
        </Reveal>
      </section>
    </div>
  );
}
