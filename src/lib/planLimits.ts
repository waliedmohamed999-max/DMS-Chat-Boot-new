import { withTenant } from "@/lib/db";

export type ChatbotNodeTypeKey =
  | "start" | "message" | "question" | "condition" | "menu" | "ai_reply" | "api_call" | "handoff" | "end";

export type ChatbotTemplatesTier = "basic" | "full";
export type ChatbotAnalyticsTier = "basic" | "advanced" | "export";

export type ChatbotLimits = {
  maxActiveFlows: number; // -1 = غير محدود
  allowedNodeTypes: ChatbotNodeTypeKey[];
  templatesTier: ChatbotTemplatesTier;
  analyticsTier: ChatbotAnalyticsTier;
  multiLanguage: boolean;
  // حد توكنز الذكاء الاصطناعي الشهري لعقدة "رد ذكي" (الموظف الذكي) — -1 = غير محدود، 0 = ممنوع
  // كلياً. منفصل عن allowedNodeTypes: الأخير يمنع *إضافة* العقدة للتدفق، بينما هذا يحد استهلاكها
  // الفعلي حتى لباقة تسمح بالعقدة، تفادياً لتكلفة غير محسوبة على مالك المنصة (بند 6 في البرومنت).
  maxAiTokensPerMonth: number;
  // يتحكم في تفريغ الرسائل الصوتية الواردة عبر Whisper وقت الاستقبال (ingestion) — بصرف النظر عن
  // قناة الاتصال (Meta Cloud API أو Baileys/QR). استدعاء Whisper له تكلفة فعلية لكل رسالة صوتية،
  // فمنفصل عن maxAiTokensPerMonth (ذاك خاص بعقدة "رد ذكي" فقط).
  voiceMessagesEnabled: boolean;
  // ويدجت شات موقع التاجر الخاص (نص + رسالة صوتية) عبر iframe — منفصلة عن voiceMessagesEnabled
  // (ذاك لواتساب فقط) وعن websiteVoiceCallEnabled أدناه (تلك للمكالمة الصوتية الحية تحديداً).
  websiteChatEnabled: boolean;
  // المكالمة الصوتية الحية (Realtime API) داخل ويدجت موقع التاجر — تتطلب websiteChatEnabled=true
  // أصلاً لتُفعَّل فعلياً (تُفحص معاً في نقاط الاستدعاء، وليس بديلاً مستقلاً عنها).
  websiteVoiceCallEnabled: boolean;
  // سقف دقائق المكالمة الصوتية الحية الشهري لكل تاجر (بالإضافة لحد الـ5 دقائق لكل مكالمة منفردة) —
  // -1 = غير محدود، 0 = ممنوع كلياً حتى لو websiteVoiceCallEnabled=true.
  maxVoiceCallMinutesPerMonth: number;
};

// حدود Starter الافتراضية — تُستخدم كـ fallback آمن (الأكثر تقييداً) إن كانت الباقة بدون
// chatbotLimitsJson مضبوط صراحة، بحيث غياب الإعداد لا يمنح صلاحيات أوسع بالخطأ أبداً.
export const DEFAULT_STARTER_CHATBOT_LIMITS: ChatbotLimits = {
  maxActiveFlows: 2,
  allowedNodeTypes: ["start", "message", "question", "condition", "menu", "handoff", "end"],
  templatesTier: "basic",
  analyticsTier: "basic",
  multiLanguage: false,
  maxAiTokensPerMonth: 0,
  voiceMessagesEnabled: false,
  websiteChatEnabled: false,
  websiteVoiceCallEnabled: false,
  maxVoiceCallMinutesPerMonth: 0,
};

export const PLAN_TIER_LABELS_AR: Record<string, string> = {
  starter: "البداية",
  growth: "النمو",
  scale: "الاحتراف",
  enterprise: "المؤسسات",
};

/** يُصدَّر ليُستخدَم أيضاً لتحليل حدود باقة أخرى غير باقة المستأجر الحالية (مثال: فحص التخفيض في
 * lib/billing/downgradeCheck.ts) — وليس فقط عبر getTenantChatbotLimits أدناه. */
export function parseChatbotLimits(raw: unknown): ChatbotLimits {
  if (!raw || typeof raw !== "object") return DEFAULT_STARTER_CHATBOT_LIMITS;
  const r = raw as Partial<ChatbotLimits>;
  return {
    maxActiveFlows: typeof r.maxActiveFlows === "number" ? r.maxActiveFlows : DEFAULT_STARTER_CHATBOT_LIMITS.maxActiveFlows,
    allowedNodeTypes: Array.isArray(r.allowedNodeTypes) ? (r.allowedNodeTypes as ChatbotNodeTypeKey[]) : DEFAULT_STARTER_CHATBOT_LIMITS.allowedNodeTypes,
    templatesTier: r.templatesTier === "full" ? "full" : "basic",
    analyticsTier: r.analyticsTier === "advanced" || r.analyticsTier === "export" ? r.analyticsTier : "basic",
    multiLanguage: Boolean(r.multiLanguage),
    maxAiTokensPerMonth: typeof r.maxAiTokensPerMonth === "number" ? r.maxAiTokensPerMonth : DEFAULT_STARTER_CHATBOT_LIMITS.maxAiTokensPerMonth,
    voiceMessagesEnabled: Boolean(r.voiceMessagesEnabled),
    websiteChatEnabled: Boolean(r.websiteChatEnabled),
    websiteVoiceCallEnabled: Boolean(r.websiteVoiceCallEnabled),
    maxVoiceCallMinutesPerMonth: typeof r.maxVoiceCallMinutesPerMonth === "number" ? r.maxVoiceCallMinutesPerMonth : DEFAULT_STARTER_CHATBOT_LIMITS.maxVoiceCallMinutesPerMonth,
  };
}

/** يجلب حدود الشات بوت الفعلية لمستأجر معيّن بناءً على باقته الحالية. */
export async function getTenantChatbotLimits(tenantId: string): Promise<ChatbotLimits & { planKey: string; planName: string }> {
  // Subscription جدول مستأجر خاضع لـ RLS — يجب المرور عبر withTenant() وإلا يُرجع فارغاً دائماً
  // (اكتُشفت هذه الفئة من الأخطاء سابقاً مع rawDb.auditLog.create، ونفس السبب هنا: استعلام
  // مباشر على جدول محمي بـ RLS بدون ضبط app.current_tenant_id يعيد صفوفاً فارغة بصمت).
  const subscription = await withTenant(tenantId, (tx) =>
    tx.subscription.findUnique({ where: { tenantId }, include: { plan: true } })
  );

  if (!subscription) {
    return { ...DEFAULT_STARTER_CHATBOT_LIMITS, planKey: "starter", planName: "البداية" };
  }

  return {
    ...parseChatbotLimits(subscription.plan.chatbotLimitsJson),
    planKey: subscription.plan.key,
    planName: subscription.plan.name,
  };
}

export function isNodeTypeAllowed(limits: ChatbotLimits, type: ChatbotNodeTypeKey): boolean {
  return limits.allowedNodeTypes.includes(type);
}

export function isUnlimited(maxActiveFlows: number): boolean {
  return maxActiveFlows < 0;
}
