import Link from "next/link";
import { requireSuperAdminSession } from "@/lib/session";
import { hasEffectivePermission } from "@/lib/rbac";
import { superAdminDb } from "@/lib/db";

export const metadata = { title: "مراقبة الإرسال — DMS Tech" };

const WINDOWS = { "24h": { label: "آخر 24 ساعة", ms: 24 * 3600_000 }, "7d": { label: "آخر 7 أيام", ms: 7 * 24 * 3600_000 }, "30d": { label: "آخر 30 يوماً", ms: 30 * 24 * 3600_000 } } as const;
type WindowKey = keyof typeof WINDOWS;

/** نسبة مئوية آمنة من القسمة على صفر. */
function pct(part: number, total: number): string {
  return total ? `${((part / total) * 100).toFixed(1)}%` : "—";
}

/**
 * مراقبة تشغيلية للإرسال بعد الانتقال لـ 360dialog (المرحلة 4): نجاح/فشل الرسائل الصادرة وأسباب الفشل،
 * الخصومات والاستردادات من المحافظ، المحافظ النافدة، الحملات المتوقفة، أخطاء webhooks، والقنوات المتعثرة.
 */
export default async function MonitoringPage(props: { searchParams: Promise<{ w?: string }> }) {
  const session = await requireSuperAdminSession();
  if (!hasEffectivePermission(session.user.permissions, "platform.health.view")) {
    return <div className="card p-8 text-center text-slate-400">ليس لديك صلاحية عرض هذه الصفحة.</div>;
  }
  const { w } = await props.searchParams;
  const win: WindowKey = w && w in WINDOWS ? (w as WindowKey) : "24h";
  const since = new Date(Date.now() - WINDOWS[win].ms);

  const [byStatus, failureReasons, usageByStatus, recharges, emptyWallets, pausedCampaigns, webhookByProvider, recentWebhookErrors, troubledChannels] = await Promise.all([
    superAdminDb.message.groupBy({ by: ["status"], where: { direction: "OUTBOUND", createdAt: { gte: since } }, _count: { _all: true } }),
    superAdminDb.message.groupBy({
      by: ["failureReason"], where: { direction: "OUTBOUND", status: "FAILED", createdAt: { gte: since } },
      _count: { _all: true }, orderBy: { _count: { failureReason: "desc" } }, take: 8,
    }),
    superAdminDb.messageUsage.groupBy({ by: ["status"], where: { createdAt: { gte: since } }, _count: { _all: true }, _sum: { cost: true, baseCost: true } }),
    superAdminDb.walletTransaction.aggregate({ where: { type: "RECHARGE", createdAt: { gte: since } }, _count: { _all: true }, _sum: { amount: true } }),
    superAdminDb.walletBalance.findMany({
      where: { balance: { lte: 0 }, tenant: { integrations: { some: { provider: "D360DIALOG", status: "CONNECTED", isSandbox: false } } } },
      include: { tenant: { select: { name: true } } }, take: 20,
    }),
    superAdminDb.campaign.findMany({
      where: { status: "PAUSED", updatedAt: { gte: since } }, select: { id: true, name: true, tenantId: true, tenant: { select: { name: true } } },
      orderBy: { updatedAt: "desc" }, take: 10,
    }),
    superAdminDb.webhookLog.groupBy({ by: ["provider", "signatureValid"], where: { createdAt: { gte: since } }, _count: { _all: true } }),
    superAdminDb.webhookLog.findMany({
      where: { createdAt: { gte: since }, OR: [{ signatureValid: false }, { processedAt: null }] },
      select: { id: true, provider: true, eventType: true, errorMessage: true, createdAt: true, tenant: { select: { name: true } } },
      orderBy: { createdAt: "desc" }, take: 15,
    }),
    superAdminDb.integration.findMany({
      where: { provider: { in: ["D360DIALOG", "META_WHATSAPP"] }, isSandbox: false, OR: [{ status: { in: ["ERROR", "NEEDS_REAUTH"] } }, { lastError: { not: null } }] },
      select: { id: true, provider: true, status: true, lastError: true, tenant: { select: { name: true } } }, take: 20,
    }),
  ]);

  const statusCount = (s: string) => byStatus.find((b) => b.status === s)?._count._all ?? 0;
  const outboundTotal = byStatus.reduce((n, b) => n + b._count._all, 0);
  const failed = statusCount("FAILED");
  const delivered = statusCount("DELIVERED") + statusCount("READ");
  const usage = (s: string) => usageByStatus.find((u) => u.status === s);
  const charged = usage("CHARGED");
  const refunded = usage("REFUNDED");
  const revenue = Number(charged?._sum.cost ?? 0);
  const margin = revenue - Number(charged?._sum.baseCost ?? 0);

  const webhookTotals = new Map<string, { total: number; invalid: number }>();
  for (const row of webhookByProvider) {
    const cur = webhookTotals.get(row.provider) ?? { total: 0, invalid: 0 };
    cur.total += row._count._all;
    if (!row.signatureValid) cur.invalid += row._count._all;
    webhookTotals.set(row.provider, cur);
  }

  const cards = [
    { label: "رسائل صادرة", value: outboundTotal.toLocaleString("ar-SA") },
    { label: "نسبة الفشل", value: pct(failed, outboundTotal), bad: outboundTotal > 20 && failed / outboundTotal > 0.1 },
    { label: "نسبة الوصول", value: pct(delivered, outboundTotal) },
    { label: "رسائل مدفوعة", value: (charged?._count._all ?? 0).toLocaleString("ar-SA") },
    { label: "إيراد الرسائل", value: `${revenue.toFixed(2)} ر.س` },
    { label: "هامش الربح", value: `${margin.toFixed(2)} ر.س` },
    { label: "استردادات (فشل مزوّد)", value: (refunded?._count._all ?? 0).toLocaleString("ar-SA"), bad: (refunded?._count._all ?? 0) > 0 },
    { label: "شحنات المحافظ", value: `${recharges._count._all} · ${Number(recharges._sum.amount ?? 0).toFixed(0)} ر.س` },
  ];

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold text-white">مراقبة الإرسال</h1>
          <p className="text-sm text-slate-400">صحة إرسال واتساب والمحافظ وwebhooks على مستوى المنصة.</p>
        </div>
        <div className="flex gap-2">
          {(Object.keys(WINDOWS) as WindowKey[]).map((k) => (
            <Link key={k} href={`/admin/monitoring?w=${k}`} className={`rounded-lg px-3 py-1.5 text-xs ${k === win ? "bg-accent-500 text-white" : "bg-white/5 text-slate-300 hover:bg-white/10"}`}>
              {WINDOWS[k].label}
            </Link>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        {cards.map((c) => (
          <div key={c.label} className={`card p-4 ${c.bad ? "border border-danger-500/40" : ""}`}>
            <p className="text-xs text-slate-400">{c.label}</p>
            <p className={`mt-1 text-xl font-bold ${c.bad ? "text-danger-500" : "text-white"}`}>{c.value}</p>
          </div>
        ))}
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <section className="card p-4">
          <h2 className="mb-3 font-bold text-white">أكثر أسباب فشل الإرسال</h2>
          {failureReasons.length === 0 ? (
            <p className="text-sm text-slate-500">لا رسائل فاشلة في هذه الفترة.</p>
          ) : (
            <ul className="space-y-2 text-sm">
              {failureReasons.map((r) => (
                <li key={r.failureReason ?? "none"} className="flex justify-between gap-3">
                  <span className="text-slate-300">{r.failureReason ?? "بلا سبب مسجَّل"}</span>
                  <span className="font-mono text-slate-400">{r._count._all}</span>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className="card p-4">
          <h2 className="mb-3 font-bold text-white">Webhooks حسب المزوّد</h2>
          {webhookTotals.size === 0 ? (
            <p className="text-sm text-slate-500">لا أحداث واردة في هذه الفترة.</p>
          ) : (
            <ul className="space-y-2 text-sm">
              {[...webhookTotals.entries()].map(([p, v]) => (
                <li key={p} className="flex justify-between gap-3">
                  <span className="text-slate-300">{p}</span>
                  <span className="text-slate-400">
                    {v.total} حدث{v.invalid > 0 && <span className="mr-2 text-danger-500">· {v.invalid} توقيع غير صالح</span>}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className="card p-4">
          <h2 className="mb-3 font-bold text-white">محافظ نافدة (قنوات 360dialog فعّالة)</h2>
          {emptyWallets.length === 0 ? (
            <p className="text-sm text-slate-500">لا محافظ نافدة.</p>
          ) : (
            <ul className="space-y-2 text-sm">
              {emptyWallets.map((wl) => (
                <li key={wl.tenantId} className="flex justify-between">
                  <Link href={`/admin/wallets/${wl.tenantId}`} className="text-slate-200 hover:underline">{wl.tenant.name}</Link>
                  <span className="text-danger-500" dir="ltr">{Number(wl.balance).toFixed(2)} SAR</span>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className="card p-4">
          <h2 className="mb-3 font-bold text-white">حملات متوقفة مؤقتاً</h2>
          {pausedCampaigns.length === 0 ? (
            <p className="text-sm text-slate-500">لا حملات متوقفة في هذه الفترة.</p>
          ) : (
            <ul className="space-y-2 text-sm">
              {pausedCampaigns.map((c) => (
                <li key={c.id} className="flex justify-between gap-3">
                  <span className="text-slate-200">{c.name}</span>
                  <Link href={`/admin/tenants/${c.tenantId}`} className="text-xs text-slate-400 hover:underline">{c.tenant.name}</Link>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>

      <section className="card overflow-x-auto p-4">
        <h2 className="mb-3 font-bold text-white">قنوات واتساب متعثرة</h2>
        {troubledChannels.length === 0 ? (
          <p className="text-sm text-slate-500">كل القنوات الفعلية سليمة.</p>
        ) : (
          <table className="w-full text-sm">
            <tbody>
              {troubledChannels.map((c) => (
                <tr key={c.id} className="border-b border-white/5">
                  <td className="p-2 text-slate-200">{c.tenant.name}</td>
                  <td className="p-2 text-xs text-slate-400">{c.provider}</td>
                  <td className="p-2 text-xs text-warning-500">{c.status}</td>
                  <td className="p-2 text-xs text-danger-500">{c.lastError ?? ""}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
        <Link href="/admin/numbers?filter=issues" className="mt-2 inline-block text-xs text-accent-400 hover:underline">كل الأرقام بها مشكلة ←</Link>
      </section>

      <section className="card overflow-x-auto p-4">
        <h2 className="mb-3 font-bold text-white">آخر أحداث webhook فاشلة أو مرفوضة</h2>
        {recentWebhookErrors.length === 0 ? (
          <p className="text-sm text-slate-500">لا أخطاء.</p>
        ) : (
          <table className="w-full text-sm">
            <tbody>
              {recentWebhookErrors.map((e) => (
                <tr key={e.id} className="border-b border-white/5 align-top">
                  <td className="p-2 text-xs text-slate-500" dir="ltr">{e.createdAt.toISOString().slice(0, 16).replace("T", " ")}</td>
                  <td className="p-2 text-xs text-slate-300">{e.provider}</td>
                  <td className="p-2 text-xs text-slate-300">{e.eventType}</td>
                  <td className="p-2 text-xs text-slate-400">{e.tenant?.name ?? "—"}</td>
                  <td className="p-2 text-xs text-danger-500">{e.errorMessage ?? "لم يُعالَج"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>
    </div>
  );
}
