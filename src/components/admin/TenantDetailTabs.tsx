"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { clsx } from "clsx";

const TABS = [
  { href: "", label: "نظرة عامة", icon: "📊" },
  { href: "/team", label: "الفريق", icon: "👥" },
  { href: "/contacts", label: "جهات الاتصال", icon: "📇" },
  { href: "/campaigns", label: "الحملات", icon: "📣" },
  { href: "/chatbot", label: "الشات بوت", icon: "🤖" },
  { href: "/templates", label: "قوالب الرسائل", icon: "📝" },
  { href: "/orders", label: "الطلبات والمنتجات", icon: "📦" },
];

export function TenantDetailTabs({ tenantId }: { tenantId: string }) {
  const pathname = usePathname();
  const base = `/admin/tenants/${tenantId}`;

  return (
    <div className="flex gap-1 overflow-x-auto rounded-lg bg-navy-800 p-1">
      {TABS.map((tab) => {
        const href = `${base}${tab.href}`;
        const active = pathname === href;
        return (
          <Link
            key={tab.href}
            href={href}
            className={clsx(
              "shrink-0 whitespace-nowrap rounded-md px-3 py-1.5 text-xs font-medium transition",
              active ? "bg-accent-500 text-white" : "text-slate-400 hover:bg-white/5 hover:text-slate-200"
            )}
          >
            {tab.icon} {tab.label}
          </Link>
        );
      })}
    </div>
  );
}
