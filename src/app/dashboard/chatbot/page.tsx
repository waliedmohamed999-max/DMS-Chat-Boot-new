import Link from "next/link";
import { requireTenantSession } from "@/lib/session";
import { withTenant } from "@/lib/db";
import { hasEffectivePermission } from "@/lib/rbac";
import { getTenantChatbotLimits, isUnlimited } from "@/lib/planLimits";
import { PLAN_TIER_LABELS_AR } from "@/lib/planLimits";
import { NODE_TYPES } from "@/lib/chatbot/nodeTypes";
import { WhatsAppPreview } from "@/components/dashboard/WhatsAppPreview";
import { getConnectedPhoneNumber } from "@/lib/integrations/registry";
import { duplicateFlow } from "./actions";
import type { FlowGraph } from "@/lib/chatbot/types";
import type { ChatbotNodeTypeKey } from "@/lib/planLimits";

/** ملخّص محتوى التدفق (نوع كل عقدة وعددها) — يجيب مباشرة على "إيه اللي جوّاه" بدون فتح المحرر. */
function summarizeNodes(nodes: FlowGraph["nodes"]): string {
  const counts = new Map<ChatbotNodeTypeKey, number>();
  for (const n of nodes) {
    if (n.type === "start") continue;
    counts.set(n.type, (counts.get(n.type) ?? 0) + 1);
  }
  if (counts.size === 0) return "لا خطوات بعد";
  return Array.from(counts.entries())
    .map(([type, count]) => `${NODE_TYPES[type].icon} ${count}`)
    .join(" · ");
}

export default async function ChatbotPage() {
  const session = await requireTenantSession();
  const tenantId = session.user.tenantId;
  const canEdit = hasEffectivePermission(session.user.permissions, "chatbot.edit");

  const [flows, limits, waIntegration, tenant, connectedPhoneNumber] = await Promise.all([
    withTenant(tenantId, (tx) => tx.chatbotFlow.findMany({ where: { tenantId }, orderBy: { updatedAt: "desc" } })),
    getTenantChatbotLimits(tenantId),
    withTenant(tenantId, (tx) => tx.integration.findUnique({ where: { tenantId_provider: { tenantId, provider: "META_WHATSAPP" } } })),
    withTenant(tenantId, (tx) => tx.tenant.findUniqueOrThrow({ where: { id: tenantId } })),
    getConnectedPhoneNumber(tenantId),
  ]);

  const activeConversationCounts = await withTenant(tenantId, async (tx) => {
    const publishedFlowIds = flows.filter((f) => f.status === "PUBLISHED").map((f) => f.id);
    if (publishedFlowIds.length === 0) return new Map<string, number>();
    const grouped = await tx.conversation.groupBy({
      by: ["activeFlowId"],
      where: { tenantId, controlMode: "BOT", activeFlowId: { in: publishedFlowIds } },
      _count: { _all: true },
    });
    return new Map(grouped.map((g) => [g.activeFlowId as string, g._count._all]));
  });

  const activeCount = flows.length;
  const atLimit = !isUnlimited(limits.maxActiveFlows) && activeCount >= limits.maxActiveFlows;
  const isLiveWhatsapp = waIntegration?.status === "CONNECTED" && !waIntegration.isSandbox;

  return (
    <div className="space-y-6">
      {!isLiveWhatsapp && (
        <div className="rounded-lg border border-warning-500/30 bg-warning-500/10 px-4 py-2.5 text-sm text-warning-500">
          🧪 وضع تجريبي — لم يتم ربط رقم واتساب حقيقي بعد. اختباراتك هنا تُحاكي المحادثة فقط. اربط
          رقمك من{" "}
          <Link href="/dashboard/integrations" className="underline">
            صفحة التكاملات
          </Link>{" "}
          لتفعيل الأتمتة على محادثات حقيقية.
        </div>
      )}

      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-white">الأتمتة</h1>
          <p className="text-sm text-slate-400">تدفقات رد تلقائي وتحويل للموظفين — تعمل فعلياً على رسائل واتساب حقيقية بعد النشر</p>
        </div>
        {canEdit && (
          <Link href="/dashboard/chatbot/new" className="btn-primary">
            + إنشاء تدفق جديد
          </Link>
        )}
      </div>

      <div className="card flex items-center justify-between p-4">
        <div>
          <p className="text-sm text-slate-300">
            باقتك الحالية: <span className="font-semibold text-accent-400">{PLAN_TIER_LABELS_AR[limits.planKey] ?? limits.planName}</span>
          </p>
          <p className="text-xs text-slate-500" dir="ltr">
            {activeCount} / {isUnlimited(limits.maxActiveFlows) ? "∞" : limits.maxActiveFlows} تدفقات مستخدمة
          </p>
        </div>
        {atLimit && (
          <Link href="/dashboard/billing" className="btn-secondary text-xs">
            وصلت للحد الأقصى — رقّي باقتك
          </Link>
        )}
      </div>

      {flows.length === 0 ? (
        <div className="card flex flex-col items-center justify-center gap-3 p-12 text-center">
          <div className="text-4xl">🤖</div>
          <p className="font-medium text-slate-200">لسه معملتش أي تدفق</p>
          <p className="max-w-xs text-sm text-slate-500">ابدأ بقالب جاهز في أقل من دقيقتين — لا حاجة لخبرة تقنية.</p>
          {canEdit ? (
            <Link href="/dashboard/chatbot/new" className="btn-primary">
              تصفّح القوالب الجاهزة
            </Link>
          ) : (
            <p className="text-xs text-slate-600">اطلب من صاحب الحساب أو المدير إنشاء أول تدفق.</p>
          )}
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-5 md:grid-cols-2 xl:grid-cols-3">
          {flows.map((f) => {
            const graph = f.nodesJson as unknown as FlowGraph;
            const href = canEdit ? `/dashboard/chatbot/${f.id}` : `/dashboard/chatbot/${f.id}/test`;
            const activeConversations = activeConversationCounts.get(f.id) ?? 0;

            return (
              <div key={f.id} className="card space-y-3 p-5">
                <Link href={href} className="block">
                  <div className="mb-2 flex items-center justify-between">
                    <h2 className="font-semibold text-white">{f.name}</h2>
                    <span className={`badge ${f.status === "PUBLISHED" ? "bg-success-500/10 text-success-500" : "bg-slate-500/10 text-slate-400"}`}>
                      {f.status === "PUBLISHED" ? "منشور" : "مسودة"}
                    </span>
                  </div>
                  <p className="mb-1 text-xs text-slate-400">{summarizeNodes(graph.nodes)}</p>
                  <p className="mb-3 text-[11px] text-slate-500">آخر تعديل {new Date(f.updatedAt).toLocaleDateString("ar-SA")}</p>
                  <WhatsAppPreview graph={graph} storeName={tenant.name} connectedPhoneNumber={connectedPhoneNumber} />
                  {f.status === "PUBLISHED" && (
                    <p className="mt-3 text-center text-xs text-accent-400">
                      💬 {activeConversations} محادثة نشطة الآن فعلياً
                    </p>
                  )}
                  {!canEdit && <p className="mt-2 text-center text-xs text-accent-400">عرض واختبار فقط ←</p>}
                </Link>
                {canEdit && (
                  <form action={duplicateFlow.bind(null, f.id)}>
                    <button type="submit" className="btn-secondary w-full text-xs">📋 نسخ كمسودة جديدة</button>
                  </form>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
