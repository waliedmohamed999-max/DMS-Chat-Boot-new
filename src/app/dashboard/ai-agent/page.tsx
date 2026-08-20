import Link from "next/link";
import { requireTenantSession } from "@/lib/session";
import { withTenant } from "@/lib/db";
import { hasEffectivePermission } from "@/lib/rbac";
import { getTenantChatbotLimits, isNodeTypeAllowed, isUnlimited } from "@/lib/planLimits";
import { AiAgentSettingsForm } from "./AiAgentSettingsForm";
import type { FaqItem } from "@/lib/ai/aiAgentConfig";

const TONE_LABELS_AR: Record<string, string> = { FORMAL: "رسمية", FRIENDLY: "ودودة", FUN: "مرحة" };

function faqToLines(items: FaqItem[]): string {
  return items.map((f) => `${f.question} | ${f.answer}`).join("\n");
}

export default async function AiAgentSettingsPage() {
  const session = await requireTenantSession();
  const tenantId = session.user.tenantId;

  if (!hasEffectivePermission(session.user.permissions, "chatbot.edit")) {
    return (
      <div className="card p-8 text-center text-slate-400">
        ليس لديك صلاحية إعداد الموظف الذكي — هذه الصفحة محصورة بمالك الحساب والمدير.
      </div>
    );
  }

  const limits = await getTenantChatbotLimits(tenantId);
  const canUseAiReply = isNodeTypeAllowed(limits, "ai_reply");

  if (!canUseAiReply) {
    return (
      <div className="space-y-6">
        <div>
          <h1 className="text-xl font-bold text-white">🤖 الموظف الذكي</h1>
          <p className="text-sm text-slate-400">موظف رد آلي بذكاء اصطناعي حقيقي يتحدث مع عملائك على واتساب.</p>
        </div>
        <div className="card p-8 text-center">
          <p className="text-lg text-slate-300">🔒 هذه الميزة متاحة من الباقة الاحترافية فأعلى.</p>
          <p className="mt-2 text-sm text-slate-500">باقتك الحالية ({limits.planName}) لا تتيح تفعيل الموظف الذكي بعد.</p>
          <Link href="/dashboard/billing" className="btn-primary mt-4 inline-block">ترقية الباقة</Link>
        </div>
      </div>
    );
  }

  const [config, subscription] = await Promise.all([
    withTenant(tenantId, (tx) => tx.aiAgentConfig.upsert({ where: { tenantId }, update: {}, create: { tenantId } })),
    withTenant(tenantId, (tx) => tx.subscription.findUnique({ where: { tenantId } })),
  ]);

  const faqItems = Array.isArray(config.faqItems) ? (config.faqItems as unknown as FaqItem[]) : [];
  const tokensUsed = subscription?.aiTokensUsedThisPeriod ?? 0;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold text-white">🤖 الموظف الذكي</h1>
          <p className="text-sm text-slate-400">موظف رد آلي بذكاء اصطناعي حقيقي يتحدث مع عملائك على واتساب بشكل طبيعي.</p>
        </div>
        <div className="flex gap-2">
          <Link href="/dashboard/ai-agent/test" className="btn-secondary text-sm">💬 جرّب موظفك الذكي</Link>
          <Link href="/dashboard/ai-agent/reviews" className="btn-secondary text-sm">📋 مراجعة الجودة</Link>
        </div>
      </div>

      <div className="card p-4">
        <p className="text-xs text-slate-400">استهلاك التوكنز هذا الشهر</p>
        <p className="mt-1 font-bold text-white" dir="ltr">
          {tokensUsed.toLocaleString()} {isUnlimited(limits.maxAiTokensPerMonth) ? "" : `/ ${limits.maxAiTokensPerMonth.toLocaleString()}`}
          {isUnlimited(limits.maxAiTokensPerMonth) && " (غير محدود)"}
        </p>
      </div>

      <AiAgentSettingsForm>
        <label className="flex items-center gap-2 text-sm text-slate-200">
          <input type="checkbox" name="enabled" defaultChecked={config.enabled} className="h-4 w-4" />
          تفعيل الموظف الذكي (يجب أيضاً إضافة عقدة "رد ذكي" في تدفق منشور ليعمل فعلياً)
        </label>

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div>
            <label className="label-field">اسم الموظف الذكي</label>
            <input name="agentName" defaultValue={config.agentName} required className="input-field" placeholder="مثال: سارة من متجر العطور" />
          </div>
          <div>
            <label className="label-field">نبرة الحديث</label>
            <select name="tone" defaultValue={config.tone} className="input-field">
              {Object.entries(TONE_LABELS_AR).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
            </select>
          </div>
        </div>

        <div>
          <label className="label-field">حدود وقواعد صريحة (اختياري)</label>
          <textarea
            name="boundariesText" defaultValue={config.boundariesText ?? ""} rows={3} className="input-field text-sm"
            placeholder="مثال: لا تناقش أسعار المنافسين، لا تعد بتوصيل في يوم محدد..."
          />
        </div>

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div>
            <label className="label-field">سياسة الشحن</label>
            <textarea name="shippingPolicy" defaultValue={config.shippingPolicy ?? ""} rows={2} className="input-field text-sm" />
          </div>
          <div>
            <label className="label-field">سياسة الاسترجاع</label>
            <textarea name="returnPolicy" defaultValue={config.returnPolicy ?? ""} rows={2} className="input-field text-sm" />
          </div>
          <div className="sm:col-span-2">
            <label className="label-field">ساعات العمل</label>
            <input name="workingHours" defaultValue={config.workingHours ?? ""} className="input-field" placeholder="مثال: السبت-الخميس، 9ص - 10م" />
          </div>
        </div>

        <div>
          <label className="label-field">أسئلة شائعة (سطر لكل سؤال، بصيغة: السؤال | الجواب)</label>
          <textarea name="faqItems" defaultValue={faqToLines(faqItems)} rows={6} className="input-field text-sm" dir="rtl" />
        </div>
      </AiAgentSettingsForm>
    </div>
  );
}
