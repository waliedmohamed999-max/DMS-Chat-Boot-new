"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { clsx } from "clsx";
import { ChevronDown } from "lucide-react";
import { NavigationIcon, isNavigationActive } from "./NavigationIcon";

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
  const isAdmin = items.some((item) => item.href === "/admin");
  // أقسام مفتوحة (أكثر من قسم ممكن) — تُفتح وتُغلق بالنقر فقط، لا بمرور المؤشر (كان المرور يفتح كل قسم
  // يعبره المؤشر ويغلق غيره). تُحفظ لكل لوحة في المتصفح.
  const storageKey = isAdmin ? "dms:sidebar-open:admin" : "dms:sidebar-open:tenant";
  const [openSections, setOpenSections] = useState<Set<string>>(() => new Set());
  const sections = isAdmin
    ? [
        { title: "المتابعة والعمليات", keys: ["admin", "approvals", "tenants", "leads", "chats", "health", "monitoring"] },
        { title: "الفوترة والتكاملات", keys: ["billing", "plans", "numbers", "wallets", "messaging", "migration", "setup", "salla", "zid", "zatca"] },
        { title: "إدارة المنصة", keys: [] },
      ]
    : [
        { title: "مساحة العمل", keys: ["dashboard", "inbox", "contacts", "orders"] },
        { title: "التواصل والأتمتة", keys: ["chatbot", "ai-agent", "brain", "website-chat", "campaigns", "templates"] },
        { title: "إدارة المتجر", keys: [] },
      ];
  const assigned = sections.flatMap((section) => section.keys);

  // لا يُعرَض <img> إلا بعد اكتمال التركيب على العميل (mount) — تفادياً لسباق حقيقي بين فشل تحميل
  // الصورة (404) واكتمال hydration React الذي قد يُفوِّت حدث onError تماماً إن حدث الفشل قبله.
  useEffect(() => setMounted(true), []);

  const sectionOf = (href: string) => {
    const key = href.split("/").at(-1)!;
    return sections.find((section) => (section.keys.length ? section.keys.includes(key) : !assigned.includes(key)))?.title;
  };
  const activeSection = sectionOf(items.find((item) => isNavigationActive(pathname, item.href))?.href ?? "");

  // الحالة المحفوظة عند أول تحميل، ثم قسم الصفحة الحالية مفتوح دائماً (حتى بعد التنقل لقسم آخر).
  useEffect(() => {
    let saved: string[] = [];
    try {
      saved = JSON.parse(localStorage.getItem(storageKey) ?? "[]");
    } catch {
      // تخزين غير متاح (وضع خاص) — يكفي القسم الحالي
    }
    setOpenSections((prev) => new Set([...prev, ...(Array.isArray(saved) ? saved : [])]));
  }, [storageKey]);
  useEffect(() => {
    if (activeSection) setOpenSections((prev) => (prev.has(activeSection) ? prev : new Set([...prev, activeSection])));
  }, [activeSection]);

  const toggleSection = (title: string) =>
    setOpenSections((prev) => {
      const next = new Set(prev);
      if (next.has(title)) next.delete(title);
      else next.add(title);
      try {
        localStorage.setItem(storageKey, JSON.stringify([...next]));
      } catch {
        // تجاهل — التفضيل لا يُحفظ فقط
      }
      return next;
    });

  return (
    <aside className="workspace-sidebar hidden h-full min-h-0 w-72 shrink-0 flex-col border-l border-white/5 bg-navy-950 lg:flex" aria-label={isAdmin ? "تنقل إدارة المنصة" : "تنقل المتجر"}>
      <div className="sidebar-brand flex shrink-0 items-center gap-3 border-b border-white/5 px-5 py-5">
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
        <div className="min-w-0">
          <span className="block text-sm font-bold leading-6 text-white" title={brandName}>{brandName}</span>
          <span className="mt-0.5 block text-[11px] text-slate-500">{isAdmin ? "لوحة إدارة المنصة" : "لوحة تحكم المتجر"}</span>
        </div>
      </div>

      <nav className="min-h-0 flex-1 space-y-2 overflow-y-auto px-3 py-5" aria-label="القائمة الرئيسية">
        {sections.map((section, index) => {
          const sectionItems = items.filter((item) => {
            const key = item.href.split("/").at(-1)!;
            return section.keys.length ? section.keys.includes(key) : !assigned.includes(key);
          });
          if (!sectionItems.length) return null;
          const open = openSections.has(section.title);
          const currentItem = sectionItems.find((item) => isNavigationActive(pathname, item.href));
          const panelId = `sidebar-section-${index}`;
          return <div key={section.title}
            onKeyDown={(event) => {
              if (event.key === "Escape" && open) {
                event.currentTarget.querySelector("button")?.focus();
                toggleSection(section.title);
              }
            }}
          >
            <button type="button"
              className={clsx("sidebar-section-trigger flex min-h-12 w-full items-center gap-3 rounded-xl px-3 py-3 text-right text-sm font-semibold", currentItem && "sidebar-section-current")}
              aria-expanded={open}
              aria-controls={panelId}
              onClick={() => toggleSection(section.title)}
            >
              <NavigationIcon href={sectionItems[0]!.href} className="h-[18px] w-[18px] shrink-0" />
              <span className="min-w-0 flex-1">
                <span className="block">{section.title}</span>
                {currentItem && !open && <span className="mt-1 block text-[11px] font-normal text-accent-400">{currentItem.label}</span>}
              </span>
              <ChevronDown aria-hidden="true" className={clsx("h-4 w-4 shrink-0 transition-transform motion-reduce:transition-none", open && "rotate-180")} />
            </button>
            {/* فتح/إغلاق ناعم (grid-rows 0fr⇄1fr) — والقسم المغلق خارج تسلسل Tab وقارئات الشاشة (inert) */}
            <div id={panelId} inert={!open} aria-hidden={!open}
              className={clsx("grid transition-[grid-template-rows,opacity] duration-200 ease-out motion-reduce:transition-none", open ? "grid-rows-[1fr] opacity-100" : "grid-rows-[0fr] opacity-0")}
            >
              <div className="min-h-0 overflow-hidden">
                <div className="mr-3 mt-1 space-y-1 border-r border-white/10 pr-2 pb-2">
        {sectionItems.map((item) => {
          const active = isNavigationActive(pathname, item.href);
          return (
            <Link key={item.href} href={item.href} aria-current={active ? "page" : undefined} className={clsx("nav-link sidebar-link", active && "nav-link-active")}>
              <NavigationIcon href={item.href} className="h-[18px] w-[18px] shrink-0" />
              <span className="flex-1">{item.label}</span>
              {active && <span className="sidebar-active-dot h-1.5 w-1.5 shrink-0 rounded-full bg-accent-500" aria-hidden="true" />}
            </Link>
          );
        })}
                </div>
              </div>
            </div>
          </div>;
        })}
      </nav>

      {footer && <div className="sidebar-footer shrink-0 border-t border-white/5 px-3 pb-4">{footer}</div>}
    </aside>
  );
}
