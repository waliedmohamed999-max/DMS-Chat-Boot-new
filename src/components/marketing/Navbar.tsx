"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { ThemeToggle } from "@/components/marketing/ThemeToggle";
import { LogoFull } from "@/components/Logo";

const NAV_LINKS = [
  { href: "/services", label: "الخدمات" },
  { href: "/pricing", label: "الأسعار" },
  { href: "/about", label: "من نحن" },
  { href: "/vision", label: "رؤيتنا" },
  { href: "/contact", label: "تواصل معنا" },
  { href: "/affiliates", label: "التسويق بالعمولة" },
];

export function Navbar() {
  const [open, setOpen] = useState(false);

  // يمنع تمرير خلفية الصفحة أثناء فتح قائمة الموبايل — بدونه كان محتوى الصفحة (فقاعات المعاينة في
  // الـHero مثلاً) يظهر ويتحرك تحت القائمة المنسدلة نصف الشفافة، شكل غير احترافي على الموبايل تحديداً.
  useEffect(() => {
    document.body.style.overflow = open ? "hidden" : "";
    return () => {
      document.body.style.overflow = "";
    };
  }, [open]);

  return (
    <header className="sticky top-0 z-40 border-b border-slate-200/70 bg-white/80 backdrop-blur dark:border-white/10 dark:bg-slate-950/80">
      <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-3">
        <Link href="/" className="flex items-center gap-2">
          <LogoFull size="sm" />
        </Link>

        <nav className="hidden items-center gap-6 lg:flex">
          {NAV_LINKS.map((link) =>
            link.href === "/affiliates" ? (
              <Link key={link.href} href={link.href} className="text-sm font-bold text-wa-600 transition hover:text-wa-700 dark:text-wa-400 dark:hover:text-wa-300">
                {link.label}
              </Link>
            ) : (
              <Link key={link.href} href={link.href} className="text-sm font-medium text-slate-600 transition hover:text-wa-600 dark:text-slate-300 dark:hover:text-wa-400">
                {link.label}
              </Link>
            )
          )}
        </nav>

        <div className="hidden items-center gap-3 lg:flex">
          <ThemeToggle />
          <Link href="/login" className="text-sm font-medium text-slate-600 hover:text-slate-900 dark:text-slate-300 dark:hover:text-white">
            تسجيل الدخول
          </Link>
          <Link
            href="/login"
            className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-700 transition hover:bg-slate-50 dark:border-white/15 dark:text-slate-200 dark:hover:bg-white/5"
          >
            لوحة التاجر
          </Link>
          <Link
            href="/partners/join"
            className="rounded-lg bg-wa-500 px-4 py-2 text-sm font-bold text-white shadow-card transition hover:bg-wa-600"
          >
            انضم كشريك
          </Link>
        </div>

        <button
          type="button"
          onClick={() => setOpen((o) => !o)}
          className="flex h-9 w-9 items-center justify-center rounded-lg border border-slate-200 text-slate-600 lg:hidden dark:border-white/10 dark:text-slate-300"
          aria-label="القائمة"
        >
          {open ? "✕" : "☰"}
        </button>
      </div>

      {open && (
        <div className="fixed inset-x-0 bottom-0 top-[57px] z-50 overflow-y-auto bg-white px-4 py-6 lg:hidden dark:bg-slate-950">
          <nav className="mx-auto flex max-w-sm flex-col gap-1">
            {NAV_LINKS.map((link) =>
              link.href === "/affiliates" ? (
                <Link
                  key={link.href}
                  href={link.href}
                  onClick={() => setOpen(false)}
                  className="rounded-lg px-2 py-3 text-base font-bold text-wa-600 transition hover:bg-wa-50 dark:text-wa-400 dark:hover:bg-white/5"
                >
                  {link.label}
                </Link>
              ) : (
                <Link
                  key={link.href}
                  href={link.href}
                  onClick={() => setOpen(false)}
                  className="rounded-lg px-2 py-3 text-base font-medium text-slate-700 transition hover:bg-slate-50 dark:text-slate-200 dark:hover:bg-white/5"
                >
                  {link.label}
                </Link>
              )
            )}
            <div className="mt-3 flex items-center justify-between border-t border-slate-100 px-2 pt-4 dark:border-white/10">
              <span className="text-sm text-slate-500 dark:text-slate-400">المظهر</span>
              <ThemeToggle />
            </div>
            <div className="mt-4 flex flex-col gap-3">
              <Link
                href="/login"
                onClick={() => setOpen(false)}
                className="rounded-lg border border-slate-300 px-4 py-3 text-center text-sm font-semibold text-slate-700 dark:border-white/15 dark:text-slate-200"
              >
                تسجيل الدخول
              </Link>
              <Link
                href="/login"
                onClick={() => setOpen(false)}
                className="rounded-lg border border-slate-300 px-4 py-3 text-center text-sm font-semibold text-slate-700 dark:border-white/15 dark:text-slate-200"
              >
                لوحة التاجر
              </Link>
              <Link
                href="/partners/join"
                onClick={() => setOpen(false)}
                className="rounded-lg bg-wa-500 px-4 py-3 text-center text-sm font-bold text-white shadow-card"
              >
                انضم كشريك
              </Link>
            </div>
          </nav>
        </div>
      )}
    </header>
  );
}
