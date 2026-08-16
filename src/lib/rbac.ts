import type { UserRole } from "@prisma/client";

export type Permission =
  | "campaigns.view"
  | "campaigns.manage"
  | "chatbot.view"
  | "chatbot.edit"
  | "chatbot.publish"
  | "chatbot.delete_draft"
  | "chatbot.delete_published"
  | "chatbot.test"
  | "contacts.manage"
  | "contacts.delete"
  | "contacts.export"
  | "inbox.reply"
  | "inbox.assign"
  | "integrations.manage"
  | "billing.view"
  | "billing.manage"
  | "team.manage"
  | "settings.manage"
  // صلاحيات لوحة مالك المنصة (Super Admin) — مجزّأة لفريق داخلي متعدد الأدوار وليس صلاحية واحدة شاملة
  | "platform.approvals.review"
  | "platform.merchants.view"
  | "platform.merchants.suspend"
  | "platform.merchants.delete"
  | "platform.merchants.change_plan"
  | "platform.merchants.impersonate"
  | "platform.merchants.notes"
  | "platform.plans.manage"
  | "platform.health.view"
  | "platform.announcements.send"
  | "platform.team.manage"
  | "platform.audit_log.view"
  | "platform.settings.manage"
  | "platform.leads.view" // رسائل نموذج "تواصل معنا" في الموقع التسويقي العام
  | "platform.content.manage" // تعديل محتوى الصفحة الرئيسية للموقع التسويقي (admin/content)
  | "platform.manage_tenants" // مظلة عامة قديمة، تبقى لتوافق الكود السابق (تعادل مجموع صلاحيات التجار أعلاه)
  | "platform.view_revenue"
  | "platform.affiliates.manage"; // إدارة برنامج التسويق بالعمولة (اعتماد مسوّقين، صرف عمولات)

const ROLE_PERMISSIONS: Record<UserRole, Permission[]> = {
  // مالك المنصة: كل شيء بلا استثناء
  SUPER_ADMIN: [
    "platform.approvals.review",
    "platform.merchants.view",
    "platform.merchants.suspend",
    "platform.merchants.delete",
    "platform.merchants.change_plan",
    "platform.merchants.impersonate",
    "platform.merchants.notes",
    "platform.plans.manage",
    "platform.health.view",
    "platform.announcements.send",
    "platform.team.manage",
    "platform.audit_log.view",
    "platform.settings.manage",
    "platform.content.manage",
    "platform.manage_tenants",
    "platform.view_revenue",
    "platform.leads.view",
    "platform.affiliates.manage",
  ],
  // فريق الدعم الفني الداخلي: مراجعة + تعليق/تفعيل، بدون حذف أو تعديل باقات أو فوترة.
  // "الدخول كخبير" (platform.merchants.impersonate) أصبح حصرياً لمالك المنصة فقط (SUPER_ADMIN) —
  // قرار صريح جديد (كان مسموحاً لفريق الدعم سابقاً)، انظر DECISIONS.md لتفاصيل هذا التغيير المتعمَّد.
  PLATFORM_SUPPORT: [
    "platform.approvals.review",
    "platform.merchants.view",
    "platform.merchants.suspend",
    "platform.merchants.notes",
    "platform.health.view",
    "platform.leads.view",
  ],
  // فريق مالي داخلي: إيرادات وفواتير فقط، بدون أي وصول لبيانات محادثات/تفاصيل التجار التشغيلية
  PLATFORM_BILLING: ["platform.view_revenue"],
  OWNER: [
    "campaigns.view",
    "campaigns.manage",
    "chatbot.view",
    "chatbot.edit",
    "chatbot.publish",
    "chatbot.delete_draft",
    "chatbot.delete_published",
    "chatbot.test",
    "contacts.manage",
    "contacts.delete",
    "contacts.export",
    "inbox.reply",
    "inbox.assign",
    "integrations.manage",
    "billing.view",
    "billing.manage",
    "team.manage",
    "settings.manage",
  ],
  ADMIN: [
    "campaigns.view",
    "campaigns.manage",
    // مدير: إنشاء/تعديل/نشر التدفقات، لكن بدون حذف تدفق منشور فعلياً (يتطلب صلاحية المالك)
    "chatbot.view",
    "chatbot.edit",
    "chatbot.publish",
    "chatbot.delete_draft",
    "chatbot.test",
    "contacts.manage",
    "contacts.delete",
    "contacts.export",
    "inbox.reply",
    "inbox.assign",
    "integrations.manage",
    // مدير: يرى صفحة الفوترة كاملة (بند 4 في البرومنت) لكن بدون billing.manage — لا يقدر ينفّذ أي
    // إجراء مالي فعلي (تغيير باقة، إلغاء، تحديث دفع)، الأزرار نفسها تُخفى وتُرفض من الخادم أيضاً.
    "billing.view",
    "team.manage",
  ],
  AGENT: [
    // موظف: عرض واختبار فقط — لا دخول لمحرر التدفقات ولا نشر ولا حذف. لا contacts.export عمداً:
    // تصدير أرقام هواتف حقيقية بيانات حساسة، مقيّد بصلاحية Owner/Admin فقط (قاعدة أمنية صريحة).
    "chatbot.view",
    "chatbot.test",
    "inbox.reply",
    "contacts.manage",
  ],
};

