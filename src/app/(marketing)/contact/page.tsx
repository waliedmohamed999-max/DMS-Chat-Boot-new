import type { Metadata } from "next";
import { getPlatformSettings } from "@/lib/platformSettings";
import { MailIcon, PhoneIcon, ClockIcon, CheckCircleIcon } from "@/components/marketing/ServiceIcons";
import { CopyButton } from "@/components/marketing/CopyButton";
import { ContactForm } from "./ContactForm";
import { COMPANY_CONTACT } from "@/lib/companyContact";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "تواصل معنا — DMS Tech",
  description: "تواصل مع فريق DMS Tech عبر النموذج أو واتساب أو البريد الإلكتروني — نرد خلال ساعات العمل.",
};

const TRUST_POINTS = [
  { icon: CheckCircleIcon, text: "دعم أداة DMS Chat Bot" },
  { icon: PhoneIcon, text: "تواصل مباشر عبر واتساب" },
  { icon: MailIcon, text: "بريد الشركة الرسمي" },
];

const FAQS = [
  { q: "كيف أتواصل مع فريق الدعم؟", a: "أرسل استفسارك عبر نموذج التواصل أو واتساب الشركة أو بريد info@dmstech.sa، وسيتابع فريق DMS Tech طلبك." },
  { q: "هل يمكنني التواصل عبر واتساب مباشرة؟", a: "نعم، استخدم زر واتساب العائم في أسفل الشاشة، أو رقم واتساب المذكور في هذه الصفحة إن كان متاحاً." },
  { q: "هل التواصل هنا مخصص للتجار الحاليين فقط؟", a: "لا، يمكن لأي زائر أو صاحب نشاط التواصل معنا سواء كان لديه حساب بالفعل أو يفكر في الانضمام." },
];

export default async function ContactPage() {
  const settings = await getPlatformSettings();

  return (
    <div className="mx-auto max-w-5xl px-4 py-16">
      <div className="mx-auto max-w-2xl text-center">
        <h1 className="text-3xl font-extrabold text-slate-900 sm:text-4xl dark:text-white">الدعم والتواصل</h1>
        <p className="mt-4 text-lg text-slate-500 dark:text-slate-400">تواصل مع فريق DMS Tech للاستفسار عن أداة المحادثات أو الحصول على الدعم.</p>

        <div className="mt-6 flex flex-wrap items-center justify-center gap-x-6 gap-y-2">
          {TRUST_POINTS.map((p) => (
            <div key={p.text} className="flex items-center gap-1.5 text-sm text-slate-500 dark:text-slate-400">
              <p.icon className="h-4 w-4 text-wa-500" />
              {p.text}
            </div>
          ))}
        </div>
      </div>

      <div className="mt-12 grid grid-cols-1 gap-8 lg:grid-cols-5">
        <div className="lg:col-span-3">
          <ContactForm />
        </div>

        <div className="space-y-4 lg:col-span-2">
          <div className="rounded-2xl border border-slate-200 bg-white p-6 dark:border-white/10 dark:bg-slate-900">
            <div className="flex items-center justify-between">
              <h3 className="flex items-center gap-2 font-semibold text-slate-900 dark:text-white">
                <MailIcon className="h-5 w-5 text-wa-500" /> البريد الإلكتروني
              </h3>
              <CopyButton value={settings.supportEmail} />
            </div>
            <a href={`mailto:${settings.supportEmail}`} dir="ltr" className="mt-2 inline-block text-sm text-slate-500 hover:text-wa-600 dark:text-slate-400">{settings.supportEmail}</a>
          </div>
          {settings.supportPhone && (
            <div className="rounded-2xl border border-slate-200 bg-white p-6 dark:border-white/10 dark:bg-slate-900">
              <div className="flex items-center justify-between">
                <h3 className="flex items-center gap-2 font-semibold text-slate-900 dark:text-white">
                  <PhoneIcon className="h-5 w-5 text-wa-500" /> واتساب
                </h3>
                <CopyButton value={settings.supportPhone} />
              </div>
              <a href={`https://wa.me/${settings.supportPhone.replace(/\D/g, "")}`} dir="ltr" className="mt-2 inline-block text-sm text-slate-500 hover:text-wa-600 dark:text-slate-400">{settings.supportPhone === COMPANY_CONTACT.phone ? COMPANY_CONTACT.displayPhone : settings.supportPhone}</a>
            </div>
          )}
          <div className="rounded-2xl border border-slate-200 bg-white p-6 dark:border-white/10 dark:bg-slate-900">
            <h3 className="mb-1 flex items-center gap-2 font-semibold text-slate-900 dark:text-white">
              <ClockIcon className="h-5 w-5 text-wa-500" /> فريق DMS Tech
            </h3>
            <p className="text-sm text-slate-500 dark:text-slate-400">الأداة جزء من منظومة الشركة. يمكنك أيضاً التواصل بخصوص الخدمات والمشاريع عبر موقعنا الرئيسي.</p>
            <a href={COMPANY_CONTACT.contactUrl} className="mt-3 inline-block text-sm font-medium text-wa-600">زيارة صفحة التواصل الرئيسية ←</a>
          </div>
        </div>
      </div>

      <div className="mx-auto mt-20 max-w-2xl">
        <h2 className="text-center text-2xl font-bold text-slate-900 dark:text-white">أسئلة شائعة قبل التواصل</h2>
        <div className="mt-8 space-y-3">
          {FAQS.map((f) => (
            <details key={f.q} className="group rounded-xl border border-slate-200 bg-white p-4 dark:border-white/10 dark:bg-slate-900">
              <summary className="flex cursor-pointer items-center justify-between text-sm font-semibold text-slate-800 dark:text-slate-100">
                {f.q}
                <span className="mr-2 text-slate-400 transition group-open:rotate-45">+</span>
              </summary>
              <p className="mt-3 text-sm text-slate-500 dark:text-slate-400">{f.a}</p>
            </details>
          ))}
        </div>
      </div>
    </div>
  );
}
