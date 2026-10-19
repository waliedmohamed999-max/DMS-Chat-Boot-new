import crypto from "crypto";
import { IntegrationProvider } from "@prisma/client";
import type { IntegrationAdapter, MessageAttachment, SendMessageResult, SendOptions, SyncResult } from "@/lib/integrations/types";
import { withTenant } from "@/lib/db";
import { decryptSecret, encryptSecret } from "@/lib/crypto";
import { attachMessageId, chargeMessage, InsufficientWalletBalanceError, maybeNotifyLowBalance, MessageRateMissingError, refundMessage } from "@/lib/billing/wallet";
import {
  d360OnboardingUrl, generateD360ChannelApiKey, getD360Channel, isD360Configured, sendD360Message, setD360ChannelWebhook, verifyD360PartnerSignature,
} from "./client";

function appBaseUrl(): string {
  return process.env.NEXTAUTH_URL || "http://localhost:3000";
}

/** نفس شكل حمولة Meta Cloud API (360dialog يمرّرها كما هي): نص، زر رابط، وسائط، أو قالب معتمد. */
function buildPayload(to: string, body: string, attachment?: MessageAttachment, options?: SendOptions): Record<string, unknown> {
  if (options?.template) {
    const params = options.template.bodyParams ?? [];
    return {
      messaging_product: "whatsapp", recipient_type: "individual", to, type: "template",
      template: {
        name: options.template.name,
        language: { code: options.template.language },
        ...(params.length ? { components: [{ type: "body", parameters: params.map((text) => ({ type: "text", text })) }] } : {}),
      },
    };
  }
  if (attachment?.kind === "link") {
    return {
      messaging_product: "whatsapp", recipient_type: "individual", to, type: "interactive",
      interactive: { type: "cta_url", body: { text: body }, action: { name: "cta_url", parameters: { display_text: attachment.text.slice(0, 20), url: attachment.url } } },
    };
  }
  if (attachment?.kind === "media") {
    return {
      messaging_product: "whatsapp", recipient_type: "individual", to, type: attachment.mediaType,
      [attachment.mediaType]: { link: attachment.url, caption: body || undefined, filename: attachment.mediaType === "document" ? attachment.filename : undefined },
    };
  }
  return { messaging_product: "whatsapp", recipient_type: "individual", to, type: "text", text: { body } };
}

async function findIntegration(tenantId: string) {
  return withTenant(tenantId, (tx) =>
    tx.integration.findUnique({ where: { tenantId_provider: { tenantId, provider: IntegrationProvider.D360DIALOG } } })
  );
}

/**
 * ربط قناة 360dialog بتاجر بعد إكماله "Integrated Onboarding": توليد مفتاح API للقناة، ضبط webhook
 * رسائلها على رابط برمز سري خاص بها، وحفظ رقم الهاتف وحالة القناة. آمن لإعادة التنفيذ لنفس القناة.
 */
export async function connectD360Channel(tenantId: string, channelId: string) {
  const [apiKey, channel] = await Promise.all([generateD360ChannelApiKey(channelId), getD360Channel(channelId)]);
  const webhookToken = crypto.randomBytes(24).toString("hex");
  await setD360ChannelWebhook(apiKey, `${appBaseUrl()}/api/webhooks/d360/${webhookToken}`);

  const ready = channel.availability === "ready";
  const data = {
    status: "CONNECTED" as const, isSandbox: false, channelId, pendingVerification: !ready,
    externalAccountId: channel.wabaId, encryptedAccessToken: encryptSecret(apiKey),
    webhookTokenHash: crypto.createHash("sha256").update(webhookToken).digest("hex"), webhookSubscribed: true,
    lastError: null,
    metadataJson: {
      displayPhoneNumber: channel.phoneNumber, connectedPhoneE164: channel.phoneNumber, phoneName: channel.phoneName,
      availability: channel.availability, channelStatus: channel.status, connectedAt: new Date().toISOString(),
    },
  };
  await withTenant(tenantId, (tx) =>
    tx.integration.upsert({
      where: { tenantId_provider: { tenantId, provider: IntegrationProvider.D360DIALOG } },
      update: data,
      create: { tenantId, provider: IntegrationProvider.D360DIALOG, ...data },
    })
  );
  return channel;
}

