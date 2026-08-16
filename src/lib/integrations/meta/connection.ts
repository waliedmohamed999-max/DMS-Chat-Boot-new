import { IntegrationProvider } from "@prisma/client";
import { isSandboxMode } from "@/lib/integrations/types";
import { SANDBOX_META_ACCOUNT } from "@/lib/integrations/fixtures";
import { encryptSecret, decryptSecret } from "@/lib/crypto";
import { withTenant } from "@/lib/db";

export type ManualConnectInput = { wabaId: string; phoneNumberId: string; accessToken: string };
export type ManualConnectResult = { success: true } | { success: false; error: string };

/**
 * الطريقة اليدوية للربط (للتجار الذين يملكون بيانات WABA/Phone Number ID/Access Token مسبقاً).
 * في وضع Sandbox: يتحقق من اكتمال الحقول فقط دون استدعاء شبكي فعلي. في وضع live: يتحقق فعلياً من
 * صلاحية الـ Token عبر استدعاء حقيقي لـ Graph API قبل حفظ أي شيء — رسالة الخطأ المعروضة للتاجر
 * عند الفشل هي رسالة Meta الفعلية (أو خطأ الشبكة الفعلي)، وليست رسالة عامة غامضة.
 */
// معرّفات Meta (WABA ID / Phone Number ID) أرقام فقط دائماً — رفض أي قيمة أخرى قبل إدراجها في رابط
// fetch مباشرة (بدل الاعتماد فقط على encodeURIComponent) يمنع أي تلاعب بمسار الطلب نفسه.
const META_ID_PATTERN = /^\d{5,25}$/;

export async function connectMetaManually(tenantId: string, input: ManualConnectInput): Promise<ManualConnectResult> {
  if (!input.wabaId.trim() || !input.phoneNumberId.trim() || !input.accessToken.trim()) {
    return { success: false, error: "جميع الحقول (WABA ID، Phone Number ID، Access Token) مطلوبة." };
  }
  if (!META_ID_PATTERN.test(input.phoneNumberId.trim()) || !META_ID_PATTERN.test(input.wabaId.trim())) {
    return { success: false, error: "صيغة WABA ID أو Phone Number ID غير صحيحة — يجب أن تكون أرقاماً فقط كما تظهر في لوحة Meta." };
  }

  if (await isSandboxMode()) {
    await persistConnection(tenantId, {
      externalAccountId: input.phoneNumberId,
      accessToken: input.accessToken,
      metadata: { ...SANDBOX_META_ACCOUNT, wabaId: input.wabaId, phoneNumberId: input.phoneNumberId },
    });
    return { success: true };
  }

  try {
    const res = await fetch(
      `https://graph.facebook.com/v20.0/${input.phoneNumberId}?fields=display_phone_number,verified_name,quality_rating,messaging_limit_tier&access_token=${encodeURIComponent(input.accessToken)}`
    );
    const data = await res.json();
    if (!res.ok) {
      return { success: false, error: data?.error?.message ?? "فشل التحقق من رقم واتساب — تأكد من صحة البيانات المُدخلة." };
    }

    await persistConnection(tenantId, {
      externalAccountId: input.phoneNumberId,
      accessToken: input.accessToken,
      metadata: {
        phoneNumberId: input.phoneNumberId,
        wabaId: input.wabaId,
        displayPhoneNumber: data.display_phone_number,
        verifiedName: data.verified_name,
        qualityRating: data.quality_rating ?? "UNKNOWN",
        messagingTier: data.messaging_limit_tier ?? "UNKNOWN",
      },
    });
    await subscribeMetaWebhook(tenantId);
    return { success: true };
  } catch {
    return { success: false, error: "تعذّر الاتصال بواجهة Meta Graph API — تحقق من اتصال الخادم بالإنترنت وصحة المفاتيح." };
  }
}

async function persistConnection(
  tenantId: string,
  input: { externalAccountId: string; accessToken: string; metadata: Record<string, unknown> }
) {
  const sandbox = await isSandboxMode();
  await withTenant(tenantId, async (tx) => {
    await tx.integration.upsert({
      where: { tenantId_provider: { tenantId, provider: IntegrationProvider.META_WHATSAPP } },
      update: {
        status: "CONNECTED", isSandbox: sandbox, pendingVerification: true,
        externalAccountId: input.externalAccountId, encryptedAccessToken: encryptSecret(input.accessToken),
        webhookSubscribed: sandbox, lastSyncedAt: new Date(), lastError: null,
        metadataJson: input.metadata as never,
      },
      create: {
        tenantId, provider: IntegrationProvider.META_WHATSAPP, status: "CONNECTED",
        isSandbox: sandbox, pendingVerification: true,
        externalAccountId: input.externalAccountId, encryptedAccessToken: encryptSecret(input.accessToken),
        webhookSubscribed: sandbox, lastSyncedAt: new Date(), metadataJson: input.metadata as never,
      },
    });

    const existingRequest = await tx.approvalRequest.findFirst({
      where: { tenantId, type: "WHATSAPP_VERIFICATION", status: "PENDING" },
    });
    if (!existingRequest) {
      await tx.approvalRequest.create({
        data: { tenantId, type: "WHATSAPP_VERIFICATION", status: "PENDING", payloadJson: { phoneNumberId: input.externalAccountId } },
      });
    }
  });
}

/**
 * يشترك فعلياً في أحداث Meta webhook (رسائل، حالة رسائل، حالة قوالب) فور نجاح الربط — بدون أي
 * خطوة يدوية إضافية من التاجر. أيضاً زر "إعادة الاشتراك" في لوحة صحة الاتصال يستدعي هذه الدالة
 * نفسها عند انقطاع الاشتراك.
 */
export async function subscribeMetaWebhook(tenantId: string): Promise<void> {
  if (await isSandboxMode()) {
    await withTenant(tenantId, (tx) =>
      tx.integration.update({ where: { tenantId_provider: { tenantId, provider: IntegrationProvider.META_WHATSAPP } }, data: { webhookSubscribed: true, lastError: null } })
    );
    return;
  }

  const integration = await withTenant(tenantId, (tx) =>
    tx.integration.findUnique({ where: { tenantId_provider: { tenantId, provider: IntegrationProvider.META_WHATSAPP } } })
  );
  if (!integration?.encryptedAccessToken) throw new Error("لا يوجد اتصال فعلي بواتساب لهذا التاجر بعد.");
  const wabaId = (integration.metadataJson as { wabaId?: string } | null)?.wabaId;
  if (!wabaId) throw new Error("معرّف WABA غير متوفر — أعد ربط الحساب.");

  const accessToken = decryptSecret(integration.encryptedAccessToken);
  const res = await fetch(`https://graph.facebook.com/v20.0/${wabaId}/subscribed_apps`, {
    method: "POST",
    headers: { Authorization: `Bearer ${accessToken}` },
  });

  if (!res.ok) {
    const data = await res.json().catch(() => null);
    await withTenant(tenantId, (tx) =>
      tx.integration.update({
        where: { tenantId_provider: { tenantId, provider: IntegrationProvider.META_WHATSAPP } },
        data: { webhookSubscribed: false, lastError: data?.error?.message ?? "فشل الاشتراك في webhooks" },
      })
    );
    throw new Error(data?.error?.message ?? "فشل الاشتراك في webhooks");
  }

  await withTenant(tenantId, (tx) =>
    tx.integration.update({ where: { tenantId_provider: { tenantId, provider: IntegrationProvider.META_WHATSAPP } }, data: { webhookSubscribed: true, lastError: null } })
  );
}
