import { Suspense } from "react";
import { cookies } from "next/headers";
import { getPublicPlans } from "@/app/partners/apply/actions";
import { getCountryConfigs, toPublicCountryOptions } from "@/lib/billing/countryConfig";
import { RegisterForm } from "./RegisterForm";

// الباقات والدول حقيقية وقابلة للتعديل من لوحة مالك المنصة — يجب أن تُقرأ حياً وليس وقت البناء
// (نفس السبب الموثَّق في partners/apply وpartners/join).
export const dynamic = "force-dynamic";

export default async function RegisterPage() {
  const [plans, countryConfigs] = await Promise.all([getPublicPlans(), getCountryConfigs()]);
  const countries = toPublicCountryOptions(countryConfigs);

  // هذه الصفحة خارج تخطيط (marketing) (بلا Navbar/CountryProvider) — تقرأ نفس كوكي dms_country
  // مباشرة حتى تبقى الدولة المختارة من زر 🌍 في الموقع العام متسقة هنا أيضاً بدل العودة للافتراضي.
  const storedCountry = cookies().get("dms_country")?.value;
  const initialCountry = countries.find((c) => c.country === storedCountry)?.country
    ?? countries.find((c) => c.isDefault)?.country
    ?? "SA";

  return (
    <Suspense>
      <RegisterForm plans={plans} countries={countries} initialCountry={initialCountry} />
    </Suspense>
  );
}
