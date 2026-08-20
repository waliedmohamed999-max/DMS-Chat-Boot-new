import { notFound } from "next/navigation";
import Link from "next/link";
import { requireTenantSession } from "@/lib/session";
import { withTenant } from "@/lib/db";
import { hasEffectivePermission } from "@/lib/rbac";
import {
  markResolved, assignConversation, transferConversation, takeOverFromBot, addInternalNote, simulateIncomingMessage,
} from "../actions";
import { ConversationThread } from "@/components/dashboard/inbox/ConversationThread";
import { AssignTransferControls } from "@/components/dashboard/inbox/AssignTransferControls";
import { isSandboxMode } from "@/lib/integrations/types";
import type { MessageBubbleData } from "@/components/dashboard/inbox/MessageBubble";

const STATUS_LABELS: Record<string, { label: string; className: string }> = {
  NEW: { label: "جديد", className: "bg-accent-500/10 text-accent-400" },
  NEEDS_REPLY: { label: "يحتاج رد", className: "bg-warning-500/10 text-warning-500" },
  OPEN: { label: "بانتظار العميل", className: "bg-slate-500/10 text-slate-300" },
  RESOLVED: { label: "تم الحل", className: "bg-success-500/10 text-success-500" },
};

const ORDER_STATUS_LABELS: Record<string, string> = {
  ABANDONED_CART: "🛒 سلة متروكة", PENDING: "⏳ قيد الانتظار", PAID: "✅ مدفوع",
  SHIPPED: "🚚 تم الشحن", DELIVERED: "📦 تم التسليم", CANCELLED: "❌ ملغي",
};

