import { requireSuperAdminSession } from "@/lib/session";
import { hasEffectivePermission } from "@/lib/rbac";
import { superAdminDb } from "@/lib/db";
import { LeadControls } from "./LeadControls";

export default async function LeadsPage() {
  const session = await requireSuperAdminSession();
  if (!hasEffectivePermission(session.user.permissions, "platform.leads.view")) {
    return (
      <div className="card p-8 text-center text-slate-400">
        ليس لديك صلاحية عرض رسائل التواصل. هذه الصفحة محصورة بفريق الدعم الفني ومالك المنصة.
      </div>
    );
  }

  const [messages, staff] = await Promise.all([
    superAdminDb.contactMessage.findMany({ orderBy: { createdAt: "desc" }, take: 100, include: { assignedTo: true } }),
    superAdminDb.user.findMany({ where: { tenantId: null }, orderBy: { name: "asc" }, select: { id: true, name: true } }),
  ]);
  const pendingCount = messages.filter((m) => m.status === "NEW").length;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-bold text-white">رسائل التواصل</h1>
        <p className="text-sm text-slate-400">
          {pendingCount > 0 ? `${pendingCount} رسالة جديدة بانتظار المتابعة` : "لا توجد رسائل جديدة بانتظار المتابعة"} — من نموذج "تواصل معنا" في الموقع التسويقي
        </p>
      </div>

      <div className="space-y-3">
        {messages.map((m) => (
          <div key={m.id} className={`card p-5 ${m.status === "CLOSED" || m.status === "CONVERTED" ? "opacity-60" : ""}`}>
            <div className="mb-2 flex items-center justify-between">
              <div>
                <p className="font-semibold text-white">{m.name}</p>
                <p className="text-xs text-slate-500">
                  {m.activityType} · {new Date(m.createdAt).toLocaleString("ar-SA")}
                  {m.assignedTo && <span> · معيَّنة لـ{m.assignedTo.name}</span>}
                </p>
              </div>
              <span className="badge bg-accent-500/10 text-accent-400">{m.inquiryType}</span>
            </div>
            <div className="mb-2 flex gap-4 text-sm text-slate-400" dir="ltr">
              <span>{m.email}</span>
              <span>{m.phone}</span>
            </div>
            <p className="mb-3 rounded-lg bg-navy-900 p-3 text-sm text-slate-300">{m.message}</p>
            <LeadControls id={m.id} status={m.status} assignedToUserId={m.assignedToUserId} staff={staff} />
          </div>
        ))}
        {messages.length === 0 && (
          <div className="card p-8 text-center text-slate-500">لا توجد رسائل تواصل بعد.</div>
        )}
      </div>
    </div>
  );
}
