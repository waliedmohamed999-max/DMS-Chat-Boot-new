import { withTenant } from "@/lib/db";
import { getTenantChatbotLimits } from "@/lib/planLimits";
import { TenantEmbedChatWidget } from "./TenantEmbedChatWidget";

/**
 * صفحة مستقلة (خارج مجموعتي layout الموقع التسويقي ولوحة التحكم) مخصَّصة للتضمين داخل iframe في
 * موقع التاجر الخاص — بلا أي واجهة تنقّل/رأس/تذييل، تملأ الـiframe بالكامل. الفحوصات هنا خادمية بحتة
 * (بوابة الباقة + تفعيل التاجر الصريح) قبل تمرير enabled/voiceCallEnabled للمكوّن العميل، بنفس نمط
 * تمرير settings.platformChatEnabled لـChatWidget من (marketing)/page.tsx تماماً.
 */
export default async function EmbedChatPage({ params }: { params: { tenantId: string } }) {
  const tenantId = params.tenantId;

  let enabled = false;
  let voiceCallEnabled = false;
  try {
    const limits = await getTenantChatbotLimits(tenantId);
    const config = await withTenant(tenantId, (tx) => tx.aiAgentConfig.findUnique({ where: { tenantId } }));
    enabled = limits.websiteChatEnabled && Boolean(config?.enabled) && Boolean(config?.websiteWidgetActive);
    voiceCallEnabled = enabled && limits.websiteVoiceCallEnabled;
  } catch {
    // tenantId غير صالح الصيغة أو أي خطأ آخر أثناء الفحص — enabled يبقى false، الصفحة تعرض حالة "غير متاح" بأمان
  }

  return <TenantEmbedChatWidget tenantId={tenantId} enabled={enabled} voiceCallEnabled={voiceCallEnabled} />;
}
