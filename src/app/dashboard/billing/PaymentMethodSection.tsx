"use client";

import { useState, useTransition } from "react";
import { updatePaymentMethod } from "./actions";

type PaymentMethod = { brand: string; last4: string; expiryMonth: number; expiryYear: number } | null;

const BRAND_ICON: Record<string, string> = { Visa: "💳", Mastercard: "💳", Mada: "🇸🇦", "بطاقة": "💳" };

export function PaymentMethodSection({ paymentMethod, canManage }: { paymentMethod: PaymentMethod; canManage: boolean }) {
  const [editing, setEditing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function handleSubmit(formData: FormData) {
    setError(null);
    startTransition(async () => {
      const res = await updatePaymentMethod({
        cardNumber: String(formData.get("cardNumber") ?? ""),
        expiryMonth: parseInt(String(formData.get("expiryMonth") ?? "0"), 10),
        expiryYear: parseInt(String(formData.get("expiryYear") ?? "0"), 10),
        cvv: String(formData.get("cvv") ?? ""),
      });
      if (!res.success) setError(res.error);
      else setEditing(false);
    });
  }

  return (
    <div className="card p-5">
      <div className="mb-3 flex items-center justify-between">
        <h2 className="font-semibold text-white">طريقة الدفع</h2>
        <span className="badge bg-warning-500/10 text-xs text-warning-500">🧪 وضع Sandbox — لا مزوّد دفع حقيقي مربوط بعد</span>
      </div>

      {!editing && (
        <>
          {paymentMethod ? (
            <div className="flex items-center justify-between rounded-lg border border-white/5 bg-navy-900 p-3">
              <div className="flex items-center gap-3">
                <span className="text-xl">{BRAND_ICON[paymentMethod.brand] ?? "💳"}</span>
                <div>
                  <p className="text-sm text-slate-200" dir="ltr">{paymentMethod.brand} •••• •••• •••• {paymentMethod.last4}</p>
                  <p className="text-xs text-slate-500" dir="ltr">تنتهي {String(paymentMethod.expiryMonth).padStart(2, "0")}/{paymentMethod.expiryYear}</p>
                </div>
              </div>
              {canManage && (
                <button onClick={() => setEditing(true)} className="btn-secondary text-xs">تحديث</button>
              )}
            </div>
          ) : (
            <div className="rounded-lg border border-dashed border-white/10 p-4 text-center text-sm text-slate-500">
              لا توجد طريقة دفع محفوظة بعد.
              {canManage && (
                <button onClick={() => setEditing(true)} className="btn-primary mt-3 block w-full text-xs">إضافة طريقة دفع</button>
              )}
            </div>
          )}
        </>
      )}

      {editing && (
        <form action={handleSubmit} className="space-y-2 rounded-lg border border-white/10 bg-navy-900 p-3">
          <p className="text-xs text-slate-400">
            🧪 نموذج اختبار (Sandbox) — لا تُدخِل بيانات بطاقة حقيقية. لا يُخزَّن رقم البطاقة الكامل أبداً، فقط آخر 4 أرقام.
          </p>
          <input name="cardNumber" required placeholder="رقم البطاقة" className="input-field text-sm" dir="ltr" maxLength={19} />
          <div className="grid grid-cols-3 gap-2">
            <input name="expiryMonth" type="number" min={1} max={12} required placeholder="شهر" className="input-field text-sm" dir="ltr" />
            <input name="expiryYear" type="number" min={2024} required placeholder="سنة" className="input-field text-sm" dir="ltr" />
            <input name="cvv" required placeholder="CVV" className="input-field text-sm" dir="ltr" maxLength={4} />
          </div>
          {error && <p className="text-xs text-danger-500">{error}</p>}
          <div className="flex gap-2">
            <button type="submit" disabled={isPending} className="btn-primary flex-1 text-xs disabled:opacity-50">
              {isPending ? "جارٍ الحفظ..." : "حفظ"}
            </button>
            <button type="button" onClick={() => setEditing(false)} className="btn-secondary text-xs">إلغاء</button>
          </div>
        </form>
      )}
    </div>
  );
}
