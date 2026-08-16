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

      <div className="mt-14 grid grid-cols-2 gap-4 sm:gap-6">
        {SERVICES.map((s, i) => {
          const wide = i === SERVICES.length - 1 && SERVICES.length % 2 === 1;
          return (
            <Reveal key={s.title} delay={i * 60} className={wide ? "col-span-2" : ""}>
              <div className="flex h-full flex-col rounded-2xl border border-slate-200 bg-white p-4 shadow-card sm:rounded-3xl sm:p-8 dark:border-white/10 dark:bg-slate-900">
                <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-wa-50 text-wa-600 sm:h-16 sm:w-16 sm:rounded-2xl dark:bg-wa-500/10 dark:text-wa-400">
                  <s.Icon className="h-5 w-5 sm:h-8 sm:w-8" />
                </div>
                <h2 className="mt-3 text-sm font-bold text-slate-900 sm:mt-4 sm:text-xl dark:text-white">{s.title}</h2>
                <p className="mt-1.5 text-xs leading-relaxed text-slate-600 sm:mt-2 sm:text-sm dark:text-slate-300">{s.body}</p>
                <ul className={`mt-3 grid grid-cols-1 gap-1.5 sm:mt-4 sm:gap-2 ${wide ? "sm:grid-cols-2" : ""}`}>
                  {s.points.map((p) => (
                    <li key={p} className="flex items-start gap-1.5 text-[11px] text-slate-500 sm:gap-2 sm:text-sm dark:text-slate-400">
                      <span className="mt-0.5 text-wa-500">✓</span>
                      {p}
                    </li>
                  ))}
                </ul>
              </div>
            </Reveal>
          );
        })}
      </div>

      <Reveal className="mt-16 text-center">
        <Link href="/partners/join" className="inline-block rounded-lg bg-wa-500 px-8 py-3 text-base font-bold text-white shadow-card transition hover:bg-wa-600">
          ابدأ الآن كشريك
        </Link>
      </Reveal>
    </div>
  );
}
