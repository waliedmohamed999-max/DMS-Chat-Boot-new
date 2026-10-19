import Link from "next/link";
import { IntegrationProvider } from "@prisma/client";
import { requireTenantSession } from "@/lib/session";
import { withTenant } from "@/lib/db";
import { hasEffectivePermission } from "@/lib/rbac";
import { sallaInstallUrl } from "@/lib/integrations/salla/api";
import { ConfirmSubmitButton } from "@/components/dashboard/ConfirmSubmitButton";
import { connectIntegration, disconnectIntegration, resyncIntegration } from "../actions";

export const metadata = { title: "ربط سلة — DMS Tech" };

type SallaMeta = {
  storeName?: string | null; storeDomain?: string | null; storeEmail?: string | null; merchantId?: string;
  linkMethod?: string; installedAt?: string; uninstalledAt?: string;
  whatsappNumber?: string; requestedAutomations?: { abandonedCart?: boolean; welcome?: boolean };
};

const LINK_METHOD_LABELS: Record<string, string> = {
  email_match: "رُبط تلقائياً بحسابك (نفس البريد)",
  email_confirmed: "رُبط بتأكيد من بريدك",
  new_account: "أُنشئ الحساب من تثبيت تطبيق سلة",
  oauth_custom: "ربط مباشر من لوحة DMS",
  sandbox: "ربط تجريبي (Sandbox)",
};

const CAMPAIGN_STATUS_LABELS: Record<string, { label: string; className: string }> = {
  ACTIVE: { label: "مفعّلة", className: "bg-success-500/10 text-success-500" },
  PAUSED: { label: "متوقفة مؤقتاً", className: "bg-warning-500/10 text-warning-500" },
};

