// تسميات وألوان موحّدة لحالة التاجر — تُستخدم في كل مكان يعرض TenantStatus بدل قيمة enum الخام.

export const TENANT_STATUS_LABELS_AR: Record<string, string> = {
  PENDING_REVIEW: "بانتظار المراجعة",
  TRIAL: "تجربة مجانية",
  ACTIVE: "نشط",
  SUSPENDED: "معلّق",
  CANCELLED: "ملغى",
  REJECTED: "مرفوض",
};

export const TENANT_STATUS_BADGE_CLASS: Record<string, string> = {
  PENDING_REVIEW: "bg-warning-500/10 text-warning-500",
  TRIAL: "bg-accent-500/10 text-accent-400",
  ACTIVE: "bg-success-500/10 text-success-500",
  SUSPENDED: "bg-danger-500/10 text-danger-500",
  CANCELLED: "bg-slate-500/10 text-slate-400",
  REJECTED: "bg-danger-500/10 text-danger-500",
};

export const TENANT_STATUS_BAR_CLASS: Record<string, string> = {
  PENDING_REVIEW: "bg-warning-500",
  TRIAL: "bg-accent-500",
  ACTIVE: "bg-success-500",
  SUSPENDED: "bg-danger-500",
  CANCELLED: "bg-slate-500",
  REJECTED: "bg-danger-600",
};
