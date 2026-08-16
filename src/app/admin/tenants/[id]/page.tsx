import { notFound } from "next/navigation";
import Link from "next/link";
import { requireSuperAdminSession } from "@/lib/session";
import { hasPermission } from "@/lib/rbac";
import { superAdminDb } from "@/lib/db";
import { PROVIDER_LABELS_AR } from "@/lib/integrations/registry";
import { DEFAULT_STARTER_CHATBOT_LIMITS, type ChatbotLimits } from "@/lib/planLimits";
import { DeleteTenantButton } from "@/components/admin/DeleteTenantButton";
import { TENANT_STATUS_LABELS_AR, TENANT_STATUS_BADGE_CLASS } from "@/lib/tenantStatus";
import { CORE_PROVIDERS, getIntegrationWebhookHealth } from "@/lib/integrationHealth";
import {
  setTenantStatus,
  changeTenantPlan,
  addMerchantNote,
  startImpersonationAction,
} from "../actions";

const JOIN_SOURCE_LABELS_AR: Record<string, string> = {
  DIRECT_REGISTER: "تسجيل مباشر (نموذج التسجيل العام)",
  PARTNER_APPLICATION: "نظام طلبات الشركاء",
  MANUAL_ADMIN: "إضافة يدوية من فريق المنصة",
};

const INVOICE_STATUS_LABELS_AR: Record<string, string> = { PAID: "مدفوعة", FAILED: "فشلت", PENDING: "قيد الانتظار", REFUNDED: "مستردة" };

