import Link from "next/link";
import { redirect } from "next/navigation";
import { requireTenantSession } from "@/lib/session";
import { withTenant } from "@/lib/db";
import { hasEffectivePermission } from "@/lib/rbac";
import { RateButtons } from "./RateButtons";

const LOW_CONFIDENCE_THRESHOLD = 40;

export default async function AiAgentReviewsPage() {
  const session = await requireTenantSession();
  const tenantId = session.user.tenantId;

  if (!hasEffectivePermission(session.user.permissions, "chatbot.edit")) {
    redirect(`/dashboard/no-access?from=${encodeURIComponent("مراجعة جودة الموظف الذكي")}`);
  }

  const logs = await withTenant(tenantId, (tx) =>
    tx.aiReplyLog.findMany({ where: { tenantId }, orderBy: { createdAt: "desc" }, take: 100, include: { conversation: { include: { contact: true } } } })
  );

  const needsReview = logs.filter((l) => l.handoffTriggered || l.confidenceScore < LOW_CONFIDENCE_THRESHOLD);

  return (
    <div className="space-y-6">
      <Link href="/dashboard/ai-agent" className="text-sm text-accent-400 hover:underline">← رجوع لإعدادات الموظف الذكي</Link>
      <div>
        <h1 className="text-xl font-bold text-white">📋 مراجعة جودة الموظف الذكي</h1>
        <p className="text-sm text-slate-400">
          {needsReview.length > 0 ? `${needsReview.length} رد يحتاج مراجعة (ثقة منخفضة أو تحويل فوري)` : "لا توجد ردود تحتاج مراجعة حالياً"}
        </p>
      </div>

      <div className="space-y-3">
        {logs.map((log) => {
          const needsAttention = log.handoffTriggered || log.confidenceScore < LOW_CONFIDENCE_THRESHOLD;
          return (
            <div key={log.id} className={`card p-4 ${needsAttention ? "border border-warning-500/30" : ""}`}>
              <div className="mb-2 flex flex-wrap items-center justify-between gap-2 text-xs text-slate-500">
                <span>{log.conversation?.contact?.name ?? "عميل غير معروف"} · {new Date(log.createdAt).toLocaleString("ar-SA")}</span>
                <div className="flex items-center gap-2">
                  {log.handoffTriggered && <span className="badge bg-warning-500/10 text-warning-500">تحويل لموظف</span>}
                  {!log.handoffTriggered && (
                    <span className={`badge ${log.confidenceScore < LOW_CONFIDENCE_THRESHOLD ? "bg-warning-500/10 text-warning-500" : "bg-success-500/10 text-success-500"}`}>
                      ثقة {log.confidenceScore}%
                    </span>
                  )}
                  {log.usedTool && <span className="badge bg-accent-500/10 text-accent-400" dir="ltr">{log.usedTool}</span>}
                </div>
              </div>
              <p className="mb-1 text-sm text-slate-400">👤 {log.userMessage}</p>
              {log.aiReply ? (
                <p className="text-sm text-slate-200">🤖 {log.aiReply}</p>
              ) : (
                <p className="text-sm italic text-slate-500">لم يُرسَل رد — حُوِّلت المحادثة مباشرة. السبب: {log.handoffReason}</p>
              )}
              <div className="mt-2 flex items-center justify-between">
                <span className="text-xs text-slate-600" dir="ltr">{log.totalTokens} tokens · {log.model}</span>
                {log.aiReply && <RateButtons logId={log.id} currentRating={log.rating} />}
              </div>
            </div>
          );
        })}
        {logs.length === 0 && <div className="card p-8 text-center text-slate-500">لا يوجد نشاط للموظف الذكي بعد.</div>}
      </div>
    </div>
  );
}
