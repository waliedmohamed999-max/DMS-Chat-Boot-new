"use client";

import { useState, useTransition } from "react";
import { PLATFORM_PERMISSION_LABELS_AR, NON_CUSTOMIZABLE_PLATFORM_PERMISSIONS, type Permission } from "@/lib/rbac";

// صلاحيات حساسة جداً تحذّر (بلا تعطيل) عند تفعيلها — وصول لبيانات/إجراءات تجّار حقيقيين يستحق تأكيداً
// واعياً من مالك المنصة قبل منحه لعضو فريق داخلي.
const SENSITIVE_PLATFORM_PERMISSION_WARNING: Partial<Record<Permission, string>> = {
  "platform.merchants.impersonate": "صلاحية حساسة جداً، امنحها بحذر",
  "platform.merchants.delete": "صلاحية حساسة جداً، امنحها بحذر",
  "platform.settings.manage": "صلاحية حساسة جداً، امنحها بحذر",
  "platform.merchants.change_plan": "صلاحية حساسة جداً، امنحها بحذر",
};

// platform.team.manage/platform.billing.manage مستبعدتان تماماً من القائمة (وليستا معطَّلتين فقط) —
// راجع تعليق NON_CUSTOMIZABLE_PLATFORM_PERMISSIONS في lib/rbac.ts لسبب الاستبعاد.
const CUSTOMIZABLE_PLATFORM_PERMISSIONS = (Object.keys(PLATFORM_PERMISSION_LABELS_AR) as Permission[]).filter(
  (p) => !(NON_CUSTOMIZABLE_PLATFORM_PERMISSIONS as string[]).includes(p)
);

export function PlatformPermissionsEditor({
  userId,
  userName,
  initialPermissions,
  isCustomized,
  updateInternalStaffPermissions,
}: {
  userId: string;
  userName: string;
  /** = resolveEffectivePermissions(target) من الخادم — لو لسه على الافتراضي تظهر افتراضي الدور نفسه هنا. */
  initialPermissions: Permission[];
  isCustomized: boolean;
  updateInternalStaffPermissions: (userId: string, permissions: string[] | null) => Promise<{ success: boolean; error?: string }>;
}) {
  const [open, setOpen] = useState(false);
  const [selected, setSelected] = useState<Set<Permission>>(new Set(initialPermissions));
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function toggle(p: Permission) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(p)) next.delete(p);
      else next.add(p);
      return next;
    });
  }

  function handleSave() {
    setError(null);
    startTransition(async () => {
      const result = await updateInternalStaffPermissions(userId, Array.from(selected));
      if (result.success) setOpen(false);
      else setError(result.error ?? "تعذّر حفظ الصلاحيات");
    });
  }

  function handleResetToDefault() {
    setError(null);
    startTransition(async () => {
      const result = await updateInternalStaffPermissions(userId, null);
      if (result.success) setOpen(false);
      else setError(result.error ?? "تعذّر الرجوع لصلاحيات الدور الافتراضية");
    });
  }

  return (
    <>
      <button
        onClick={() => {
          setSelected(new Set(initialPermissions));
          setError(null);
          setOpen(true);
        }}
        className="badge border border-white/10 text-slate-300 hover:bg-white/5"
      >
        🔧 تخصيص الصلاحيات
      </button>

      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4" onClick={() => setOpen(false)}>
          <div className="card w-full max-w-md p-6" onClick={(e) => e.stopPropagation()}>
            <h3 className="mb-1 text-lg font-bold text-white">تخصيص صلاحيات {userName}</h3>
            <p className="mb-4 text-xs text-slate-400">
              {isCustomized ? "هذا العضو لديه صلاحيات مخصَّصة حالياً (مختلفة عن افتراضي دوره)." : "هذا العضو حالياً على صلاحيات دوره الافتراضية."}
            </p>

            {error && <p className="mb-3 rounded-lg bg-danger-500/10 px-3 py-2 text-xs text-danger-500">{error}</p>}

            <div className="mb-4 max-h-80 space-y-1 overflow-y-auto">
              {CUSTOMIZABLE_PLATFORM_PERMISSIONS.map((p) => {
                const checked = selected.has(p);
                return (
                  <label key={p} className="flex items-start gap-2 rounded-lg px-2 py-1.5 text-sm hover:bg-white/5">
                    <input type="checkbox" checked={checked} onChange={() => toggle(p)} className="mt-0.5" />
                    <span>
                      <span className="text-slate-200">{PLATFORM_PERMISSION_LABELS_AR[p]}</span>
                      {checked && SENSITIVE_PLATFORM_PERMISSION_WARNING[p] && (
                        <span className="block text-xs text-warning-500">⚠️ {SENSITIVE_PLATFORM_PERMISSION_WARNING[p]}</span>
                      )}
                    </span>
                  </label>
                );
              })}
            </div>

            <div className="flex gap-2">
              <button onClick={() => setOpen(false)} disabled={isPending} className="btn-secondary flex-1 text-sm disabled:opacity-50">
                إلغاء
              </button>
              <button onClick={handleResetToDefault} disabled={isPending} className="btn-secondary flex-1 text-sm disabled:opacity-50">
                الرجوع للافتراضي
              </button>
              <button onClick={handleSave} disabled={isPending} className="btn-primary flex-1 text-sm disabled:opacity-50">
                {isPending ? "جارٍ الحفظ..." : "حفظ"}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
