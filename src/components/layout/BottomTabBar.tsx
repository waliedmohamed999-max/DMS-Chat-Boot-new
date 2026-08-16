"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { clsx } from "clsx";
import type { NavItem } from "@/components/layout/Sidebar";
import { MobileNavSheet } from "@/components/layout/MobileNavSheet";

const PRIMARY_COUNT = 4;

/**
 * شريط تبويبات سفلي ثابت — نمط تطبيقات الموبايل الأساسي (بديل الشريط الجانبي على الديسكتوب، الذي
 * يُخفى بالكامل تحت lg). أول 4 عناصر تظهر مباشرة، والباقي خلف زر "المزيد" (MobileNavSheet).
 */
export function BottomTabBar({ items }: { items: NavItem[] }) {
  const pathname = usePathname();
  const [moreOpen, setMoreOpen] = useState(false);
  const primary = items.slice(0, PRIMARY_COUNT);
  const rest = items.slice(PRIMARY_COUNT);
  const moreActive = rest.some((item) => pathname === item.href || pathname?.startsWith(item.href + "/"));

  return (
    <>
      <nav
        className="fixed inset-x-0 bottom-0 z-40 flex items-stretch border-t border-white/10 bg-navy-950 pb-[env(safe-area-inset-bottom)] lg:hidden"
        style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
      >
        {primary.map((item) => {
          const active = pathname === item.href || pathname?.startsWith(item.href + "/");
          return (
            <Link
              key={item.href}
              href={item.href}
              className={clsx(
                "flex flex-1 flex-col items-center justify-center gap-0.5 py-2 text-[11px] font-medium transition",
                active ? "text-wa-400" : "text-slate-500"
              )}
            >
              <span className="text-lg">{item.icon}</span>
              {item.label}
            </Link>
          );
        })}
        {rest.length > 0 && (
          <button
            type="button"
            onClick={() => setMoreOpen(true)}
            className={clsx(
              "flex flex-1 flex-col items-center justify-center gap-0.5 py-2 text-[11px] font-medium transition",
              moreActive || moreOpen ? "text-wa-400" : "text-slate-500"
            )}
          >
            <span className="text-lg">☰</span>
            المزيد
          </button>
        )}
      </nav>

      {rest.length > 0 && <MobileNavSheet open={moreOpen} onClose={() => setMoreOpen(false)} items={rest} />}
    </>
  );
}
