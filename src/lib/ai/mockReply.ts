// محاكاة رد ذكاء اصطناعي مبني على "بيانات المتجر" (سياق تجريبي بدون استدعاء نموذج فعلي).
// عند التوفر لاحقاً، يُستبدل هذا بموفر نموذج لغوي حقيقي خلف نفس التوقيع (signature).

export function generateMockAiReply(userMessage: string): string {
  const msg = userMessage.toLowerCase();

  if (msg.includes("طلب") || msg.includes("order") || msg.includes("شحن")) {
    return "طلبك رقم #10234 حالياً \"قيد الشحن\" 🚚 ومن المتوقع وصوله خلال يومين. هل تحتاج شيئاً آخر؟";
  }
  if (msg.includes("سعر") || msg.includes("بكم") || msg.includes("price")) {
    return "منتجنا الأكثر مبيعاً بسعر 199 ر.س حالياً مع خصم 15% لفترة محدودة 🎉";
  }
  if (msg.includes("إلغاء") || msg.includes("استرجاع") || msg.includes("cancel")) {
    return "يمكنك طلب الاسترجاع خلال 14 يوماً من الاستلام. هل ترغب أن أحوّلك لأحد موظفينا لإتمام الطلب؟";
  }
  return "شكراً لتواصلك معنا! سأقوم بمساعدتك — هل تسأل عن حالة طلب، سعر منتج، أم شيء آخر؟";
}
