import Link from "next/link";
import { notFound } from "next/navigation";
import { requireSuperAdminSession } from "@/lib/session";
import { hasEffectivePermission } from "@/lib/rbac";
import { superAdminDb } from "@/lib/db";
import { TenantDetailTabs } from "@/components/admin/TenantDetailTabs";

export default async function TenantDetailLayout({ children, params }: { children: React.ReactNode; params: { id: string } }) {
  const session = await requireSuperAdminSession();
  if (!hasEffectivePermission(session.user.permissions, "platform.merchants.view")) {
    return (
      <div className="card p-8 text-center text-slate-400">
        ليس لديك صلاحية عرض تفاصيل التجار. هذه الصفحة محصورة بفريق الدعم الفني ومالك المنصة.
      </div>
    );
  }

  const tenant = await superAdminDb.tenant.findUnique({ where: { id: params.id }, select: { id: true, name: true, slug: true } });
  if (!tenant) notFound();

  return (
    <div className="space-y-4">
      <Link href="/admin/tenants" className="text-sm text-accent-400 hover:underline">
        ← رجوع للتجار
      </Link>
      <TenantDetailTabs tenantId={tenant.id} />
      {children}
    </div>
  );
}
