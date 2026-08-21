import { requireTenantSession } from "@/lib/session";
import { withTenant } from "@/lib/db";
import { hasEffectivePermission } from "@/lib/rbac";
import { TenantChatSessionCard } from "./TenantChatSessionCard";

export default async function WebsiteChatSessionsPage() {
  const session = await requireTenantSession();
  const tenantId = session.user.tenantId;

  if (!hasEffectivePermission(session.user.permissions, "chatbot.edit")) {
    return (
      <div className="card p-8 text-center text-slate-400">
        ليس لديك صلاحية عرض جلسات شات موقعك — هذه الصفحة محصورة بمالك الحساب والمدير.
      </div>
    );
  }

  const sessions = await withTenant(tenantId, (tx) =>
    tx.tenantChatSession.findMany({
      where: { tenantId, status: { in: ["OPEN", "HANDED_OFF"] } },
      orderBy: { lastMessageAt: "desc" },
      include: {
        assignedTo: { select: { id: true, name: true } },
        messages: { orderBy: { createdAt: "desc" }, take: 20 },
      },
    })
  );

  const serialized = sessions.map((s) => ({
    id: s.id,
    tenantId,
    status: s.status as "OPEN" | "HANDED_OFF",
    visitorName: s.visitorName,
    visitorEmail: s.visitorEmail,
    assignedTo: s.assignedTo ? { id: s.assignedTo.id, name: s.assignedTo.name } : null,
    lastMessageAt: s.lastMessageAt.toISOString(),
    messages: s.messages
      .slice()
      .reverse()
      .map((m) => ({ id: m.id, senderType: m.senderType, text: m.text, createdAt: m.createdAt.toISOString() })),
  }));

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-bold text-white">جلسات شات موقعك</h1>
        <p className="text-sm text-slate-400">
          {serialized.length > 0 ? `${serialized.length} جلسة نشطة` : "لا توجد جلسات نشطة حالياً"} — من ويدجت الشات المُضمَّن في موقعك الخاص
        </p>
      </div>

      {serialized.length === 0 ? (
        <div className="card p-8 text-center text-slate-500">لا توجد جلسات نشطة حالياً.</div>
      ) : (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          {serialized.map((s) => (
            <TenantChatSessionCard key={s.id} session={s} />
          ))}
        </div>
      )}
    </div>
  );
}
