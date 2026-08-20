import { notFound } from "next/navigation";
import { requireTenantSession } from "@/lib/session";
import { withTenant, rawDb } from "@/lib/db";
// billing.manage تبقى فحصاً دورياً عمداً (NON_CUSTOMIZABLE_PERMISSIONS — راجع lib/rbac.ts):
// لو استُخدمت hasEffectivePermission هنا، أي مدير (ADMIN) لديه أي تخصيص صلاحيات فردي (حتى لغرض
// مختلف تماماً) كان سيفقد billing.manage بصمت، لأن resolveEffectivePermissions تستبدل صلاحيات
// الدور بالكامل بالمصفوفة المخصَّصة (لا تدمج)، وbilling.manage لا يمكن أن يظهر في تلك المصفوفة
// أصلاً (مرفوضة من updateUserPermissions). billing.view وحدها قابلة للتخصيص فتستخدم effective.
import { hasPermission, hasEffectivePermission } from "@/lib/rbac";
import { parseChatbotLimits, DEFAULT_STARTER_CHATBOT_LIMITS } from "@/lib/planLimits";
import { parseCampaignLimits, DEFAULT_STARTER_CAMPAIGN_LIMITS } from "@/lib/campaigns/limits";
import { requestCustomPlan } from "./actions";
import { UsageBar } from "./UsageBar";
import { PaymentMethodSection } from "./PaymentMethodSection";
import { PlanComparison, type ComparisonPlan } from "./PlanComparison";
import { CancelSubscriptionFlow } from "./CancelSubscriptionFlow";
import { RetryPaymentButton } from "./RetryPaymentButton";
import { DevSimulateFailureButton } from "./DevSimulateFailureButton";
import { resolvePlanPrice } from "@/lib/planPricing";
import { COUNTRY_TO_CURRENCY, formatMoney } from "@/lib/currency";
import { getCountryConfig } from "@/lib/billing/countryConfig";

