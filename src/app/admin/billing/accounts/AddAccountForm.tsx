"use client";

import { useState, useTransition } from "react";
import { addChartOfAccountsEntry } from "../actions";

export function AddAccountForm({ parentOptions }: { parentOptions: { code: string; name: string }[] }) {
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [isPending, startTransition] = useTransition();

  function handleSubmit(formData: FormData) {
    setError(null);
    setSuccess(false);
    startTransition(async () => {
      const result = await addChartOfAccountsEntry(formData);
      if (result.success) setSuccess(true);
      else setError(result.error);
    });
  }

  return (
    <form action={handleSubmit} className="flex flex-wrap items-end gap-2">
      {error && <div className="w-full rounded-lg border border-danger-500/30 bg-danger-500/10 px-3 py-2 text-xs text-danger-500">{error}</div>}
      {success && <div className="w-full rounded-lg border border-success-500/30 bg-success-500/10 px-3 py-2 text-xs text-success-500">تمت إضافة الحساب بنجاح.</div>}
      <div>
        <label className="label-field text-xs">الحساب الأب</label>
        <select name="parentCode" required className="input-field text-sm">
          <option value="">اختر...</option>
          {parentOptions.map((p) => <option key={p.code} value={p.code}>{p.name} ({p.code})</option>)}
        </select>
      </div>
      <div>
        <label className="label-field text-xs">اسم الحساب الجديد</label>
        <input name="name" required className="input-field text-sm" />
      </div>
      <button type="submit" disabled={isPending} className="btn-primary text-xs">
        {isPending ? "جارٍ الإضافة..." : "+ إضافة"}
      </button>
    </form>
  );
}
