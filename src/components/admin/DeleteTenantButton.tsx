"use client";

import { useState, useTransition } from "react";
import { deleteTenantPermanently } from "@/app/admin/tenants/actions";

export function DeleteTenantButton({ tenantId, tenantSlug }: { tenantId: string; tenantSlug: string }) {
  const [open, setOpen] = useState(false);
  const [confirmText, setConfirmText] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  if (!open) {
    return (
      <button onClick={() => setOpen(true)} className="btn-danger text-xs">
        حذف نهائي
      </button>
    );
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4" onClick={() => setOpen(false)}>
      <div className="card w-full max-w-sm p-6" onClick={(e) => e.stopPropagation()}>
        <h3 className="mb-2 text-lg font-bold text-danger-500">⚠️ حذف نهائي لا يمكن التراجع عنه</h3>
        <p className="mb-4 text-sm text-slate-400">
          سيُحذف كل شيء يخص هذا التاجر: جهات الاتصال، المحادثات، الحملات، الفواتير. اكتب معرّف
          المتجر <strong dir="ltr">{tenantSlug}</strong> لتأكيد الحذف.
        </p>
        {error && <p className="mb-2 text-xs text-danger-500">{error}</p>}
        <input
          value={confirmText}
          onChange={(e) => setConfirmText(e.target.value)}
          className="input-field mb-4 text-sm"
          dir="ltr"
          placeholder={tenantSlug}
        />
        <div className="flex gap-2">
          <button onClick={() => setOpen(false)} className="btn-secondary flex-1 text-sm">
            إلغاء
          </button>
          <button
            disabled={isPending || confirmText !== tenantSlug}
            onClick={() =>
              startTransition(async () => {
                try {
                  await deleteTenantPermanently(tenantId, confirmText);
                } catch (e) {
                  setError(e instanceof Error ? e.message : "فشل الحذف");
                }
              })
            }
            className="btn-danger flex-1 text-sm"
          >
            {isPending ? "جاري الحذف..." : "تأكيد الحذف النهائي"}
          </button>
        </div>
      </div>
    </div>
  );
}
