import { requireTenantSession } from "@/lib/session";
import { withTenant } from "@/lib/db";
import Link from "next/link";

function StatCard({ label, value, hint, tone }: { label: string; value: string; hint?: string; tone?: "success" | "warning" | "danger" }) {
  const toneClass = tone === "success" ? "text-success-500" : tone === "warning" ? "text-warning-500" : tone === "danger" ? "text-danger-500" : "text-slate-100";
  return (
    <div className="card p-5">
      <p className="text-sm text-slate-400">{label}</p>
      <p dir="ltr" className={`mt-2 text-2xl font-bold ${toneClass} text-right`}>{value}</p>
      {hint && <p className="mt-1 text-xs text-slate-500">{hint}</p>}
    </div>
  );
}

export default async function DashboardOverviewPage() {
  const session = await requireTenantSession();
  const tenantId = session.user.tenantId;

  const data = await withTenant(tenantId, async (tx) => {
    const [needsReply, totalContacts, sentMessages, subscription, integrations, recentConvos] = await Promise.all([
      tx.conversation.count({ where: { tenantId, status: "NEEDS_REPLY" } }),
      tx.contact.count({ where: { tenantId } }),
      tx.message.count({ where: { tenantId, direction: "OUTBOUND" } }),
      tx.subscription.findUnique({ where: { tenantId }, include: { plan: true } }),
      tx.integration.findMany({ where: { tenantId } }),
      tx.conversation.findMany({
        where: { tenantId },
        orderBy: { lastMessageAt: "desc" },
        take: 5,
        include: { contact: true },
      }),
    ]);
    return { needsReply, totalContacts, sentMessages, subscription, integrations, recentConvos };
  });

  const usagePercent = data.subscription
    ? Math.min(100, Math.round((data.subscription.messagesUsedThisPeriod / data.subscription.plan.maxMessagesPerMonth) * 100))
    : 0;

  const connectedCount = data.integrations.filter((i) => i.status === "CONNECTED").length;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-bold text-white">نظرة عامة</h1>
        <p className="text-sm text-slate-400">ملخص أداء متجرك على واتساب</p>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard label="محادثات تحتاج رد" value={String(data.needsReply)} tone={data.needsReply > 0 ? "warning" : undefined} />
        <StatCard label="إجمالي جهات الاتصال" value={String(data.totalContacts)} />
        <StatCard label="رسائل مُرسلة (كل الوقت)" value={String(data.sentMessages)} />
        <StatCard
          label="التكاملات المتصلة"
          value={`${connectedCount} / 3`}
          tone={connectedCount === 3 ? "success" : connectedCount === 0 ? "danger" : "warning"}
        />
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <div className="card p-5 lg:col-span-2">
          <div className="mb-4 flex items-center justify-between">
            <h2 className="font-semibold text-white">أحدث المحادثات</h2>
            <Link href="/dashboard/inbox" className="text-sm text-accent-400 hover:underline">
              عرض الكل ←
            </Link>
          </div>
          <div className="space-y-2">
            {data.recentConvos.length === 0 && <p className="text-sm text-slate-500">لا توجد محادثات بعد.</p>}
            {data.recentConvos.map((c) => (
              <Link
                key={c.id}
                href={`/dashboard/inbox/${c.id}`}
                className="flex items-center justify-between rounded-lg border border-white/5 p-3 hover:bg-white/5"
              >
                <div>
                  <p className="text-sm font-medium text-slate-100">{c.contact.name}</p>
                  <p className="text-xs text-slate-500" dir="ltr">
                    {c.contact.phoneE164}
                  </p>
                </div>
                <span
                  className={`badge ${
                    c.status === "NEEDS_REPLY"
                      ? "bg-warning-500/10 text-warning-500"
                      : c.status === "NEW"
                        ? "bg-accent-500/10 text-accent-400"
                        : "bg-success-500/10 text-success-500"
                  }`}
                >
                  {c.status === "NEEDS_REPLY" ? "يحتاج رد" : c.status === "NEW" ? "جديد" : "تم الحل"}
                </span>
              </Link>
            ))}
          </div>
        </div>

        <div className="card p-5">
          <h2 className="mb-4 font-semibold text-white">الاشتراك الحالي</h2>
          {data.subscription ? (
            <div className="space-y-3">
              <p className="text-sm text-slate-300">
                باقة <span className="font-bold text-accent-400">{data.subscription.plan.name}</span>
              </p>
              <div>
                <div className="mb-1 flex justify-between text-xs text-slate-400">
                  <span>الرسائل المستخدمة</span>
                  <span dir="ltr">
                    {data.subscription.messagesUsedThisPeriod} / {data.subscription.plan.maxMessagesPerMonth}
                  </span>
                </div>
                <div className="h-2 overflow-hidden rounded-full bg-navy-700">
                  <div
                    className={`h-full rounded-full ${usagePercent > 90 ? "bg-danger-500" : usagePercent > 70 ? "bg-warning-500" : "bg-accent-500"}`}
                    style={{ width: `${usagePercent}%` }}
                  />
                </div>
              </div>
              <Link href="/dashboard/billing" className="btn-secondary mt-2 w-full text-sm">
                إدارة الاشتراك
              </Link>
            </div>
          ) : (
            <p className="text-sm text-slate-500">لا يوجد اشتراك نشط.</p>
          )}
        </div>
      </div>
    </div>
  );
}
