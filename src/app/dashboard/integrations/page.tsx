import { requireTenantSession } from "@/lib/session";
import { withTenant } from "@/lib/db";
import { hasPermission } from "@/lib/rbac";
import { PROVIDER_LABELS_AR, PROVIDER_ICONS } from "@/lib/integrations/registry";
import { IntegrationProvider } from "@prisma/client";
import { connectIntegration, disconnectIntegration, resyncIntegration } from "./actions";
import { MetaConnectionWizard, ConnectionHealthPanel } from "@/components/dashboard/MetaConnectionPanel";
import { ConfirmSubmitButton } from "@/components/dashboard/ConfirmSubmitButton";
import { WhatsappQrConnectPanel } from "@/components/dashboard/WhatsappQrConnectPanel";

const STATUS_LABELS: Record<string, { label: string; className: string }> = {
  CONNECTED: { label: "متصل", className: "bg-success-500/10 text-success-500" },
  DISCONNECTED: { label: "غير متصل", className: "bg-slate-500/10 text-slate-400" },
  NEEDS_REAUTH: { label: "يحتاج إعادة مصادقة", className: "bg-warning-500/10 text-warning-500" },
  ERROR: { label: "خطأ", className: "bg-danger-500/10 text-danger-500" },
};

type SearchParams = { connected?: string; zid_error?: string; salla_error?: string };

export default async function IntegrationsPage({ searchParams }: { searchParams: SearchParams }) {
  const session = await requireTenantSession();
  const tenantId = session.user.tenantId;

  if (!hasPermission(session.user.role, "integrations.manage")) {
    return <div className="card p-8 text-center text-slate-400">ليس لديك صلاحية إدارة التكاملات. هذا المسار محصور بصاحب الحساب والمدير.</div>;
  }

  const [integrations, webhookLogs] = await withTenant(tenantId, async (tx) => {
    return Promise.all([
      tx.integration.findMany({ where: { tenantId } }),
      tx.webhookLog.findMany({ where: { tenantId }, orderBy: { createdAt: "desc" }, take: 10 }),
    ]);
  });

  const byProvider = new Map(integrations.map((i) => [i.provider, i]));

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
      {(searchParams.zid_error || searchParams.salla_error) && (
        <div className="rounded-lg border border-danger-500/30 bg-danger-500/10 px-4 py-3 text-sm text-danger-500">
          ❌ فشل الاتصال الحقيقي: {searchParams.zid_error || searchParams.salla_error}
        </div>
      )}

      <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
        {/* PAYMENT_GATEWAY ليس تكاملاً قابلاً للربط من هنا (أُضيف فقط لتصنيف WebhookLog — انظر
            lib/integrations/registry.ts) — يُستبعَد صراحة من قائمة بطاقات "اربط الآن". */}
        {(Object.values(IntegrationProvider) as IntegrationProvider[])
          .filter((provider) => provider !== "PAYMENT_GATEWAY")
          .map((provider) => {
          const integration = byProvider.get(provider);
          const status = STATUS_LABELS[integration?.status ?? "DISCONNECTED"]!;
          const isMeta = provider === "META_WHATSAPP";
          const isWhatsappQr = provider === "WHATSAPP_QR";
          const metadata = (integration?.metadataJson ?? null) as {
            qualityRating?: string; messagingTier?: string; displayPhoneNumber?: string; connectedPhoneE164?: string;
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

              {isWhatsappQr && integration?.status === "CONNECTED" && (
                <div className="mb-2 space-y-1 text-xs text-slate-400">
                  <p dir="ltr" className="text-slate-300">{metadata?.connectedPhoneE164}</p>
                  {integration.qrTrialExpiresAt && (
                    <p>
                      تنتهي التجربة: {new Date(integration.qrTrialExpiresAt).toLocaleString("ar-SA")}
                    </p>
                  )}
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
                {isWhatsappQr && integration?.status !== "CONNECTED" && <WhatsappQrConnectPanel />}
              </div>

              <div className="mt-4 flex gap-2">
                {integration?.status === "CONNECTED" ? (
                  <>
                    {provider !== "META_WHATSAPP" && provider !== "WHATSAPP_QR" && (
                      <form action={resyncIntegration.bind(null, provider)}>
                        <button className="btn-secondary text-xs">إعادة مزامنة</button>
                      </form>
                    )}
                    <ConfirmSubmitButton
                      action={disconnectIntegration.bind(null, provider)}
                      confirmMessage={
                        isMeta
                          ? "قطع الاتصال سيوقف استقبال وإرسال رسائل واتساب فوراً لهذا التاجر. هل أنت متأكد؟"
                          : isWhatsappQr
                          ? "سيُسجَّل الخروج من جلسة واتساب التجريبية فوراً وتُمسَح بياناتها. هل أنت متأكد؟"
                          : "هل تريد فعلاً قطع الاتصال بهذا التكامل؟"
                      }
                      className="btn-danger text-xs"
                    >
                      قطع الاتصال
                    </ConfirmSubmitButton>
                  </>
                ) : !isMeta && !isWhatsappQr ? (
                  <form action={connectIntegration.bind(null, provider)}>
                    <button className="btn-primary w-full text-xs">ربط الآن</button>
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
