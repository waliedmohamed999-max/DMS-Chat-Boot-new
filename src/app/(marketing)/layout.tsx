import { cookies } from "next/headers";
import { Navbar } from "@/components/marketing/Navbar";
import { Footer } from "@/components/marketing/Footer";
import { FloatingWhatsAppButton } from "@/components/marketing/FloatingWhatsAppButton";
import { CountryProvider, type Country } from "@/components/marketing/CountryContext";
import { getPlatformSettings } from "@/lib/platformSettings";
import { getCountryConfigs } from "@/lib/billing/countryConfig";

// يقرأ إعدادات حقيقية من القاعدة (رقم الدعم لزر واتساب العائم) لكل صفحة تحت هذا التخطيط — بدون
// هذا السطر يحاول Next.js توليد الصفحات الفرعية (about/privacy/services/terms/vision) بشكل ثابت
// وقت `next build` نفسه، فيفشل البناء بالكامل لو قاعدة البيانات غير متاحة وقت البناء (نفس سبب فشل
// نشر Vercel قبل إعداد قاعدة بيانات سحابية حقيقية). الصفحة الرئيسية للصفحة التسويقية معلَّمة أصلاً
// بنفس التصريح لسببها الخاص (باقات حية) — موجود هنا الآن كمصدر واحد يغطي كل الصفحات دفعة واحدة.
export const dynamic = "force-dynamic";

export default async function MarketingLayout({ children }: { children: React.ReactNode }) {
  const [settings, countryConfigs] = await Promise.all([getPlatformSettings(), getCountryConfigs()]);
  const countries = countryConfigs
    .filter((c) => c.isActive)
    .map((c) => ({ country: c.country, currency: c.currency, isDefault: c.isDefault }));
  const defaultCountry = countries.find((c) => c.isDefault)?.country ?? "SA";

  // كوكي dms_country يُقرأ هنا (Server Component) قبل أول رسم — يمنع "flash" لدولة خاطئة قبل أن
  // يتحقق CountryProvider من الكوكي على العميل. اختيار محفوظ صالح فعلياً (موجود ضمن الدول النشطة
  // حالياً) وحده يُحتسَب "تفضيلاً محفوظاً" يمنع الكشف التلقائي عبر IP لاحقاً.
  const storedCountryRaw = cookies().get("dms_country")?.value;
  const hasStoredPreference = Boolean(storedCountryRaw && countries.some((c) => c.country === storedCountryRaw));
  const initialCountry: Country = hasStoredPreference ? (storedCountryRaw as Country) : defaultCountry;

  return (
    <CountryProvider initialCountry={initialCountry} hasStoredPreference={hasStoredPreference} countries={countries}>
      <div className="min-h-screen bg-white text-slate-900 dark:bg-slate-950 dark:text-slate-100">
        <Navbar />
        <main>{children}</main>
        <Footer />
        <FloatingWhatsAppButton phone={settings.supportPhone} />
      </div>
    </CountryProvider>
  );
}
