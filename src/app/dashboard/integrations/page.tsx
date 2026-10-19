import Link from "next/link";
import { requireTenantSession } from "@/lib/session";
import { withTenant } from "@/lib/db";
import { hasEffectivePermission } from "@/lib/rbac";
import { PROVIDER_LABELS_AR, PROVIDER_ICONS } from "@/lib/integrations/registry";
import { IntegrationProvider } from "@prisma/client";
import { connectIntegration, disconnectIntegration, resyncIntegration } from "./actions";
import { MetaConnectionWizard, ConnectionHealthPanel } from "@/components/dashboard/MetaConnectionPanel";
import { ConfirmSubmitButton } from "@/components/dashboard/ConfirmSubmitButton";
import { getTenantMigration } from "@/lib/integrations/migration";
import { MigrationCard } from "./MigrationCard";

const STATUS_LABELS: Record<string, { label: string; className: string }> = {
  CONNECTED: { label: "متصل", className: "bg-success-500/10 text-success-500" },
  DISCONNECTED: { label: "غير متصل", className: "bg-slate-500/10 text-slate-400" },
  NEEDS_REAUTH: { label: "يحتاج إعادة مصادقة", className: "bg-warning-500/10 text-warning-500" },
  ERROR: { label: "خطأ", className: "bg-danger-500/10 text-danger-500" },
};

type SearchParams = { connected?: string; zid_error?: string; salla_error?: string; d360_error?: string };

