import { IntegrationProvider, Prisma, type Plan, type SubscriptionStatus } from "@prisma/client";
import { superAdminDb } from "@/lib/db";
import { getSallaConfig } from "./config";

/**
 * اشتراكات DMS المدفوعة عبر متجر تطبيقات سلة (أحداث app.subscription.* وapp.trial.*): سلة تحصّل المبلغ
 * من التاجر، ونحن نعكس الباقة والفترة على Subscription في DMS — بلا فاتورة DMS (الفاتورة من سلة).
 *
 * مطابقة باقة سلة بباقة DMS بالترتيب: ربط الباقات من لوحة الأدمن (/admin/salla) أو SALLA_PLAN_MAP ({"اسم باقة سلة": "مفتاح باقة DMS"})
 * ← مفتاح الباقة = item_slug أو اسم الباقة ← اسم الباقة العربي مطابق تماماً.
 */

type SubData = {
  plan_name?: string; plan_type?: string; item_type?: string; item_slug?: string;
  start_date?: string; end_date?: string; renew_date?: string; price?: number; total?: number; plan_period?: unknown;
};

export type SubscriptionEventResult = { applied: boolean; note: string };

async function resolveDmsPlan(data: SubData): Promise<Plan | null> {
  const name = (data.plan_name ?? "").trim();
  try {
    const map = (await getSallaConfig()).planMap;
    const mappedKey = map[name] ?? (data.item_slug ? map[data.item_slug] : undefined);
    if (mappedKey) {
      const plan = await superAdminDb.plan.findUnique({ where: { key: mappedKey } });
      if (plan) return plan;
    }
  } catch {
    console.error("تعذّرت قراءة ربط باقات سلة — تم تجاهله");
  }
  const keys = [data.item_slug, name.toLowerCase()].filter((k): k is string => !!k);
  for (const key of keys) {
    const plan = await superAdminDb.plan.findUnique({ where: { key } });
    if (plan) return plan;
  }
  return name ? superAdminDb.plan.findFirst({ where: { name } }) : null;
}

function parseDate(value: unknown): Date | null {
  if (typeof value !== "string" || !value) return null;
  const d = new Date(value.replace(" ", "T"));
  return Number.isNaN(d.getTime()) ? null : d;
}

