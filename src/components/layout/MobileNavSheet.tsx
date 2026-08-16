"use client";

import { useEffect } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { clsx } from "clsx";
import type { NavItem } from "@/components/layout/Sidebar";

/**
 * ورقة تنقّل منزلقة من أسفل الشاشة (bottom sheet) — نمط تطبيقات الموبايل القياسي لعرض قائمة تنقّل
 * كاملة بدون احتلال مساحة دائمة من الشاشة (بخلاف الشريط الجانبي الثابت على الديسكتوب). تُستخدم من
 * BottomTabBar (زر "المزيد" في لوحة التاجر) ومن Topbar (زر القائمة☰ في لوحة مالك المنصة) معاً.
 */
export function MobileNavSheet({
  open,
  onClose,
  items,
  title,
}: {
  open: boolean;
  onClose: () => void;
  items: NavItem[];
  title?: string;
}) {
  const pathname = usePathname();

  useEffect(() => {
    if (!open) return;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = "";
    };
  }, [open]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 lg:hidden">
      <div className="absolute inset-0 bg-black/50" onClick={onClose} aria-hidden="true" />
      <div className="absolute inset-x-0 bottom-0 max-h-[80vh] overflow-y-auto rounded-t-2xl border-t border-white/10 bg-navy-950 p-4 pb-[calc(env(safe-area-inset-bottom)+16px)] shadow-2xl">
        <div className="mx-auto mb-3 h-1 w-10 rounded-full bg-white/15" />
        {title && <p className="mb-3 px-1 text-xs font-semibold text-slate-400">{title}</p>}
        <div className="grid grid-cols-4 gap-3">
          {items.map((item) => {
            const active = pathname === item.href || pathname?.startsWith(item.href + "/");
            return (
              <Link
                key={item.href}
                href={item.href}
                onClick={onClose}
                className={clsx(
                  "flex flex-col items-center gap-1.5 rounded-xl p-3 text-center text-[11px] font-medium transition",
                  active ? "bg-wa-500/10 text-wa-400" : "text-slate-300 hover:bg-white/5"
                )}
              >
                <span className="text-xl">{item.icon}</span>
                {item.label}
              </Link>
            );
          })}
        </div>
      </div>
    </div>
  );
}
