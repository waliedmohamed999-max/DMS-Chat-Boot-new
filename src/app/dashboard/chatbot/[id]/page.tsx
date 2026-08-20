import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { requireTenantSession } from "@/lib/session";
import { withTenant, rawDb } from "@/lib/db";
import { hasEffectivePermission } from "@/lib/rbac";
import { getTenantChatbotLimits } from "@/lib/planLimits";
import { ChatbotFlowBuilder } from "@/components/dashboard/ChatbotFlowBuilder";
import { ChatbotFlowEditor } from "@/components/dashboard/ChatbotFlowEditor";
import { canDeleteFlow } from "@/lib/chatbot/permissions";
import { getConnectedPhoneNumber } from "@/lib/integrations/registry";
import type { FlowGraph } from "@/lib/chatbot/types";

export default async function ChatbotFlowPage({
  params,
  searchParams,
}: {
  params: { id: string };
  searchParams: { view?: string };
}) {
  const session = await requireTenantSession();

  if (!hasEffectivePermission(session.user.permissions, "chatbot.edit")) {
    redirect(`/dashboard/no-access?from=${encodeURIComponent("محرر الأتمتة")}`);
  }

  const [flow, limits, tenant, connectedPhoneNumber] = await Promise.all([
    withTenant(session.user.tenantId, (tx) => tx.chatbotFlow.findUnique({ where: { id: params.id, tenantId: session.user.tenantId } })),
    getTenantChatbotLimits(session.user.tenantId),
    rawDb.tenant.findUniqueOrThrow({ where: { id: session.user.tenantId } }),
    getConnectedPhoneNumber(session.user.tenantId),
  ]);

  if (!flow) notFound();

  // عرضان مستقلان لنفس بيانات التدفق (FlowGraph): "بسيط" (تسلسلي، افتراضي) و"متقدم" (لوحة رسم
  // حرة بربط يدوي) — كلاهما يقرأ/يكتب نفس البنية المخزَّنة، بلا حذف لأي منهما (قرار صريح من المستخدم).
  const view = searchParams.view === "canvas" ? "canvas" : "simple";
  const sharedProps = {
    flowId: flow.id,
    initialGraph: flow.nodesJson as unknown as FlowGraph,
    initialStatus: flow.status,
    storeName: tenant.name,
    connectedPhoneNumber,
    allowedNodeTypes: limits.allowedNodeTypes,
    canPublish: hasEffectivePermission(session.user.permissions, "chatbot.publish"),
    canDelete: canDeleteFlow(session.user.role, flow.status),
    initialTestRunCount: flow.testRunCount,
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <Link href="/dashboard/chatbot" className="text-sm text-accent-400 hover:underline">
          ← رجوع للأتمتة
        </Link>
        <Link href={`/dashboard/chatbot/${flow.id}/test`} className="text-sm text-slate-400 hover:underline">
          عرض كوضع اختبار فقط ↗
        </Link>
      </div>
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold text-white">{flow.name}</h1>
        <div className="flex gap-2">
          <Link href={`/dashboard/chatbot/${flow.id}?view=simple`} className={view === "simple" ? "btn-primary text-xs" : "btn-secondary text-xs"}>
            📋 عرض بسيط
          </Link>
          <Link href={`/dashboard/chatbot/${flow.id}?view=canvas`} className={view === "canvas" ? "btn-primary text-xs" : "btn-secondary text-xs"}>
            🕸️ عرض متقدم (رسم بياني)
          </Link>
        </div>
      </div>
      {view === "canvas" ? <ChatbotFlowEditor {...sharedProps} /> : <ChatbotFlowBuilder {...sharedProps} />}
    </div>
  );
}
