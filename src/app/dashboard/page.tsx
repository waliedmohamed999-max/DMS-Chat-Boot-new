import { requireTenantSession } from "@/lib/session";
import { withTenant } from "@/lib/db";
import { hasEffectivePermission } from "@/lib/rbac";
import { isUnlimited } from "@/lib/planLimits";
import { BarChart } from "@/components/admin/BarChart";
import { DonutChart } from "@/components/admin/DonutChart";
import Link from "next/link";

const DAY_LABELS_AR = ["الأحد", "الإثنين", "الثلاثاء", "الأربعاء", "الخميس", "الجمعة", "السبت"];
const CONVO_STATUS_LABELS_AR: Record<string, string> = { NEEDS_REPLY: "يحتاج رد", NEW: "جديد", OPEN: "تم الحل", RESOLVED: "تم الحل" };

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

  const canViewOrders = hasEffectivePermission(session.user.permissions, "orders.view");
  const canManageOrders = hasEffectivePermission(session.user.permissions, "orders.manage");
  const canManageCampaigns = hasEffectivePermission(session.user.permissions, "campaigns.manage");
  const canManageAiSettings = hasEffectivePermission(session.user.permissions, "settings.manage");
  const canManageTeam = hasEffectivePermission(session.user.permissions, "team.manage");

  const now = new Date();
  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const sevenDaysAgoStart = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 6);
  const last7Days = Array.from({ length: 7 }, (_, i) => {
    const d = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 6 + i);
    return { key: `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`, date: d, dayLabel: DAY_LABELS_AR[d.getDay()] ?? "" };
  });

  const data = await withTenant(tenantId, async (tx) => {
    const [
      needsReply, totalContacts, sentMessages, subscription, integrations, recentConvos,
      outboundMessages7d, conversationsByStatus, abandonedNeedingAction, aiConfig, aiReplyLogsToday,
    ] = await Promise.all([
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
      tx.message.findMany({ where: { tenantId, direction: "OUTBOUND", createdAt: { gte: sevenDaysAgoStart } }, select: { createdAt: true } }),
      tx.conversation.groupBy({ by: ["status"], where: { tenantId }, _count: true }),
      canViewOrders ? tx.order.count({ where: { tenantId, status: "ABANDONED_CART", recoveryMessageSentAt: null } }) : Promise.resolve(0),
      tx.aiAgentConfig.findUnique({ where: { tenantId } }),
      tx.aiReplyLog.findMany({ where: { tenantId, createdAt: { gte: todayStart } }, select: { handoffTriggered: true } }),
    ]);
    return {
      needsReply, totalContacts, sentMessages, subscription, integrations, recentConvos,
      outboundMessages7d, conversationsByStatus, abandonedNeedingAction, aiConfig, aiReplyLogsToday,
    };
  });

  const usagePercent = data.subscription
    ? Math.min(100, Math.round((data.subscription.messagesUsedThisPeriod / data.subscription.plan.maxMessagesPerMonth) * 100))
    : 0;

  const maxAiTokensRaw = (data.subscription?.plan.chatbotLimitsJson as { maxAiTokensPerMonth?: number } | null)?.maxAiTokensPerMonth;
  const hasAiTokenLimit = data.subscription && typeof maxAiTokensRaw === "number";
  const aiTokensUnlimited = hasAiTokenLimit && isUnlimited(maxAiTokensRaw!);
  const aiTokensPercent =
    hasAiTokenLimit && !aiTokensUnlimited && maxAiTokensRaw! > 0
      ? Math.min(100, Math.round((data.subscription!.aiTokensUsedThisPeriod / maxAiTokensRaw!) * 100))
      : 0;

  const connectedCount = data.integrations.filter((i) => i.status === "CONNECTED").length;

  const dailyMessageCounts = new Map<string, number>(last7Days.map((d) => [d.key, 0]));
  for (const m of data.outboundMessages7d) {
    const key = `${m.createdAt.getFullYear()}-${m.createdAt.getMonth()}-${m.createdAt.getDate()}`;
    if (dailyMessageCounts.has(key)) dailyMessageCounts.set(key, (dailyMessageCounts.get(key) ?? 0) + 1);
  }
  const messagesTrend = last7Days.map((d) => ({ label: d.dayLabel, amountSar: dailyMessageCounts.get(d.key) ?? 0 }));

  const convoStatusCounts = new Map<string, number>();
  for (const row of data.conversationsByStatus) {
    const label = CONVO_STATUS_LABELS_AR[row.status] ?? row.status;
    convoStatusCounts.set(label, (convoStatusCounts.get(label) ?? 0) + row._count);
  }
  const convoStatusDonutData = Array.from(convoStatusCounts.entries()).map(([label, value]) => ({ label, value }));

  const aiRepliesToday = data.aiReplyLogsToday.length;
  const aiHandoffsToday = data.aiReplyLogsToday.filter((l) => l.handoffTriggered).length;
  const aiHandoffRatePercent = aiRepliesToday > 0 ? Math.round((aiHandoffsToday / aiRepliesToday) * 100) : null;

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

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <div className="card p-5">
          <h2 className="mb-4 font-semibold text-white">الرسائل المُرسلة — آخر 7 أيام</h2>
          <BarChart data={messagesTrend} />
        </div>
        <div className="card p-5">
          <h2 className="mb-4 font-semibold text-white">حالة المحادثات</h2>
          <DonutChart data={convoStatusDonutData} />
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        {canViewOrders && (
          <Link href="/dashboard/orders" className="card p-5 transition hover:bg-white/5">
            <p className="text-sm text-slate-400">سلات متروكة بحاجة استرداد</p>
            <p className={`mt-2 text-2xl font-bold ${data.abandonedNeedingAction > 0 ? "text-warning-500" : "text-white"}`}>
              {data.abandonedNeedingAction}
            </p>
            {data.abandonedNeedingAction > 0 && <p className="mt-1 text-xs text-warning-500">استهدفهم الآن ←</p>}
          </Link>
        )}

        <div className="card p-5">
          <h2 className="mb-3 font-semibold text-white">🤖 الموظف الذكي — نشاط اليوم</h2>
          {!data.aiConfig?.enabled ? (
            <div>
              <p className="text-sm text-slate-500">الموظف الذكي غير مفعَّل بعد.</p>
              <Link href="/dashboard/ai-agent" className="btn-secondary mt-3 inline-block text-sm">تفعيله الآن</Link>
            </div>
          ) : (
            <>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <p className="text-xs text-slate-400">عدد الردود اليوم</p>
                  <p className="mt-1 text-xl font-bold text-white" dir="ltr">{aiRepliesToday}</p>
                </div>
                <div>
                  <p className="text-xs text-slate-400">نسبة التحويل لموظف بشري</p>
                  <p className="mt-1 text-xl font-bold text-warning-500" dir="ltr">{aiHandoffRatePercent === null ? "—" : `${aiHandoffRatePercent}%`}</p>
                </div>
              </div>
              <Link href="/dashboard/ai-agent/reviews" className="mt-3 inline-block text-sm text-accent-400 hover:underline">مراجعة الردود ←</Link>
            </>
          )}
        </div>
      </div>

      {(canManageCampaigns || canManageOrders || canManageAiSettings || canManageTeam) && (
        <div className="card p-5">
          <h2 className="mb-3 font-semibold text-white">إجراءات سريعة</h2>
          <div className="flex flex-wrap gap-2">
            {canManageCampaigns && <Link href="/dashboard/campaigns/new" className="btn-secondary text-sm">📣 حملة جديدة</Link>}
            {canManageOrders && <Link href="/dashboard/orders" className="btn-secondary text-sm">🛒 استهداف السلات المتروكة</Link>}
            {canManageAiSettings && <Link href="/dashboard/ai-agent" className="btn-secondary text-sm">🤖 إعدادات الموظف الذكي</Link>}
            {canManageTeam && <Link href="/dashboard/settings" className="btn-secondary text-sm">👥 دعوة عضو فريق</Link>}
          </div>
        </div>
      )}

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
              {hasAiTokenLimit && (
                <div>
                  <div className="mb-1 flex justify-between text-xs text-slate-400">
                    <span>توكنز الذكاء الاصطناعي المستخدمة</span>
                    <span dir="ltr">
                      {aiTokensUnlimited
                        ? `${data.subscription.aiTokensUsedThisPeriod} (غير محدود)`
                        : `${data.subscription.aiTokensUsedThisPeriod} / ${maxAiTokensRaw}`}
                    </span>
                  </div>
                  {!aiTokensUnlimited && (
                    <div className="h-2 overflow-hidden rounded-full bg-navy-700">
                      <div
                        className={`h-full rounded-full ${aiTokensPercent > 90 ? "bg-danger-500" : aiTokensPercent > 70 ? "bg-warning-500" : "bg-accent-500"}`}
                        style={{ width: `${aiTokensPercent}%` }}
                      />
                    </div>
                  )}
                </div>
              )}
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
