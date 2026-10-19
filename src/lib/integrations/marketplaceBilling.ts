import { IntegrationProvider } from "@prisma/client";
import { superAdminDb } from "@/lib/db";

/**
 * اشتراك يُحصَّل عبر متجر تطبيقات (سلة أو زد): يُسجَّل في metadataJson.billing للربط المعني عند وصول أحداث
 * الاشتراك. عندها تغيير الباقة/الإلغاء/الإيقاف يتم من المنصة المعنية فقط (منع فوترة مزدوجة).
 */
export type MarketplaceBilling = { source: "salla" | "zid"; label: string; planName: string | null; endDate: string | null };

const LABELS = { salla: "سلة", zid: "زد" } as const;

export async function getMarketplaceBilling(tenantId: string): Promise<MarketplaceBilling | null> {
  const rows = await superAdminDb.integration.findMany({
    where: { tenantId, provider: { in: [IntegrationProvider.SALLA, IntegrationProvider.ZID] } },
    select: { provider: true, metadataJson: true },
  });
  for (const row of rows) {
    const billing = (row.metadataJson as { billing?: { source?: string; planName?: string | null; endDate?: string | null } } | null)?.billing;
    if (billing?.source === "salla" || billing?.source === "zid") {
      return { source: billing.source, label: LABELS[billing.source], planName: billing.planName ?? null, endDate: billing.endDate ?? null };
    }
  }
  return null;
}

export function marketplaceBilledMessage(b: Pick<MarketplaceBilling, "label">): string {
  return `اشتراكك يُدار عبر متجر تطبيقات ${b.label} — غيّر الباقة أو ألغِها من صفحة التطبيق في لوحة متجرك على ${b.label}.`;
}

export async function assertNotMarketplaceBilled(tenantId: string) {
  const b = await getMarketplaceBilling(tenantId);
  if (b) throw new Error(marketplaceBilledMessage(b));
}
