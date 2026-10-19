import { IntegrationProvider } from "@prisma/client";
import { superAdminDb, withTenant } from "@/lib/db";
import { checkTenantRateLimit } from "@/lib/rateLimit";
import { resolveWhatsappAdapter } from "@/lib/integrations/registry";
import { getTenantCampaignLimits } from "@/lib/campaigns/limits";
import { sallaPhoneToE164 } from "./mappers";

/**
 * تطبيق تواصل (Communication App): التاجر يختار DMS كقناة واتساب لمتجره في سلة، فتمرّر سلة كل رسائل
 * المتجر (حالة الطلب، الفاتورة، السلة المتروكة، رمز التحقق…) نصاً جاهزاً إلى دالة التطبيق التي تحوّلها
 * هنا، ونرسلها من رقم واتساب التاجر المربوط في DMS. docs.salla.dev/1380572m0
 *
 * - رموز التحقق (OTP) لا تُحفظ نصوصها أبداً (لا في صندوق المحادثات ولا في سجل الأحداث).
 * - الرسائل التسويقية (marketing.campaign.broadcast) لا تُرسل لعميل ألغى موافقته التسويقية.
 * - كل رسالة تُحتسب من حصة الباقة الشهرية، ولا يُرسل شيء لاشتراك منتهٍ/متوقف أو حساب غير مفعّل.
 */

type CommPayload = {
  event?: string;
  merchant?: string | number;
  data?: { notifiable?: unknown; type?: string; content?: string; entity?: { id?: unknown; type?: string } | null; locale?: string; meta?: Record<string, unknown> };
};

export type CommResult = { ok: true; sent: number; skipped: number } | { ok: false; status: number; error: string };

const OTP_TYPES = new Set(["auth.otp.verification", "otp"]);
const MARKETING_TYPES = new Set(["marketing.campaign.broadcast"]);
const BLOCKED_TENANT_STATUSES = new Set(["PENDING_REVIEW", "SUSPENDED", "CANCELLED", "REJECTED"]);

export function redactCommunication(payload: CommPayload): Record<string, unknown> {
  const isOtp = OTP_TYPES.has(payload.data?.type ?? "");
  return {
    ...payload,
    data: {
      ...payload.data,
      content: isOtp ? "[رمز تحقق — مخفي]" : payload.data?.content,
      meta: isOtp ? { ...(payload.data?.meta ?? {}), code: "[مخفي]" } : payload.data?.meta,
    },
  };
}

export async function handleSallaCommunication(payload: CommPayload): Promise<CommResult> {
  if (payload.event !== "communication.whatsapp.send") {
    return { ok: false, status: 422, error: "DMS Tech يدعم قناة واتساب فقط" };
  }
  const merchantId = payload.merchant != null ? String(payload.merchant) : "";
  const data = payload.data ?? {};
  const content = typeof data.content === "string" ? data.content.trim() : "";
  const recipients = (Array.isArray(data.notifiable) ? data.notifiable : [data.notifiable]).filter((x) => x != null && x !== "").map(String);
  if (!merchantId || !content || recipients.length === 0) return { ok: false, status: 400, error: "رسالة ناقصة (التاجر/المحتوى/المستلم)" };

  const integration = await superAdminDb.integration.findFirst({
    where: { provider: IntegrationProvider.SALLA, externalAccountId: merchantId, isSandbox: false, status: "CONNECTED" },
    select: { tenantId: true },
  });
  if (!integration) return { ok: false, status: 404, error: "المتجر غير مربوط بحساب DMS فعّال" };
  const tenantId = integration.tenantId;

  const tenant = await superAdminDb.tenant.findUnique({ where: { id: tenantId }, select: { status: true } });
  if (!tenant || BLOCKED_TENANT_STATUSES.has(tenant.status)) return { ok: false, status: 403, error: "حساب DMS غير مفعّل بعد" };

  const limits = await getTenantCampaignLimits(tenantId);
  if (["PAST_DUE", "CANCELLED", "PAUSED"].includes(limits.subscriptionStatus)) return { ok: false, status: 402, error: "اشتراك DMS غير نشط" };
  if (limits.messagesUsedThisPeriod + recipients.length > limits.maxMessagesPerMonth) return { ok: false, status: 402, error: "انتهت حصة الرسائل الشهرية في باقة DMS" };

  if (!(await checkTenantRateLimit(tenantId, "salla-communication", 600, 60)).allowed) return { ok: false, status: 429, error: "تجاوز حد الإرسال — أعد المحاولة" };

  const isOtp = OTP_TYPES.has(data.type ?? "");
  const isMarketing = MARKETING_TYPES.has(data.type ?? "");
  // فئة تسعير Meta للرسالة (قناة 360dialog تخصمها من المحفظة؛ القنوات الأخرى تتجاهلها).
  const sendOptions = { category: isOtp ? "AUTHENTICATION" : isMarketing ? "MARKETING" : "UTILITY" } as const;
  const adapter = await resolveWhatsappAdapter(tenantId);
  let sent = 0;
  let skipped = 0;
  const errors: string[] = [];

  for (const raw of recipients) {
    const phoneE164 = sallaPhoneToE164(raw);
    if (!phoneE164) {
      skipped++;
      continue;
    }

    if (isOtp) {
      // رمز التحقق: إرسال مباشر بلا إنشاء جهة اتصال ولا حفظ النص في أي مكان.
      const result = await adapter.sendMessage(tenantId, phoneE164, content, undefined, sendOptions);
      await withTenant(tenantId, (tx) => tx.subscription.updateMany({ where: { tenantId }, data: { messagesUsedThisPeriod: { increment: 1 } } }));
      if (result.success) sent++;
      else errors.push(result.error ?? "فشل الإرسال");
      continue;
    }

    const contact = await withTenant(tenantId, async (tx) =>
      (await tx.contact.findUnique({ where: { tenantId_phoneE164: { tenantId, phoneE164 } } })) ??
      (await tx.contact.create({ data: { tenantId, name: phoneE164, phoneE164, source: "SALLA_SYNC", stage: "CUSTOMER" } }))
    );
    if (isMarketing && contact.marketingOptIn === false) {
      skipped++;
      continue;
    }

    // الإرسال خارج أي معاملة قاعدة بيانات — طلب HTTP بطيء لواتساب لا يجب أن يُبقي معاملة مفتوحة.
    const result = await adapter.sendMessage(tenantId, phoneE164, content, undefined, sendOptions);
    await withTenant(tenantId, async (tx) => {
      await tx.subscription.updateMany({ where: { tenantId }, data: { messagesUsedThisPeriod: { increment: 1 } } });
      const now = new Date();
      const conversation =
        (await tx.conversation.findFirst({ where: { tenantId, contactId: contact.id } })) ??
        (await tx.conversation.create({ data: { tenantId, contactId: contact.id, status: "OPEN", lastMessageAt: now } }));
      await tx.message.create({
        data: {
          tenantId, conversationId: conversation.id, direction: "OUTBOUND", senderType: "SYSTEM",
          body: content, waMessageId: result.externalMessageId,
          status: result.success ? "SENT" : "FAILED", statusUpdatedAt: now, failureReason: result.success ? null : result.error,
        },
      });
      await tx.conversation.update({ where: { id: conversation.id }, data: { lastMessageAt: now } });
    });
    const outcome = result.success ? "sent" : (result.error ?? "فشل الإرسال");

    if (outcome === "sent") sent++;
    else errors.push(outcome);
  }

  if (sent === 0 && errors.length > 0) return { ok: false, status: 502, error: errors[0]! };
  return { ok: true, sent, skipped };
}
