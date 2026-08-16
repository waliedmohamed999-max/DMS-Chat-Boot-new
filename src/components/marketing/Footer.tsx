"use client";

import Link from "next/link";
import { LogoFull } from "@/components/Logo";

const SOCIAL_LINKS = [
  { label: "X", icon: "🐦", href: "https://x.com/dms_platform" },
  { label: "انستقرام", icon: "📷", href: "https://instagram.com/dms_platform" },
  { label: "لينكدإن", icon: "💼", href: "https://linkedin.com/company/dms-platform" },
  { label: "فيسبوك", icon: "📘", href: "https://facebook.com/dms_platform" },
];

const PAGE_LINKS = [
  { href: "/services", label: "الخدمات" },
  { href: "/pricing", label: "الأسعار" },
  { href: "/about", label: "من نحن" },
  { href: "/vision", label: "رؤيتنا ومنهجيتنا" },
  { href: "/affiliates", label: "التسويق بالعمولة" },
  { href: "/contact", label: "تواصل معنا" },
];

const LEGAL_LINKS = [
  { href: "/terms", label: "الشروط والأحكام" },
  { href: "/privacy", label: "سياسة الخصوصية" },
];

export function Footer() {
  return (
    <footer className="border-t border-slate-200 bg-white dark:border-white/10 dark:bg-slate-950">
      <div className="mx-auto max-w-6xl px-4 py-12">
        <div className="grid grid-cols-2 gap-8 sm:grid-cols-4">
          <div className="col-span-2 sm:col-span-1">
            <div className="mb-3">
              <LogoFull size="sm" />
            </div>
            <p className="text-sm text-slate-500 dark:text-slate-400">
              منصة CRM متكاملة لإدارة عملائك عبر WhatsApp Business Platform.
            </p>
          </div>

          <div>
            <h3 className="mb-3 text-sm font-semibold text-slate-900 dark:text-white">الصفحات</h3>
            <ul className="space-y-2">
              {PAGE_LINKS.map((l) => (
                <li key={l.href}>
                  <Link href={l.href} className="text-sm text-slate-500 hover:text-wa-600 dark:text-slate-400 dark:hover:text-wa-400">
                    {l.label}
                  </Link>
                </li>
              ))}
            </ul>
          </div>

          <div>
            <h3 className="mb-3 text-sm font-semibold text-slate-900 dark:text-white">قانوني</h3>
            <ul className="space-y-2">
              {LEGAL_LINKS.map((l) => (
                <li key={l.href}>
                  <Link href={l.href} className="text-sm text-slate-500 hover:text-wa-600 dark:text-slate-400 dark:hover:text-wa-400">
                    {l.label}
                  </Link>
                </li>
              ))}
            </ul>
          </div>

          <div>
            <h3 className="mb-3 text-sm font-semibold text-slate-900 dark:text-white">حسابك</h3>
            <ul className="space-y-2">
              <li>
                <Link href="/partners/join" className="inline-block rounded-lg bg-wa-500 px-3 py-1.5 text-sm font-semibold text-white">
                  انضم كشريك
                </Link>
              </li>
              <li>
                <Link href="/login" className="inline-block rounded-lg border border-slate-300 px-3 py-1.5 text-sm font-semibold text-slate-700 dark:border-white/15 dark:text-slate-200">
                  لوحة التاجر
                </Link>
              </li>
              <li>
                <Link href="/login" className="text-sm text-slate-500 hover:text-wa-600 dark:text-slate-400 dark:hover:text-wa-400">
                  تسجيل الدخول
                </Link>
              </li>
            </ul>
          </div>
        </div>

        <div className="mt-10 flex flex-col items-center gap-4 border-t border-slate-100 pt-6 sm:flex-row sm:justify-between dark:border-white/10">
          <form className="flex w-full max-w-sm items-center gap-2 sm:w-auto" onSubmit={(e) => e.preventDefault()}>
            <input
              type="email"
              placeholder="بريدك الإلكتروني"
              dir="ltr"
              className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 placeholder:text-slate-400 dark:border-white/15 dark:bg-slate-900 dark:text-white"
            />
            <button type="submit" className="whitespace-nowrap rounded-lg bg-wa-500 px-4 py-2 text-sm font-semibold text-white">
              اشترك
            </button>
          </form>

          <div className="flex items-center gap-3">
            {SOCIAL_LINKS.map((s) => (
              <a
                key={s.label}
                href={s.href}
                target="_blank"
                rel="noopener noreferrer"
                aria-label={s.label}
                className="flex h-9 w-9 items-center justify-center rounded-full border border-slate-200 text-sm transition hover:bg-slate-50 dark:border-white/10 dark:hover:bg-white/5"
              >
                {s.icon}
              </a>
            ))}
          </div>
        </div>

        <p className="mt-6 text-center text-xs text-slate-400 dark:text-slate-500">
          © {new Date().getFullYear()} DMS — Digital Messaging System. جميع الحقوق محفوظة. المنصة
          مبنية على WhatsApp Business Platform الرسمي وليست تابعة لشركة WhatsApp أو Meta.
        </p>
      </div>
    </footer>
  );
}