export default async function SallaIntegrationPage() {
  const session = await requireTenantSession();
  const tenantId = session.user.tenantId;

  if (!hasEffectivePermission(session.user.permissions, "integrations.manage")) {
    return <div className="card p-8 text-center text-slate-400">ليس لديك صلاحية إدارة التكاملات. هذا المسار محصور بصاحب الحساب والمدير.</div>;
  }

  const [integration, orderCounts, pendingCarts, contactsCount, productsCount, automations, logs] = await withTenant(tenantId, (tx) =>
    Promise.all([
      tx.integration.findUnique({ where: { tenantId_provider: { tenantId, provider: IntegrationProvider.SALLA } } }),
      tx.order.groupBy({ by: ["status"], where: { tenantId, externalSource: "SALLA" }, _count: { _all: true } }),
      tx.order.count({ where: { tenantId, externalSource: "SALLA", status: "ABANDONED_CART", recoveryMessageSentAt: null } }),
      tx.contact.count({ where: { tenantId, source: "SALLA_SYNC" } }),
      tx.product.count({ where: { tenantId, externalSource: "SALLA" } }),
      tx.campaign.findMany({
        where: { tenantId, type: "TRIGGERED", triggerEvent: { in: ["ABANDONED_CART", "NEW_CUSTOMER"] } },
        orderBy: { createdAt: "desc" },
        select: { id: true, name: true, status: true, triggerEvent: true },
      }),
      tx.webhookLog.findMany({ where: { tenantId, provider: "SALLA" }, orderBy: { createdAt: "desc" }, take: 15 }),
    ])
  );

  const meta = (integration?.metadataJson ?? {}) as SallaMeta;
  const connected = integration?.status === "CONNECTED";
  const needsReauth = integration?.status === "NEEDS_REAUTH";
  const installUrl = sallaInstallUrl();
  const totalOrders = orderCounts.filter((o) => o.status !== "ABANDONED_CART").reduce((n, o) => n + o._count._all, 0);
  const totalCarts = orderCounts.find((o) => o.status === "ABANDONED_CART")?._count._all ?? 0;
  const cartCampaign = automations.find((c) => c.triggerEvent === "ABANDONED_CART");
  const welcomeCampaign = automations.find((c) => c.triggerEvent === "NEW_CUSTOMER");

  return (
    <div className="space-y-6">
      <div>
        <Link href="/dashboard/integrations" className="text-sm text-accent-400 hover:underline">← التكاملات</Link>
        <h1 className="mt-2 text-xl font-bold text-white">🛍️ ربط متجر سلة</h1>
        <p className="text-sm text-slate-400">طلبات متجرك وعملاؤه ومنتجاته تصل لحظياً، والسلات المتروكة تتحوّل لرسائل استرداد على واتساب.</p>
      </div>

      {/* حالة الربط */}
      <div className="card space-y-4 p-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="text-lg font-bold text-white">{meta.storeName ?? (connected ? "متجر سلة" : "لم يُربط متجر بعد")}</p>
            {meta.storeDomain && (
              <a href={meta.storeDomain} target="_blank" rel="noopener noreferrer" className="text-xs text-accent-400 hover:underline" dir="ltr">{meta.storeDomain}</a>
            )}
          </div>
          <span className={`badge ${connected ? "bg-success-500/10 text-success-500" : needsReauth ? "bg-warning-500/10 text-warning-500" : "bg-slate-500/10 text-slate-400"}`}>
            {connected ? (integration?.isSandbox ? "متصل (تجريبي)" : "متصل") : needsReauth ? "يحتاج إعادة تثبيت" : "غير متصل"}
          </span>
        </div>

        {integration?.lastError && (
          <p className="rounded bg-danger-500/10 px-3 py-2 text-sm text-danger-500">{integration.lastError}</p>
        )}

        {connected ? (
          <>
            <dl className="grid grid-cols-1 gap-3 text-sm sm:grid-cols-2 lg:grid-cols-4">
              <Info label="رقم التاجر في سلة" value={integration?.externalAccountId} ltr />
              <Info label="طريقة الربط" value={LINK_METHOD_LABELS[meta.linkMethod ?? ""] ?? "—"} />
              <Info label="آخر مزامنة كاملة" value={integration?.lastSyncedAt ? new Date(integration.lastSyncedAt).toLocaleString("ar-SA") : "جارية…"} />
              <Info label="صلاحية رمز الوصول" value={integration?.tokenExpiresAt ? `حتى ${new Date(integration.tokenExpiresAt).toLocaleDateString("ar-SA")} (تتجدد تلقائياً)` : "—"} />
            </dl>
            {meta.whatsappNumber && (
              <p className="text-xs text-slate-400">
                رقم واتساب المتجر (من خطوات تثبيت التطبيق): <span dir="ltr" className="text-slate-200">{meta.whatsappNumber}</span> —{" "}
                <Link href="/dashboard/integrations" className="text-accent-400 hover:underline">اربطه من التكاملات</Link>
              </p>
            )}
            <div className="flex flex-wrap gap-2">
              <form action={resyncIntegration.bind(null, "SALLA")}>
                <button className="btn-secondary text-sm">🔄 مزامنة الآن</button>
              </form>
              <ConfirmSubmitButton
                action={disconnectIntegration.bind(null, "SALLA")}
                confirmMessage="سيتوقف استقبال الطلبات والعملاء من سلة فوراً. لإعادة الربط لاحقاً ستحتاج حذف التطبيق من متجرك على سلة ثم تثبيته من جديد. متأكد؟"
                className="btn-danger text-sm"
              >
                فك الربط
              </ConfirmSubmitButton>
            </div>
          </>
        ) : (
          <div className="space-y-3">
            <ol className="list-inside list-decimal space-y-1 text-sm text-slate-300">
              <li>اضغط "ربط متجر سلة" لتفتح صفحة تطبيق DMS Tech في متجر تطبيقات سلة.</li>
              <li>ثبّت التطبيق على متجرك ووافق على الصلاحيات.</li>
              <li>يُربط متجرك تلقائياً بهذا الحساب لو بريد متجرك في سلة هو نفس بريد حسابك هنا (<span dir="ltr">{session.user.email}</span>).</li>
            </ol>
            {needsReauth && (
              <p className="text-sm text-warning-500">انتهت صلاحية الربط — احذف التطبيق من متجرك على سلة ثم ثبّته من جديد.</p>
            )}
            <form action={connectIntegration.bind(null, "SALLA")}>
              <button className="btn-primary text-sm">{installUrl ? "ربط متجر سلة" : "ربط متجر سلة (تجريبي)"}</button>
            </form>
            {!installUrl && (
              <p className="text-xs text-slate-500">تطبيق سلة الرسمي غير مُفعَّل على المنصة بعد — الربط الآن تجريبي ببيانات وهمية.</p>
            )}
          </div>
        )}
      </div>

      {/* الأرقام */}
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <Stat label="طلبات مزامَنة" value={totalOrders} href="/dashboard/orders" />
        <Stat label="سلات متروكة" value={totalCarts} sub={pendingCarts > 0 ? `${pendingCarts} لم تُرسل لها رسالة` : undefined} href="/dashboard/orders?tab=ABANDONED_CART" />
        <Stat label="عملاء من سلة" value={contactsCount} href="/dashboard/contacts" />
        <Stat label="منتجات" value={productsCount} />
      </div>

      {/* الرسائل التلقائية */}
      <div className="card space-y-4 p-6">
        <div>
          <h2 className="font-semibold text-white">الرسائل التلقائية على واتساب</h2>
          <p className="text-xs text-slate-400">تُرسل بقالب واتساب معتمد تختاره عند التفعيل، وتحترم موافقة العميل على الرسائل التسويقية.</p>
        </div>
        <Automation
          title="🛒 استرداد السلة المتروكة"
          description="رسالة لكل عميل ترك سلته في متجرك دون إتمام الطلب."
          campaign={cartCampaign}
          requested={meta.requestedAutomations?.abandonedCart}
          createHref="/dashboard/campaigns/new?trigger=ABANDONED_CART"
        />
        <Automation
          title="👋 ترحيب بالعميل الجديد"
          description="رسالة ترحيب مرة واحدة لكل عميل جديد يصل من متجرك بعد التفعيل."
          campaign={welcomeCampaign}
          requested={meta.requestedAutomations?.welcome}
          createHref="/dashboard/campaigns/new?trigger=NEW_CUSTOMER"
        />
        <p className="text-xs text-slate-500">إشعارات حالة الطلب (تم الشحن، تم التوصيل…) تأتي في المرحلة القادمة عبر قناة التواصل الرسمية في سلة.</p>
      </div>

      {/* سجل الأحداث */}
      <div className="card p-6">
        <h2 className="mb-4 font-semibold text-white">آخر الأحداث من سلة</h2>
        {logs.length === 0 ? (
          <p className="text-sm text-slate-500">لا توجد أحداث بعد.</p>
        ) : (
          <div className="space-y-2">
            {logs.map((log) => {
              const ok = log.signatureValid && !log.errorMessage;
              return (
                <div key={log.id} className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-white/5 p-3 text-sm">
                  <div className="flex items-center gap-3">
                    <span className={`h-2 w-2 rounded-full ${ok ? "bg-success-500" : "bg-warning-500"}`} />
                    <span className="text-slate-300" dir="ltr">{log.eventType}</span>
                    {log.errorMessage && <span className="text-xs text-warning-500">{log.errorMessage}</span>}
                  </div>
                  <span className="text-xs text-slate-500">{new Date(log.createdAt).toLocaleString("ar-SA")}</span>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

function Info({ label, value, ltr }: { label: string; value: string | null | undefined; ltr?: boolean }) {
  return (
    <div className="rounded-lg border border-white/5 p-3">
      <dt className="text-xs text-slate-500">{label}</dt>
      <dd className="mt-1 text-slate-200" dir={ltr ? "ltr" : undefined}>{value || "—"}</dd>
    </div>
  );
}

function Stat({ label, value, sub, href }: { label: string; value: number; sub?: string; href?: string }) {
  const body = (
    <>
      <p className="text-xs text-slate-400">{label}</p>
      <p className="mt-1 text-2xl font-bold text-white">{value.toLocaleString("ar-SA")}</p>
      {sub && <p className="mt-1 text-xs text-warning-500">{sub}</p>}
    </>
  );
  return href ? (
    <Link href={href} className="card block p-4 transition hover:border-accent-500/40">{body}</Link>
  ) : (
    <div className="card p-4">{body}</div>
  );
}

function Automation({
  title, description, campaign, createHref, requested,
}: {
  title: string; description: string; createHref: string; requested?: boolean;
  campaign?: { id: string; name: string; status: string };
}) {
  const status = campaign ? CAMPAIGN_STATUS_LABELS[campaign.status] : undefined;
  return (
    <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-white/5 p-4">
      <div>
        <p className="font-medium text-white">{title}</p>
        <p className="text-xs text-slate-400">{description}</p>
        {!campaign && requested && <p className="mt-1 text-xs text-warning-500">طلبت تفعيلها من سلة — اختر قالب واتساب لإكمال التفعيل.</p>}
      </div>
      {campaign ? (
        <div className="flex items-center gap-3">
          {status && <span className={`badge ${status.className}`}>{status.label}</span>}
          <Link href={`/dashboard/campaigns/${campaign.id}`} className="btn-secondary text-xs">إدارة الحملة</Link>
        </div>
      ) : (
        <Link href={createHref} className="btn-primary text-xs">تفعيل</Link>
      )}
    </div>
  );
}
