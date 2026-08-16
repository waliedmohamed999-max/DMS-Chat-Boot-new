import type { IntegrationProvider } from "@prisma/client";
import { isSandboxModeFromSettings } from "@/lib/platformSettings";

export type SyncResult = {
  ordersSynced: number;
  productsSynced: number;
};

export type SendMessageResult = {
  success: boolean;
  externalMessageId?: string;
  error?: string;
};

/** مرفق اختياري لرسالة بوت: إما زر رابط باسم مخصَّص، أو وسائط (صورة/فيديو/ملف) — لا يجتمعان في نفس
 * الرسالة (قيد حقيقي من واتساب نفسه: رسالة "تفاعلية" بزر لا تحمل وسائط، ورسالة وسائط لا تحمل زراً). */
export type MessageAttachment =
  | { kind: "link"; url: string; text: string }
  | { kind: "media"; mediaType: "image" | "video" | "document"; url: string; filename?: string };

/**
 * واجهة موحدة لكل تكامل خارجي (Meta WhatsApp / Zid / Salla).
 * إضافة منصة جديدة (مثل Shopify مستقبلاً) = تنفيذ هذه الواجهة في ملف adapter جديد فقط،
 * بدون تعديل أي كود استدعاء في campaigns/chatbot/inbox.
 */
export interface IntegrationAdapter {
  readonly provider: IntegrationProvider;

  /** يبدأ عملية الربط (OAuth أو Embedded Signup)، يعيد رابط التفويض أو ينفذها مباشرة في sandbox.
   * `state` (وضع live فقط): قيمة عشوائية للحماية من CSRF، يُخزَّنها المتصل ويقارنها عند الـcallback. */
  getAuthorizationUrl(tenantId: string, state?: string): string;

  /** يُستدعى بعد رجوع OAuth callback لتبادل الكود بـ access token وتخزينه مشفراً. */
  handleAuthorizationCallback(tenantId: string, code: string): Promise<{ externalAccountId: string }>;

  /** يزامن الطلبات والكتالوج من المنصة الخارجية. */
  syncOrders(tenantId: string): Promise<SyncResult>;

  /** يرسل رسالة واتساب فعلية (أو محاكاة في sandbox) لجهة اتصال. `attachment` اختياري (رابط بزر أو
   * وسائط) — انظر تعليق `MessageAttachment` أعلاه لتفاصيل الفرق بين القنوات. */
  sendMessage(tenantId: string, phoneE164: string, body: string, attachment?: MessageAttachment): Promise<SendMessageResult>;

  /** اختياري: مؤشر "يكتب الآن..." — لا كل قناة تدعمه فعلياً (انظر تطبيقات meta/whatsappQr). يُستدعى
   * دفاعياً دائماً عبر `?.()` من المتصل، فلا حاجة لتطبيقه في كل adapter. */
  sendTypingIndicator?(tenantId: string, phoneE164: string, lastInboundWaMessageId?: string): Promise<void>;

  /** يتحقق من توقيع webhook وارد قبل معالجته. */
  verifyWebhookSignature(rawBody: string, signatureHeader: string | null): Promise<boolean>;

  disconnect(tenantId: string): Promise<void>;
}

/**
 * وضع Sandbox مُتحكَّم به فعلياً من لوحة Super Admin (`/admin/settings` → PlatformSettings.
 * integrationsMode) وليس متغير بيئة ثابتاً — تغييره من اللوحة ينعكس فوراً على كل تكامل جديد
 * دون إعادة نشر. env var `INTEGRATIONS_MODE` يبقى fallback دفاعي فقط إن تعذّر الوصول لقاعدة
 * البيانات (مثال: أثناء بناء الإنتاج قبل توفر اتصال).
 */
export async function isSandboxMode(): Promise<boolean> {
  try {
    return await isSandboxModeFromSettings();
  } catch {
    return (process.env.INTEGRATIONS_MODE ?? "sandbox") !== "live";
  }
}

/** نسخة متزامنة تعتمد على متغير البيئة فقط — تُستخدم حصراً في مسارات لا يمكن أن تكون async (مثل بناء رابط ثابت). */
export function isSandboxModeSync(): boolean {
  return (process.env.INTEGRATIONS_MODE ?? "sandbox") !== "live";
}
