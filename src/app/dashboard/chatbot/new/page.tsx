import Link from "next/link";
import { redirect } from "next/navigation";
import { requireTenantSession } from "@/lib/session";
import { withTenant } from "@/lib/db";
import { hasEffectivePermission } from "@/lib/rbac";
import { getTenantChatbotLimits, isUnlimited } from "@/lib/planLimits";
import { FLOW_TEMPLATES } from "@/lib/chatbot/templates";
import { TemplateGallery } from "@/components/dashboard/TemplateGallery";

export default async function NewChatbotFlowPage() {
  const session = await requireTenantSession();
  if (!hasEffectivePermission(session.user.permissions, "chatbot.edit")) {
    redirect(`/dashboard/no-access?from=${encodeURIComponent("إنشاء تدفق شات بوت")}`);
  }

  const [limits, activeCount] = await Promise.all([
    getTenantChatbotLimits(session.user.tenantId),
    withTenant(session.user.tenantId, (tx) => tx.chatbotFlow.count({ where: { tenantId: session.user.tenantId } })),
  ]);
  const atFlowLimit = !isUnlimited(limits.maxActiveFlows) && activeCount >= limits.maxActiveFlows;
  const templateSummaries = FLOW_TEMPLATES.map(({ id, name, description, icon, tier }) => ({ id, name, description, icon, tier }));

  return (
    <div className="space-y-6">
      <Link href="/dashboard/chatbot" className="text-sm text-accent-400 hover:underline">
        ← رجوع للأتمتة
      </Link>
      <div>
        <h1 className="text-xl font-bold text-white">اختر قالباً جاهزاً</h1>
        <p className="text-sm text-slate-400">ابدأ بقالب جاهز في أقل من دقيقتين، أو اختر "تدفق فارغ" لبناء تدفقك من الصفر.</p>
      </div>

      <TemplateGallery templates={templateSummaries} templatesTier={limits.templatesTier} atFlowLimit={atFlowLimit} />
    </div>
  );
}
