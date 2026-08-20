import { requireSuperAdminSession } from "@/lib/session";
import { hasEffectivePermission } from "@/lib/rbac";
import { superAdminDb } from "@/lib/db";
import { LeadsList } from "./LeadsList";

export default async function LeadsPage() {
  const session = await requireSuperAdminSession();
  if (!hasEffectivePermission(session.user.permissions, "platform.leads.view")) {
    return (
      <div className="card p-8 text-center text-slate-400">
        ليس لديك صلاحية عرض رسائل التواصل. هذه الصفحة محصورة بفريق الدعم الفني ومالك المنصة.
      </div>
    );
  }

  const [messages, staff, totalCount] = await Promise.all([
    superAdminDb.contactMessage.findMany({ orderBy: { createdAt: "desc" }, take: 100, include: { assignedTo: true } }),
    superAdminDb.user.findMany({ where: { tenantId: null }, orderBy: { name: "asc" }, select: { id: true, name: true } }),
    superAdminDb.contactMessage.count(),
  ]);
  const pendingCount = messages.filter((m) => m.status === "NEW").length;

  const serialized = messages.map((m) => ({
    id: m.id,
    name: m.name,
    email: m.email,
    phone: m.phone,
    activityType: m.activityType,
    inquiryType: m.inquiryType,
    message: m.message,
    status: m.status,
    assignedToUserId: m.assignedToUserId,
    assignedTo: m.assignedTo ? { id: m.assignedTo.id, name: m.assignedTo.name } : null,
    createdAt: m.createdAt.toISOString(),
  }));

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-bold text-white">رسائل التواصل</h1>
        <p className="text-sm text-slate-400">
          {pendingCount > 0 ? `${pendingCount} رسالة جديدة بانتظار المتابعة` : "لا توجد رسائل جديدة بانتظار المتابعة"} — من نموذج "تواصل معنا" في الموقع التسويقي
        </p>
      </div>

      <LeadsList messages={serialized} staff={staff} />

      {totalCount > messages.length && (
        <p className="text-center text-xs text-slate-500">
          تُعرض آخر {messages.length} رسالة من أصل {totalCount} — استخدم البحث أعلاه لإيجاد رسائل أقدم.
        </p>
      )}
    </div>
  );
}
