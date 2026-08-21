"use client";

import { useState, useTransition } from "react";
import { createAffiliateManually } from "./actions";
import { TIER_LABELS_AR, TIER_RATE_PERCENT } from "@/lib/affiliates/tiers";

/** نظير CreateTenantButton.tsx بالحرف — ينشئ حساب مسوّق فعّال فوراً (ACTIVE، بلا مرور بمركز
 * المراجعة)، مع كود إحالة مخصَّص اختياري (فارغ = توليد عشوائي تلقائي). كلمة المرور يحدّدها الأدمن
 * هنا ويبلّغها للمسوّق يدوياً — لا بريد إعداد حساب تلقائي لـAffiliate حالياً. */
export function CreateAffiliateButton() {
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function handleSubmit(formData: FormData) {
    setError(null);
    setSuccess(null);
    startTransition(async () => {
      const result = await createAffiliateManually(formData);
      if (result.success) {
        setSuccess(`تم إنشاء المسوّق بنجاح — كود الإحالة: ${result.referralCode}`);
      } else {
        setError(result.error);
      }
    });
  }

  return (
    <div className="relative">
      <button onClick={() => setOpen((v) => !v)} className="btn-primary text-xs">
        + إضافة مسوّق يدوياً
      </button>

      {open && (
        <div className="absolute left-0 top-full z-20 mt-2 w-96 rounded-xl2 border border-white/10 bg-slate-900 p-4 shadow-xl">
          <h3 className="mb-3 text-sm font-bold text-white">إضافة مسوّق يدوياً</h3>
          <p className="mb-3 text-xs text-slate-500">
            ينشئ حساباً نشطاً فوراً بلا مرور عبر مركز المراجعة — لشركاء تواصلتم معهم مباشرة. بلّغ المسوّق بكلمة المرور بنفسك.
          </p>

          {error && (
            <div className="mb-3 rounded-lg border border-danger-500/30 bg-danger-500/10 px-3 py-2 text-xs text-danger-500">{error}</div>
          )}
          {success && (
            <div className="mb-3 rounded-lg border border-success-500/30 bg-success-500/10 px-3 py-2 text-xs text-success-500">{success}</div>
          )}

          <form action={handleSubmit} className="space-y-2">
            <div>
              <label className="label-field text-xs">الاسم</label>
              <input name="name" required className="input-field text-sm" />
            </div>
            <div>
              <label className="label-field text-xs">البريد الإلكتروني</label>
              <input name="email" type="email" required className="input-field text-sm" dir="ltr" />
            </div>
            <div>
              <label className="label-field text-xs">الهاتف (اختياري)</label>
              <input name="phone" className="input-field text-sm" dir="ltr" />
            </div>
            <div>
              <label className="label-field text-xs">كلمة مرور مبدئية</label>
              <input name="password" type="text" required minLength={8} className="input-field text-sm" dir="ltr" placeholder="8 أحرف على الأقل" />
            </div>
            <div>
              <label className="label-field text-xs">كود الإحالة (اختياري — فارغ = توليد تلقائي)</label>
              <input name="referralCode" className="input-field text-sm" dir="ltr" maxLength={32} placeholder="مثال: AHMED-VIP" />
            </div>
            <div>
              <label className="label-field text-xs">المستوى</label>
              <select name="tier" defaultValue="STARTER" className="input-field text-sm">
                <option value="STARTER">{TIER_LABELS_AR.STARTER} ({TIER_RATE_PERCENT.STARTER}%)</option>
                <option value="GROWTH">{TIER_LABELS_AR.GROWTH} ({TIER_RATE_PERCENT.GROWTH}%)</option>
                <option value="ELITE">{TIER_LABELS_AR.ELITE} ({TIER_RATE_PERCENT.ELITE}%)</option>
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
