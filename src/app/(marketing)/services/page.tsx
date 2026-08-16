import type { Metadata } from "next";
import Link from "next/link";
import { Reveal } from "@/components/marketing/Reveal";
import { CampaignIcon, ChatbotIcon, CrmIcon, IntegrationIcon, VerifiedBadgeIcon } from "@/components/marketing/ServiceIcons";
import { getSiteContent } from "@/lib/siteContent";

export const metadata: Metadata = {
  title: "الخدمات — DMS",
  description: "الحملات الإعلانية، الشات بوت الذكي، CRM موحّد، تكامل المتاجر، والربط الرسمي مع واتساب — كل خدمات منصة DMS بالتفصيل.",
};

// الأيقونات ثابتة بالكود بترتيبها (لا تُعدَّل من الـCMS، نفس قرار "features" في الصفحة الرئيسية) —
// النصوص فقط (title/body/points) تأتي من SiteContent.servicesItems بنفس الترتيب.
const SERVICE_ICONS = [CampaignIcon, ChatbotIcon, CrmIcon, IntegrationIcon, VerifiedBadgeIcon];

export default async function ServicesPage() {
  const content = await getSiteContent();
  const SERVICES = content.servicesItems.map((item, i) => ({ ...item, Icon: SERVICE_ICONS[i % SERVICE_ICONS.length]! }));

  return (
    <div className="mx-auto max-w-6xl px-4 py-16">
      <div className="mx-auto max-w-2xl text-center">
        <h1 className="text-3xl font-extrabold text-slate-900 sm:text-4xl dark:text-white">{content.servicesHeading}</h1>
        <p className="mt-4 text-lg text-slate-500 dark:text-slate-400">{content.servicesSubheading}</p>
      </div>

      <div className="mt-14 space-y-10">
        {SERVICES.map((s, i) => (
          <Reveal key={s.title} delay={i * 60}>
            <div className={`grid grid-cols-1 items-center gap-8 rounded-3xl border border-slate-200 bg-white p-8 shadow-card lg:grid-cols-3 dark:border-white/10 dark:bg-slate-900`}>
              <div className="flex justify-center lg:col-span-1">
                <div className="flex h-24 w-24 items-center justify-center rounded-3xl bg-wa-50 text-wa-600 dark:bg-wa-500/10 dark:text-wa-400">
                  <s.Icon className="h-11 w-11" />
                </div>
              </div>
              <div className="lg:col-span-2">
                <h2 className="text-xl font-bold text-slate-900 dark:text-white">{s.title}</h2>
                <p className="mt-2 text-sm leading-relaxed text-slate-600 dark:text-slate-300">{s.body}</p>
                <ul className="mt-4 grid grid-cols-1 gap-2 sm:grid-cols-2">
                  {s.points.map((p) => (
                    <li key={p} className="flex items-start gap-2 text-sm text-slate-500 dark:text-slate-400">
                      <span className="mt-0.5 text-wa-500">✓</span>
                      {p}
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          </Reveal>
        ))}
      </div>

      <Reveal className="mt-16 text-center">
        <Link href="/partners/join" className="inline-block rounded-lg bg-wa-500 px-8 py-3 text-base font-bold text-white shadow-card transition hover:bg-wa-600">
          ابدأ الآن كشريك
        </Link>
      </Reveal>
    </div>
  );
}
