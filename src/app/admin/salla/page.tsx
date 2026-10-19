import Link from "next/link";
import { requireSuperAdminSession } from "@/lib/session";
import { hasEffectivePermission } from "@/lib/rbac";
import { superAdminDb } from "@/lib/db";
import { getSallaConfig, sallaInstallUrlFor } from "@/lib/integrations/salla/config";
import { getSallaSyncState } from "@/lib/integrations/salla/sync";
import { appUrl } from "@/lib/setupReadiness";
import { CopyField } from "../setup/SetupClient";
import { SallaAppForm } from "./SallaAppForm";
import { adminSyncSallaStore } from "./actions";

export const metadata = { title: "تطبيق سلة — DMS Tech" };
export const dynamic = "force-dynamic";

const n = (x: number) => x.toLocaleString("ar-SA");

/**
 * إعداد تطبيق سلة من لوحة الأدمن (بدل متغيرات Hostinger): المفاتيح، ربط الباقات، الروابط التي تُلصق في
 * بوابة شركاء سلة، والمتاجر المربوطة مع حالة مزامنتها وزر مزامنة للدعم الفني.
 */
export default async function AdminSallaPage() {
  const session = await requireSuperAdminSession();
  if (!hasEffectivePermission(session.user.permissions, "platform.settings.manage")) {
    return <div className="card p-8 text-center text-slate-400">ليس لديك صلاحية عرض هذه الصفحة.</div>;
  }
  const [config, plans, stores] = await Promise.all([
    getSallaConfig(),
    superAdminDb.plan.findMany({ select: { key: true, name: true }, orderBy: { priceMonthlySar: "asc" } }),
    superAdminDb.integration.findMany({
      where: { provider: "SALLA", isSandbox: false, status: { not: "DISCONNECTED" } },
      include: { tenant: { select: { id: true, name: true } } },
      orderBy: { updatedAt: "desc" },
      take: 100,
    }),
  ]);
  const syncStates = await Promise.all(stores.map((s) => getSallaSyncState(s.tenantId)));
  const base = appUrl();
  const installUrl = sallaInstallUrlFor(config.appId);
  const ready = Boolean(config.appId && config.clientId && config.clientSecret && config.webhookSecret);

  const urls = [
    { label: "رابط استقبال التنبيهات (Webhook URL)", value: `${base}/api/webhooks/salla` },
    { label: "رابط الصفحة المضمَّنة (Iframe URL — Route: dashboard)", value: `${base}/salla/app` },
    { label: "رابط دوال خطوات التثبيت (ENDPOINT)", value: `${base}/api/salla/onboarding` },
    { label: "رابط ميزة الإرسال عبر واتساب (Communication)", value: `${base}/api/salla/communication` },
  ];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-bold text-white">🛍️ تطبيق سلة</h1>
        <p className="text-sm text-slate-400">
          اربط تطبيق DMS Tech في بوابة شركاء سلة من هنا مباشرة — بلا متغيرات بيئة ولا إعادة نشر. بعد الحفظ: التاجر يثبّت
          التطبيق من متجر تطبيقات سلة، فيُنشأ حسابه ويبدأ سحب بياناته تلقائياً، ويستطيع إعادة المزامنة من داخل التطبيق في لوحة سلة.
        </p>
      </div>

      <div className={`card p-4 ${ready ? "border border-success-500/30" : "border border-warning-500/30"}`}>
        <p className={`font-semibold ${ready ? "text-success-500" : "text-warning-500"}`}>
          {ready ? "✅ تطبيق سلة مضبوط وجاهز لاستقبال التثبيتات" : "⚠️ التطبيق غير مكتمل — أكمل الحقول أدناه"}
        </p>
        {installUrl && (
          <p className="mt-1 text-xs text-slate-400">
            رابط التثبيت للتجار: <a href={installUrl} target="_blank" rel="noopener noreferrer" className="text-accent-400 hover:underline" dir="ltr">{installUrl}</a>
          </p>
        )}
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        <section className="card p-5 lg:col-span-2">
          <h2 className="mb-4 font-bold text-white">مفاتيح التطبيق</h2>
          <SallaAppForm
            appId={config.sources.appId === "admin" ? config.appId ?? "" : ""}
            clientId={config.sources.clientId === "admin" ? config.clientId ?? "" : ""}
            secrets={{ clientSecret: config.sources.clientSecret, webhookSecret: config.sources.webhookSecret, functionsSecret: config.sources.functionsSecret }}
            planMap={Object.entries(config.planMap).map(([name, key]) => ({ name, key }))}
            plans={plans}
            onboardingEndpoint={`${base}/api/salla/onboarding`}
          />
          {(config.sources.appId === "env" || config.sources.clientId === "env") && (
            <p className="mt-3 text-xs text-slate-500">
              قيم حالية من متغيرات البيئة: {config.sources.appId === "env" && <>App ID <span dir="ltr">{config.appId}</span> </>}
              {config.sources.clientId === "env" && <>· Client ID <span dir="ltr">{config.clientId}</span></>} — أي قيمة تحفظها هنا تتقدّم عليها.
            </p>
          )}
        </section>

        <section className="card space-y-3 p-5">
          <h2 className="font-bold text-white">روابط تُلصق في بوابة شركاء سلة</h2>
          {urls.map((u) => <CopyField key={u.label} label={u.label} value={u.value} />)}
          <p className="text-xs text-slate-500">
            خطة حماية التنبيهات: Signature. الأحداث المطلوبة وكود الدوال في docs/SALLA_APP_SETUP.md.
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
                <th className="p-2 font-medium">متجر سلة</th>
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
                      <form action={adminSyncSallaStore.bind(null, s.tenantId)}>
                        <button disabled={sync?.status === "running"} className="btn-secondary text-xs disabled:opacity-50">مزامنة</button>
                      </form>
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
