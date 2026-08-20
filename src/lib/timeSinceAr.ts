// تحويل مبسّط لفارق الوقت لصيغة عربية مقروءة — بلا مكتبة خارجية (لا حاجة فعلية لها لعرض تقريبي).
// المثنى (ساعتين/يومين) بلا رقم ظاهر (الصيغة الصحيحة نحوياً)، وبقية الحالات برقم صريح. مصدر وحيد
// مشترك بين مركز الموافقات (ApprovalCard) ورسائل التواصل (LeadsList) — نفس المنطق بالضبط في الاثنين.
export function timeSinceAr(iso: string): string {
  const diffMs = Date.now() - new Date(iso).getTime();
  const hours = Math.floor(diffMs / (3600 * 1000));
  if (hours < 1) return "منذ أقل من ساعة";
  if (hours < 24) {
    if (hours === 1) return "منذ ساعة";
    if (hours === 2) return "منذ ساعتين";
    return `منذ ${hours} ${hours <= 10 ? "ساعات" : "ساعة"}`;
  }
  const days = Math.floor(hours / 24);
  if (days === 1) return "منذ يوم";
  if (days === 2) return "منذ يومين";
  return `منذ ${days} ${days <= 10 ? "أيام" : "يوم"}`;
}