export const d360Adapter: IntegrationAdapter = {
  provider: IntegrationProvider.D360DIALOG,

  getAuthorizationUrl(tenantId: string, state?: string): string {
    if (!isD360Configured()) return `/dashboard/integrations?sandbox_connect=D360DIALOG&tenant=${tenantId}`;
    return d360OnboardingUrl(`${appBaseUrl()}/api/integrations/d360/callback`, state);
  },

  /** الكود هنا = معرّف القناة العائد من صفحة 360dialog (أو "sandbox-code" للربط التجريبي). */
  async handleAuthorizationCallback(tenantId: string, code: string) {
    if (code === "sandbox-code" || !isD360Configured()) {
      const externalAccountId = `sandbox-d360-${tenantId.slice(-6)}`;
      const data = {
        status: "CONNECTED" as const, isSandbox: true, externalAccountId, channelId: null, lastError: null,
        encryptedAccessToken: encryptSecret("sandbox-d360-key"),
        metadataJson: { displayPhoneNumber: "+966500000360", connectedPhoneE164: "+966500000360", availability: "ready" },
      };
      await withTenant(tenantId, (tx) =>
        tx.integration.upsert({
          where: { tenantId_provider: { tenantId, provider: IntegrationProvider.D360DIALOG } },
          update: data,
          create: { tenantId, provider: IntegrationProvider.D360DIALOG, ...data },
        })
      );
      return { externalAccountId };
    }
    const channel = await connectD360Channel(tenantId, code);
    return { externalAccountId: channel.wabaId ?? channel.channelId };
  },

  async syncOrders(): Promise<SyncResult> {
    return { ordersSynced: 0, productsSynced: 0 };
  },

  async sendMessage(tenantId, phoneE164, body, attachment, options): Promise<SendMessageResult> {
    const integration = await findIntegration(tenantId);
    if (!integration || integration.status !== "CONNECTED" || !integration.encryptedAccessToken) {
      return { success: false, error: "لا يوجد رقم واتساب فعّال عبر 360dialog لهذا التاجر.", errorCode: "NOT_CONNECTED" };
    }
    if (integration.isSandbox) {
      return { success: true, externalMessageId: `wamid.sandbox360.${Date.now()}.${phoneE164.slice(-4)}` };
    }

    // الخصم قبل الإرسال — لا تُرسل رسالة غير مدفوعة.
    const category = options?.category ?? "SERVICE";
    let usageId: string;
    try {
      usageId = (await chargeMessage(tenantId, phoneE164, category)).usageId;
    } catch (err) {
      if (err instanceof InsufficientWalletBalanceError) {
        await maybeNotifyLowBalance(tenantId).catch(() => {});
        return { success: false, error: err.message, errorCode: "INSUFFICIENT_BALANCE" };
      }
      if (err instanceof MessageRateMissingError) return { success: false, error: err.message, errorCode: "RATE_NOT_CONFIGURED" };
      throw err;
    }

    const result = await sendD360Message(decryptSecret(integration.encryptedAccessToken), buildPayload(phoneE164.replace(/^\+/, ""), body, attachment, options));
    if (!result.ok) {
      await refundMessage(usageId, result.error ?? "فشل الإرسال");
      return { success: false, error: result.error, errorCode: "PROVIDER_ERROR" };
    }
    await attachMessageId(usageId, result.messageId);
    return { success: true, externalMessageId: result.messageId };
  },

  async verifyWebhookSignature(rawBody: string, signatureHeader: string | null): Promise<boolean> {
    return verifyD360PartnerSignature(rawBody, signatureHeader);
  },

  async disconnect(tenantId: string) {
    await withTenant(tenantId, (tx) =>
      tx.integration.update({
        where: { tenantId_provider: { tenantId, provider: IntegrationProvider.D360DIALOG } },
        data: { status: "DISCONNECTED", encryptedAccessToken: null, webhookTokenHash: null },
      })
    );
  },
};
