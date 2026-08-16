import type { ConversationStatus } from "@prisma/client";

/**
 * آلة حالة المحادثة — تُطبَّق في كل نقطة تُنشئ أو تُحدّث رسالة، بدل ترك كل موقع في الكود يقرر
 * الحالة بنفسه (وهو ما كان يسبب أخطاء سابقاً مثل تحديد كل رد كـ"محلولة" بالخطأ). المرجعية:
 * - NEW: أول رسالة من عميل جديد كلياً، لم يتم الرد عليها إطلاقاً.
 * - NEEDS_REPLY: آخر رسالة من العميل (جديدة أو محادثة أُعيد فتحها) بانتظار رد.
 * - OPEN: تم الرد فعلياً (بوت أو موظف) وبانتظار رسالة العميل التالية.
 * - RESOLVED: أُغلقت يدوياً بواسطة موظف فقط — لا يضعها أي رد تلقائياً في هذه الحالة.
 */

/** يُستدعى عند إنشاء أول رسالة في محادثة جديدة كلياً (لم تكن موجودة من قبل). */
export function initialStatusForNewConversation(): ConversationStatus {
  return "NEW";
}

/** يُستدعى عند وصول رسالة واردة من العميل على محادثة موجودة مسبقاً، بصرف النظر عن حالتها الحالية. */
export function statusAfterInboundMessage(): ConversationStatus {
  return "NEEDS_REPLY";
}

/** يُستدعى عند إرسال رد (من موظف أو بوت) على محادثة كانت NEW أو NEEDS_REPLY. */
export function statusAfterOutboundReply(currentStatus: ConversationStatus): ConversationStatus {
  if (currentStatus === "RESOLVED") return "RESOLVED"; // رد على محادثة محلولة (نادر) لا يُعيد فتحها ضمنياً
  return "OPEN";
}

export const SLA_WARNING_MINUTES = 15;

/** هل تجاوزت محادثة "يحتاج رد" حد الوقت المسموح دون رد (لتلوين المؤشر أحمر). */
export function isSlaBreached(lastMessageAt: Date, now: Date = new Date()): boolean {
  return (now.getTime() - lastMessageAt.getTime()) / 60000 > SLA_WARNING_MINUTES;
}