export default async function TenantDetailPage({ params }: { params: { id: string } }) {
  const session = await requireSuperAdminSession();
  const canView = hasPermission(session.user.role, "platform.merchants.view");
  if (!canView) {
    return (
      <div className="card p-8 text-center text-slate-400">
        ليس لديك صلاحية عرض تفاصيل التجار. هذه الصفحة محصورة بفريق الدعم الفني ومالك المنصة.
      </div>
    );
  }

  const canSuspend = hasPermission(session.user.role, "platform.merchants.suspend");
  const canDelete = hasPermission(session.user.role, "platform.merchants.delete");
  const canChangePlan = hasPermission(session.user.role, "platform.merchants.change_plan");
  const canImpersonate = hasPermission(session.user.role, "platform.merchants.impersonate");
  const canAddNotes = hasPermission(session.user.role, "platform.merchants.notes");

  const [tenant, plans, recentInvoices, joinRequest] = await Promise.all([
    superAdminDb.tenant.findUnique({
      where: { id: params.id },
      include: {
        subscription: { include: { plan: true } },
        integrations: true,
        merchantNotes: { include: { author: true }, orderBy: { createdAt: "desc" }, take: 20 },
        _count: { select: { contacts: true, campaigns: true, chatbotFlows: true, users: true } },
      },
    }),
    superAdminDb.plan.findMany({ where: { isActive: true, isCustomForTenantId: null }, orderBy: { priceMonthlySar: "asc" } }),
    superAdminDb.invoice.findMany({ where: { tenantId: params.id }, orderBy: { createdAt: "desc" }, take: 10 }),
    // "بانتظار المراجعة" وحدها قد لا توضّح فعلياً *متى/كيف* وصل هذا التاجر — أُضيف لعرض تفاصيل طلب
    // NEW_TENANT/PARTNER_APPLICATION الأصلي إن وُجد، تكميلاً لعرض Tenant.joinSource الخام.
    superAdminDb.approvalRequest.findFirst({
      where: { tenantId: params.id, type: { in: ["NEW_TENANT", "PARTNER_APPLICATION"] } },
      orderBy: { createdAt: "asc" },
    }),
  ]);

  if (!tenant) notFound();

  const webhookHealthByProvider = await Promise.all(
    CORE_PROVIDERS.map(async (provider) => ({ provider, ...(await getIntegrationWebhookHealth(tenant.id, provider)) }))
  );

  const chatbotLimits = (tenant.subscription?.plan.chatbotLimitsJson as ChatbotLimits | null) ?? DEFAULT_STARTER_CHATBOT_LIMITS;
  const connectedWhatsappCount = tenant.integrations.filter((i) => (i.provider === "META_WHATSAPP" || i.provider === "WHATSAPP_QR") && i.status === "CONNECTED").length;
  const usage = tenant.subscription
    ? {
        messages: { used: tenant.subscription.messagesUsedThisPeriod, max: tenant.subscription.plan.maxMessagesPerMonth },
        users: { used: tenant._count.users, max: tenant.subscription.plan.maxUsers },
        flows: { used: tenant._count.chatbotFlows, max: chatbotLimits.maxActiveFlows < 0 ? null : chatbotLimits.maxActiveFlows },
        whatsapp: { used: connectedWhatsappCount, max: tenant.subscription.plan.maxWhatsappNumbers },
      }
    : null;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="flex h-12 w-12 items-center justify-center rounded-xl2 text-lg font-bold text-white" style={{ backgroundColor: tenant.primaryColor }}>
            {tenant.name.slice(0, 1)}
          </div>
          <div>
            <h1 className="text-xl font-bold text-white">{tenant.name}</h1>
            <div className="flex items-center gap-2 text-sm text-slate-400">
              <span dir="ltr">{tenant.slug}</span>
              <span className={`badge ${TENANT_STATUS_BADGE_CLASS[tenant.status] ?? "bg-slate-500/10 text-slate-400"}`}>
                {TENANT_STATUS_LABELS_AR[tenant.status] ?? tenant.status}
              </span>
            </div>
            <p className="mt-1 text-xs text-slate-500">
              مصدر الانضمام: {JOIN_SOURCE_LABELS_AR[tenant.joinSource] ?? tenant.joinSource}
              {joinRequest?.applicantEmail && <span dir="ltr"> · {joinRequest.applicantEmail}</span>}
              {" · "}انضم في {tenant.createdAt.toLocaleDateString("ar-SA")}
            </p>
          </div>
        </div>

        <div className="flex flex-wrap gap-2">
          {canImpersonate && (
            <form action={startImpersonationAction.bind(null, tenant.id)}>
              <button className="btn-secondary text-xs" title="حصري لمالك المنصة — جلسة مؤقتة موثَّقة بالكامل في سجل التدقيق">
                🕵️ الدخول كخبير
              </button>
            </form>
          )}
          {canSuspend && (
            tenant.status === "SUSPENDED" ? (
              <form action={setTenantStatus.bind(null, tenant.id, "ACTIVE")}>
                <button className="btn-secondary text-xs text-success-500">إعادة تفعيل</button>
              </form>
            ) : (
              <form action={setTenantStatus.bind(null, tenant.id, "SUSPENDED")}>
                <button className="btn-secondary text-xs text-danger-500">تعليق الحساب</button>
              </form>
            )
          )}
          {canDelete && <DeleteTenantButton tenantId={tenant.id} tenantSlug={tenant.slug} />}
        </div>
      </div>

      {usage && (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <UsageCard label="الرسائل هذا الشهر" used={usage.messages.used} max={usage.messages.max} />
          <UsageCard label="أعضاء الفريق" used={usage.users.used} max={usage.users.max} />
          <UsageCard label="تدفقات الشات بوت" used={usage.flows.used} max={usage.flows.max} />
          <UsageCard label="أرقام واتساب المربوطة" used={usage.whatsapp.used} max={usage.whatsapp.max} />
        </div>
      )}

      <div className="card p-5">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="font-semibold text-white">الباقة والاشتراك</h2>
        </div>
        <p className="mb-3 text-sm text-slate-300">
          الباقة الحالية: <span className="font-semibold text-accent-400">{tenant.subscription?.plan.name ?? "لا يوجد اشتراك"}</span>
        </p>
        {canChangePlan && (
          <form action={async (fd) => {
            "use server";
            await changeTenantPlan(tenant.id, String(fd.get("planId")));
          }} className="flex gap-2">
            <select name="planId" defaultValue={tenant.subscription?.planId} className="input-field text-sm">
              {plans.map((p) => (
                <option key={p.id} value={p.id}>{p.name} — {p.priceMonthlySar} ر.س</option>
              ))}
            </select>
            <button type="submit" className="btn-secondary text-xs">تغيير الباقة يدوياً</button>
          </form>
        )}
      </div>

      <div className="card p-5">
        <h2 className="mb-3 font-semibold text-white">صحة التكاملات التفصيلية</h2>
        <div className="space-y-2">
          {tenant.integrations.map((i) => {
            const webhookHealth = webhookHealthByProvider.find((w) => w.provider === i.provider);
            return (
              <div key={i.id} className="rounded-lg border border-white/5 p-3 text-sm">
                <div className="flex items-center justify-between">
                  <span className="text-slate-300">
                    {PROVIDER_LABELS_AR[i.provider]}
                    {i.pendingVerification && <span className="badge bg-warning-500/10 text-warning-500 mr-2">بانتظار التحقق</span>}
                  </span>
                  <span
                    className={`badge ${
                      i.status === "CONNECTED" ? "bg-success-500/10 text-success-500"
                      : i.status === "ERROR" || i.status === "NEEDS_REAUTH" ? "bg-danger-500/10 text-danger-500"
                      : "bg-slate-500/10 text-slate-400"
                    }`}
                  >
                    {i.status === "CONNECTED" ? "متصل" : i.status === "NEEDS_REAUTH" ? "يحتاج إعادة مصادقة" : i.status === "ERROR" ? "خطأ" : "غير متصل"}
                  </span>
                </div>
                {i.lastError && <p className="mt-1 text-xs text-danger-500">{i.lastError}</p>}
                {webhookHealth && (webhookHealth.lastSuccessAt || webhookHealth.lastFailureAt) && (
                  <p className="mt-1 text-xs text-slate-500">
                    {webhookHealth.lastSuccessAt && <span>آخر webhook ناجح: {webhookHealth.lastSuccessAt.toLocaleString("ar-SA")}</span>}
                    {webhookHealth.lastSuccessAt && webhookHealth.lastFailureAt && " · "}
                    {webhookHealth.lastFailureAt && (
                      <span className="text-danger-500">
                        آخر webhook فاشل: {webhookHealth.lastFailureAt.toLocaleString("ar-SA")}
                        {webhookHealth.lastFailureReason && ` (${webhookHealth.lastFailureReason})`}
                      </span>
                    )}
                  </p>
                )}
              </div>
            );
          })}
        </div>
      </div>

      <div className="card p-5">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="font-semibold text-white">سجل الفواتير (قراءة فقط)</h2>
          <Link href="/admin/billing" className="text-xs text-accent-400 hover:underline">إدارة الفوترة الكاملة ←</Link>
        </div>
        <div className="space-y-1.5">
          {recentInvoices.length === 0 && <p className="text-sm text-slate-500">لا توجد فواتير بعد.</p>}
          {recentInvoices.map((inv) => (
            <div key={inv.id} className="flex items-center justify-between rounded-lg border border-white/5 p-2.5 text-sm">
              <span className="text-slate-400" dir="ltr">#{inv.invoiceNumber}</span>
              <span className="text-slate-300">{inv.createdAt.toLocaleDateString("ar-SA")}</span>
              <span className="text-slate-100" dir="ltr">{inv.amountSar} ر.س</span>
              <span
                className={`badge ${
                  inv.status === "PAID" ? "bg-success-500/10 text-success-500"
                  : inv.status === "FAILED" ? "bg-danger-500/10 text-danger-500"
                  : "bg-warning-500/10 text-warning-500"
                }`}
              >
                {INVOICE_STATUS_LABELS_AR[inv.status] ?? inv.status}
              </span>
            </div>
          ))}
        </div>
      </div>

      <div className="card p-5">
        <h2 className="mb-3 font-semibold text-white">ملاحظات داخلية (فريق المنصة فقط)</h2>
        {canAddNotes && (
          <form action={addMerchantNote.bind(null, tenant.id)} className="mb-4 flex gap-2">
            <input name="body" required placeholder="أضف ملاحظة عن هذا التاجر..." className="input-field flex-1 text-sm" />
            <button type="submit" className="btn-secondary text-xs">إضافة</button>
          </form>
        )}
        <div className="space-y-2">
          {tenant.merchantNotes.length === 0 && <p className="text-sm text-slate-500">لا توجد ملاحظات بعد.</p>}
          {tenant.merchantNotes.map((n) => (
            <div key={n.id} className="rounded-lg border border-white/5 p-3 text-sm">
              <p className="text-slate-300">{n.body}</p>
              <p className="mt-1 text-xs text-slate-500">{n.author.name} · {new Date(n.createdAt).toLocaleString("ar-SA")}</p>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function UsageCard({ label, used, max }: { label: string; used: number; max: number | null }) {
  const percent = max ? Math.min(100, Math.round((used / max) * 100)) : null;
  return (
    <div className="card p-4">
      <p className="text-xs text-slate-400">{label}</p>
      <p className="mt-1 font-bold text-white" dir="ltr">{used}{max ? ` / ${max}` : ""}</p>
      {percent !== null && (
        <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-navy-700">
          <div className={`h-full rounded-full ${percent > 90 ? "bg-danger-500" : percent > 70 ? "bg-warning-500" : "bg-accent-500"}`} style={{ width: `${percent}%` }} />
        </div>
      )}
    </div>
  );
}
