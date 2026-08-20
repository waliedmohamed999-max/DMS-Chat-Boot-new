import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { requireTenantSession } from "@/lib/session";
import { withTenant, rawDb } from "@/lib/db";
import { hasEffectivePermission } from "@/lib/rbac";
import { ChatbotTestOnlyPanel } from "@/components/dashboard/ChatbotTestOnlyPanel";
import { getConnectedPhoneNumber } from "@/lib/integrations/registry";
import type { FlowGraph } from "@/lib/chatbot/types";

export default async function ChatbotFlowTestOnlyPage({ params }: { params: { id: string } }) {
  const session = await requireTenantSession();

  if (!hasEffectivePermission(session.user.permissions, "chatbot.test")) {
    redirect(`/dashboard/no-access?from=${encodeURIComponent("اختبار الأتمتة")}`);
  }

  const [flow, tenant, connectedPhoneNumber] = await Promise.all([
    withTenant(session.user.tenantId, (tx) => tx.chatbotFlow.findUnique({ where: { id: params.id, tenantId: session.user.tenantId } })),
    rawDb.tenant.findUniqueOrThrow({ where: { id: session.user.tenantId } }),
    getConnectedPhoneNumber(session.user.tenantId),
  ]);

  if (!flow) notFound();

  return (
    <div className="space-y-6">
      <Link href="/dashboard/chatbot" className="text-sm text-accent-400 hover:underline">
        ← رجوع للأتمتة
      </Link>
      <div>
        <h1 className="text-xl font-bold text-white">{flow.name}</h1>
        <p className="text-sm text-slate-400">وضع عرض واختبار فقط — لا تملك صلاحية تعديل هذا التدفق.</p>
      </div>
      <ChatbotTestOnlyPanel
        flowId={flow.id}
        graph={flow.nodesJson as unknown as FlowGraph}
        storeName={tenant.name}
        connectedPhoneNumber={connectedPhoneNumber}
      />
    </div>
  );
}
