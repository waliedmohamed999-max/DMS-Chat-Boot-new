import Link from "next/link";
import { IntegrationProvider } from "@prisma/client";
import { requireTenantSession } from "@/lib/session";
import { hasEffectivePermission } from "@/lib/rbac";
import { withTenant } from "@/lib/db";
import { ConfirmSubmitButton } from "@/components/dashboard/ConfirmSubmitButton";
import { StoreSyncPanel } from "@/components/dashboard/StoreSyncPanel";
import { disconnectIntegration } from "../actions";
import { getZidSyncStateAction, startZidConnect, startZidSyncAction } from "./actions";

export const metadata = { title: "ربط متجر زد — DMS Tech" };

type ZidMeta = { storeName?: string | null; storeDomain?: string | null; linkMethod?: string; billing?: { source?: string; planName?: string | null; endDate?: string | null } };
const LINK_METHOD_LABELS: Record<string, string> = {
  new_account: "تثبيت التطبيق من متجر تطبيقات زد (حساب جديد)",
  email_match: "تثبيت التطبيق من زد (نفس بريد حسابك)",
  dashboard: "من لوحة DMS",
};

export default async function ZidIntegrationPage(props: { searchParams: Promise<{ connected?: string; zid_error?: string }> }) {
  const { connected: justConnected, zid_error } = await props.searchParams;
  const session = await requireTenantSession();
  if (!hasEffectivePermission(session.user.permissions, "integrations.manage")) {
    return <div className="card p-8 text-center text-slate-400">ليس لديك صلاحية إدارة التكاملات.</div>;
  }
  const tenantId = session.user.tenantId;
  const [integration, orders, carts, products, contacts, events] = await withTenant(tenantId, (tx) =>
    Promise.all([
      tx.integration.findUnique({ where: { tenantId_provider: { tenantId, provider: IntegrationProvider.ZID } } }),
      tx.order.count({ where: { tenantId, externalSource: "ZID", status: { not: "ABANDONED_CART" } } }),
      tx.order.count({ where: { tenantId, externalSource: "ZID", status: "ABANDONED_CART" } }),
      tx.product.count({ where: { tenantId, externalSource: "ZID" } }),
      tx.contact.count({ where: { tenantId, source: "ZID_SYNC" } }),
      tx.webhookLog.findMany({ where: { tenantId, provider: "ZID" }, orderBy: { createdAt: "desc" }, take: 10 }),
    ])
  );
  const meta = (integration?.metadataJson ?? {}) as ZidMeta;
  const connected = integration?.status === "CONNECTED";
  const needsReauth = integration?.status === "NEEDS_REAUTH";

  return (
    <div className="space-y-6">
      <div>
        <Link href="/dashboard/integrations" className="text-sm text-accent-400 hover:underline">← التكاملات</Link>
        <h1 className="mt-2 text-xl font-bold text-white">🟣 ربط متجر زد</h1>
        <p className="text-sm text-slate-400">طلبات متجرك وعملاؤه ومنتجاته وسلاته المتروكة تصل لحظياً، والسلات المتروكة تتحوّل لرسائل استرداد على واتساب.</p>
      </div>

      {justConnected && <div className="rounded-lg border border-success-500/30 bg-success-500/10 px-4 py-3 text-sm text-success-500">✅ تم ربط متجرك على زد — بدأت مزامنة البيانات.</div>}
      {zid_error && <div className="rounded-lg border border-danger-500/30 bg-danger-500/10 px-4 py-3 text-sm text-danger-500">❌ {zid_error}</div>}

      <div className="card space-y-4 p-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="text-lg font-bold text-white">{meta.storeName ?? (connected ? "متجر زد" : "لم يُربط متجر بعد")}</p>
            {meta.storeDomain && <a href={meta.storeDomain} target="_blank" rel="noopener noreferrer" className="text-xs text-accent-400 hover:underline" dir="ltr">{meta.storeDomain}</a>}
          </div>
          <span className={`badge ${connected ? "bg-success-500/10 text-success-500" : needsReauth ? "bg-warning-500/10 text-warning-500" : "bg-slate-500/10 text-slate-400"}`}>
            {connected ? (integration?.isSandbox ? "متصل (تجريبي)" : "متصل") : needsReauth ? "يحتاج إعادة تفويض" : "غير متصل"}
          </span>
        </div>
        {integration?.lastError && <p className="rounded bg-danger-500/10 px-3 py-2 text-sm text-danger-500">{integration.lastError}</p>}

        {connected ? (
          <>
            <dl className="grid grid-cols-2 gap-3 text-sm lg:grid-cols-4">
              <Info label="رقم المتجر في زد" value={integration?.externalAccountId} />
              <Info label="طريقة الربط" value={LINK_METHOD_LABELS[meta.linkMethod ?? ""] ?? "—"} />
              <Info label="التحديثات اللحظية" value={integration?.webhookSubscribed ? "مفعّلة" : "غير مفعّلة"} />
              <Info label="آخر مزامنة كاملة" value={integration?.lastSyncedAt ? new Date(integration.lastSyncedAt).toLocaleString("ar-SA") : "جارية…"} />
            </dl>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              <Info label="طلبات" value={orders.toLocaleString("ar-SA")} />
              <Info label="سلات متروكة" value={carts.toLocaleString("ar-SA")} />
              <Info label="عملاء" value={contacts.toLocaleString("ar-SA")} />
              <Info label="منتجات" value={products.toLocaleString("ar-SA")} />
            </div>
            {meta.billing?.source === "zid" && (
              <p className="text-xs text-slate-400">
                💳 اشتراكك يُدار عبر متجر تطبيقات زد{meta.billing.planName ? ` — باقة ${meta.billing.planName}` : ""}
                {meta.billing.endDate ? ` حتى ${new Date(meta.billing.endDate).toLocaleDateString("ar-SA")}` : ""}.
              </p>
            )}
            <StoreSyncPanel getState={getZidSyncStateAction} start={startZidSyncAction} />
            <ConfirmSubmitButton
              action={disconnectIntegration.bind(null, "ZID")}
              confirmMessage="سيتوقف استقبال الطلبات والعملاء من زد فوراً. لإعادة الربط افتح التطبيق من لوحة زد أو اربط من هنا. متأكد؟"
              className="btn-danger text-sm"
            >
              فك الربط
            </ConfirmSubmitButton>
          </>
        ) : (
          <div className="space-y-3">
            <ol className="list-inside list-decimal space-y-1 text-sm text-slate-300">
              <li>ثبّت تطبيق DMS Tech من متجر تطبيقات زد — يُربط متجرك تلقائياً لو بريد متجرك هو نفس بريد حسابك (<span dir="ltr">{session.user.email}</span>).</li>
              <li>أو اضغط "ربط متجر زد" وسجّل دخولك في زد ووافق على الصلاحيات.</li>
            </ol>
            <form action={startZidConnect}>
              <button className="btn-primary text-sm">ربط متجر زد</button>
            </form>
          </div>
        )}
      </div>

      <div className="card p-6">
        <h2 className="mb-3 font-bold text-white">آخر أحداث زد</h2>
        {events.length === 0 ? (
          <p className="text-sm text-slate-500">لا أحداث بعد.</p>
        ) : (
          <ul className="space-y-2 text-sm">
            {events.map((e) => (
              <li key={e.id} className="flex flex-wrap justify-between gap-2 border-b border-white/5 pb-2">
                <span className="text-slate-300" dir="ltr">{e.eventType}</span>
                <span className="text-xs text-slate-500">{e.errorMessage ?? ""} · {e.createdAt.toLocaleString("ar-SA")}</span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

function Info({ label, value }: { label: string; value: string | null | undefined }) {
  return (
    <div className="rounded-lg bg-white/5 p-3">
      <dt className="text-xs text-slate-500">{label}</dt>
      <dd className="mt-1 text-slate-200">{value ?? "—"}</dd>
    </div>
  );
}
