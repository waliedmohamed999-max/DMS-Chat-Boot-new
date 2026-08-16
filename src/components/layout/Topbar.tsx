"use client";

import { signOut } from "next-auth/react";
import { useState } from "react";
import type { NavItem } from "@/components/layout/Sidebar";
import { MobileNavSheet } from "@/components/layout/MobileNavSheet";

export function Topbar({
  userName,
  roleLabel,
  sandboxMode = true,
  onLogout,
  mobileNavItems,
}: {
  userName: string;
  roleLabel: string;
  sandboxMode?: boolean;
  /** يستبدل تسجيل خروج NextAuth الافتراضي — تستخدمه لوحة فريق المنصة لتصفير كوكي جلستها المستقلة فقط. */
  onLogout?: () => void | Promise<void>;
  /** عند تمريرها: زر قائمة ☰ يظهر على الموبايل فقط، يفتح MobileNavSheet بكل عناصر التنقّل — تستخدمه
   * لوحة مالك المنصة (بلا شريط تبويبات سفلي خاص بها، بخلاف لوحة التاجر). */
  mobileNavItems?: NavItem[];
}) {
  const [menuOpen, setMenuOpen] = useState(false);
  const [mobileNavOpen, setMobileNavOpen] = useState(false);

  return (
    <>
    <header className="flex h-16 items-center justify-between border-b border-white/5 bg-navy-900/80 px-6 backdrop-blur">
      <div className="flex items-center gap-3">
        {mobileNavItems && mobileNavItems.length > 0 && (
          <button
            type="button"
            onClick={() => setMobileNavOpen(true)}
            className="flex h-9 w-9 items-center justify-center rounded-lg border border-white/10 text-slate-300 lg:hidden"
            aria-label="القائمة"
          >
            ☰
          </button>
        )}
        {sandboxMode && (
          <span className="badge bg-warning-500/10 text-warning-500 border border-warning-500/30">
            🧪 وضع تجريبي (Sandbox) — التكاملات تستخدم بيانات وهمية
          </span>
        )}
      </div>
      <div className="relative">
        <button
          onClick={() => setMenuOpen((v) => !v)}
          className="flex items-center gap-2.5 rounded-lg px-2 py-1.5 hover:bg-white/5"
        >
          <div className="flex h-8 w-8 items-center justify-center rounded-full bg-accent-500/20 text-xs font-bold text-accent-400">
            {userName.slice(0, 1)}
          </div>
          <div className="text-right">
            <p className="text-sm font-medium text-slate-100">{userName}</p>
            <p className="text-xs text-slate-500">{roleLabel}</p>
          </div>
        </button>
        {menuOpen && (
          <div className="absolute left-0 top-12 w-40 overflow-hidden rounded-lg border border-white/10 bg-navy-800 shadow-card">
            <button
              onClick={() => (onLogout ? onLogout() : signOut({ callbackUrl: "/login" }))}
              className="w-full px-4 py-2.5 text-right text-sm text-slate-300 hover:bg-white/5"
            >
              تسجيل الخروج
            </button>
          </div>
        )}
      </div>
    </header>

    {/* خارج <header> عمداً — نفس سبب Navbar.tsx: backdrop-blur على الأب يخلق containing block جديد
        لأي عنصر position:fixed بداخله، فتنحشر القائمة في ارتفاع الـheader (64px) بدل تغطية الشاشة. */}
    {mobileNavItems && mobileNavItems.length > 0 && (
      <MobileNavSheet open={mobileNavOpen} onClose={() => setMobileNavOpen(false)} items={mobileNavItems} />
    )}
    </>
  );
}
