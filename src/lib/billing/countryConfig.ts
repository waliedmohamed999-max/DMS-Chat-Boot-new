import { rawDb } from "@/lib/db";
import type { Country } from "@prisma/client";

// نفس مبدأ platformSettings.ts (صف عام، لا tenantId، بلا RLS) لكن صف واحد **لكل دولة** بدل صف
// وحيد للمنصة كلها — القيم الافتراضية هنا تُزرَع مرة واحدة فقط عند أول استدعاء (idempotent upsert،
// نفس أسلوب ensureChartOfAccounts في lib/accounting/chartOfAccounts.ts).
const DEFAULT_CONFIGS: { country: Country; currency: string; currencyLabel: string; vatRateBps: number; isDefault: boolean }[] = [
  { country: "SA", currency: "SAR", currencyLabel: "ريال سعودي", vatRateBps: 1500, isDefault: true },
  { country: "AE", currency: "AED", currencyLabel: "درهم إماراتي", vatRateBps: 500, isDefault: false },
  { country: "EG", currency: "EGP", currencyLabel: "جنيه مصري", vatRateBps: 1400, isDefault: false },
];

export type CountryConfigData = {
  country: Country;
  currency: string;
  currencyLabel: string;
  vatRateBps: number;
  isDefault: boolean;
  isActive: boolean;
};

/** يزرع صفوف الدول الثلاثة الافتراضية إن لم تكن موجودة بعد — لا يُعدِّل صفوفاً موجودة فعلاً
 * (تجنّباً لإعادة تصفير تعديلات مالك المنصة اليدوية على نسبة الضريبة/التفعيل). */
export async function seedDefaultCountryConfigs(): Promise<void> {
  for (const cfg of DEFAULT_CONFIGS) {
    await rawDb.countryConfig.upsert({
      where: { country: cfg.country },
      update: {},
      create: cfg,
    });
  }
}

/** كل إعدادات الدول، بعد ضمان وجود الافتراضيات — تُستخدَم في لوحة الإدارة ونماذج التسجيل العامة. */
export async function getCountryConfigs(): Promise<CountryConfigData[]> {
  await seedDefaultCountryConfigs();
  return rawDb.countryConfig.findMany({ orderBy: { createdAt: "asc" } });
}

/** إعداد دولة واحدة — يرمي خطأً واضحاً إن لم توجد (لا احتياط صامت لعملة/ضريبة خاطئة). */
export async function getCountryConfig(country: Country): Promise<CountryConfigData> {
  await seedDefaultCountryConfigs();
  const config = await rawDb.countryConfig.findUnique({ where: { country } });
  if (!config) throw new Error(`لا يوجد إعداد دولة لـ ${country}`);
  return config;
}
