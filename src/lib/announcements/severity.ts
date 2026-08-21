/** مصدر حقيقة واحد للألوان/الأيقونات/الأولوية — يُستخدَم من AnnouncementBanner.tsx (عرض التاجر)
 * وadmin/announcements/page.tsx (شارات السجل) معاً. */
export const SEVERITY_LABELS_AR: Record<string, string> = { INFO: "معلومة", UPDATE: "تحديث", MAINTENANCE: "صيانة", CRITICAL: "عاجل" };
export const SEVERITY_ICON: Record<string, string> = { INFO: "📢", UPDATE: "✨", MAINTENANCE: "🛠️", CRITICAL: "🚨" };
// نفس فلسفة ألوان الشارات (badge) المستخدمة في admin/affiliates بالحرف — accent/wa/warning/danger.
export const SEVERITY_BANNER_CLASSES: Record<string, string> = {
  INFO: "border-accent-500/30 bg-accent-500/10 text-accent-400",
  UPDATE: "border-wa-500/30 bg-wa-500/10 text-wa-400",
  MAINTENANCE: "border-warning-500/30 bg-warning-500/10 text-warning-500",
  CRITICAL: "border-danger-500/30 bg-danger-500/10 text-danger-500",
};
// أولوية الأهمية عند تعدّد الإعلانات النشطة في نفس الوقت (الأحرج يظهر أولاً) — يُستخدَم في
// dashboard/layout.tsx::getApplicableAnnouncement للترتيب قبل اختيار الأول.
export const SEVERITY_PRIORITY: Record<string, number> = { CRITICAL: 0, MAINTENANCE: 1, UPDATE: 2, INFO: 3 };
