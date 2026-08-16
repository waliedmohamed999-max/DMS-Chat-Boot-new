import { IntegrationProvider } from "@prisma/client";
import type { IntegrationAdapter, SendMessageResult, SyncResult, MessageAttachment } from "@/lib/integrations/types";
import { isSandboxMode, isSandboxModeSync } from "@/lib/integrations/types";
import { SANDBOX_META_ACCOUNT, sandboxAccountIdFor } from "@/lib/integrations/fixtures";
import { encryptSecret, decryptSecret, verifyHmacSignature } from "@/lib/crypto";
import { withTenant } from "@/lib/db";
import { pickRandomFailureReason } from "@/lib/campaigns/simulateOutcome";
import { getPlatformSettings } from "@/lib/platformSettings";

/**
 * Meta WhatsApp Cloud API adapter.
 * وضع sandbox: يحاكي Embedded Signup ونجاح إرسال الرسائل دون أي استدعاء شبكي فعلي لـ graph.facebook.com.
 * وضع live: ينفّذ التبادل الفعلي (يتطلب META_APP_ID/META_APP_SECRET حقيقية غير متوفرة في بيئة البناء الحالية).
 */
export const metaAdapter: IntegrationAdapter = {
  provider: IntegrationProvider.META_WHATSAPP,

  getAuthorizationUrl(tenantId: string): string {
    // مسار غير مستخدَم فعلياً حالياً (الربط ينفَّذ مباشرة عبر handleAuthorizationCallback)، لذا
    // يبقى متزامناً بقراءة env فقط لتفادي تعقيد غير ضروري لكود لا يُستدعى.
    if (isSandboxModeSync()) {
      return `/dashboard/integrations?sandbox_connect=META_WHATSAPP&tenant=${tenantId}`;
    }
    const appId = process.env.META_APP_ID;
    return `https://www.facebook.com/v20.0/dialog/oauth?client_id=${appId}&response_type=code&scope=whatsapp_business_management,whatsapp_business_messaging`;
  },

  async handleAuthorizationCallback(tenantId: string, _code: string) {
    if (await isSandboxMode()) {
      // معرّف رقم فريد لكل مستأجر — استخدام قيمة SANDBOX_META_ACCOUNT.phoneNumberId الثابتة نفسها
      // لكل تاجر كان سيجعل استقبال webhook (المطابقة بـ phone_number_id) يوجّه رسائل كل التجار
      // المتصلين بـ Sandbox لنفس الحساب الأول الذي طابقه (خطأ حقيقي اكتُشف أثناء اختبار هذه الجولة).
      const phoneNumberId = sandboxAccountIdFor("meta-phone");
      const wabaId = sandboxAccountIdFor("meta-waba");
      await withTenant(tenantId, async (tx) => {
        // ربط رقم واتساب جديد يبقى CONNECTED لكن pendingVerification=true — تحقق يدوي إضافي
        // من فريق المنصة مطلوب قبل التفعيل الكامل (مركز الموافقات).
        await tx.integration.upsert({
          where: { tenantId_provider: { tenantId, provider: IntegrationProvider.META_WHATSAPP } },
          update: {
            status: "CONNECTED",
            isSandbox: true,
            pendingVerification: true,
            externalAccountId: phoneNumberId,
            encryptedAccessToken: encryptSecret("sandbox-access-token"),
            webhookSubscribed: true,
            lastSyncedAt: new Date(),
            lastError: null,
            metadataJson: { ...SANDBOX_META_ACCOUNT, phoneNumberId, wabaId },
          },
          create: {
            tenantId,
            provider: IntegrationProvider.META_WHATSAPP,
            status: "CONNECTED",
            isSandbox: true,
            pendingVerification: true,
            externalAccountId: phoneNumberId,
            encryptedAccessToken: encryptSecret("sandbox-access-token"),
            webhookSubscribed: true,
            lastSyncedAt: new Date(),
            metadataJson: { ...SANDBOX_META_ACCOUNT, phoneNumberId, wabaId },
          },
        });

        await tx.approvalRequest.create({
          data: {
            tenantId,
            type: "WHATSAPP_VERIFICATION",
            status: "PENDING",
            payloadJson: { phoneNumberId },
          },
        });
      });
      return { externalAccountId: phoneNumberId };
    }
    // تُفضَّل قيم PlatformSettings (قابلة للتعديل من admin/settings دون إعادة نشر) على متغيرات
    // البيئة — الأخيرة تبقى احتياطاً دفاعياً فقط. ملاحظة نطاق: هذا المسار (OAuth التلقائي) غير
    // مستدعى فعلياً من أي مكان في الواجهة حالياً — الربط الحقيقي المُستخدَم فعلاً هو
    // connectMetaManually (إدخال يدوي للتوكن)، فتنفيذ تبادل OAuth الفعلي الكامل مؤجَّل لحين الحاجة.
    const settings = await getPlatformSettings();
    if (!(settings.metaAppId || process.env.META_APP_ID) || !(settings.metaAppSecret || process.env.META_APP_SECRET)) {
      throw new Error("Live Meta OAuth exchange requires META_APP_ID/META_APP_SECRET — not configured.");
    }
    throw new Error("Live Meta OAuth exchange not yet implemented — use manual connection instead.");
  },

  async syncOrders(): Promise<SyncResult> {
    return { ordersSynced: 0, productsSynced: 0 }; // Meta لا يزامن طلبات — هذا من اختصاص Zid/Salla
  },

  async sendMessage(tenantId: string, phoneE164: string, body: string, attachment?: MessageAttachment): Promise<SendMessageResult> {
    // القرار sandbox أو live هنا خاص **بهذا التاجر تحديداً** (Integration.isSandbox الفعلي لاتصاله
    // هو نفسه)، وليس إعداد المنصة العام — تاجر ربط رقماً حقيقياً فعلياً يجب أن ترسل رسائله حقيقياً
    // حتى لو كانت المنصة عموماً بوضع sandbox لبقية التجار الذين لم يربطوا بعد.
    const integration = await withTenant(tenantId, (tx) =>
      tx.integration.findUnique({ where: { tenantId_provider: { tenantId, provider: IntegrationProvider.META_WHATSAPP } } })
    );
    const sandbox = integration ? integration.isSandbox : await isSandboxMode();

    if (sandbox) {
      // محاكاة واقعية: 92% نجاح، 8% فشل (رقم غير صالح/تجاوز حد الإرسال) لعرض حالات الخطأ في التقارير
      const success = Math.random() > 0.08;
      return success
        ? { success: true, externalMessageId: `wamid.sandbox.${Date.now()}.${phoneE164.slice(-4)}` }
        : { success: false, error: pickRandomFailureReason() };
    }

    if (!integration?.encryptedAccessToken || !integration.externalAccountId) {
      return { success: false, error: "لا يوجد اتصال واتساب حقيقي فعّال لهذا التاجر." };
    }

    const accessToken = decryptSecret(integration.encryptedAccessToken);
    const to = phoneE164.replace(/^\+/, "");
    // رابط (زر CTA URL) ووسائط (صورة/فيديو/ملف) نوعا رسالة مختلفان تماماً حسب توثيق Meta Cloud API
    // الرسمي — لا يجتمعان في رسالة واحدة (رسالة "تفاعلية" بزر لا تحمل وسائط). خوادم Meta نفسها هي من
    // تُحمِّل رابط الوسائط (وليس خادمنا)، فلا حاجة لفحص SSRF هنا خلافاً لقناة QR (انظر whatsappQr/adapter.ts).
    let payload: Record<string, unknown>;
    if (attachment?.kind === "link") {
      payload = {
        messaging_product: "whatsapp", to, type: "interactive",
        interactive: {
          type: "cta_url",
          body: { text: body },
          action: { name: "cta_url", parameters: { display_text: attachment.text.slice(0, 20), url: attachment.url } },
        },
      };
    } else if (attachment?.kind === "media") {
      payload = {
        messaging_product: "whatsapp", to, type: attachment.mediaType,
        [attachment.mediaType]: {
          link: attachment.url,
          caption: body || undefined,
          filename: attachment.mediaType === "document" ? attachment.filename : undefined,
        },
      };
    } else {
      payload = { messaging_product: "whatsapp", to, type: "text", text: { body } };
    }

    const res = await fetch(`https://graph.facebook.com/v20.0/${integration.externalAccountId}/messages`, {
      method: "POST",
      headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    const data = await res.json().catch(() => null);
    if (!res.ok) {
      return { success: false, error: data?.error?.message ?? "فشل الإرسال عبر Meta Cloud API" };
    }
    return { success: true, externalMessageId: data?.messages?.[0]?.id };
  },

  /**
   * مؤشر "يكتب الآن..." — Meta Cloud API يربطه بتحديد رسالة واردة معيّنة كمقروءة (typing_indicator
   * جزء من نفس طلب "mark as read")، فيتطلب wamid الرسالة الواردة الأخيرة. بلا wamid أو في وضع
   * sandbox/غير مربوط فعلياً: لا شيء يُنفَّذ (best-effort بحت — فشله لا يجب أن يوقف إرسال الرد
   * الفعلي، المتصل يستدعيها عبر `?.().catch()` دائماً).
   */
  async sendTypingIndicator(tenantId: string, _phoneE164: string, lastInboundWaMessageId?: string): Promise<void> {
    if (!lastInboundWaMessageId) return;
    const integration = await withTenant(tenantId, (tx) =>
      tx.integration.findUnique({ where: { tenantId_provider: { tenantId, provider: IntegrationProvider.META_WHATSAPP } } })
    );
    if (!integration || integration.isSandbox || !integration.encryptedAccessToken || !integration.externalAccountId) return;

    const accessToken = decryptSecret(integration.encryptedAccessToken);
    await fetch(`https://graph.facebook.com/v20.0/${integration.externalAccountId}/messages`, {
      method: "POST",
      headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        messaging_product: "whatsapp", status: "read", message_id: lastInboundWaMessageId,
        typing_indicator: { type: "text" },
      }),
    }).catch(() => {}); // best-effort — لا يُوقِف تدفق إرسال الرد الفعلي أبداً
  },

  async verifyWebhookSignature(rawBody: string, signatureHeader: string | null): Promise<boolean> {
    // لا يوجد استثناء لوضع sandbox هنا عمداً: محاكاة استقبال الرسائل في وضع sandbox تتم بالكامل
    // داخل التطبيق (lib/inbox/sandboxSimulator.ts) ولا تمر أبداً عبر هذا المسار العام
    // (api/webhooks/meta)، لذا فإن تجاوز التحقق بناءً على إعداد المنصة العام (وليس حالة اتصال
    // تاجر بعينه) كان يسمح لأي طرف خارجي بإرسال طلبات غير موقّعة إلى كل التجار طالما كانت
    // المنصة عموماً بوضع sandbox — حتى لو كان تاجر معيّن متصلاً برقم واتساب حقيقي فعلاً. ثغرة
    // حقيقية اكتُشفت أثناء مراجعة أمنية شاملة قبل الإطلاق، أُزيلت هنا نهائياً (fail closed دائماً).
    // تُفضَّل قيمة PlatformSettings (قابلة للتعديل من admin/settings دون إعادة نشر) على متغير البيئة.
    const settings = await getPlatformSettings();
    const secret = settings.metaAppSecret || process.env.META_APP_SECRET;
    if (!signatureHeader || !secret) return false;
    return verifyHmacSignature(rawBody, signatureHeader, secret);
  },

  async disconnect(tenantId: string) {
    await withTenant(tenantId, async (tx) => {
      await tx.integration.update({
        where: { tenantId_provider: { tenantId, provider: IntegrationProvider.META_WHATSAPP } },
        data: { status: "DISCONNECTED", encryptedAccessToken: null, webhookSubscribed: false, tokenExpiresAt: null },
      });
    });
  },
};
