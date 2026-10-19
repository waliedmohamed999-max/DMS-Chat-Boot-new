import Link from "next/link";
import { requireSuperAdminSession } from "@/lib/session";
import { hasEffectivePermission } from "@/lib/rbac";
import { superAdminDb } from "@/lib/db";
import { getZidConfig } from "@/lib/integrations/zid/config";
import { getZidSyncState } from "@/lib/integrations/zid/sync";
import { appUrl } from "@/lib/setupReadiness";
import { CopyField } from "../setup/SetupClient";
import { ZidAppForm } from "./ZidAppForm";
import { adminResubscribeZidWebhooks, adminSyncZidStore } from "./actions";

export const metadata = { title: "تطبيق زد — DMS Tech" };
export const dynamic = "force-dynamic";

const n = (x: number) => x.toLocaleString("ar-SA");

/**
 * إعداد تطبيق زد من لوحة الأدمن: المفاتيح، ربط الباقات، الروابط التي تُلصق في لوحة شركاء زد (رابط التطبيق،
 * رابط إعادة التوجيه، أحداث متجر التطبيقات)، والمتاجر المربوطة مع المزامنة وإعادة الاشتراك في الأحداث.
 */
export default async function AdminZidPage() {
  const session = await requireSuperAdminSession();
  if (!hasEffectivePermission(session.user.permissions, "platform.settings.manage")) {
    return <div className="card p-8 text-center text-slate-400">ليس لديك صلاحية عرض هذه الصفحة.</div>;
  }
  const [config, plans, stores] = await Promise.all([
    getZidConfig(),
    superAdminDb.plan.findMany({ select: { key: true, name: true }, orderBy: { priceMonthlySar: "asc" } }),
    superAdminDb.integration.findMany({
      where: { provider: "ZID", isSandbox: false, status: { not: "DISCONNECTED" } },
      include: { tenant: { select: { id: true, name: true } } },
      orderBy: { updatedAt: "desc" },
      take: 100,
    }),
  ]);
  const syncStates = await Promise.all(stores.map((s) => getZidSyncState(s.tenantId)));
  const base = appUrl();
  const ready = Boolean(config.clientId && config.clientSecret && config.marketSecret);

  const urls = [
    { label: "رابط التطبيق (Application URL)", value: `${base}/api/zid/install` },
    { label: "رابط إعادة التوجيه (Redirect / Callback URL)", value: `${base}/api/zid/oauth/callback` },
    { label: "رابط أحداث متجر التطبيقات (Webhooks)", value: `${base}/api/webhooks/zid/market` },
  ];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-bold text-white">🟣 تطبيق زد</h1>
        <p className="text-sm text-slate-400">
          ربط زد يختلف عن سلة: التاجر يثبّت التطبيق فيفتح زد "رابط التطبيق" ← تفويض OAuth ← نعود برموز المتجر، فنُنشئ/نربط
          حسابه ونشترك في أحداث متجره عبر Zid API ونبدأ سحب بياناته. التاجر يعيد المزامنة من صفحة التطبيق أو من لوحة DMS.
        </p>
      </div>

      <div className={`card p-4 ${ready ? "border border-success-500/30" : "border border-warning-500/30"}`}>
        <p className={`font-semibold ${ready ? "text-success-500" : "text-warning-500"}`}>
          {ready ? "✅ تطبيق زد مضبوط وجاهز لاستقبال التثبيتات" : "⚠️ التطبيق غير مكتمل — أكمل الحقول أدناه"}
        </p>
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        <section className="card p-5 lg:col-span-2">
          <h2 className="mb-4 font-bold text-white">مفاتيح التطبيق</h2>
          <ZidAppForm
            appId={config.sources.appId === "admin" ? config.appId ?? "" : ""}
            clientId={config.sources.clientId === "admin" ? config.clientId ?? "" : ""}
            secrets={{ clientSecret: config.sources.clientSecret, marketSecret: config.sources.marketSecret }}
            planMap={Object.entries(config.planMap).map(([name, key]) => ({ name, key }))}
            plans={plans}
          />
        </section>

        <section className="card space-y-3 p-5">
          <h2 className="font-bold text-white">روابط تُلصق في لوحة شركاء زد</h2>
          {urls.map((u) => <CopyField key={u.label} label={u.label} value={u.value} />)}
          <p className="text-xs text-slate-500">
            في قسم Webhooks اختر أحداث <span dir="ltr">app.market.*</span> (التثبيت، الحذف، الاشتراكات) وأضف الترويسة
            <span dir="ltr"> X-DMS-Zid-Token</span>. أحداث المتجر (الطلبات، العملاء، المنتجات، السلات) نشترك فيها تلقائياً لكل متجر.
          </p>
        </section>
      </div>

      <section className="card overflow-x-auto p-5">
        <h2 className="mb-3 font-bold text-white">المتاجر المربوطة ({n(stores.length)})</h2>
        {stores.length === 0 ? (
          <p className="text-sm text-slate-500">لم يثبّت أي متجر التطبيق بعد.</p>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-white/5 text-right text-xs text-slate-500">
                <th className="p-2 font-medium">التاجر</th>
                <th className="p-2 font-medium">متجر زد</th>
                <th className="p-2 font-medium">الحالة</th>
                <th className="p-2 font-medium">المزامنة</th>
                <th className="p-2 font-medium"></th>
              </tr>
            </thead>
            <tbody>
              {stores.map((s, i) => {
                const meta = (s.metadataJson ?? {}) as { storeName?: string };
                const sync = syncStates[i];
                return (
                  <tr key={s.id} className="border-b border-white/5 align-top">
                    <td className="p-2"><Link href={`/admin/tenants/${s.tenant.id}`} className="text-white hover:underline">{s.tenant.name}</Link></td>
                    <td className="p-2 text-slate-300">
                      {meta.storeName ?? "—"}
                      <p className="text-xs text-slate-500" dir="ltr">#{s.externalAccountId}</p>
                    </td>
                    <td className="p-2 text-xs">
                      <span className={s.status === "CONNECTED" ? "text-success-500" : "text-warning-500"}>{s.status}</span>
                      <p className={s.webhookSubscribed ? "text-slate-500" : "text-warning-500"}>{s.webhookSubscribed ? "الأحداث مفعّلة" : "الأحداث غير مفعّلة"}</p>
                      {s.lastError && <p className="mt-1 max-w-xs text-danger-500">{s.lastError}</p>}
                    </td>
                    <td className="p-2 text-xs text-slate-400">
                      {sync?.status === "running" ? (
                        <span className="text-accent-400">جارية… {n(sync.orders)} طلب · {n(sync.products)} منتج · {n(sync.customers)} عميل</span>
                      ) : sync ? (
                        <span className={sync.status === "failed" ? "text-danger-500" : ""}>
                          {sync.status === "failed" ? "فشلت" : `${n(sync.orders)} طلب · ${n(sync.products)} منتج · ${n(sync.customers)} عميل · ${n(sync.carts ?? 0)} سلة`}
                        </span>
                      ) : null}
                      {s.lastSyncedAt && <p>آخر مزامنة كاملة: {s.lastSyncedAt.toLocaleString("ar-SA")}</p>}
                    </td>
                    <td className="p-2">
                      <div className="flex flex-wrap justify-end gap-2">
                        <form action={adminSyncZidStore.bind(null, s.tenantId)}>
                          <button disabled={sync?.status === "running"} className="btn-secondary text-xs disabled:opacity-50">مزامنة</button>
                        </form>
                        <form action={adminResubscribeZidWebhooks.bind(null, s.tenantId)}>
                          <button className="btn-secondary text-xs">إعادة الاشتراك في الأحداث</button>
                        </form>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </section>
    </div>
  );
}
