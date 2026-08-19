"use client";

import { useEffect, useRef, useState } from "react";
import { useCountry } from "./CountryContext";
import { COUNTRY_LABELS_AR } from "@/lib/currency";

/** الزر الدائري (🌍) في الشريط العلوي — نفس التحكم يظهر بنفس القيمة على كل صفحات الموقع التسويقي
 * (راجع CountryProvider في (marketing)/layout.tsx). لا يظهر إطلاقاً لو دولة واحدة فقط نشطة (لا معنى
 * لمبدّل بخيار واحد). */
export function CountryGlobeButton() {
  const { country, setCountry, countries } = useCountry();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleOutsideClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", handleOutsideClick);
    return () => document.removeEventListener("mousedown", handleOutsideClick);
  }, []);

  if (countries.length <= 1) return null;

  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-label={`الدولة الحالية: ${COUNTRY_LABELS_AR[country]} — اضغط لتغييرها`}
        title={COUNTRY_LABELS_AR[country]}
        className="flex h-9 w-9 items-center justify-center rounded-full border border-slate-200 text-base transition hover:bg-slate-50 dark:border-white/10 dark:hover:bg-white/5"
      >
        🌍
      </button>
      {open && (
        <div
          role="listbox"
          className="absolute left-0 top-full z-50 mt-2 w-44 rounded-xl border border-slate-200 bg-white p-1.5 shadow-lg dark:border-white/10 dark:bg-slate-900"
        >
          {countries.map((c) => (
            <button
              key={c.country}
              type="button"
              role="option"
              aria-selected={country === c.country}
              onClick={() => {
                setCountry(c.country);
                setOpen(false);
              }}
              className={`flex w-full items-center justify-between rounded-lg px-3 py-2 text-sm transition ${
                country === c.country
                  ? "bg-wa-50 font-semibold text-wa-700 dark:bg-wa-500/10 dark:text-wa-400"
                  : "text-slate-600 hover:bg-slate-50 dark:text-slate-300 dark:hover:bg-white/5"
              }`}
            >
              {COUNTRY_LABELS_AR[c.country]}
              {country === c.country && <span>✓</span>}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

/** صف أزرار أفقي (بدل قائمة منسدلة) للاستخدام داخل قوائم الموبايل الممتلئة الشاشة — يتفادى مشاكل
 * تموضع/قص القوائم المنسدلة داخل حاويات overflow-y-auto، وأنسب للمس على الشاشات الصغيرة أصلاً. */
export function CountryPillRow() {
  const { country, setCountry, countries } = useCountry();
  if (countries.length <= 1) return null;

  return (
    <div className="flex flex-wrap gap-1.5">
      {countries.map((c) => (
        <button
          key={c.country}
          type="button"
          onClick={() => setCountry(c.country)}
          className={`rounded-full border px-3 py-1 text-xs font-medium transition ${
            country === c.country
              ? "border-wa-500 bg-wa-500 text-white"
              : "border-slate-300 text-slate-600 hover:bg-slate-50 dark:border-white/15 dark:text-slate-300 dark:hover:bg-white/5"
          }`}
        >
          {COUNTRY_LABELS_AR[c.country]}
        </button>
      ))}
    </div>
  );
}
