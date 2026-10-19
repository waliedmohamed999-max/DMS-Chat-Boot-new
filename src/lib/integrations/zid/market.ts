import { IntegrationProvider, Prisma, type SubscriptionStatus } from "@prisma/client";
import { superAdminDb } from "@/lib/db";
import { getZidConfig } from "./config";
import { handleZidUninstall } from "./install";

/**
 * أحداث متجر تطبيقات زد (docs.zid.sa/events): تُضبط في لوحة شركاء زد ← Webhooks بترويسة مخصّصة
 * X-DMS-Zid-Token. المتجر يُعرَّف بـstore_id (رقمي). الاشتراكات تنعكس على Subscription في DMS
 * (الفوترة من زد) بمطابقة اسم باقة زد ← ربط الباقات في لوحة الأدمن ← مفتاح/اسم باقة DMS.
 */
export type ZidMarketPayload = {
  event_name?: string;
  store_id?: number | string;
  store_uuid?: string;
  plan_name?: string | null;
  old_plan_name?: string | null;
  plan_id?: number | string;
  plan_type?: string;
  status?: string;
  start_date?: string | null;
  end_date?: string | null;
  amount_paid?: number | null;
  merchant_email?: string | null;
};

export type ZidMarketResult = { tenantId: string | null; note: string; unmatched?: boolean };

function parseDate(value: unknown): Date | null {
  if (typeof value !== "string" || !value) return null;
  const d = new Date(value.replace(" ", "T"));
  return Number.isNaN(d.getTime()) ? null : d;
}

async function resolveDmsPlan(name: string | null | undefined) {
  const n = (name ?? "").trim();
  if (!n) return null;
  const mapped = (await getZidConfig()).planMap[n];
  if (mapped) {
    const plan = await superAdminDb.plan.findUnique({ where: { key: mapped } });
    if (plan) return plan;
  }
  return (await superAdminDb.plan.findUnique({ where: { key: n.toLowerCase() } })) ?? superAdminDb.plan.findFirst({ where: { name: n } });
}

export async function processZidMarketEvent(p: ZidMarketPayload): Promise<ZidMarketResult> {
  const event = p.event_name ?? "unknown";
  const storeId = p.store_id != null ? String(p.store_id) : null;
  if (!storeId) return { tenantId: null, note: "حدث بلا رقم متجر", unmatched: true };

  if (event === "app.market.application.uninstall") {
    const tenantId = await handleZidUninstall(storeId);
    return tenantId ? { tenantId, note: "حُذف التطبيق من متجر زد — تم فك الربط" } : { tenantId: null, note: "متجر غير مربوط", unmatched: true };
  }

  const integration = await superAdminDb.integration.findFirst({ where: { provider: IntegrationProvider.ZID, externalAccountId: storeId, isSandbox: false } });
  if (event === "app.market.application.authorized" || event === "app.market.application.install") {
    // الربط الفعلي يتم عبر OAuth (/api/zid/oauth/callback) — هذا الحدث يُسجَّل فقط (قد يصل قبله).
    return { tenantId: integration?.tenantId ?? null, note: integration ? "تثبيت لمتجر مربوط" : "تثبيت — بانتظار إكمال التفويض من رابط التطبيق" };
  }
  if (event === "app.market.application.rated" || event === "app.market.private.plan.request" || event.startsWith("app.market.subscription.usage_based")) {
    return { tenantId: integration?.tenantId ?? null, note: "تم الاستلام" };
  }
  if (!integration) return { tenantId: null, note: "لم يتم إيجاد متجر زد مطابق", unmatched: true };
  const tenantId = integration.tenantId;
  if (!event.startsWith("app.market.subscription.")) return { tenantId, note: "حدث غير مدعوم — تم تسجيله فقط" };

  const subscription = await superAdminDb.subscription.findUnique({ where: { tenantId } });
  if (!subscription) return { tenantId, note: "لا يوجد اشتراك DMS لهذا الحساب" };
  const start = parseDate(p.start_date);
  const end = parseDate(p.end_date);
  let update: Prisma.SubscriptionUpdateInput;
  let note: string;

  switch (event) {
    case "app.market.subscription.active":
    case "app.market.subscription.renew":
    case "app.market.subscription.upgrade": {
      const plan = await resolveDmsPlan(p.plan_name);
      if (!plan) return { tenantId, note: `باقة زد "${p.plan_name ?? "?"}" غير مطابقة لأي باقة DMS — أضفها في "ربط الباقات" بصفحة تطبيق زد في لوحة الأدمن`, unmatched: true };
      const isTrial = (p.plan_type ?? "").toLowerCase() === "trial";
      update = {
        status: (isTrial ? "TRIALING" : "ACTIVE") as SubscriptionStatus, plan: { connect: { id: plan.id } }, cancelAtPeriodEnd: false, cancelReason: null,
        ...(start ? { currentPeriodStart: start } : {}), ...(end ? { currentPeriodEnd: end } : {}),
        ...(event !== "app.market.subscription.active" || subscription.planId !== plan.id ? { messagesUsedThisPeriod: 0, aiTokensUsedThisPeriod: 0, voiceCallMinutesUsedThisPeriod: 0 } : {}),
      };
      note = `${event.endsWith("renew") ? "تجدد" : event.endsWith("upgrade") ? "رُقّي" : "فُعّل"} اشتراك ${plan.name} عبر زد${end ? ` حتى ${end.toISOString().slice(0, 10)}` : ""}`;
      break;
    }
    case "app.market.subscription.warning":
      return { tenantId, note: "تنبيه: الاشتراك عبر زد ينتهي خلال 3 أيام" };
    case "app.market.subscription.suspended":
      update = { status: "PAST_DUE", ...(end ? { currentPeriodEnd: end } : {}) };
      note = "عُلّق الاشتراك عبر زد (فترة سماح)";
      break;
    case "app.market.subscription.expired":
    case "app.market.subscription.refunded":
      update = { status: "CANCELLED" as SubscriptionStatus, cancelReason: event.endsWith("refunded") ? "استُرد المبلغ عبر زد" : "انتهى الاشتراك عبر زد" };
      note = event.endsWith("refunded") ? "استُرد اشتراك زد — أُلغي" : "انتهى الاشتراك عبر زد";
      break;
    default:
      return { tenantId, note: "حدث اشتراك غير مدعوم" };
  }

  await superAdminDb.$transaction(async (tx) => {
    await tx.subscription.update({ where: { tenantId }, data: update });
    const meta = (integration.metadataJson && typeof integration.metadataJson === "object" ? integration.metadataJson : {}) as Record<string, unknown>;
    await tx.integration.update({
      where: { id: integration.id },
      data: {
        metadataJson: {
          ...meta,
          billing: { source: "zid", lastEvent: event, planName: p.plan_name ?? null, endDate: end?.toISOString() ?? null, total: p.amount_paid ?? null, updatedAt: new Date().toISOString() },
        } as Prisma.InputJsonValue,
      },
    });
    await tx.auditLog.create({ data: { tenantId, action: "billing.zid_subscription_event", targetType: "Subscription", targetId: subscription.id, metaJson: { event, planName: p.plan_name ?? null } } });
  });
  return { tenantId, note };
}
