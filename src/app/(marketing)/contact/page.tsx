import type { Metadata } from "next";
import { getPlatformSettings } from "@/lib/platformSettings";
import { MailIcon, PhoneIcon, ClockIcon, CheckCircleIcon } from "@/components/marketing/ServiceIcons";
import { CopyButton } from "@/components/marketing/CopyButton";
import { ContactForm } from "./ContactForm";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "تواصل معنا — DMS",
  description: "تواصل مع فريق DMS عبر النموذج أو واتساب أو البريد الإلكتروني — نرد خلال ساعات العمل.",
};

const TRUST_POINTS = [
  { icon: CheckCircleIcon, text: "رد خلال ساعتين في أيام العمل" },
  { icon: ClockIcon, text: "دعم متاح 6 أيام أسبوعياً" },
  { icon: MailIcon, text: "فريق دعم عربي متخصص" },
];

const FAQS = [
  { q: "خلال متى يرد فريق الدعم؟", a: "خلال ساعتين تقريباً في أيام العمل الرسمية، وقد يطول الرد قليلاً في أوقات الذروة." },
  { q: "هل يمكنني التواصل عبر واتساب مباشرة؟", a: "نعم، استخدم زر واتساب العائم في أسفل الشاشة، أو رقم واتساب المذكور في هذه الصفحة إن كان متاحاً." },
  { q: "هل التواصل هنا مخصص للتجار الحاليين فقط؟", a: "لا، يمكن لأي زائر أو صاحب نشاط التواصل معنا سواء كان لديه حساب بالفعل أو يفكر في الانضمام." },
];

export default async function ContactPage() {
  const settings = await getPlatformSettings();

  return (
    <div className="mx-auto max-w-5xl px-4 py-16">
      <div className="mx-auto max-w-2xl text-center">
        <h1 className="text-3xl font-extrabold text-slate-900 sm:text-4xl dark:text-white">تواصل معنا</h1>
        <p className="mt-4 text-lg text-slate-500 dark:text-slate-400">لديك سؤال أو تحتاج مساعدة؟ فريقنا جاهز للرد.</p>

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
            <p dir="ltr" className="mt-1 text-sm text-slate-500 dark:text-slate-400">{settings.supportEmail}</p>
          </div>
          {settings.supportPhone && (
            <div className="rounded-2xl border border-slate-200 bg-white p-6 dark:border-white/10 dark:bg-slate-900">
              <div className="flex items-center justify-between">
                <h3 className="flex items-center gap-2 font-semibold text-slate-900 dark:text-white">
                  <PhoneIcon className="h-5 w-5 text-wa-500" /> واتساب
                </h3>
                <CopyButton value={settings.supportPhone} />
              </div>
              <p dir="ltr" className="mt-1 text-sm text-slate-500 dark:text-slate-400">{settings.supportPhone}</p>
            </div>
          )}
          <div className="rounded-2xl border border-slate-200 bg-white p-6 dark:border-white/10 dark:bg-slate-900">
            <h3 className="mb-1 flex items-center gap-2 font-semibold text-slate-900 dark:text-white">
              <ClockIcon className="h-5 w-5 text-wa-500" /> ساعات الدعم
            </h3>
            <p className="text-sm text-slate-500 dark:text-slate-400">السبت – الخميس، 9 صباحاً – 6 مساءً (بتوقيت السعودية)</p>
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
