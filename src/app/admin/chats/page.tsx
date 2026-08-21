import { requireSuperAdminSession } from "@/lib/session";
import { hasEffectivePermission } from "@/lib/rbac";
import { superAdminDb } from "@/lib/db";
import { ChatSessionCard } from "./ChatSessionCard";

export default async function PlatformChatsPage() {
  const session = await requireSuperAdminSession();
  if (!hasEffectivePermission(session.user.permissions, "platform.chats.view")) {
    return (
      <div className="card p-8 text-center text-slate-400">
        ليس لديك صلاحية عرض جلسات شات الموقع العام. هذه الصفحة محصورة بفريق الدعم الفني ومالك المنصة.
      </div>
    );
  }

  const sessions = await superAdminDb.platformChatSession.findMany({
    where: { status: { in: ["OPEN", "HANDED_OFF"] } },
    orderBy: { lastMessageAt: "desc" },
    include: {
      assignedTo: { select: { id: true, name: true } },
      messages: { orderBy: { createdAt: "desc" }, take: 20 },
    },
  });

  const serialized = sessions.map((s) => ({
    id: s.id,
    status: s.status as "OPEN" | "HANDED_OFF",
    isDemo: s.isDemo,
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
        <h1 className="text-xl font-bold text-white">شات الموقع المباشر</h1>
        <p className="text-sm text-slate-400">
          {serialized.length > 0 ? `${serialized.length} جلسة نشطة` : "لا توجد جلسات نشطة حالياً"} — من فقاعة الشات في الموقع التسويقي العام
        </p>
      </div>

      {serialized.length === 0 ? (
        <div className="card p-8 text-center text-slate-500">لا توجد جلسات نشطة حالياً.</div>
      ) : (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          {serialized.map((s) => (
            <ChatSessionCard key={s.id} session={s} />
          ))}
        </div>
      )}
    </div>
  );
}
