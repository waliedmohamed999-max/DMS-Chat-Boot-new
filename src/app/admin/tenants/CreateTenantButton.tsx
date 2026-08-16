"use client";

import { useState, useTransition } from "react";
import { createTenantManually } from "./actions";

type Plan = { id: string; name: string; priceMonthlySar: number };
type Prefill = { leadId: string; storeName: string; ownerName: string; ownerEmail: string; ownerPhone: string } | null;

export function CreateTenantButton({ plans, prefill = null }: { plans: Plan[]; prefill?: Prefill }) {
  const [open, setOpen] = useState(!!prefill);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [isPending, startTransition] = useTransition();

  function handleSubmit(formData: FormData) {
    setError(null);
    setSuccess(false);
    startTransition(async () => {
      const result = await createTenantManually(formData);
      if (result.success) {
        setSuccess(true);
      } else {
        setError(result.error);
      }
    });
  }

  return (
    <div className="relative">
      <button onClick={() => setOpen((v) => !v)} className="btn-primary text-xs">
        + إضافة تاجر مباشرة
      </button>

      {open && (
        <div className="absolute left-0 top-full z-20 mt-2 w-96 rounded-xl2 border border-white/10 bg-slate-900 p-4 shadow-xl">
          <h3 className="mb-3 text-sm font-bold text-white">إضافة تاجر مباشرة</h3>
          <p className="mb-3 text-xs text-slate-500">
            {prefill
              ? "الحقول مُعبَّأة من رسالة التواصل المحوَّلة — راجعها قبل الإنشاء."
              : 'ينشئ حساباً فعّالاً فوراً بلا مرور عبر مركز الموافقات — لمبيعات الهاتف، عملاء VIP، أو تجار تجريبيين.'}
            {" "}سيصل للمالك نفس بريد "أكمل إعداد حسابك" المرسَل لأي تاجر آخر.
          </p>

          {error && (
            <div className="mb-3 rounded-lg border border-danger-500/30 bg-danger-500/10 px-3 py-2 text-xs text-danger-500">{error}</div>
          )}
          {success && (
            <div className="mb-3 rounded-lg border border-success-500/30 bg-success-500/10 px-3 py-2 text-xs text-success-500">
              تم إنشاء الحساب بنجاح، ووصل بريد إعداد الحساب للمالك.
            </div>
          )}

          <form action={handleSubmit} className="space-y-2">
            {prefill && <input type="hidden" name="leadId" value={prefill.leadId} />}
            <div>
              <label className="label-field text-xs">اسم المتجر</label>
              <input name="storeName" required defaultValue={prefill?.storeName ?? ""} className="input-field text-sm" />
            </div>
            <div>
              <label className="label-field text-xs">اسم المالك</label>
              <input name="ownerName" required defaultValue={prefill?.ownerName ?? ""} className="input-field text-sm" />
            </div>
            <div>
              <label className="label-field text-xs">بريد المالك الإلكتروني</label>
              <input name="ownerEmail" type="email" required defaultValue={prefill?.ownerEmail ?? ""} className="input-field text-sm" dir="ltr" />
            </div>
            <div>
              <label className="label-field text-xs">رقم تواصل المالك (اختياري)</label>
              <input name="ownerPhone" defaultValue={prefill?.ownerPhone ?? ""} className="input-field text-sm" dir="ltr" />
            </div>
            <div>
              <label className="label-field text-xs">الباقة</label>
              <select name="planId" required className="input-field text-sm">
                <option value="">اختر باقة...</option>
                {plans.map((p) => (
                  <option key={p.id} value={p.id}>{p.name} — {p.priceMonthlySar} ر.س/شهرياً</option>
                ))}
              </select>
            </div>
            <div className="flex gap-2 pt-1">
              <button type="submit" disabled={isPending} className="btn-primary flex-1 text-xs">
                {isPending ? "جارٍ الإنشاء..." : "إنشاء الحساب"}
              </button>
              <button type="button" onClick={() => setOpen(false)} className="btn-secondary text-xs">إغلاق</button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}
