"use client";

import { useEffect, useState } from "react";

/**
 * تبديل فعلي بين الوضعين الفاتح/الداكن للموقع التسويقي (وليس فقط تصميم داكن ثابت كما في لوحة
 * التحكم الداخلية) — يضيف/يزيل class="dark" على <html> ويحفظ التفضيل في localStorage. النص المضمّن
 * في <head> (راجع layout.tsx) يطبّق القيمة المحفوظة قبل أول رسم لمنع وميض تغيّر اللون (FOUC).
 */
export function ThemeToggle() {
  const [isDark, setIsDark] = useState(false);

  useEffect(() => {
    setIsDark(document.documentElement.classList.contains("dark"));
  }, []);

  function toggle() {
    const next = !isDark;
    setIsDark(next);
    document.documentElement.classList.toggle("dark", next);
    localStorage.setItem("dms-theme", next ? "dark" : "light");
  }

  return (
    <button
      type="button"
      onClick={toggle}
      aria-label={isDark ? "التبديل للوضع الفاتح" : "التبديل للوضع الداكن"}
      className="flex h-9 w-9 items-center justify-center rounded-full border border-slate-200 bg-white text-slate-600 transition hover:bg-slate-50 dark:border-white/10 dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-slate-700"
    >
      {isDark ? "☀️" : "🌙"}
    </button>
  );
}
