import { IntegrationProvider } from "@prisma/client";
import type { IntegrationAdapter } from "@/lib/integrations/types";
import { metaAdapter } from "@/lib/integrations/meta/adapter";
import { zidAdapter } from "@/lib/integrations/zid/adapter";
import { sallaAdapter } from "@/lib/integrations/salla/adapter";
import { whatsappQrAdapter } from "@/lib/integrations/whatsappQr/adapter";
import { withTenant } from "@/lib/db";

// PAYMENT_GATEWAY ليس تكاملاً حقيقياً بمعنى "اتصال/فصل" من صفحة التكاملات — أُضيف لقيم
// IntegrationProvider فقط لإعادة استخدام جدول/بنية WebhookLog الموجودة أصلاً لتسجيل أحداث
// Webhook بوابة الدفع (انظر src/app/api/webhooks/payment/route.ts)، وليس لأنه يحتاج محوّل ربط فعلي.
// هذا Stub دفاعي فقط — لا يُستدعى أبداً من مسار OAuth/مزامنة حقيقي.
const paymentGatewayStubAdapter: IntegrationAdapter = {
  provider: "PAYMENT_GATEWAY",
  getAuthorizationUrl() {
    throw new Error("PAYMENT_GATEWAY ليس تكاملاً قابلاً للربط من صفحة التكاملات");
  },
  async handleAuthorizationCallback() {
    throw new Error("PAYMENT_GATEWAY ليس تكاملاً قابلاً للربط من صفحة التكاملات");
  },
  async syncOrders() {
    throw new Error("PAYMENT_GATEWAY لا يدعم مزامنة طلبات");
  },
  async sendMessage() {
    throw new Error("PAYMENT_GATEWAY لا يدعم إرسال رسائل");
  },
  async verifyWebhookSignature() {
    return false;
  },
  async disconnect() {
    throw new Error("PAYMENT_GATEWAY ليس تكاملاً قابلاً للفصل من صفحة التكاملات");
  },
};

const registry: Record<IntegrationProvider, IntegrationAdapter> = {
  META_WHATSAPP: metaAdapter,
  ZID: zidAdapter,
  SALLA: sallaAdapter,
  WHATSAPP_QR: whatsappQrAdapter,
  PAYMENT_GATEWAY: paymentGatewayStubAdapter,
};

export function getIntegrationAdapter(provider: IntegrationProvider): IntegrationAdapter {
  return registry[provider];
}

export const PROVIDER_LABELS_AR: Record<IntegrationProvider, string> = {
  META_WHATSAPP: "واتساب (Meta Cloud API)",
  ZID: "زد",
  SALLA: "سلة",
  WHATSAPP_QR: "واتساب تجريبي (QR)",
  PAYMENT_GATEWAY: "بوابة الدفع",
};

export const PROVIDER_ICONS: Record<IntegrationProvider, string> = {
  META_WHATSAPP: "💬",
  ZID: "🟩",
  SALLA: "⬛",
  WHATSAPP_QR: "📱",
  PAYMENT_GATEWAY: "💳",
};

/**
 * يختار محوّل الإرسال الفعلي حسب ما هو متصل فعلياً لهذا المستأجر — الرسمي (Meta) له الأولوية دائماً
 * إن كان متصلاً، والقناة التجريبية QR بديل مؤقت فقط. تُستخدَم في worker.ts (إرسال الحملات) وفي
 * dashboard/inbox/actions.ts (الردود اليدوية) بدل الاستيراد الثابت لـmetaAdapter الذي كان موجوداً
 * سابقاً بلا أي اختيار حسب حالة الاتصال الفعلية — تاجر لم يربط أي شيء يحصل على نفس سلوك اليوم تماماً
 * (metaAdapter كافتراضي، والذي يتصرف بوضع sandbox تلقائياً بلا اتصال حقيقي).
 */
export async function resolveWhatsappAdapter(tenantId: string): Promise<IntegrationAdapter> {
  const integrations = await withTenant(tenantId, (tx) =>
    tx.integration.findMany({
      where: { tenantId, provider: { in: ["META_WHATSAPP", "WHATSAPP_QR"] }, status: "CONNECTED" },
    })
  );
  if (integrations.some((i) => i.provider === "META_WHATSAPP")) return metaAdapter;
  if (integrations.some((i) => i.provider === "WHATSAPP_QR")) return whatsappQrAdapter;
  return metaAdapter;
}

/**
 * رقم واتساب الحقيقي المتصل فعلياً لهذا التاجر (لعرضه في معاينات واجهة المستخدم — مثل معاينة
 * الموبايل في محرر الشات بوت)، أو `null` إن لم يربط أي رقم حقيقي بعد. الرسمي (Meta) له الأولوية،
 * ثم القناة التجريبية (QR)، بنفس ترتيب أولوية `resolveWhatsappAdapter` أعلاه.
 */
export async function getConnectedPhoneNumber(tenantId: string): Promise<string | null> {
  const integrations = await withTenant(tenantId, (tx) =>
    tx.integration.findMany({
      where: { tenantId, provider: { in: ["META_WHATSAPP", "WHATSAPP_QR"] }, status: "CONNECTED" },
    })
  );
  const meta = integrations.find((i) => i.provider === "META_WHATSAPP");
  if (meta) {
    const metadata = meta.metadataJson as { displayPhoneNumber?: string } | null;
    if (metadata?.displayPhoneNumber) return metadata.displayPhoneNumber;
  }
  const qr = integrations.find((i) => i.provider === "WHATSAPP_QR");
  if (qr) {
    const metadata = qr.metadataJson as { connectedPhoneE164?: string } | null;
    if (metadata?.connectedPhoneE164) return metadata.connectedPhoneE164;
  }
  return null;
}