export async function handleSallaSubscriptionEvent(tenantId: string, event: string, data: SubData): Promise<SubscriptionEventResult> {
  if (data.item_type && data.item_type !== "plan") return { applied: false, note: `حدث إضافة (${data.item_type}) — لا يؤثر على الباقة` };

  const subscription = await superAdminDb.subscription.findUnique({ where: { tenantId }, include: { plan: true } });
  if (!subscription) return { applied: false, note: "لا يوجد اشتراك DMS لهذا الحساب" };

  const start = parseDate(data.start_date);
  const end = parseDate(data.renew_date) ?? parseDate(data.end_date);
  let update: Prisma.SubscriptionUpdateInput = {};
  let note = "";

  switch (event) {
    case "app.trial.started": {
      const plan = await resolveDmsPlan(data);
      update = { status: "TRIALING" as SubscriptionStatus, ...(plan ? { plan: { connect: { id: plan.id } } } : {}), ...(start ? { currentPeriodStart: start } : {}), ...(end ? { currentPeriodEnd: end } : {}), cancelAtPeriodEnd: false };
      note = `بدأت التجربة عبر سلة${plan ? ` (باقة ${plan.name})` : ""}`;
      break;
    }
    case "app.subscription.started":
    case "app.subscription.renewed": {
      const plan = await resolveDmsPlan(data);
      if (!plan) return { applied: false, note: `باقة سلة "${data.plan_name ?? "?"}" غير مطابقة لأي باقة DMS — أضفها في "ربط الباقات" بصفحة تطبيق سلة في لوحة الأدمن` };
      update = {
        status: "ACTIVE", plan: { connect: { id: plan.id } }, cancelAtPeriodEnd: false, cancelReason: null,
        ...(start ? { currentPeriodStart: start } : {}), ...(end ? { currentPeriodEnd: end } : {}),
        // فترة جديدة = عدّادات استخدام جديدة (نفس سلوك تجديد الاشتراك الداخلي).
        ...(event === "app.subscription.renewed" || subscription.planId !== plan.id ? { messagesUsedThisPeriod: 0, aiTokensUsedThisPeriod: 0, voiceCallMinutesUsedThisPeriod: 0 } : {}),
      };
      note = `${event === "app.subscription.renewed" ? "تجدد" : "بدأ"} اشتراك ${plan.name} عبر سلة${end ? ` حتى ${end.toISOString().slice(0, 10)}` : ""}`;
      break;
    }
    case "app.subscription.canceled":
    case "app.trial.canceled":
      // الإلغاء يسري بنهاية الفترة المدفوعة (التاجر دفع لها) — مهمة فحص الانتهاء الدورية تحوّله لاحقاً.
      update = { cancelAtPeriodEnd: true, cancelReason: "أُلغي من متجر تطبيقات سلة", ...(end ? { currentPeriodEnd: end } : {}) };
      note = "أُلغي الاشتراك من سلة — يسري بنهاية الفترة الحالية";
      break;
    case "app.subscription.expired":
    case "app.trial.expired":
      update = { status: "PAST_DUE", ...(end ? { currentPeriodEnd: end } : {}) };
      note = event === "app.trial.expired" ? "انتهت التجربة عبر سلة" : "انتهى الاشتراك عبر سلة";
      break;
    default:
      return { applied: false, note: "حدث اشتراك غير مدعوم" };
  }

  await superAdminDb.$transaction(async (tx) => {
    await tx.subscription.update({ where: { tenantId }, data: update });
    const integration = await tx.integration.findUnique({ where: { tenantId_provider: { tenantId, provider: IntegrationProvider.SALLA } } });
    if (integration) {
      const meta = (integration.metadataJson && typeof integration.metadataJson === "object" ? integration.metadataJson : {}) as Record<string, unknown>;
      await tx.integration.update({
        where: { id: integration.id },
        data: {
          metadataJson: {
            ...meta,
            billing: { source: "salla", lastEvent: event, planName: data.plan_name ?? null, endDate: end?.toISOString() ?? null, total: data.total ?? data.price ?? null, updatedAt: new Date().toISOString() },
          } as Prisma.InputJsonValue,
        },
      });
    }
    await tx.auditLog.create({ data: { tenantId, action: "billing.salla_subscription_event", targetType: "Subscription", targetId: subscription.id, metaJson: { event, planName: data.plan_name ?? null } } });
  });
  return { applied: true, note };
}

const SALLA_BILLED_MESSAGE = "اشتراكك يُدار عبر متجر تطبيقات سلة — غيّر الباقة أو ألغِها من صفحة التطبيق في لوحة متجرك على سلة.";

/** هل يُحصَّل اشتراك هذا الحساب عبر سلة؟ عندها تغيير الباقة/الإلغاء/الإيقاف يتم من سلة فقط (منع تعارض الفوترة). */
export async function getSallaBilling(tenantId: string): Promise<{ planName: string | null; endDate: string | null } | null> {
  const integration = await superAdminDb.integration.findUnique({
    where: { tenantId_provider: { tenantId, provider: IntegrationProvider.SALLA } },
    select: { metadataJson: true },
  });
  const billing = (integration?.metadataJson as { billing?: { source?: string; planName?: string | null; endDate?: string | null } } | null)?.billing;
  return billing?.source === "salla" ? { planName: billing.planName ?? null, endDate: billing.endDate ?? null } : null;
}

export async function assertNotSallaBilled(tenantId: string) {
  if (await getSallaBilling(tenantId)) throw new Error(SALLA_BILLED_MESSAGE);
}

export { SALLA_BILLED_MESSAGE };