export default async function IntegrationsPage(props: { searchParams: Promise<SearchParams> }) {
  const searchParams = await props.searchParams;
  const session = await requireTenantSession();
  const tenantId = session.user.tenantId;

  if (!hasEffectivePermission(session.user.permissions, "integrations.manage")) {
    return <div className="card p-8 text-center text-slate-400">ليس لديك صلاحية إدارة التكاملات. هذا المسار محصور بصاحب الحساب والمدير.</div>;
  }

  const [integrations, webhookLogs] = await withTenant(tenantId, async (tx) => {
    return Promise.all([
      tx.integration.findMany({ where: { tenantId, provider: { not: "WHATSAPP_QR" } } }),
      tx.webhookLog.findMany({ where: { tenantId }, orderBy: { createdAt: "desc" }, take: 10 }),
    ]);
  });

  const byProvider = new Map(integrations.map((i) => [i.provider, i]));
  const migration = await getTenantMigration(tenantId);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-bold text-white">التكاملات</h1>
        <p className="text-sm text-slate-400">اربط واتساب ومنصة متجرك لتفعيل الحملات والمزامنة التلقائية</p>
      </div>

      {searchParams.connected && (
        <div className="rounded-lg border border-success-500/30 bg-success-500/10 px-4 py-3 text-sm text-success-500">
          ✅ تم الاتصال الحقيقي بنجاح ({PROVIDER_LABELS_AR[searchParams.connected as IntegrationProvider] ?? searchParams.connected})
        </div>
      )}
      {(searchParams.zid_error || searchParams.salla_error || searchParams.d360_error) && (
        <div className="rounded-lg border border-danger-500/30 bg-danger-500/10 px-4 py-3 text-sm text-danger-500">
          ❌ فشل الاتصال الحقيقي: {searchParams.zid_error || searchParams.salla_error || searchParams.d360_error}
        </div>
      )}

      {migration && (
        <MigrationCard
          status={migration.state?.status ?? null}
          metaConnected={migration.metaConnected}
          d360Connected={migration.d360Connected}
          d360Ready={migration.d360Ready}
          hasFeedback={Boolean(migration.state?.feedback)}
        />
      )}

      <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
        {/* PAYMENT_GATEWAY ليس تكاملاً قابلاً للربط من هنا (أُضيف فقط لتصنيف WebhookLog — انظر
            lib/integrations/registry.ts) — يُستبعَد صراحة من قائمة بطاقات "اربط الآن". */}
        {(Object.values(IntegrationProvider) as IntegrationProvider[])
          // الربط المباشر بـ Meta لم يعد متاحاً للربط الجديد (القناة الرسمية الآن عبر 360dialog) — يظهر فقط لتاجر
          // مربوط به مسبقاً ليتابع حالته أو يفصله.
          .filter((provider) => provider !== "PAYMENT_GATEWAY" && provider !== "WHATSAPP_QR")
          .filter((provider) => provider !== "META_WHATSAPP" || !!byProvider.get(provider)?.externalAccountId || byProvider.get(provider)?.status === "CONNECTED")
          .sort((a, b) => (a === "D360DIALOG" ? -1 : b === "D360DIALOG" ? 1 : 0))
          .map((provider) => {
          const integration = byProvider.get(provider);
          const status = STATUS_LABELS[integration?.status ?? "DISCONNECTED"]!;
          const isMeta = provider === "META_WHATSAPP";

          const isD360 = provider === "D360DIALOG";
          const metadata = (integration?.metadataJson ?? null) as {
            qualityRating?: string; messagingTier?: string; displayPhoneNumber?: string;
          } | null;

          return (
            <div key={provider} className="card flex flex-col p-5">
              <div className="mb-3 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className="text-2xl">{PROVIDER_ICONS[provider]}</span>
                  <span className="font-semibold text-white">{PROVIDER_LABELS_AR[provider]}</span>
                </div>
                <span className={`badge ${status.className}`}>{status.label}</span>
              </div>

              {integration?.isSandbox && integration.status === "CONNECTED" && (
                <p className="mb-2 text-xs text-warning-500">🧪 متصل بوضع Sandbox (بيانات وهمية)</p>
              )}
              {integration?.pendingVerification && (
                <p className="mb-2 text-xs text-warning-500">⏳ بانتظار تحقق فريق المنصة قبل التفعيل الكامل</p>
              )}
              {integration?.externalAccountId && (
                <p className="mb-2 text-xs text-slate-500" dir="ltr">
                  ID: {integration.externalAccountId}
                </p>
              )}
              {integration?.lastSyncedAt && (
                <p className="mb-2 text-xs text-slate-500">
                  آخر مزامنة: {new Date(integration.lastSyncedAt).toLocaleString("ar-SA")}
                </p>
              )}
              {integration?.lastError && (
                <p className="mb-2 rounded bg-danger-500/10 px-2 py-1 text-xs text-danger-500">{integration.lastError}</p>
              )}

              {provider === "SALLA" && (
                <Link href="/dashboard/integrations/salla" className="mb-2 text-xs font-semibold text-accent-400 hover:underline">
                  إدارة ربط سلة والرسائل التلقائية ←
                </Link>
              )}
              {provider === "ZID" && (
                <Link href="/dashboard/integrations/zid" className="mb-2 text-xs font-semibold text-accent-400 hover:underline">
                  إدارة ربط زد والمزامنة ←
                </Link>
              )}

              {isD360 && integration?.status === "CONNECTED" && (
                <div className="mb-2 space-y-1 text-xs text-slate-400">
                  <p dir="ltr" className="text-sm text-slate-200">{metadata?.displayPhoneNumber ?? "—"}</p>
                  {integration.pendingVerification && <p className="text-warning-500">⏳ الرقم قيد التفعيل لدى واتساب — يجهز عادة خلال دقائق إلى ساعات</p>}
                  <Link href="/dashboard/billing/wallet" className="text-accent-400 hover:underline">محفظة الرسائل ←</Link>
                </div>
              )}
              {isD360 && integration?.status !== "CONNECTED" && (
                <div className="mb-2 space-y-2 text-xs text-slate-400">
                  <p className="text-sm text-slate-300">رقم واتساب رسمي (WhatsApp Business API) عبر DMS — بلا بطاقة دفع في Meta: رسائل القوالب تُخصم من محفظتك، والرد على العملاء مجاني.</p>
                  <ol className="list-inside list-decimal space-y-1">
                    <li>اضغط "ربط رقم واتساب" وسجّل الدخول بحساب فيسبوك نشاطك.</li>
                    <li>اختر الرقم الذي تريد ربطه وأكّده برمز التحقق.</li>
                    <li>ترجع لهنا تلقائياً والرقم مربوط.</li>
                  </ol>
                </div>
              )}


              {isMeta && integration?.status === "CONNECTED" && (
                <ConnectionHealthPanel
                  status={integration.status}
                  pendingVerification={integration.pendingVerification}
                  qualityRating={metadata?.qualityRating}
                  messagingTier={metadata?.messagingTier}
                  webhookSubscribed={integration.webhookSubscribed}
                  displayPhoneNumber={metadata?.displayPhoneNumber}
                />
              )}

              <div className="mt-4 flex-1">
                {isMeta && integration?.status !== "CONNECTED" && (
                  <MetaConnectionWizard connectSandbox={connectIntegration.bind(null, provider)} />
                )}
              </div>

              <div className="mt-4 flex gap-2">
                {integration?.status === "CONNECTED" ? (
                  <>
                    {provider !== "META_WHATSAPP" && (
                      <form action={resyncIntegration.bind(null, provider)}>
                        <button className="btn-secondary text-xs">إعادة مزامنة</button>
                      </form>
                    )}
                    <ConfirmSubmitButton
                      action={disconnectIntegration.bind(null, provider)}
                      confirmMessage={
                        isMeta
                          ? "قطع الاتصال سيوقف استقبال وإرسال رسائل واتساب فوراً لهذا التاجر. هل أنت متأكد؟"
                          : "هل تريد فعلاً قطع الاتصال بهذا التكامل؟"
                      }
                      className="btn-danger text-xs"
                    >
                      قطع الاتصال
                    </ConfirmSubmitButton>
                  </>
                ) : !isMeta ? (
                  <form action={connectIntegration.bind(null, provider)} className="w-full">
                    <button className="btn-primary w-full text-xs">{isD360 ? "🟢 ربط رقم واتساب" : "ربط الآن"}</button>
                  </form>
                ) : null}
              </div>
            </div>
          );
        })}
      </div>

      <div className="card p-5">
        <h2 className="mb-4 font-semibold text-white">سجل الأحداث الواردة (Webhooks)</h2>
        {webhookLogs.length === 0 ? (
          <p className="text-sm text-slate-500">لا توجد أحداث بعد.</p>
        ) : (
          <div className="space-y-2">
            {webhookLogs.map((log) => (
              <div key={log.id} className="flex items-center justify-between rounded-lg border border-white/5 p-3 text-sm">
                <div className="flex items-center gap-3">
                  <span>{PROVIDER_ICONS[log.provider]}</span>
                  <span className="text-slate-300">{log.eventType}</span>
                </div>
                <div className="flex items-center gap-3">
                  <span className={`badge ${log.signatureValid ? "bg-success-500/10 text-success-500" : "bg-danger-500/10 text-danger-500"}`}>
                    {log.signatureValid ? "توقيع صالح" : "توقيع غير صالح"}
                  </span>
                  <span className="text-xs text-slate-500">{new Date(log.createdAt).toLocaleString("ar-SA")}</span>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
