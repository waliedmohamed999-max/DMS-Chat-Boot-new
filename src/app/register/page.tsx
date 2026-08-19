import { Suspense } from "react";
import { getPublicPlans } from "@/app/partners/apply/actions";
import { getCountryConfigs } from "@/lib/billing/countryConfig";
import { RegisterForm } from "./RegisterForm";

// الباقات والدول حقيقية وقابلة للتعديل من لوحة مالك المنصة — يجب أن تُقرأ حياً وليس وقت البناء
// (نفس السبب الموثَّق في partners/apply وpartners/join).
export const dynamic = "force-dynamic";

export default async function RegisterPage() {
  const [plans, countryConfigs] = await Promise.all([getPublicPlans(), getCountryConfigs()]);
  const countries = countryConfigs
    .filter((c) => c.isActive)
    .map((c) => ({ country: c.country, currency: c.currency, isDefault: c.isDefault }));

  return (
    <Suspense>
      <RegisterForm plans={plans} countries={countries} />
    </Suspense>
  );
}
