import Link from "next/link";
import { requireSuperAdminSession } from "@/lib/session";
import { hasPermission } from "@/lib/rbac";
import { superAdminDb } from "@/lib/db";

const INACTIVITY_DAYS = 14;

export default async function PlatformHealthPage() {
  const session = await requireSuperAdminSession();
  if (!hasPermission(session.user.role, "platform.health.view")) {
    return (
      <div className="card p-8 text-center text-slate-400">
        ليس لديك صلاحية عرض صحة المنصة. هذه الصفحة محصورة بفريق الدعم الفني ومالك المنصة.
      </div>
    );
  }

  const [
    metaConnectedCount,
    metaTotalCount,
    webhookTotal,
    webhookFailed,
    topTenantsByUsage,
    subscriptionsNearLimit,
    inactiveOwners,
    lowEngagementTenants,
  ] = await Promise.all([
    superAdminDb.integration.count({ where: { provider: "META_WHATSAPP", status: "CONNECTED" } }),
    superAdminDb.integration.count({ where: { provider: "META_WHATSAPP" } }),
    superAdminDb.webhookLog.count(),
    superAdminDb.webhookLog.count({ where: { signatureValid: false } }),
    superAdminDb.subscription.findMany({
      include: { tenant: true, plan: true },
      orderBy: { messagesUsedThisPeriod: "desc" },
      take: 5,
    }),
    superAdminDb.subscription.findMany({ include: { tenant: true, plan: true } }),
    superAdminDb.user.findMany({
      where: {
        role: "OWNER",
        OR: [{ lastLoginAt: null }, { lastLoginAt: { lt: new Date(Date.now() - INACTIVITY_DAYS * 24 * 3600 * 1000) } }],
      },
      include: { tenant: true },
      orderBy: { lastLoginAt: "asc" },
      take: 10,
    }),
    superAdminDb.chatbotFlow.groupBy({ by: ["tenantId"], _sum: { testRunCount: true } }),
  ]);

  const nearLimitTenants = subscriptionsNearLimit
    .map((s) => ({ ...s, percent: s.plan.maxMessagesPerMonth ? (s.messagesUsedThisPeriod / s.plan.maxMessagesPerMonth) * 100 : 0 }))
    .filter((s) => s.percent >= 80)
    .sort((a, b) => b.percent - a.percent);

  const lowEngagementTenantIds = new Set(
    lowEngagementTenants.filter((t) => (t._sum.testRunCount ?? 0) === 0).map((t) => t.tenantId)
  );
  const tenantsForNames = await superAdminDb.tenant.findMany({
    where: { id: { in: Array.from(lowEngagementTenantIds) }, status: { in: ["ACTIVE", "TRIAL"] } },
    select: { id: true, name: true, slug: true },
  });

  const webhookFailureRate = webhookTotal > 0 ? Math.round((webhookFailed / webhookTotal) * 100) : 0;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-bold text-white">صحة المنصة</h1>
        <p className="text-sm text-slate-400">مؤشرات تشغيلية عبر كل التجار</p>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <div className="card p-4">
          <p className="text-xs text-slate-400">اتصال واتساب عبر المنصة</p>
          <p className="mt-1 font-bold text-white" dir="ltr">{metaConnectedCount} / {metaTotalCount}</p>
        </div>
        <div className="card p-4">
          <p className="text-xs text-slate-400">معدل فشل Webhooks (كل الوقت)</p>
          <p className={`mt-1 font-bold ${webhookFailureRate > 10 ? "text-danger-500" : "text-white"}`}>{webhookFailureRate}%</p>
        </div>
        <div className="card p-4">
          <p className="text-xs text-slate-400">تجار يقتربون من حد باقتهم</p>
          <p className="mt-1 font-bold text-warning-500">{nearLimitTenants.length}</p>
        </div>
      </div>

      <div className="card p-5">
        <h2 className="mb-3 font-semibold text-white">⚠️ تجار يقتربون من حد الرسائل (فرصة ترقية استباقية)</h2>
        <div className="space-y-2">
          {nearLimitTenants.length === 0 && <p className="text-sm text-slate-500">لا يوجد تجار قريبون من الحد حالياً.</p>}
          {nearLimitTenants.map((s) => (
            <Link key={s.id} href={`/admin/tenants/${s.tenantId}`} className="flex items-center justify-between rounded-lg border border-white/5 p-3 text-sm hover:bg-white/5">
              <span className="text-slate-300">{s.tenant.name}</span>
              <span className="text-warning-500" dir="ltr">{s.messagesUsedThisPeriod} / {s.plan.maxMessagesPerMonth} ({Math.round(s.percent)}%)</span>
            </Link>
          ))}
        </div>
      </div>

      <div className="card p-5">
        <h2 className="mb-3 font-semibold text-white">📊 أكثر التجار استهلاكاً للرسائل</h2>
        <div className="space-y-2">
          {topTenantsByUsage.map((s) => (
            <Link key={s.id} href={`/admin/tenants/${s.tenantId}`} className="flex items-center justify-between rounded-lg border border-white/5 p-3 text-sm hover:bg-white/5">
              <span className="text-slate-300">{s.tenant.name}</span>
              <span className="text-slate-400" dir="ltr">{s.messagesUsedThisPeriod} رسالة</span>
            </Link>
          ))}
        </div>
      </div>

      <div className="card p-5">
        <h2 className="mb-3 font-semibold text-white">🚩 مؤشرات مخاطر التسرب (تحتاج متابعة)</h2>
        <p className="mb-2 text-xs text-slate-500">أصحاب حسابات لم يسجلوا دخول منذ {INACTIVITY_DAYS} يوماً أو أكثر:</p>
        <div className="mb-4 space-y-2">
          {inactiveOwners.length === 0 && <p className="text-sm text-slate-500">لا يوجد.</p>}
          {inactiveOwners.map((u) => (
            <Link key={u.id} href={`/admin/tenants/${u.tenantId}`} className="flex items-center justify-between rounded-lg border border-white/5 p-3 text-sm hover:bg-white/5">
              <span className="text-slate-300">{u.tenant?.name}</span>
              <span className="text-danger-500">{u.lastLoginAt ? new Date(u.lastLoginAt).toLocaleDateString("ar-SA") : "لم يسجّل الدخول قط"}</span>
            </Link>
          ))}
        </div>
        <p className="mb-2 text-xs text-slate-500">تجار نشطون باستخدام شبه صفري للشات بوت:</p>
        <div className="space-y-2">
          {tenantsForNames.length === 0 && <p className="text-sm text-slate-500">لا يوجد.</p>}
          {tenantsForNames.map((t) => (
            <Link key={t.id} href={`/admin/tenants/${t.id}`} className="flex items-center justify-between rounded-lg border border-white/5 p-3 text-sm hover:bg-white/5">
              <span className="text-slate-300">{t.name}</span>
              <span className="text-slate-500">0 اختبارات شات بوت</span>
            </Link>
          ))}
        </div>
      </div>
    </div>
  );
}
