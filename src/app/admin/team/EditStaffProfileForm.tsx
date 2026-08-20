"use client";

import { useState, useTransition } from "react";
import { updateInternalStaffProfile } from "./actions";

export function EditStaffProfileForm({ userId, name, email }: { userId: string; name: string; email: string }) {
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function handleSubmit(formData: FormData) {
    setError(null);
    startTransition(async () => {
      const result = await updateInternalStaffProfile(userId, formData);
      if (result.success) setOpen(false);
      else setError(result.error);
    });
  }

  if (!open) {
    return (
      <button type="button" onClick={() => setOpen(true)} className="badge border border-white/10 text-slate-300 hover:bg-white/5">
        ✏️ تعديل البيانات
      </button>
    );
  }

  return (
    <form action={handleSubmit} className="mt-2 w-full space-y-2 rounded-lg border border-white/10 bg-navy-800 p-3">
      {error && <p className="rounded-lg bg-danger-500/10 px-2 py-1 text-xs text-danger-500">{error}</p>}
      <div>
        <label className="label-field text-xs">الاسم</label>
        <input name="name" defaultValue={name} required className="input-field text-sm" />
      </div>
      <div>
        <label className="label-field text-xs">البريد الإلكتروني</label>
        <input name="email" type="email" defaultValue={email} required className="input-field text-sm" dir="ltr" />
      </div>
      <div className="flex gap-2">
        <button type="button" onClick={() => setOpen(false)} disabled={isPending} className="btn-secondary flex-1 text-xs disabled:opacity-50">
          إلغاء
        </button>
        <button type="submit" disabled={isPending} className="btn-primary flex-1 text-xs disabled:opacity-50">
          {isPending ? "جارٍ الحفظ..." : "حفظ"}
        </button>
      </div>
    </form>
  );
}
