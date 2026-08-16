import { notFound } from "next/navigation";
import { superAdminDb } from "@/lib/db";
import { requireSuperAdminSession } from "@/lib/session";
import { hasPermission, ROLE_LABELS_AR } from "@/lib/rbac";
import { toggleMerchantUserActive } from "../../actions";

export default async function TenantTeamPage({ params }: { params: { id: string } }) {
  const session = await requireSuperAdminSession();
  const canSuspend = hasPermission(session.user.role, "platform.merchants.suspend");

  const tenant = await superAdminDb.tenant.findUnique({
    where: { id: params.id },
    include: { users: { orderBy: { createdAt: "asc" } } },
  });
  if (!tenant) notFound();

  return (
    <div className="card p-5">
      <h2 className="mb-4 font-semibold text-white">فريق {tenant.name}</h2>
      <div className="space-y-2">
        {tenant.users.map((u) => (
          <div key={u.id} className="flex items-center justify-between rounded-lg border border-white/5 p-3 text-sm">
            <div>
              <p className="text-slate-300">{u.name}</p>
              <p className="text-xs text-slate-500" dir="ltr">{u.email}</p>
              {u.lastLoginAt && <p className="text-xs text-slate-600">آخر دخول: {new Date(u.lastLoginAt).toLocaleString("ar-SA")}</p>}
            </div>
            <div className="flex items-center gap-2">
              <span className="badge bg-white/5 text-slate-400">{ROLE_LABELS_AR[u.role]}</span>
              {canSuspend && u.role !== "OWNER" && (
                <form action={toggleMerchantUserActive.bind(null, tenant.id, u.id, !u.isActive)}>
                  <button className={`badge ${u.isActive ? "bg-success-500/10 text-success-500" : "bg-danger-500/10 text-danger-500"}`}>
                    {u.isActive ? "نشط" : "معطّل"}
                  </button>
                </form>
              )}
            </div>
          </div>
        ))}
        {tenant.users.length === 0 && <p className="text-sm text-slate-500">لا يوجد أعضاء بعد.</p>}
      </div>
    </div>
  );
}
