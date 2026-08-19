"use client";

import { createContext, useContext, useEffect, useState } from "react";

export type Country = "SA" | "AE" | "EG";
export type CountryOption = { country: Country; currency: string; exchangeRateFromSar: number; isDefault: boolean };

type CountryContextValue = {
  country: Country;
  setCountry: (c: Country) => void;
  countries: CountryOption[];
  /** إعداد الدولة المختارة حالياً (نفس عنصر countries المطابق) — راحة لتفادي بحث متكرر بكل مكوّن. */
  currentCountryOption: CountryOption;
};

const CountryContext = createContext<CountryContextValue | null>(null);

const COOKIE_NAME = "dms_country";
const COOKIE_MAX_AGE = 60 * 60 * 24 * 365; // سنة — نفس مدة معظم كوكيز التفضيلات في المشروع

function persistCookie(country: Country) {
  document.cookie = `${COOKIE_NAME}=${country}; path=/; max-age=${COOKIE_MAX_AGE}; SameSite=Lax`;
}

/**
 * مصدر واحد لدولة الزائر عبر كل الموقع التسويقي العام (الزر الدائري في الشريط العلوي + صفحة
 * الأسعار) — قيمة أولية تصل من التخطيط (Server Component) بعد قراءة كوكي dms_country فعلياً، حتى
 * لا يحدث "flash" لدولة خاطئة عند أول رسم. لو الزائر لم يختر دولة يدوياً من قبل (لا كوكي محفوظ)،
 * يُكتشَف موقعه تلقائياً عبر IP (مثل جوجل) مرة واحدة فقط عند التحميل — واختيار يدوي لاحق من الزر
 * الدائري يُخزَّن في نفس الكوكي ويبقى هو الأولوية دائماً بعدها.
 */
export function CountryProvider({
  initialCountry,
  hasStoredPreference,
  countries,
  children,
}: {
  initialCountry: Country;
  hasStoredPreference: boolean;
  countries: CountryOption[];
  children: React.ReactNode;
}) {
  const [country, setCountryState] = useState<Country>(initialCountry);

  function setCountry(next: Country) {
    setCountryState(next);
    persistCookie(next);
  }

  useEffect(() => {
    if (hasStoredPreference) return; // اختيار يدوي محفوظ مسبقاً — لا يُتجاوَز أبداً بالكشف التلقائي
    let cancelled = false;
    fetch("/api/geo/detect")
      .then((r) => r.json())
      .then((data: { country?: Country | null }) => {
        if (cancelled || !data.country) return;
        if (countries.some((c) => c.country === data.country)) setCountry(data.country);
      })
      .catch(() => {}); // فشل الكشف (شبكة/مزوّد خارجي) — يبقى الافتراضي (دولة المنصة الأساسية) بصمت
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const currentCountryOption = countries.find((c) => c.country === country) ?? countries[0] ?? { country, currency: "SAR", exchangeRateFromSar: 1, isDefault: true };

  return <CountryContext.Provider value={{ country, setCountry, countries, currentCountryOption }}>{children}</CountryContext.Provider>;
}

export function useCountry(): CountryContextValue {
  const ctx = useContext(CountryContext);
  if (!ctx) throw new Error("useCountry يجب أن تُستخدَم داخل CountryProvider");
  return ctx;
}
