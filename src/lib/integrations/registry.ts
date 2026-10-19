import { IntegrationProvider } from "@prisma/client";
import type { IntegrationAdapter } from "@/lib/integrations/types";
import { d360Adapter } from "@/lib/integrations/d360/adapter";
import { metaAdapter } from "@/lib/integrations/meta/adapter";
import { zidAdapter } from "@/lib/integrations/zid/adapter";
import { sallaAdapter } from "@/lib/integrations/salla/adapter";
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

const registry: Partial<Record<IntegrationProvider, IntegrationAdapter>> = {
  META_WHATSAPP: metaAdapter,
  ZID: zidAdapter,
  SALLA: sallaAdapter,
  PAYMENT_GATEWAY: paymentGatewayStubAdapter,
  D360DIALOG: d360Adapter,
};

export function getIntegrationAdapter(provider: IntegrationProvider): IntegrationAdapter {
  const adapter = registry[provider];
  if (!adapter) throw new Error("Unsupported integration provider");
  return adapter;
}

export const PROVIDER_LABELS_AR: Partial<Record<IntegrationProvider, string>> = {
  META_WHATSAPP: "واتساب (Meta Cloud API)",
  ZID: "زد",
  SALLA: "سلة",
  PAYMENT_GATEWAY: "بوابة الدفع",
  D360DIALOG: "واتساب الرسمي (عبر DMS)",
};

export const PROVIDER_ICONS: Partial<Record<IntegrationProvider, string>> = {
  META_WHATSAPP: "💬",
  ZID: "🟩",
  SALLA: "⬛",
  PAYMENT_GATEWAY: "💳",
  D360DIALOG: "✅",
};

/** Select an official WhatsApp integration, preferring 360dialog. */
export async function resolveWhatsappAdapter(tenantId: string): Promise<IntegrationAdapter> {
  const integrations = await withTenant(tenantId, (tx) =>
    tx.integration.findMany({
      where: { tenantId, provider: { in: ["D360DIALOG", "META_WHATSAPP"] }, status: "CONNECTED" },
    })
  );
  if (integrations.some((i) => i.provider === "D360DIALOG")) return d360Adapter;
  return metaAdapter;
}

/** Return the phone number of an official WhatsApp integration. */
export async function getConnectedPhoneNumber(tenantId: string): Promise<string | null> {
  const integrations = await withTenant(tenantId, (tx) =>
    tx.integration.findMany({
      where: { tenantId, provider: { in: ["D360DIALOG", "META_WHATSAPP"] }, status: "CONNECTED" },
    })
  );
  const d360 = integrations.find((i) => i.provider === "D360DIALOG");
  if (d360) {
    const metadata = d360.metadataJson as { displayPhoneNumber?: string } | null;
    if (metadata?.displayPhoneNumber) return metadata.displayPhoneNumber;
  }
  const meta = integrations.find((i) => i.provider === "META_WHATSAPP");
  if (meta) {
    const metadata = meta.metadataJson as { displayPhoneNumber?: string } | null;
    if (metadata?.displayPhoneNumber) return metadata.displayPhoneNumber;
  }
  return null;
}
