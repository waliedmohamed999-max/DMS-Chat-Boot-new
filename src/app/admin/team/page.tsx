import Link from "next/link";
import { requireSuperAdminSession } from "@/lib/session";
import {
  hasPermission,
  ROLE_LABELS_AR,
  PLATFORM_PERMISSION_LABELS_AR,
  TENANT_PERMISSION_LABELS_AR,
  ALL_ROLES_ORDERED,
  resolveEffectivePermissions,
  type Permission,
} from "@/lib/rbac";
import { superAdminDb } from "@/lib/db";
import { InviteStaffForm } from "./InviteStaffForm";
import { ToggleActiveButton } from "./ToggleActiveButton";
import { RoleSelect } from "./RoleSelect";
import { RemoveStaffButton } from "./RemoveStaffButton";
import { ResendSetupLinkButton } from "./ResendSetupLinkButton";
import { PlatformPermissionsEditor } from "./PlatformPermissionsEditor";
import { EditStaffProfileForm } from "./EditStaffProfileForm";
import { ForceResetPasswordButton } from "./ForceResetPasswordButton";
import { updateInternalStaffPermissions } from "./actions";

export default async function InternalTeamPage() {
  const session = await requireSuperAdminSession();
  if (!hasPermission(session.user.role, "platform.team.manage")) {
    return (
      <div className="card p-8 text-center text-slate-400">
        ليس لديك صلاحية إدارة فريق المنصة الداخلي. هذه الصفحة محصورة بمالك المنصة.
      </div>
    );
  }

  const [staff, pendingPartnerApplications, totalTenants, recentPartnerRequests] = await Promise.all([
    superAdminDb.user.findMany({
      where: { tenantId: null },
      orderBy: { createdAt: "asc" },
      include: { accountSetupTokens: { orderBy: { createdAt: "desc" }, take: 1 } },
    }),
    superAdminDb.approvalRequest.count({ where: { type: "PARTNER_APPLICATION", status: { in: ["PENDING", "NEEDS_INFO"] } } }),
    superAdminDb.tenant.count(),
    superAdminDb.approvalRequest.findMany({
      where: { type: "PARTNER_APPLICATION" },
      orderBy: { createdAt: "desc" },
      take: 5,
      select: { id: true, status: true, applicantEmail: true, createdAt: true, payloadJson: true },
    }),
  ]);

  const STATUS_LABELS_AR: Record<string, string> = {
    PENDING: "قيد المراجعة",
    NEEDS_INFO: "بانتظار معلومات",
    APPROVED: "مقبول",
    REJECTED: "مرفوض",
  };
  const STATUS_COLORS: Record<string, string> = {
    PENDING: "bg-amber-500/10 text-amber-400",
    NEEDS_INFO: "bg-amber-500/10 text-amber-400",
    APPROVED: "bg-success-500/10 text-success-500",
    REJECTED: "bg-danger-500/10 text-danger-500",
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-bold text-white">فريق المنصة الداخلي</h1>
        <p className="text-sm text-slate-400">إدارة كاملة للأعضاء والصلاحيات وطلبات الشركاء — كل البيانات حية ومرتبطة فعلياً بالنظام</p>
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <div className="card p-5 lg:col-span-2">
          <h2 className="mb-4 font-semibold text-white">الأعضاء</h2>
          <div className="space-y-2">
            {staff.map((u) => {
              const isSelf = u.id === session.user.id;
              const latestToken = u.accountSetupTokens[0];
              const pendingSetup = Boolean(latestToken && !latestToken.usedAt);
              return (
                <div key={u.id} className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-white/5 p-3 text-sm">
                  <div>
                    <p className="font-medium text-slate-100">
                      {u.name} {isSelf && <span className="text-xs text-slate-500">(أنت)</span>}
                    </p>
                    <p className="text-xs text-slate-500" dir="ltr">{u.email}</p>
                    {pendingSetup && (
                      <div className="mt-1 flex items-center gap-2">
                        <span className="badge bg-amber-500/10 text-xs text-amber-400">بانتظار إكمال الإعداد</span>
                        <ResendSetupLinkButton userId={u.id} />
                      </div>
                    )}
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    {u.role === "SUPER_ADMIN" ? (
                      <span className="badge bg-white/5 text-slate-300">{ROLE_LABELS_AR[u.role]}</span>
                    ) : (
                      <RoleSelect userId={u.id} currentRole={u.role as "PLATFORM_SUPPORT" | "PLATFORM_BILLING"} />
                    )}
                    {u.role !== "SUPER_ADMIN" && <ToggleActiveButton userId={u.id} isActive={u.isActive} />}
                    {u.role !== "SUPER_ADMIN" && (
                      <PlatformPermissionsEditor
                        userId={u.id}
                        userName={u.name}
                        initialPermissions={resolveEffectivePermissions(u)}
                        isCustomized={u.customPermissionsJson !== null}
                        updateInternalStaffPermissions={updateInternalStaffPermissions}
                      />
                    )}
                    {(u.role !== "SUPER_ADMIN" || isSelf) && <EditStaffProfileForm userId={u.id} name={u.name} email={u.email} />}
                    {u.role !== "SUPER_ADMIN" && <ForceResetPasswordButton userId={u.id} />}
                    {u.role !== "SUPER_ADMIN" && !isSelf && <RemoveStaffButton userId={u.id} name={u.name} />}
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        <div className="card p-5">
          <h2 className="mb-4 font-semibold text-white">دعوة عضو جديد</h2>
          <InviteStaffForm />
        </div>
      </div>

      {/* لوحة "الشركاء" — بيانات حية مرتبطة بمركز الموافقات ونظام التينانتات، وليست بيانات وهمية.
          إدارة فريق التاجر نفسه (OWNER/ADMIN/AGENT) لها صفحة مخصصة بالفعل عند كل تينانت
          (admin/tenants/[id]/team) فلا داعي لتكرارها هنا — هذه اللوحة رابط سريع وملخّص حي فقط. */}
      <div className="card p-5">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="font-semibold text-white">الشركاء</h2>
          <div className="flex gap-2 text-xs">
            <Link href="/admin/approvals" className="text-wa-500 hover:underline">مركز الموافقات</Link>
            <span className="text-slate-600">·</span>
            <Link href="/admin/tenants" className="text-wa-500 hover:underline">كل التجار</Link>
          </div>
        </div>
        <div className="mb-4 grid grid-cols-2 gap-3 sm:grid-cols-2">
          <div className="rounded-lg border border-white/5 p-4">
            <p className="text-2xl font-bold text-white">{pendingPartnerApplications}</p>
            <p className="text-xs text-slate-400">طلب انضمام شريك بانتظار المراجعة</p>
          </div>
          <div className="rounded-lg border border-white/5 p-4">
            <p className="text-2xl font-bold text-white">{totalTenants}</p>
            <p className="text-xs text-slate-400">تاجر نشط على المنصة</p>
          </div>
        </div>
        {recentPartnerRequests.length > 0 && (
          <div className="space-y-2">
            <p className="text-xs font-medium text-slate-500">أحدث طلبات الشركاء</p>
            {recentPartnerRequests.map((r) => {
              const payload = r.payloadJson as { storeName?: string; ownerName?: string } | null;
              return (
                <div key={r.id} className="flex items-center justify-between rounded-lg border border-white/5 p-2 text-xs">
                  <div>
                    <p className="text-slate-200">{payload?.storeName ?? payload?.ownerName ?? r.applicantEmail ?? "—"}</p>
                    <p className="text-slate-500" dir="ltr">{r.applicantEmail}</p>
                  </div>
                  <span className={`badge ${STATUS_COLORS[r.status]}`}>{STATUS_LABELS_AR[r.status]}</span>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* مصفوفة صلاحيات شاملة مُشتقّة حياً من lib/rbac.ts — كل الأدوار (منصة + تجار) وكل الصلاحيات
          في مكان واحد، تتحدّث تلقائياً عند أي تعديل مستقبلي على ROLE_PERMISSIONS بلا أي نص ثابت منفصل. */}
      <div className="card overflow-hidden p-5">
        <h2 className="mb-1 font-semibold text-white">مصفوفة الصلاحيات الشاملة</h2>
        <p className="mb-4 text-sm text-slate-400">كل الأدوار وكل الصلاحيات الفعلية المُطبَّقة في الكود — تتحدّث تلقائياً مع أي تعديل مستقبلي</p>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[720px] text-sm">
            <thead>
              <tr className="border-b border-white/5 text-right text-xs text-slate-500">
                <th className="p-2 font-medium">الصلاحية</th>
                {ALL_ROLES_ORDERED.map((role) => (
                  <th key={role} className="p-2 text-center font-medium">{ROLE_LABELS_AR[role]}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              <tr>
                <td colSpan={ALL_ROLES_ORDERED.length + 1} className="bg-white/[0.03] p-2 text-xs font-semibold text-slate-400">
                  صلاحيات لوحة مالك المنصة
                </td>
              </tr>
              {(Object.entries(PLATFORM_PERMISSION_LABELS_AR) as [Permission, string][]).map(([permission, label]) => (
                <tr key={permission} className="border-b border-white/5 last:border-0">
                  <td className="p-2 text-slate-300">{label}</td>
                  {ALL_ROLES_ORDERED.map((role) => (
                    <td key={role} className="p-2 text-center">
                      {hasPermission(role, permission) ? <span className="text-success-500">✓</span> : <span className="text-slate-600">—</span>}
                    </td>
                  ))}
                </tr>
              ))}
              <tr>
                <td colSpan={ALL_ROLES_ORDERED.length + 1} className="bg-white/[0.03] p-2 text-xs font-semibold text-slate-400">
                  صلاحيات لوحة التاجر
                </td>
              </tr>
              {(Object.entries(TENANT_PERMISSION_LABELS_AR) as [Permission, string][]).map(([permission, label]) => (
                <tr key={permission} className="border-b border-white/5 last:border-0">
                  <td className="p-2 text-slate-300">{label}</td>
                  {ALL_ROLES_ORDERED.map((role) => (
                    <td key={role} className="p-2 text-center">
                      {hasPermission(role, permission) ? <span className="text-success-500">✓</span> : <span className="text-slate-600">—</span>}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="mt-3 text-xs text-slate-500">
          هذا الجدول يعرض صلاحيات الدور الافتراضية — الصلاحيات الفعلية لكل عضو قد تكون مخصَّصة، راجع زر
          "تخصيص الصلاحيات" الخاص به في قائمة الأعضاء أعلاه.
        </p>
      </div>
    </div>
  );
}
