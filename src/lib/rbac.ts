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
  // طلبات زد/سلة المزامَنة (بما فيها السلات المتروكة) — orders.view للعرض فقط (منح AGENT إياها، بلا
  // orders.manage، بنفس فلسفة استثناء contacts.export له: بيانات عملاء/مبالغ حساسة يُسمح بعرضها له
  // لخدمة العميل لكن لا يستهدفها بحملات ولا يرسل لها رسائل بنفسه). orders.manage = تحديد جماعي/استهداف/إرسال سريع.
  | "orders.view"
  | "orders.manage"
  // صلاحيات لوحة مالك المنصة (Super Admin) — مجزّأة لفريق داخلي متعدد الأدوار وليس صلاحية واحدة شاملة
  | "platform.approvals.review"
  | "platform.merchants.view"
  | "platform.merchants.suspend"
  | "platform.merchants.delete"
  | "platform.merchants.change_plan"
  | "platform.merchants.impersonate"
  | "platform.merchants.notes"
  | "platform.merchants.reset_password"
  | "platform.plans.manage"
  | "platform.health.view"
  | "platform.announcements.send"
  | "platform.team.manage"
  | "platform.audit_log.view"
  | "platform.settings.manage"
  | "platform.leads.view" // رسائل نموذج "تواصل معنا" في الموقع التسويقي
  | "platform.chats.view" // جلسات شات الموقع التسويقي العام (Widget بلا تسجيل دخول) + تولّي المحادثة كموظف بشري العام
  | "platform.content.manage" // تعديل محتوى الصفحة الرئيسية للموقع التسويقي (admin/content)
  | "platform.manage_tenants" // مظلة عامة قديمة، تبقى لتوافق الكود السابق (تعادل مجموع صلاحيات التجار أعلاه)
  | "platform.view_revenue"
  // إجراءات مالية فعلية تُحرِّك أموالاً حقيقية (استرداد، إعادة محاولة تحصيل، تعديل دليل الحسابات) —
  // منفصلة عمداً عن platform.view_revenue (كانت مدموجة معها سابقاً، فيمنح "عرض الإيرادات" ضمنياً
  // صلاحية استرداد فواتير التجار فعلياً، مخالفاً لنفس مبدأ الفصل بين .view و.manage المتّبع في كل
  // مكان آخر بالنظام؛ راجع DECISIONS.md). ممنوحة لمالك المنصة فقط، وليس لدور PLATFORM_BILLING القرائي.
  | "platform.billing.manage"
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
    "platform.merchants.reset_password",
    "platform.plans.manage",
    "platform.health.view",
    "platform.announcements.send",
    "platform.team.manage",
    "platform.audit_log.view",
    "platform.settings.manage",
    "platform.content.manage",
    "platform.manage_tenants",
    "platform.view_revenue",
    "platform.billing.manage",
    "platform.leads.view",
    "platform.chats.view",
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
    "platform.chats.view",
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
    "orders.view",
    "orders.manage",
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
    "orders.view",
    "orders.manage",
  ],
  AGENT: [
    // موظف: عرض واختبار فقط — لا دخول لمحرر التدفقات ولا نشر ولا حذف. لا contacts.export عمداً:
    // تصدير أرقام هواتف حقيقية بيانات حساسة، مقيّد بصلاحية Owner/Admin فقط (قاعدة أمنية صريحة).
    "chatbot.view",
    "chatbot.test",
    "inbox.reply",
    "contacts.manage",
    // orders.view بلا orders.manage: يشوف الطلبات/السلات المتروكة لخدمة العميل، بلا استهداف بحملات
    // ولا تحديد جماعي ولا إرسال سريع (نفس فلسفة استبعاده من contacts.export).
    "orders.view",
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

// تُرجع مصفوفة صلاحيات الدور الافتراضية — بديل تصدير ROLE_PERMISSIONS مباشرة (يبقى private) عشان
// نمنع أي كود خارجي من تعديلها بالغلط بالإشارة.
export function getRoleDefaultPermissions(role: UserRole): Permission[] {
  return ROLE_PERMISSIONS[role] ?? [];
}

// الصلاحيات المستبعدة عمداً من التخصيص الفردي مهما كان — فتح إحداهما لموظف عادي يفتح مسار تصعيد
// صلاحيات ذاتي (موظف يمنح نفسه صلاحيات أكتر)، لأن صفحة الإعدادات وكل إجراءات الفريق/الفوترة الفعلية
// محمية بفحص دوري ثابت (hasPermission/requirePermission على session.user.role)، وليس بالصلاحيات
// الفعلية. تبقى هاتين دايماً تابعتين لقيمة الدور فقط، بلا استثناء، حتى لو الطلب جاي من Owner نفسه.
export const NON_CUSTOMIZABLE_PERMISSIONS: Permission[] = ["team.manage", "billing.manage"];

// الصلاحيات المستبعدة عمداً من تخصيص فريق المنصة الداخلي — نفس فلسفة NON_CUSTOMIZABLE_PERMISSIONS
// تماماً: صفحة admin/team وكل actions.ts فيها محمية بفحص دوري ثابت (requirePermission على
// session.user.role)، فمنح platform.team.manage كتخصيص لموظف دعم فني يفتح مسار تصعيد صلاحيات ذاتي
// (يقدر يمنح نفسه باقي الصلاحيات عبر نفس الصفحة). platform.billing.manage إجراءات مالية فعلية حقيقية
// (استرداد، تعديل دليل حسابات) — تبقى دايماً تابعة لقيمة الدور فقط، بنفس مبدأ billing.manage التاجري.
export const NON_CUSTOMIZABLE_PLATFORM_PERMISSIONS: Permission[] = ["platform.team.manage", "platform.billing.manage"];

// تحسب الصلاحيات الفعلية لمستخدم واحد (تاجر أو عضو فريق منصة). SUPER_ADMIN وOWNER لا يُخصَّصان أبداً
// — كل منهما لازم يحتفظ بكل صلاحيات حسابه دايماً بلا استثناء (فرض خادمي، ليس فقط UI). PLATFORM_SUPPORT/
// PLATFORM_BILLING قابلان للتخصيص الآن بنفس آلية ADMIN/AGENT التاجرية تماماً.
export function resolveEffectivePermissions(user: {
  role: UserRole;
  customPermissionsJson?: unknown;
}): Permission[] {
  if (user.role === "SUPER_ADMIN" || user.role === "OWNER") {
    return getRoleDefaultPermissions(user.role);
  }
  const custom = parseCustomPermissions(user.customPermissionsJson, user.role);
  return custom ?? getRoleDefaultPermissions(user.role);
}

// يتحقق إن الـJSON المخزّن فعلاً مصفوفة نصوص كل عنصر فيها Permission معروف *ومسموح بتخصيصه لهذا
// الدور تحديداً* (عالم الصلاحيات التاجرية لتاجر، عالم صلاحيات platform.* لعضو منصة — لا تسريب بين
// العالمين مهما حدث)، مطروحاً منها الصلاحيات غير القابلة للتخصيص إطلاقاً. أي قيمة غير متوقعة (JSON
// تالف، صلاحية من عالم خاطئ، نص عشوائي) تُرفض بصمت وتُرجع null (= رجوع آمن لصلاحيات الدور الافتراضية)
// بدل رمي استثناء يكسر تحميل الصفحة.
function parseCustomPermissions(raw: unknown, role: UserRole): Permission[] | null {
  try {
    const arr = typeof raw === "string" ? JSON.parse(raw) : raw;
    if (!Array.isArray(arr)) return null;
    // فلترة يدوية بدل Set.prototype.difference (ES2024) عمداً — دعم هذه الدالة في وقت التشغيل يعتمد
    // على نسخة Node.js الفعلية على خادم الإنتاج، وغير مضمون عبر كل بيئات النشر.
    const nonCustomizable: string[] = isPlatformRole(role) ? NON_CUSTOMIZABLE_PLATFORM_PERMISSIONS : NON_CUSTOMIZABLE_PERMISSIONS;
    const universe = new Set(Object.keys(isPlatformRole(role) ? PLATFORM_PERMISSION_LABELS_AR : TENANT_PERMISSION_LABELS_AR));
    const known = new Set(Array.from(universe).filter((p) => !nonCustomizable.includes(p)));
    const filtered = arr.filter((p): p is Permission => typeof p === "string" && known.has(p));
    return filtered.length === arr.length ? (filtered as Permission[]) : null;
  } catch {
    return null;
  }
}

export function hasEffectivePermission(permissions: Permission[], permission: Permission): boolean {
  return permissions.includes(permission);
}

export function requireEffectivePermission(permissions: Permission[], permission: Permission): void {
  if (!permissions.includes(permission)) {
    throw new Error(`الصلاحية "${permission}" غير متاحة لك حالياً`);
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
  "platform.merchants.reset_password": "تغيير كلمة مرور حساب تاجر مباشرة",
  "platform.plans.manage": "إدارة حدود الباقات",
  "platform.health.view": "عرض صحة المنصة",
  "platform.announcements.send": "إرسال إعلانات للتجار",
  "platform.team.manage": "إدارة فريق المنصة الداخلي",
  "platform.audit_log.view": "عرض سجل التدقيق الشامل",
  "platform.settings.manage": "إعدادات المنصة العامة",
  "platform.content.manage": "تعديل محتوى الصفحة الرئيسية للموقع",
  "platform.leads.view": "عرض رسائل تواصل الموقع",
  "platform.chats.view": "عرض جلسات شات الموقع العام وتولّيها",
  "platform.view_revenue": "عرض الإيرادات والفوترة",
  "platform.billing.manage": "إجراءات مالية فعلية (استرداد، إعادة تحصيل، دليل الحسابات)",
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
  "orders.view": "عرض الطلبات (زد/سلة)",
  "orders.manage": "استهداف/إرسال سريع للطلبات",
};

/** كل الأدوار في النظام بترتيب عرض ثابت — تُستخدم لعرض مصفوفة صلاحيات شاملة (منصة + تجار) في مكان واحد */
export const ALL_ROLES_ORDERED: UserRole[] = ["SUPER_ADMIN", "PLATFORM_SUPPORT", "PLATFORM_BILLING", "OWNER", "ADMIN", "AGENT"];
