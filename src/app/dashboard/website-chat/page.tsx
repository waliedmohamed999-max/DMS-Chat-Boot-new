import Link from "next/link";
import { requireTenantSession } from "@/lib/session";
import { withTenant } from "@/lib/db";
import { hasEffectivePermission } from "@/lib/rbac";
import { getTenantChatbotLimits, isUnlimited } from "@/lib/planLimits";
import { baseUrl } from "@/lib/email/partnerTemplates";
import { WebsiteChatSettingsForm } from "./WebsiteChatSettingsForm";
import { EmbedCodeBox } from "./EmbedCodeBox";

export default async function WebsiteChatSettingsPage() {
  const session = await requireTenantSession();
  const tenantId = session.user.tenantId;

  if (!hasEffectivePermission(session.user.permissions, "chatbot.edit")) {
    return (
      <div className="card p-8 text-center text-slate-400">
        ليس لديك صلاحية إعداد شات موقعك — هذه الصفحة محصورة بمالك الحساب والمدير.
      </div>
    );
  }

  const limits = await getTenantChatbotLimits(tenantId);

  if (!limits.websiteChatEnabled) {
    return (
      <div className="space-y-6">
        <div>
          <h1 className="text-xl font-bold text-white">💬 شات موقعك الخاص</h1>
          <p className="text-sm text-slate-400">نفس الموظف الذكي، لكن على موقعك الإلكتروني الخاص — شات نصي، رسالة صوتية، ومكالمة صوتية حية.</p>
        </div>
        <div className="card p-8 text-center">
          <p className="text-lg text-slate-300">🔒 هذه الميزة متاحة من باقة النمو فأعلى.</p>
          <p className="mt-2 text-sm text-slate-500">باقتك الحالية ({limits.planName}) لا تتيح تفعيل شات الموقع بعد.</p>
          <Link href="/dashboard/billing" className="btn-primary mt-4 inline-block">ترقية الباقة</Link>
        </div>
      </div>
    );
  }

  const [config, subscription] = await Promise.all([
    withTenant(tenantId, (tx) => tx.aiAgentConfig.upsert({ where: { tenantId }, update: {}, create: { tenantId } })),
    withTenant(tenantId, (tx) => tx.subscription.findUnique({ where: { tenantId } })),
  ]);

  const minutesUsed = subscription?.voiceCallMinutesUsedThisPeriod ?? 0;
  const embedCode = `<iframe\n  src="${baseUrl()}/embed/chat/${tenantId}"\n  style="position:fixed;bottom:0;right:0;width:380px;height:560px;border:0;z-index:9999"\n  allow="microphone"\n></iframe>`;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-bold text-white">💬 شات موقعك الخاص</h1>
        <p className="text-sm text-slate-400">نفس الموظف الذكي المُعدَّ في صفحة "الموظف الذكي"، لكن على موقعك الإلكتروني الخاص — شات نصي، رسالة صوتية، ومكالمة صوتية حية.</p>
      </div>

      {!config.enabled && (
        <div className="card border border-warning-500/20 bg-warning-500/5 p-4 text-sm text-slate-300">
          🔒 لم تُفعِّل الموظف الذكي بعد — <Link href="/dashboard/ai-agent" className="text-accent-400 underline">فعِّله من هنا</Link> أولاً، وإلا سيُحوَّل زوار موقعك مباشرة لفريقك بلا رد آلي.
        </div>
      )}

      {limits.websiteVoiceCallEnabled && (
        <div className="card p-4">
          <p className="text-xs text-slate-400">دقائق المكالمة الصوتية المستهلَكة هذا الشهر</p>
          <p className="mt-1 font-bold text-white" dir="ltr">
            {minutesUsed.toLocaleString()} {isUnlimited(limits.maxVoiceCallMinutesPerMonth) ? "" : `/ ${limits.maxVoiceCallMinutesPerMonth.toLocaleString()}`}
            {isUnlimited(limits.maxVoiceCallMinutesPerMonth) && " (غير محدود)"}
          </p>
        </div>
      )}

      {!limits.websiteVoiceCallEnabled && (
        <div className="card border border-warning-500/20 bg-warning-500/5 p-4 text-sm text-slate-300">
          🔒 المكالمة الصوتية الحية داخل شات موقعك متاحة من باقة أعلى — شات النص والرسائل الصوتية متاحان حالياً.
        </div>
      )}

      <WebsiteChatSettingsForm defaultActive={config.websiteWidgetActive} />

      <div className="card max-w-3xl space-y-3 p-6">
        <h2 className="font-semibold text-white">كود التضمين</h2>
        <p className="text-sm text-slate-400">أضف هذا الكود قبل إغلاق وسم <code dir="ltr">&lt;/body&gt;</code> في موقعك مباشرة.</p>
        <EmbedCodeBox code={embedCode} />
      </div>

      <div className="card max-w-3xl p-6">
        <Link href="/dashboard/website-chat/sessions" className="btn-secondary inline-block text-sm">
          📋 عرض جلسات شات الموقع
        </Link>
      </div>
    </div>
  );
}
