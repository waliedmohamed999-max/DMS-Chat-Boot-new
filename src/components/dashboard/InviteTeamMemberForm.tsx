"use client";

import { useState, useTransition } from "react";

export function InviteTeamMemberForm({ inviteTeamMember }: { inviteTeamMember: (formData: FormData) => Promise<void> }) {
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function handleSubmit(formData: FormData) {
    setError(null);
    startTransition(async () => {
      try {
        await inviteTeamMember(formData);
      } catch (e) {
        setError(e instanceof Error ? e.message : "تعذّرت دعوة العضو");
      }
    });
  }

  return (
    <form action={handleSubmit} className="space-y-3">
      {error && <p className="rounded-lg bg-danger-500/10 px-3 py-2 text-xs text-danger-500">{error}</p>}
      <div>
        <label className="label-field">الاسم</label>
        <input name="name" required className="input-field" />
      </div>
      <div>
        <label className="label-field">البريد الإلكتروني</label>
        <input name="email" type="email" required className="input-field" dir="ltr" />
      </div>
      <div>
        <label className="label-field">الدور</label>
        <select name="role" className="input-field">
          <option value="ADMIN">مدير</option>
          <option value="AGENT">موظف</option>
        </select>
      </div>
      <button type="submit" disabled={isPending} className="btn-primary w-full">
        {isPending ? "جارٍ الإرسال..." : "إرسال الدعوة"}
      </button>
    </form>
  );
}