export function hasPermission(role: UserRole, permission: Permission): boolean {
  return ROLE_PERMISSIONS[role]?.includes(permission) ?? false;
}

export function requirePermission(role: UserRole, permission: Permission): void {
  if (!hasPermission(role, permission)) {
    throw new Error(`الصلاحية "${permission}" غير متاحة لهذا الدور (${role})`);
  }
}

export const ROLE_LABELS_AR: Record<UserRole, string> = {
  SUPER_ADMIN: "مالك المنصة",
  PLATFORM_SUPPORT: "فريق الدعم الفني",
  PLATFORM_BILLING: "فريق مالي",
  OWNER: "صاحب الحساب",
  ADMIN: "مدير",
  AGENT: "موظف",
};

/** أي دور من أدوار فريق المنصة الداخلي (وليس تاجراً) */
export function isPlatformRole(role: string): boolean {
  return role === "SUPER_ADMIN" || role === "PLATFORM_SUPPORT" || role === "PLATFORM_BILLING";
}

/**
 * صلاحيات لوحة مالك المنصة فقط (platform.*) بترتيب عرض ثابت + تسمية عربية لكل واحدة — تُستخدم في
 * مصفوفة الصلاحيات المعروضة فعلياً في admin/team (مُشتقّة حياً من `ROLE_PERMISSIONS` أعلاه عبر
 * `hasPermission`، وليست نصوصاً ثابتة منفصلة قد تنحرف عن التعريف الفعلي عند تعديله لاحقاً).
 */
export const PLATFORM_PERMISSION_LABELS_AR: Partial<Record<Permission, string>> = {
  "platform.approvals.review": "مراجعة مركز الموافقات",
  "platform.merchants.view": "عرض بيانات التجار",
  "platform.merchants.suspend": "تعليق/تفعيل حساب تاجر",
  "platform.merchants.delete": "حذف حساب تاجر نهائياً",
  "platform.merchants.change_plan": "تغيير باقة تاجر",
  "platform.merchants.impersonate": "انتحال هوية تاجر (دعم فني)",
  "platform.merchants.notes": "إضافة ملاحظات داخلية على تاجر",
  "platform.plans.manage": "إدارة حدود الباقات",
  "platform.health.view": "عرض صحة المنصة",
  "platform.announcements.send": "إرسال إعلانات للتجار",
  "platform.team.manage": "إدارة فريق المنصة الداخلي",
  "platform.audit_log.view": "عرض سجل التدقيق الشامل",
  "platform.settings.manage": "إعدادات المنصة العامة",
  "platform.content.manage": "تعديل محتوى الصفحة الرئيسية للموقع",
  "platform.leads.view": "عرض رسائل تواصل الموقع",
  "platform.view_revenue": "عرض الإيرادات والفوترة",
  "platform.affiliates.manage": "إدارة برنامج التسويق بالعمولة",
};

export const PLATFORM_STAFF_ROLES = ["SUPER_ADMIN", "PLATFORM_SUPPORT", "PLATFORM_BILLING"] as const;

/** تسمية عربية لصلاحيات لوحة التاجر (tenant-scoped) — مُشتقّة حياً بنفس أسلوب PLATFORM_PERMISSION_LABELS_AR */
export const TENANT_PERMISSION_LABELS_AR: Partial<Record<Permission, string>> = {
  "campaigns.view": "عرض الحملات",
  "campaigns.manage": "إنشاء/إدارة الحملات",
  "chatbot.view": "عرض الشات بوت",
  "chatbot.edit": "تعديل تدفقات الشات بوت",
  "chatbot.publish": "نشر تدفقات الشات بوت",
  "chatbot.delete_draft": "حذف مسودة تدفق",
  "chatbot.delete_published": "حذف تدفق منشور",
  "chatbot.test": "اختبار الشات بوت",
  "contacts.manage": "إدارة جهات الاتصال",
  "contacts.delete": "حذف جهات الاتصال",
  "contacts.export": "تصدير جهات الاتصال (بيانات حساسة)",
  "inbox.reply": "الرد في صندوق المحادثات",
  "inbox.assign": "تعيين المحادثات للموظفين",
  "integrations.manage": "إدارة التكاملات",
  "billing.view": "عرض صفحة الفوترة (بلا إجراءات مالية)",
  "billing.manage": "إدارة الفوترة والباقة",
  "team.manage": "إدارة فريق المتجر",
  "settings.manage": "إعدادات المتجر",
};

/** كل الأدوار في النظام بترتيب عرض ثابت — تُستخدم لعرض مصفوفة صلاحيات شاملة (منصة + تجار) في مكان واحد */
export const ALL_ROLES_ORDERED: UserRole[] = ["SUPER_ADMIN", "PLATFORM_SUPPORT", "PLATFORM_BILLING", "OWNER", "ADMIN", "AGENT"];
