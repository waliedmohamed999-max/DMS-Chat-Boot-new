import Link from "next/link";
import { redirect } from "next/navigation";
import { requireTenantSession } from "@/lib/session";
import { withTenant } from "@/lib/db";
import { hasEffectivePermission } from "@/lib/rbac";
import { getTenantChatbotLimits, isNodeTypeAllowed } from "@/lib/planLimits";
import { TestChatPanel } from "./TestChatPanel";

export default async function AiAgentTestPage() {
  const session = await requireTenantSession();
  const tenantId = session.user.tenantId;

  if (!hasEffectivePermission(session.user.permissions, "chatbot.test")) {
    redirect(`/dashboard/no-access?from=${encodeURIComponent("تجربة الموظف الذكي")}`);
  }

  const limits = await getTenantChatbotLimits(tenantId);
  if (!isNodeTypeAllowed(limits, "ai_reply")) {
    redirect("/dashboard/ai-agent");
  }

  const config = await withTenant(tenantId, (tx) => tx.aiAgentConfig.upsert({ where: { tenantId }, update: {}, create: { tenantId } }));

  return (
    <div className="space-y-6">
      <Link href="/dashboard/ai-agent" className="text-sm text-accent-400 hover:underline">← رجوع لإعدادات الموظف الذكي</Link>
      <div>
        <h1 className="text-xl font-bold text-white">💬 جرّب موظفك الذكي</h1>
        <p className="text-sm text-slate-400">حادثه مباشرة كأنك عميل قبل تفعيله على محادثات حقيقية.</p>
      </div>
      <TestChatPanel agentName={config.agentName} />
    </div>
  );
}
