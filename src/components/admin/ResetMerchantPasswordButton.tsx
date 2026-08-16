"use client";

import { useState, useTransition } from "react";
import { resetMerchantPassword } from "@/app/admin/tenants/actions";

export function ResetMerchantPasswordButton({ tenantId, userId, userEmail }: { tenantId: string; userId: string; userEmail: string }) {
  const [open, setOpen] = useState(false);
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const [isPending, startTransition] = useTransition();

  if (!open) {
    return (
      <button onClick={() => setOpen(true)} className="btn-secondary text-xs">
        تغيير كلمة المرور
      </button>
    );
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4" onClick={() => setOpen(false)}>
      <div className="card w-full max-w-sm p-6" onClick={(e) => e.stopPropagation()}>
        {done ? (
          <>
            <h3 className="mb-2 text-lg font-bold text-success-500">تم تغيير كلمة المرور</h3>
            <p className="mb-4 text-sm text-slate-400">
              أبلغ التاجر بكلمة المرور الجديدة عبر قناة موثوقة (اتصال هاتفي مثلاً، وليس البريد الإلكتروني وحده).
            </p>
            <button onClick={() => setOpen(false)} className="btn-secondary w-full text-sm">إغلاق</button>
          </>
        ) : (
          <>
            <h3 className="mb-1 text-lg font-bold text-white">تغيير كلمة مرور الحساب</h3>
            <p className="mb-4 text-xs text-slate-500" dir="ltr">{userEmail}</p>
            {error && <p className="mb-2 text-xs text-danger-500">{error}</p>}
            <div className="mb-3">
              <label className="label-field">كلمة المرور الجديدة</label>
              <input
                type="password"
                dir="ltr"
                minLength={8}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="input-field text-sm"
                placeholder="8 أحرف على الأقل"
              />
            </div>
            <div className="mb-4">
              <label className="label-field">تأكيد كلمة المرور</label>
              <input
                type="password"
                dir="ltr"
                minLength={8}
                value={confirm}
                onChange={(e) => setConfirm(e.target.value)}
                className="input-field text-sm"
              />
            </div>
            <div className="flex gap-2">
              <button onClick={() => setOpen(false)} className="btn-secondary flex-1 text-sm">إلغاء</button>
              <button
                disabled={isPending || password.length < 8 || password !== confirm}
                onClick={() =>
                  startTransition(async () => {
                    setError(null);
                    try {
                      await resetMerchantPassword(tenantId, userId, password);
                      setDone(true);
                    } catch (e) {
                      setError(e instanceof Error ? e.message : "فشل تغيير كلمة المرور");
                    }
                  })
                }
                className="flex-1 rounded-lg bg-wa-500 px-4 py-2 text-sm font-semibold text-white transition hover:bg-wa-600 disabled:opacity-50"
              >
                {isPending ? "جارٍ الحفظ..." : "حفظ"}
              </button>
            </div>
            {password.length > 0 && password.length < 8 && (
              <p className="mt-2 text-xs text-danger-500">8 أحرف على الأقل</p>
            )}
            {confirm.length > 0 && password !== confirm && (
              <p className="mt-2 text-xs text-danger-500">كلمتا المرور غير متطابقتين</p>
            )}
          </>
        )}
      </div>
    </div>
  );
}
