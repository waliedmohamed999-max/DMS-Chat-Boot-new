"use client";

import Link from "next/link";
import { LogoFull } from "@/components/Logo";

// أيقونات SVG مضمَّنة للعلامات التجارية (بدل رموز إيموجي 🐦📷💼📘 كانت تُعرَض كرموز نظام عامة غير
// متسقة بصرياً حسب المتصفح/النظام) — بلا مكتبة أيقونات خارجية، بنفس قرار الرسوم البيانية SVG الخفيفة
// الموثَّق في DECISIONS.md. مسارات مبسّطة قياسية لكل شعار، لون العلامة التجارية الحقيقي عند التحويم فقط.
const SOCIAL_LINKS = [
  {
    label: "X",
    href: "https://x.com/dms_platform",
    hoverClass: "hover:text-slate-900 dark:hover:text-white",
    path: "M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z",
  },
  {
    label: "انستقرام",
    href: "https://instagram.com/dms_platform",
    hoverClass: "hover:text-[#E4405F]",
    path: "M12 2.163c3.204 0 3.584.012 4.85.07 3.252.148 4.771 1.691 4.919 4.919.058 1.265.069 1.645.069 4.849 0 3.205-.012 3.584-.069 4.849-.149 3.225-1.664 4.771-4.919 4.919-1.266.058-1.644.07-4.85.07-3.204 0-3.584-.012-4.849-.07-3.26-.149-4.771-1.699-4.919-4.92-.058-1.265-.07-1.644-.07-4.849 0-3.204.013-3.583.07-4.849.149-3.227 1.664-4.771 4.919-4.919 1.266-.057 1.645-.069 4.849-.069zM12 0C8.741 0 8.333.014 7.053.072 2.695.272.273 2.69.073 7.052.014 8.333 0 8.741 0 12c0 3.259.014 3.668.072 4.948.2 4.358 2.618 6.78 6.98 6.98C8.333 23.986 8.741 24 12 24c3.259 0 3.668-.014 4.948-.072 4.354-.2 6.782-2.618 6.979-6.98.059-1.28.073-1.689.073-4.948 0-3.259-.014-3.667-.072-4.947-.196-4.354-2.617-6.78-6.979-6.98C15.668.014 15.259 0 12 0zm0 5.838a6.162 6.162 0 100 12.324 6.162 6.162 0 000-12.324zM12 16a4 4 0 110-8 4 4 0 010 8zm6.406-11.845a1.44 1.44 0 100 2.881 1.44 1.44 0 000-2.881z",
  },
  {
    label: "لينكدإن",
    href: "https://linkedin.com/company/dms-platform",
    hoverClass: "hover:text-[#0A66C2]",
    path: "M20.447 20.452h-3.554v-5.569c0-1.328-.027-3.037-1.852-3.037-1.853 0-2.136 1.445-2.136 2.939v5.667H9.351V9h3.414v1.561h.046c.477-.9 1.637-1.85 3.37-1.85 3.601 0 4.267 2.37 4.267 5.455v6.286zM5.337 7.433a2.062 2.062 0 11-.001-4.124 2.062 2.062 0 010 4.124zM7.119 20.452H3.554V9h3.565v11.452zM22.225 0H1.771C.792 0 0 .774 0 1.729v20.542C0 23.227.792 24 1.771 24h20.451C23.2 24 24 23.227 24 22.271V1.729C24 .774 23.2 0 22.222 0h.003z",
  },
  {
    label: "فيسبوك",
    href: "https://facebook.com/dms_platform",
    hoverClass: "hover:text-[#1877F2]",
    path: "M22 12.06C22 6.505 17.523 2 12 2S2 6.505 2 12.06c0 5.02 3.657 9.184 8.438 9.94v-7.03H7.898v-2.91h2.54V9.845c0-2.507 1.492-3.89 3.777-3.89 1.094 0 2.238.195 2.238.195v2.46h-1.26c-1.243 0-1.63.771-1.63 1.562v1.877h2.773l-.443 2.91h-2.33V22c4.78-.756 8.437-4.92 8.437-9.94z",
  },
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

          <div className="flex items-center gap-2">
            {SOCIAL_LINKS.map((s) => (
              <a
                key={s.label}
                href={s.href}
                target="_blank"
                rel="noopener noreferrer"
                aria-label={s.label}
                className={`flex h-9 w-9 items-center justify-center rounded-full border border-slate-200 text-slate-500 transition hover:border-transparent hover:bg-slate-100 dark:border-white/10 dark:text-slate-400 dark:hover:bg-white/10 ${s.hoverClass}`}
              >
                <svg viewBox="0 0 24 24" className="h-4 w-4" fill="currentColor" aria-hidden="true">
                  <path d={s.path} />
                </svg>
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
