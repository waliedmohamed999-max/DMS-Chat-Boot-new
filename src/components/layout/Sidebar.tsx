"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { clsx } from "clsx";

export type NavItem = {
  href: string;
  label: string;
  icon: string;
};

export function Sidebar({
  items,
  brandName,
  brandColor,
  brandInitial,
  logoUrl,
  footer,
}: {
  items: NavItem[];
  brandName: string;
  brandColor: string;
  brandInitial: string;
  /** شعار حقيقي (رابط صورة) — تاجر رفع شعاره الخاص عبر إعدادات علامته التجارية، أو شعار المنصة
   * الافتراضي. عند غياب الرابط أو فشل تحميله يُستخدَم شارة الحرف الأول الملوّنة كما كان سابقاً. */
  logoUrl?: string | null;
  footer?: React.ReactNode;
}) {
  const pathname = usePathname();
  const [mounted, setMounted] = useState(false);
  const [imgFailed, setImgFailed] = useState(false);

  // لا يُعرَض <img> إلا بعد اكتمال التركيب على العميل (mount) — تفادياً لسباق حقيقي بين فشل تحميل
  // الصورة (404) واكتمال hydration React الذي قد يُفوِّت حدث onError تماماً إن حدث الفشل قبله.
  useEffect(() => setMounted(true), []);

  return (
    <aside className="flex h-screen w-64 flex-col border-l border-white/5 bg-navy-950 px-3 py-4">
      <div className="mb-6 flex items-center gap-2.5 px-2">
        {mounted && logoUrl && !imgFailed ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={logoUrl}
            alt={brandName}
            className="h-9 w-9 shrink-0 rounded-lg object-contain"
            onError={() => setImgFailed(true)}
          />
        ) : (
          <div
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-sm font-bold text-white"
            style={{ backgroundColor: brandColor }}
          >
            {brandInitial}
          </div>
        )}
        <span className="truncate text-sm font-bold text-white">{brandName}</span>
      </div>

      <nav className="flex-1 space-y-1 overflow-y-auto">
        {items.map((item) => {
          const active = pathname === item.href || pathname?.startsWith(item.href + "/");
          return (
            <Link key={item.href} href={item.href} className={clsx("nav-link", active && "nav-link-active")}>
              <span className="text-base">{item.icon}</span>
              <span>{item.label}</span>
            </Link>
          );
        })}
      </nav>

      {footer}
    </aside>
  );
}