export default async function BillingPage() {
  const session = await requireTenantSession();
  if (!hasEffectivePermission(session.user.permissions, "billing.view")) notFound();
  const canManage = hasPermission(session.user.role, "billing.manage");
  const tenantId = session.user.tenantId;

  const [tenant, subscription, invoices, catalogPlans, pendingCustomPlanRequest, paymentMethod, activeUserCount, connectedWhatsappCount, publishedFlowCount] =
    await Promise.all([
      rawDb.tenant.findUniqueOrThrow({ where: { id: tenantId }, select: { country: true } }),
      withTenant(tenantId, (tx) => tx.subscription.findUnique({ where: { tenantId }, include: { plan: true } })),
      withTenant(tenantId, (tx) => tx.invoice.findMany({ where: { tenantId }, orderBy: { createdAt: "desc" }, take: 50 })),
      // الباقات المخصصة (isCustomForTenantId) لا تظهر أبداً في كتالوج الباقات العام لبقية التجار
      rawDb.plan.findMany({ where: { isActive: true, isCustomForTenantId: null }, orderBy: { priceMonthlySar: "asc" } }),
      withTenant(tenantId, (tx) => tx.approvalRequest.findFirst({ where: { tenantId, type: "CUSTOM_PLAN", status: "PENDING" } })),
      withTenant(tenantId, (tx) => tx.paymentMethod.findUnique({ where: { tenantId } })),
      withTenant(tenantId, (tx) => tx.user.count({ where: { tenantId, isActive: true } })),
      withTenant(tenantId, (tx) => tx.integration.count({ where: { tenantId, provider: { in: ["META_WHATSAPP", "WHATSAPP_QR"] }, status: "CONNECTED" } })),
      withTenant(tenantId, (tx) => tx.chatbotFlow.count({ where: { tenantId, status: "PUBLISHED" } })),
    ]);

  const tenantCurrency = COUNTRY_TO_CURRENCY[tenant.country];
  const tenantCountryConfig = await getCountryConfig(tenant.country);
  // كل باقة لها سعر تلقائي لكل دولة الآن (راجع lib/planPricing.ts).
  const comparisonPlans: ComparisonPlan[] = catalogPlans.map((p) => {
    const price = resolvePlanPrice(p, tenantCountryConfig);
    const chatbotLimits = parseChatbotLimits(p.chatbotLimitsJson) ?? DEFAULT_STARTER_CHATBOT_LIMITS;
    const campaignLimits = parseCampaignLimits(p.campaignLimitsJson) ?? DEFAULT_STARTER_CAMPAIGN_LIMITS;
    return {
      id: p.id, name: p.name, priceMonthlySar: price, annualDiscountBps: p.annualDiscountBps, isPopular: p.isPopular,
      maxUsers: p.maxUsers, maxWhatsappNumbers: p.maxWhatsappNumbers, maxMessagesPerMonth: p.maxMessagesPerMonth,
      maxActiveFlows: chatbotLimits.maxActiveFlows, hasAiNode: chatbotLimits.allowedNodeTypes.includes("ai_reply"),
      hasApiCallNode: chatbotLimits.allowedNodeTypes.includes("api_call"), maxCampaignsPerMonth: campaignLimits.maxCampaignsPerMonth,
      supportTier: p.supportTier, features: (p.features as string[] | null) ?? [],
    };
  });

  const daysRemaining = subscription ? Math.ceil((subscription.currentPeriodEnd.getTime() - Date.now()) / 86400000) : 0;
  const latestFailedInvoice = invoices.find((i) => i.status === "FAILED");

  // تنبيه تلقائي عند تجاوز أي مورد 80% من حده — لا ينتظر التاجر يكتشف بنفسه عند الفشل (بند أ في البرومنت)
  const usageWarnings: string[] = [];
  if (subscription) {
    const check = (label: string, used: number, max: number) => {
      if (max >= 0 && used / max >= 0.8) usageWarnings.push(`${label} (${Math.round((used / max) * 100)}%)`);
    };
    check("الرسائل الشهرية", subscription.messagesUsedThisPeriod, subscription.plan.maxMessagesPerMonth);
    check("أعضاء الفريق", activeUserCount, subscription.plan.maxUsers);
    check("أرقام واتساب", connectedWhatsappCount, subscription.plan.maxWhatsappNumbers);
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-bold text-white">الفوترة والاشتراك</h1>
        <p className="text-sm text-slate-400">إدارة باقتك واستخدامك وفواتيرك</p>
      </div>

      {subscription?.status === "TRIALING" && (
        <div className="card border border-accent-500/30 bg-accent-500/5 p-5">
          <p className="font-bold text-accent-400">
            🎁 فترتك التجريبية تنتهي خلال {daysRemaining > 0 ? `${daysRemaining} يوم` : "اليوم"}
          </p>
          <p className="mt-1 text-sm text-slate-400">اشترك الآن لضمان استمرار الخدمة بلا انقطاع.</p>
        </div>
      )}

      {subscription?.status === "PAST_DUE" && (
        <div className="card border border-danger-500/30 bg-danger-500/5 p-5">
          <p className="font-bold text-danger-500">⚠️ فشل آخر تحصيل دفع لاشتراكك</p>
          {latestFailedInvoice?.failureReason && <p className="mt-1 text-sm text-slate-400">السبب: {latestFailedInvoice.failureReason}</p>}
          {canManage && latestFailedInvoice && (
            <div className="mt-3">
              <RetryPaymentButton invoiceId={latestFailedInvoice.id} />
            </div>
          )}
        </div>
      )}

      {usageWarnings.length > 0 && (
        <div className="card border border-warning-500/30 bg-warning-500/5 p-5">
          <p className="font-bold text-warning-500">⚠️ اقتربت من حدود باقتك: {usageWarnings.join("، ")}</p>
          <p className="mt-1 text-sm text-slate-400">رقّي باقتك لتفادي انقطاع الخدمة عند الوصول للحد الأقصى.</p>
        </div>
      )}

      {subscription && (
        <div className="card p-5">
          <div className="mb-4 flex items-center justify-between">
            <div>
              <p className="text-sm text-slate-400">الباقة الحالية</p>
              <p className="text-lg font-bold text-accent-400">{subscription.plan.name}</p>
            </div>
            <span
              className={`badge ${
                subscription.status === "ACTIVE" ? "bg-success-500/10 text-success-500"
                : subscription.status === "PAST_DUE" ? "bg-danger-500/10 text-danger-500"
                : subscription.status === "PAUSED" ? "bg-warning-500/10 text-warning-500"
                : subscription.status === "CANCELLED" ? "bg-slate-500/10 text-slate-400"
                : "bg-accent-500/10 text-accent-400"
              }`}
            >
              {subscription.status === "ACTIVE" ? "نشط" : subscription.status === "TRIALING" ? "تجريبي"
                : subscription.status === "PAST_DUE" ? "متأخر السداد" : subscription.status === "PAUSED" ? "مُوقَف مؤقتاً" : "مُلغى"}
            </span>
          </div>

          <div className="space-y-3">
            <UsageBar label="الرسائل المستخدمة هذا الشهر" used={subscription.messagesUsedThisPeriod} max={subscription.plan.maxMessagesPerMonth} />
            <UsageBar label="تدفقات الشات بوت المنشورة" used={publishedFlowCount} max={comparisonPlans.find((p) => p.id === subscription.planId)?.maxActiveFlows ?? -1} />
            <UsageBar label="أعضاء الفريق" used={activeUserCount} max={subscription.plan.maxUsers} />
            <UsageBar label="أرقام واتساب المربوطة" used={connectedWhatsappCount} max={subscription.plan.maxWhatsappNumbers} />
          </div>

          <div className="mt-4 flex items-center justify-between border-t border-white/5 pt-3 text-xs text-slate-500">
            <span dir="ltr">الفاتورة القادمة: {formatMoney(resolvePlanPrice(subscription.plan, tenantCountryConfig), tenantCurrency)}</span>
            <span dir="ltr">تجديد الدورة: {subscription.currentPeriodEnd.toLocaleDateString("ar-SA")}</span>
          </div>
        </div>
      )}

      <PaymentMethodSection
        paymentMethod={paymentMethod ? { brand: paymentMethod.brand, last4: paymentMethod.last4, expiryMonth: paymentMethod.expiryMonth, expiryYear: paymentMethod.expiryYear } : null}
        canManage={canManage}
      />

      <PlanComparison plans={comparisonPlans} currentPlanId={subscription?.planId ?? null} canManage={canManage} currency={tenantCurrency} />

      <div className="card p-5">
        <h2 className="mb-2 font-semibold text-white">تحتاج باقة مخصصة (Enterprise)؟</h2>
        {pendingCustomPlanRequest ? (
          <p className="rounded-lg bg-warning-500/10 px-3 py-2 text-sm text-warning-500">
            ⏳ طلبك بانتظار مراجعة فريقنا، سنتواصل معك قريباً.
          </p>
        ) : canManage ? (
          <form action={requestCustomPlan} className="flex gap-2">
            <input name="details" required placeholder="صف احتياجك (عدد الرسائل، المستخدمين، إلخ)" className="input-field flex-1 text-sm" />
            <button type="submit" className="btn-secondary text-xs whitespace-nowrap">إرسال طلب</button>
          </form>
        ) : (
          <p className="text-sm text-slate-500">يتطلب صلاحية صاحب الحساب لإرسال طلب.</p>
        )}
      </div>

      {subscription && (
        <CancelSubscriptionFlow
          canManage={canManage}
          status={subscription.status}
          cancelAtPeriodEnd={subscription.cancelAtPeriodEnd}
          currentPeriodEnd={subscription.currentPeriodEnd.toISOString()}
          pausedUntil={subscription.pausedUntil?.toISOString() ?? null}
        />
      )}

      <div className="card overflow-hidden">
        <div className="flex items-center justify-between border-b border-white/5 p-4">
          <h2 className="font-semibold text-white">الفواتير السابقة</h2>
          {canManage && <DevSimulateFailureButton />}
        </div>
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-white/5 text-right text-xs text-slate-500">
              <th className="p-3 font-medium">رقم الفاتورة</th>
              <th className="p-3 font-medium">التاريخ</th>
              <th className="p-3 font-medium">المبلغ (شامل الضريبة)</th>
              <th className="p-3 font-medium">الحالة</th>
              <th className="p-3 font-medium"></th>
            </tr>
          </thead>
          <tbody>
            {invoices.map((inv) => (
              <tr key={inv.id} className="border-b border-white/5 last:border-0">
                <td className="p-3 text-slate-400" dir="ltr">#{inv.invoiceNumber}</td>
                <td className="p-3 text-slate-300">{inv.createdAt.toLocaleDateString("ar-SA")}</td>
                <td className="p-3 text-slate-100" dir="ltr">
                  {formatMoney(inv.amountSar, inv.currency)}
                  <span className="mr-1 text-xs text-slate-500">(منها {formatMoney(inv.vatAmountSar, inv.currency)} ضريبة قيمة مضافة {inv.vatRateBps / 100}%)</span>
                </td>
                <td className="p-3">
                  <span
                    className={`badge ${
                      inv.status === "PAID" ? "bg-success-500/10 text-success-500"
                      : inv.status === "FAILED" ? "bg-danger-500/10 text-danger-500"
                      : inv.status === "REFUNDED" ? "bg-slate-500/10 text-slate-400"
                      : "bg-warning-500/10 text-warning-500"
                    }`}
                  >
                    {inv.status === "PAID" ? "مدفوعة" : inv.status === "FAILED" ? "فشلت" : inv.status === "REFUNDED" ? "مستردة" : "قيد الانتظار"}
                  </span>
                  {inv.status === "FAILED" && inv.failureReason && <p className="mt-1 text-xs text-danger-500">{inv.failureReason}</p>}
                </td>
                <td className="p-3 text-left">
                  <div className="flex items-center justify-end gap-2">
                    {inv.status === "FAILED" && canManage && <RetryPaymentButton invoiceId={inv.id} />}
                    <a href={`/api/billing/invoices/${inv.id}/pdf`} className="text-xs text-accent-400 hover:underline">تحميل PDF</a>
                  </div>
                </td>
              </tr>
            ))}
            {invoices.length === 0 && (
              <tr>
                <td colSpan={5} className="p-8 text-center text-slate-500">لا توجد فواتير بعد.</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
