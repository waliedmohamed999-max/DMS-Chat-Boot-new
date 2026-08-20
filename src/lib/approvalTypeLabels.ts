// مصدر واحد لتسميات/أيقونات أنواع طلبات مركز الموافقات — كانت مكرَّرة (أو كانت ستتكرر) بين
// ApprovalCard.tsx (عرض) وactions.ts (بناء نص قوالب البريد) وpage.tsx (تفصيل العدد حسب النوع).
export type ApprovalRequestTypeLabel = "NEW_TENANT" | "CUSTOM_PLAN" | "WHATSAPP_VERIFICATION" | "MESSAGE_TEMPLATE" | "PARTNER_APPLICATION";

export const APPROVAL_TYPE_LABELS: Record<ApprovalRequestTypeLabel, { label: string; icon: string }> = {
  NEW_TENANT: { label: "تسجيل تاجر جديد", icon: "🏬" },
  CUSTOM_PLAN: { label: "طلب باقة مخصصة", icon: "🧩" },
  WHATSAPP_VERIFICATION: { label: "تحقق ربط واتساب", icon: "📱" },
  MESSAGE_TEMPLATE: { label: "قالب رسالة جديد", icon: "📝" },
  PARTNER_APPLICATION: { label: "طلب انضمام شريك", icon: "🤝" },
};