export default async function ConversationThreadPage({ params }: { params: { id: string } }) {
  const session = await requireTenantSession();
  const tenantId = session.user.tenantId;
  const canAssign = hasEffectivePermission(session.user.permissions, "inbox.assign");

  const [conversation, teamMembers, quickReplies, approvedTemplates, sandbox] = await withTenant(tenantId, async (tx) => {
    return Promise.all([
      tx.conversation.findUnique({
        where: { id: params.id, tenantId },
        include: {
          contact: { include: { orders: { orderBy: { createdAt: "desc" }, take: 3 }, tags: { include: { tag: true } } } },
          assignedAgent: true,
          messages: { orderBy: { createdAt: "asc" }, include: { quotedMessage: { select: { id: true, body: true } } } },
          internalNotes: { orderBy: { createdAt: "desc" }, include: { author: true } },
        },
      }),
      tx.user.findMany({ where: { tenantId, isActive: true } }),
      tx.quickReply.findMany({ where: { tenantId }, orderBy: { shortcut: "asc" } }),
      tx.messageTemplate.findMany({ where: { tenantId, status: "APPROVED" } }),
      isSandboxMode(),
    ]);
  });

  if (!conversation) notFound();

  const status = STATUS_LABELS[conversation.status]!;
  const messages: MessageBubbleData[] = conversation.messages.map((m) => ({
    id: m.id, direction: m.direction, senderType: m.senderType, type: m.type, body: m.body,
    mediaUrl: m.mediaUrl, latitude: m.latitude, longitude: m.longitude, status: m.status,
    failureReason: m.failureReason, createdAt: m.createdAt.toISOString(), quotedMessage: m.quotedMessage,
  }));

  return (
    <div className="flex h-full gap-4">
      <div className="flex flex-1 flex-col rounded-xl2 border border-white/5 bg-navy-800">
        <div className="flex items-center justify-between border-b border-white/5 p-4">
          <div className="flex items-center gap-3">
            <div>
              <p className="font-semibold text-white">{conversation.contact.name}</p>
              <p className="text-xs text-slate-500" dir="ltr">{conversation.contact.phoneE164}</p>
            </div>
            <span className={`badge ${status.className}`}>{status.label}</span>
            <span className={`badge ${conversation.controlMode === "BOT" ? "bg-accent-500/10 text-accent-400" : "bg-white/5 text-slate-400"}`}>
              {conversation.controlMode === "BOT" ? "🤖 يتحكم البوت" : "🙋 يتحكم موظف"}
            </span>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {conversation.controlMode === "BOT" && (
              <form action={takeOverFromBot.bind(null, conversation.id)}>
                <button className="btn-secondary text-xs">🙋 الاستيلاء من البوت</button>
              </form>
            )}
            {conversation.status !== "RESOLVED" && (
              <form action={markResolved.bind(null, conversation.id)}>
                <button className="btn-secondary text-xs">✅ تحديد كمحلولة</button>
              </form>
            )}
          </div>
        </div>

        {canAssign && (
          <AssignTransferControls
            assignedAgentId={conversation.assignedAgentId}
            teamMembers={teamMembers.map((u) => ({ id: u.id, name: u.name }))}
            onAssign={assignConversation.bind(null, conversation.id)}
            onTransfer={transferConversation.bind(null, conversation.id)}
          />
        )}

        {sandbox && (
          <div className="flex flex-wrap items-center gap-2 border-b border-white/5 bg-warning-500/5 px-4 py-2">
            <span className="text-[11px] text-warning-500">🧪 محاكاة رسالة واردة (Sandbox):</span>
            {(["text", "image", "document", "location"] as const).map((kind) => (
              <form key={kind} action={simulateIncomingMessage.bind(null, conversation.contact.phoneE164, conversation.contact.name, kind)}>
                <button className="rounded-full border border-white/10 px-2 py-0.5 text-[11px] text-slate-300 hover:bg-white/5">
                  {kind === "text" ? "💬 نص" : kind === "image" ? "🖼️ صورة" : kind === "document" ? "📄 مستند" : "📍 موقع"}
                </button>
              </form>
            ))}
          </div>
        )}

        <ConversationThread
          conversationId={conversation.id}
          messages={messages}
          sessionWindowExpiresAt={conversation.sessionWindowExpiresAt?.toISOString() ?? null}
          quickReplies={quickReplies}
          approvedTemplates={approvedTemplates.map((t) => ({ id: t.id, name: t.name, bodyText: t.bodyText }))}
        />
      </div>

      <div className="card w-72 shrink-0 space-y-4 overflow-y-auto p-4">
        <div>
          <h2 className="mb-2 text-sm font-semibold text-white">بيانات العميل</h2>
          <Link href={`/dashboard/contacts/${conversation.contact.id}`} className="text-sm text-accent-400 hover:underline">
            عرض ملف العميل الكامل →
          </Link>
        </div>

        {conversation.contact.tags.length > 0 && (
          <div>
            <p className="mb-1.5 text-xs font-medium text-slate-400">الوسوم</p>
            <div className="flex flex-wrap gap-1">
              {conversation.contact.tags.map((t) => (
                <span key={t.tagId} className="badge bg-white/5" style={{ color: t.tag.color }}>{t.tag.name}</span>
              ))}
            </div>
          </div>
        )}

        <div>
          <p className="mb-2 text-xs font-medium text-slate-400">آخر الطلبات</p>
          {conversation.contact.orders.length === 0 && <p className="text-xs text-slate-500">لا توجد طلبات</p>}
          {conversation.contact.orders.map((o) => (
            <div key={o.id} className="mb-2 rounded-lg border border-white/5 p-2 text-xs">
              <p className="text-slate-300">{o.externalId}</p>
              <p className="text-slate-500">{o.totalSar} ر.س — {ORDER_STATUS_LABELS[o.status] ?? o.status}</p>
            </div>
          ))}
        </div>

        <div>
          <p className="mb-2 text-xs font-medium text-slate-400">📝 ملاحظات داخلية (لا تصل للعميل إطلاقاً)</p>
          <form action={addInternalNote.bind(null, conversation.id)} className="mb-3 flex gap-1.5">
            <input name="body" required className="input-field flex-1 !py-1.5 text-xs" placeholder="أضف ملاحظة..." />
            <button className="btn-secondary text-xs">حفظ</button>
          </form>
          <div className="space-y-2">
            {conversation.internalNotes.map((n) => (
              <div key={n.id} className="rounded-lg border border-warning-500/20 bg-warning-500/5 p-2 text-xs">
                <p className="text-slate-200">{n.body}</p>
                <p className="mt-1 text-[10px] text-slate-500">{n.author?.name ?? "🤖 ملخص تلقائي"} · {new Date(n.createdAt).toLocaleString("ar-SA")}</p>
              </div>
            ))}
            {conversation.internalNotes.length === 0 && <p className="text-xs text-slate-500">لا توجد ملاحظات بعد.</p>}
          </div>
        </div>
      </div>
    </div>
  );
}
