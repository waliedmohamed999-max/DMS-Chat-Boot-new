import { notFound } from "next/navigation";
import { requireTenantSession } from "@/lib/session";
import { withTenant } from "@/lib/db";
import { ROLE_LABELS_AR, hasPermission, resolveEffectivePermissions } from "@/lib/rbac";
import { inviteTeamMember, changeUserRole, toggleUserActive, updateUserPermissions } from "./actions";
import { InviteTeamMemberForm } from "@/components/dashboard/InviteTeamMemberForm";
import { PermissionsEditor } from "@/components/dashboard/PermissionsEditor";

export default async function SettingsPage() {
  const session = await requireTenantSession();
  if (!hasPermission(session.user.role, "team.manage")) notFound();
  const tenantId = session.user.tenantId;

  const [users, auditLogs] = await withTenant(tenantId, async (tx) => {
    return Promise.all([
      tx.user.findMany({ where: { tenantId }, orderBy: { createdAt: "asc" } }),
      tx.auditLog.findMany({ where: { tenantId }, include: { user: true }, orderBy: { createdAt: "desc" }, take: 20 }),
    ]);
  });

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-bold text-white">الفريق والإعدادات</h1>
        <p className="text-sm text-slate-400">إدارة أعضاء الفريق وصلاحياتهم وسجل النشاط</p>
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <div className="card p-5 lg:col-span-2">
          <h2 className="mb-4 font-semibold text-white">أعضاء الفريق</h2>
          <div className="space-y-2">
            {users.map((u) => (
              <div key={u.id} className="flex items-center justify-between rounded-lg border border-white/5 p-3">
                <div>
                  <p className="text-sm font-medium text-slate-100">{u.name}</p>
                  <p className="text-xs text-slate-500" dir="ltr">
                    {u.email}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  {u.role === "OWNER" ? (
                    <span className="badge bg-accent-500/10 text-accent-400">{ROLE_LABELS_AR[u.role]}</span>
                  ) : (
                    <>
                      <form action={changeUserRole.bind(null, u.id, u.role === "ADMIN" ? "AGENT" : "ADMIN")}>
                        <button className="badge border border-white/10 text-slate-300 hover:bg-white/5">
                          {ROLE_LABELS_AR[u.role]} (تبديل)
                        </button>
                      </form>
                      <form action={toggleUserActive.bind(null, u.id, !u.isActive)}>
                        <button className={`badge ${u.isActive ? "bg-success-500/10 text-success-500" : "bg-danger-500/10 text-danger-500"}`}>
                          {u.isActive ? "نشط" : "معطّل"}
                        </button>
                      </form>
                      <PermissionsEditor
                        userId={u.id}
                        userName={u.name}
                        initialPermissions={resolveEffectivePermissions(u)}
                        isCustomized={u.customPermissionsJson !== null}
                        updateUserPermissions={updateUserPermissions}
                      />
                    </>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="card p-5">
          <h2 className="mb-4 font-semibold text-white">دعوة عضو جديد</h2>
          <InviteTeamMemberForm inviteTeamMember={inviteTeamMember} />
        </div>
      </div>

      <div className="card p-5">
        <h2 className="mb-4 font-semibold text-white">سجل النشاط (Audit Log)</h2>
        <div className="space-y-2">
          {auditLogs.map((log) => (
            <div key={log.id} className="flex items-center justify-between border-b border-white/5 py-2 text-sm last:border-0">
              <span className="text-slate-300">
                {log.user?.name ?? "النظام"} — <span className="text-slate-500">{log.action}</span>
              </span>
              <span className="text-xs text-slate-500">{new Date(log.createdAt).toLocaleString("ar-SA")}</span>
            </div>
          ))}
          {auditLogs.length === 0 && <p className="text-sm text-slate-500">لا يوجد نشاط مسجّل بعد.</p>}
        </div>
      </div>
    </div>
  );
}
