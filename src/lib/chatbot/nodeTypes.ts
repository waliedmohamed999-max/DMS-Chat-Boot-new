import type { ChatbotNodeTypeKey } from "@/lib/planLimits";

export type NodeTypeMeta = {
  key: ChatbotNodeTypeKey;
  label: string;
  icon: string;
  description: string;
  /** أقل باقة تتيح هذه العقدة — لعرض شارة القفل الصحيحة في الواجهة */
  minTier: "starter" | "growth" | "scale";
  /** هل يمكن للمستخدم إضافتها يدوياً من شريط الأدوات (بداية/نهاية تُداران تلقائياً) */
  addable: boolean;
};

// أسماء بسيطة بالعربي لغير التقنيين — بلا أي مصطلحات برمجية (Trigger/Webhook) في الواجهة.
export const NODE_TYPES: Record<ChatbotNodeTypeKey, NodeTypeMeta> = {
  start: {
    key: "start", label: "بداية", icon: "🚀",
    description: "نقطة انطلاق التدفق — تبدأ تلقائياً عند وصول أول رسالة من العميل.",
    minTier: "starter", addable: false,
  },
  message: {
    key: "message", label: "رسالة", icon: "💬",
    description: "يرسل البوت رسالة نصية ثابتة للعميل.",
    minTier: "starter", addable: true,
  },
  question: {
    key: "question", label: "سؤال", icon: "❓",
    description: "يسأل البوت العميل سؤالاً وينتظر رده قبل المتابعة.",
    minTier: "starter", addable: true,
  },
  condition: {
    key: "condition", label: "شرط", icon: "🔀",
    description: "اكتب كلمات مفتاحية مفصولة بفاصلة (مثال: نعم, أيوه, تمام) — لو رد العميل يحتوي إحداها ينتقل لفرع \"نعم\"، وإلا لفرع \"لا\".",
    minTier: "starter", addable: true,
  },
  menu: {
    key: "menu", label: "قائمة اختيارات", icon: "📋",
    description: "يعرض للعميل عدة خيارات (مثل: تتبع الطلب، التوصيل، الدعم) وكل خيار له رد تلقائي خاص به — بديل احترافي عن تكرار عقد \"شرط\" المتداخلة لأكثر من خيارين.",
    minTier: "starter", addable: true,
  },
  ai_reply: {
    key: "ai_reply", label: "رد ذكي (الموظف الذكي)", icon: "🤖",
    description: "يسلّم المحادثة لـ\"الموظف الذكي\" — يرد بذكاء اصطناعي حقيقي متماسك عبر عدة رسائل، ويحوّل تلقائياً لموظف بشري عند طلب صريح أو شكوى أو ثقة منخفضة. أعدّ شخصيته من صفحة \"الموظف الذكي\" أولاً.",
    minTier: "growth", addable: true,
  },
  api_call: {
    key: "api_call", label: "استدعاء API خارجي", icon: "🔌",
    description: "يستدعي رابط خارجي لجلب أو إرسال بيانات أثناء المحادثة (يتطلب الباقة الاحترافية فأعلى).",
    minTier: "growth", addable: true,
  },
  handoff: {
    key: "handoff", label: "تحويل لموظف", icon: "🙋",
    description: "ينهي رد البوت الآلي ويحوّل المحادثة لأحد موظفي فريقك صامتاً — لا رسالة تلقائية تصل للعميل، أضف خطوة \"رسالة\" قبلها لو تريد إعلامه بالتحويل.",
    minTier: "starter", addable: true,
  },
  end: {
    key: "end", label: "نهاية", icon: "🏁",
    description: "ينهي التدفق دون أي إجراء إضافي.",
    minTier: "starter", addable: true,
  },
};

export const TIER_LABELS_AR: Record<NodeTypeMeta["minTier"], string> = {
  starter: "البداية",
  growth: "النمو",
  scale: "الاحتراف",
};

export const TIER_BADGE: Record<NodeTypeMeta["minTier"], string | null> = {
  starter: null,
  growth: "Pro",
  scale: "Business",
};
