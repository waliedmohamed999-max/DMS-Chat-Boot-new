import { requireSuperAdminSession } from "@/lib/session";
import { hasEffectivePermission, ROLE_LABELS_AR, type Permission } from "@/lib/rbac";
import { Sidebar, type NavItem } from "@/components/layout/Sidebar";
import { Topbar } from "@/components/layout/Topbar";
import { platformLogout } from "@/app/admin-login/actions";

const ALL_NAV_ITEMS: (NavItem & { requires?: Permission })[] = [
  { href: "/admin", label: "نظرة عامة", icon: "📊" },
  { href: "/admin/approvals", label: "مركز الموافقات", icon: "✅", requires: "platform.approvals.review" },
  { href: "/admin/tenants", label: "التجار المشتركون", icon: "🏬", requires: "platform.merchants.view" },
  { href: "/admin/leads", label: "رسائل التواصل", icon: "📩", requires: "platform.leads.view" },
  { href: "/admin/health", label: "صحة المنصة", icon: "🩺", requires: "platform.health.view" },
  { href: "/admin/billing", label: "الإيرادات والفوترة", icon: "💰", requires: "platform.view_revenue" },
  { href: "/admin/plans", label: "حدود الباقات", icon: "🧩", requires: "platform.plans.manage" },
  { href: "/admin/countries", label: "الدول والعملات", icon: "🌍", requires: "platform.settings.manage" },
  { href: "/admin/affiliates", label: "التسويق بالعمولة", icon: "🤝", requires: "platform.affiliates.manage" },
  { href: "/admin/announcements", label: "إعلانات المنصة", icon: "📢", requires: "platform.announcements.send" },
  { href: "/admin/team", label: "فريق المنصة الداخلي", icon: "🔐", requires: "platform.team.manage" },
  { href: "/admin/audit-log", label: "سجل التدقيق الشامل", icon: "📜", requires: "platform.audit_log.view" },
  { href: "/admin/settings", label: "إعدادات المنصة العامة", icon: "🛠️", requires: "platform.settings.manage" },
  { href: "/admin/content", label: "محتوى الموقع", icon: "🖋️", requires: "platform.content.manage" },
];

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const session = await requireSuperAdminSession();
  const navItems = ALL_NAV_ITEMS.filter((item) => !item.requires || hasEffectivePermission(session.user.permissions, item.requires));

  return (
    <div className="flex h-screen overflow-hidden bg-navy-900">
      <Sidebar items={navItems} brandName="DMS — لوحة مالك المنصة" brandColor="#25D366" brandInitial="D" logoUrl="/logo.png" />
      <div className="flex flex-1 flex-col overflow-hidden">
        <Topbar
          userName={session.user.name ?? "مدير المنصة"}
          roleLabel={ROLE_LABELS_AR[session.user.role]}
          sandboxMode={false}
          onLogout={session.authSource === "platform" ? platformLogout : undefined}
          mobileNavItems={navItems}
        />
        <main className="flex-1 overflow-y-auto p-6">{children}</main>
      </div>
    </div>
  );
}
