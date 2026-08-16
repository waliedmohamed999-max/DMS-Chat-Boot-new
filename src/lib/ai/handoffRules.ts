/**
 * قواعد تحويل حتمية (Deterministic) تُفحَص **قبل** استدعاء النموذج — شبكة أمان لا تعتمد على حسن نية
 * النموذج في اكتشاف هذه الحالات بنفسه (بند 4 في القواعد غير القابلة للتفاوض: "لا محاولة حل كل شيء
 * بالذكاء الاصطناعي"). أي تطابق هنا يمنع استدعاء الـLLM كلياً فيوفّر تكلفة وزمناً، ويضمن أن هذه
 * القواعد تُطبَّق دائماً بصرف النظر عن سلوك النموذج في تلك اللحظة تحديداً.
 */

const EXPLICIT_HUMAN_REQUEST_PATTERNS = [
  "أريد شخص", "أريد موظف", "أريد إنسان", "أريد التحدث مع أحد", "أريد أتحدث مع", "حولني لموظف",
  "حولني للدعم", "موظف حقيقي", "شخص حقيقي", "مسؤول حقيقي", "أتكلم مع بشر", "مو عايز بوت", "مو عايزة بوت",
  "مش عايز اتكلم مع بوت", "خليني اتكلم مع حد", "talk to a human", "talk to an agent", "real person",
];

const SENSITIVE_KEYWORD_PATTERNS = [
  "شكوى", "شكوي", "استرجاع", "استرداد", "استرد فلوسي", "أرجع فلوسي", "قانوني", "محامي", "أقاضي",
  "احتيال", "نصب", "خداع", "غاضب", "غضبان", "زعلان جداً", "سيء جداً", "أسوأ خدمة", "تهديد",
  "complaint", "refund", "lawsuit", "legal action", "fraud", "scam",
];

export type DeterministicHandoffResult = { shouldHandoff: true; reason: string } | { shouldHandoff: false };

function normalize(text: string): string {
  return text.trim().toLowerCase();
}

/** يفحص رسالة العميل الأخيرة فقط ضد أنماط ثابتة — مطابقة substring بسيطة، مطابقةً لنفس أسلوب
 * matchesConditionKeywords في محرك الشات بوت (lib/chatbot/simulate.ts) بدل محرك تعابير معقّد جديد. */
export function checkDeterministicHandoff(userMessage: string): DeterministicHandoffResult {
  const normalized = normalize(userMessage);
  if (!normalized) return { shouldHandoff: false };

  for (const pattern of EXPLICIT_HUMAN_REQUEST_PATTERNS) {
    if (normalized.includes(pattern)) {
      return { shouldHandoff: true, reason: "طلب صريح من العميل بالتحدث مع موظف بشري" };
    }
  }
  for (const pattern of SENSITIVE_KEYWORD_PATTERNS) {
    if (normalized.includes(pattern)) {
      return { shouldHandoff: true, reason: `كلمة مفتاحية حساسة اكتُشفت: "${pattern}"` };
    }
  }
  return { shouldHandoff: false };
}

/** يفحص ما إذا كانت آخر 3 محاولات رد من الموظف الذكي في نفس المحادثة تتعامل مع نفس السؤال دون حل —
 * مطابقة نصية مبسّطة (وليس تشابهاً دلالياً معقّداً) على رسالة العميل نفسها. */
export function isRepeatedUnresolvedQuestion(recentUserMessages: string[], currentMessage: string): boolean {
  if (recentUserMessages.length < 2) return false;
  const current = normalize(currentMessage);
  const matches = recentUserMessages.filter((m) => normalize(m) === current).length;
  return matches >= 2; // الحالية + مرتان سابقتان على الأقل بنفس النص = 3 تكرارات إجمالاً
}
