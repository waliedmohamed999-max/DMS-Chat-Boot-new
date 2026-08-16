import { superAdminDb } from "@/lib/db";
import { requireSuperAdminSession } from "@/lib/session";
import { hasPermission } from "@/lib/rbac";
import { DEFAULT_STARTER_CHATBOT_LIMITS, type ChatbotLimits } from "@/lib/planLimits";
import { DEFAULT_STARTER_CAMPAIGN_LIMITS, type CampaignLimits } from "@/lib/campaigns/limits";
import { NODE_TYPES } from "@/lib/chatbot/nodeTypes";
import { updatePlanChatbotLimits, updatePlanCampaignLimits, createPlan, updatePlanCoreFields, togglePlanActive, setPlanAsPopular, unsetPlanPopular } from "./actions";

const CONFIGURABLE_NODE_TYPES = ["message", "question", "condition", "ai_reply", "api_call", "handoff"] as const;

export default async function AdminPlansPage() {
  const session = await requireSuperAdminSession();
  if (!hasPermission(session.user.role, "platform.plans.manage")) {
    return (
      <div className="card p-8 text-center text-slate-400">
        ليس لديك صلاحية تعديل الباقات. هذه الصفحة محصورة بمالك المنصة.
      </div>
    );
  }

  const plans = await superAdminDb.plan.findMany({
    where: { isCustomForTenantId: null },
    include: { _count: { select: { subscriptions: true } } },
    orderBy: { priceMonthlySar: "asc" },
  });

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-bold text-white">إدارة الباقات</h1>
        <p className="text-sm text-slate-400">إنشاء/تعديل الباقات القياسية بالكامل — الاسم، السعر، الحدود، وحدود الشات بوت — دون الحاجة لتعديل الكود.</p>
      </div>

      <div className="card p-5">
        <h2 className="mb-4 font-semibold text-white">+ إنشاء باقة جديدة</h2>
        <form action={createPlan} className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          <div>
            <label className="label-field">اسم الباقة</label>
            <input name="name" required className="input-field" placeholder="مثال: الاحترافية" />
          </div>
          <div>
            <label className="label-field">السعر الشهري (ر.س)</label>
            <input name="priceMonthlySar" type="number" required min={0} className="input-field" dir="ltr" placeholder="مثال: 299" />
          </div>
          <div>
            <label className="label-field">أقصى عدد مستخدمين</label>
            <input name="maxUsers" type="number" required min={1} className="input-field" dir="ltr" placeholder="مثال: 5 — عدد حسابات الموظفين المسموح بها داخل المتجر" />
          </div>
          <div>
            <label className="label-field">أقصى أرقام واتساب</label>
            <input name="maxWhatsappNumbers" type="number" required min={1} className="input-field" dir="ltr" placeholder="مثال: 1 — عدد أرقام واتساب التي يمكن ربطها بالمتجر" />
          </div>
          <div>
            <label className="label-field">أقصى رسائل شهرياً</label>
            <input name="maxMessagesPerMonth" type="number" required min={1} className="input-field" dir="ltr" placeholder="مثال: 5000 — سقف الرسائل الصادرة/الشهر قبل إيقاف الإرسال" />
          </div>
          <div className="sm:col-span-2 lg:col-span-3">
            <label className="label-field">الميزات المعروضة (سطر لكل ميزة)</label>
            <textarea name="features" required rows={3} className="input-field" placeholder={"اكتب كل ميزة في سطر منفصل، وستظهر كقائمة نقطية للعميل في صفحة الأسعار، مثال:\nحملات غير محدودة\nشات بوت بالذكاء الاصطناعي\nدعم فني على مدار الساعة"} />
          </div>
          <button type="submit" className="btn-primary sm:col-span-2 lg:col-span-3">إنشاء الباقة</button>
        </form>
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        {plans.map((plan) => {
          const limits = (plan.chatbotLimitsJson as ChatbotLimits | null) ?? DEFAULT_STARTER_CHATBOT_LIMITS;
          const campaignLimits = (plan.campaignLimitsJson as CampaignLimits | null) ?? DEFAULT_STARTER_CAMPAIGN_LIMITS;
          const features = (plan.features as string[] | null) ?? [];
          return (
            <div key={plan.id} className="card space-y-4 p-5">
              <div className="flex items-center justify-between">
                <div>
                  <h2 className="font-bold text-white">
                    {plan.name} {plan.isPopular && <span className="badge bg-accent-500/10 text-accent-400">⭐ الأكثر طلباً</span>}
                  </h2>
                  <p className="text-xs text-slate-500">{plan._count.subscriptions} مشترك حالياً</p>
                </div>
                <div className="flex gap-1.5">
                  <form action={(plan.isPopular ? unsetPlanPopular : setPlanAsPopular).bind(null, plan.id)}>
                    <button className={`badge ${plan.isPopular ? "bg-accent-500/10 text-accent-400" : "bg-white/5 text-slate-400"}`}>
                      {plan.isPopular ? "إلغاء 'الأكثر طلباً'" : "تعيين كـ'الأكثر طلباً'"}
                    </button>
                  </form>
                  <form action={togglePlanActive.bind(null, plan.id, !plan.isActive)}>
                    <button className={`badge ${plan.isActive ? "bg-success-500/10 text-success-500" : "bg-danger-500/10 text-danger-500"}`}>
                      {plan.isActive ? "نشطة" : "معطّلة"}
                    </button>
                  </form>
                </div>
              </div>

              <form action={updatePlanCoreFields.bind(null, plan.id)} className="space-y-2 border-b border-white/5 pb-4">
                <p className="text-xs font-medium text-slate-400">البيانات الأساسية</p>
                <input name="name" defaultValue={plan.name} required className="input-field text-sm" placeholder="الاسم" />
                <div className="grid grid-cols-2 gap-2">
                  <input name="priceMonthlySar" type="number" defaultValue={plan.priceMonthlySar} required min={0} className="input-field text-sm" dir="ltr" placeholder="السعر" />
                  <input name="maxUsers" type="number" defaultValue={plan.maxUsers} required min={1} className="input-field text-sm" dir="ltr" placeholder="مستخدمين" />
                  <input name="maxWhatsappNumbers" type="number" defaultValue={plan.maxWhatsappNumbers} required min={1} className="input-field text-sm" dir="ltr" placeholder="أرقام واتساب" />
                  <input name="maxMessagesPerMonth" type="number" defaultValue={plan.maxMessagesPerMonth} required min={1} className="input-field text-sm" dir="ltr" placeholder="رسائل/شهر" />
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="label-field text-xs">خصم الاشتراك السنوي %</label>
                    <input
                      name="annualDiscountBps" type="number" min={0} max={100} step={1}
                      defaultValue={plan.annualDiscountBps / 100} className="input-field text-sm" dir="ltr"
                    />
                  </div>
                  <div>
                    <label className="label-field text-xs">مستوى الدعم</label>
                    <select name="supportTier" defaultValue={plan.supportTier} className="input-field text-sm">
                      <option value="email">دعم عبر البريد</option>
                      <option value="priority">دعم ذو أولوية</option>
                      <option value="dedicated">مدير حساب مخصص</option>
                    </select>
                  </div>
                </div>
                <textarea name="features" defaultValue={features.join("\n")} required rows={3} className="input-field text-sm" />
                <button type="submit" className="btn-secondary w-full text-sm">حفظ البيانات الأساسية</button>
              </form>

              <form action={updatePlanChatbotLimits.bind(null, plan.id)} className="space-y-3">
                <p className="text-xs font-medium text-slate-400">حدود الشات بوت</p>
                <div>
                  <label className="label-field">أقصى عدد تدفقات نشطة</label>
                  <input
                    name="maxActiveFlows"
                    type="number"
                    min={0}
                    defaultValue={limits.maxActiveFlows < 0 ? 0 : limits.maxActiveFlows}
                    className="input-field"
                    dir="ltr"
                  />
                  <label className="mt-1.5 flex items-center gap-1.5 text-xs text-slate-400">
                    <input type="checkbox" name="unlimited" defaultChecked={limits.maxActiveFlows < 0} />
                    غير محدود
                  </label>
                </div>

                <div>
                  <label className="label-field">العقد المتاحة</label>
                  <div className="space-y-1">
                    {CONFIGURABLE_NODE_TYPES.map((t) => (
                      <label key={t} className="flex items-center gap-1.5 text-xs text-slate-300">
                        <input type="checkbox" name={`node_${t}`} defaultChecked={limits.allowedNodeTypes.includes(t)} />
                        {NODE_TYPES[t].icon} {NODE_TYPES[t].label}
                      </label>
                    ))}
                  </div>
                </div>

                <div>
                  <label className="label-field">مستوى مكتبة القوالب</label>
                  <select name="templatesTier" defaultValue={limits.templatesTier} className="input-field">
                    <option value="basic">أساسي (3 قوالب)</option>
                    <option value="full">كامل (كل القوالب)</option>
                  </select>
                </div>

                <div>
                  <label className="label-field">مستوى التحليلات</label>
                  <select name="analyticsTier" defaultValue={limits.analyticsTier} className="input-field">
                    <option value="basic">أساسي</option>
                    <option value="advanced">متقدم</option>
                    <option value="export">متقدم + تصدير</option>
                  </select>
                </div>

                <label className="flex items-center gap-1.5 text-xs text-slate-300">
                  <input type="checkbox" name="multiLanguage" defaultChecked={limits.multiLanguage} />
                  دعم لغات متعددة داخل التدفق
                </label>

                <div>
                  <label className="label-field">حد توكنز الموظف الذكي شهرياً</label>
                  <input
                    name="maxAiTokensPerMonth"
                    type="number"
                    min={0}
                    defaultValue={limits.maxAiTokensPerMonth < 0 ? 0 : limits.maxAiTokensPerMonth}
                    className="input-field"
                    dir="ltr"
                  />
                  <label className="mt-1.5 flex items-center gap-1.5 text-xs text-slate-400">
                    <input type="checkbox" name="aiTokensUnlimited" defaultChecked={limits.maxAiTokensPerMonth < 0} />
                    غير محدود
                  </label>
                  <p className="mt-1 text-xs text-slate-500">0 = عقدة "رد ذكي" محظورة كلياً حتى لو مضافة للتدفق.</p>
                </div>

                <button type="submit" className="btn-primary w-full text-sm">
                  حفظ حدود الشات بوت
                </button>
              </form>

              <form action={updatePlanCampaignLimits.bind(null, plan.id)} className="space-y-3 border-t border-white/5 pt-4">
                <p className="text-xs font-medium text-slate-400">حدود الحملات</p>
                <div>
                  <label className="label-field">أقصى عدد حملات شهرياً</label>
                  <input
                    name="maxCampaignsPerMonth"
                    type="number"
                    min={0}
                    defaultValue={campaignLimits.maxCampaignsPerMonth < 0 ? 0 : campaignLimits.maxCampaignsPerMonth}
                    className="input-field"
                    dir="ltr"
                  />
                  <label className="mt-1.5 flex items-center gap-1.5 text-xs text-slate-400">
                    <input type="checkbox" name="campaignsUnlimited" defaultChecked={campaignLimits.maxCampaignsPerMonth < 0} />
                    غير محدود
                  </label>
                </div>

                <div>
                  <label className="label-field">أقصى حجم جمهور للحملة الواحدة</label>
                  <input
                    name="maxAudiencePerCampaign"
                    type="number"
                    min={0}
                    defaultValue={campaignLimits.maxAudiencePerCampaign < 0 ? 0 : campaignLimits.maxAudiencePerCampaign}
                    className="input-field"
                    dir="ltr"
                  />
                  <label className="mt-1.5 flex items-center gap-1.5 text-xs text-slate-400">
                    <input type="checkbox" name="audienceUnlimited" defaultChecked={campaignLimits.maxAudiencePerCampaign < 0} />
                    غير محدود
                  </label>
                </div>

                <label className="flex items-center gap-1.5 text-xs text-slate-300">
                  <input type="checkbox" name="abTestingEnabled" defaultChecked={campaignLimits.abTestingEnabled} />
                  تفعيل A/B Testing (علم بيانات محجوز — لا واجهة فعلية بعد)
                </label>

                <button type="submit" className="btn-primary w-full text-sm">
                  حفظ حدود الحملات
                </button>
              </form>
            </div>
          );
        })}
      </div>
    </div>
  );
}
