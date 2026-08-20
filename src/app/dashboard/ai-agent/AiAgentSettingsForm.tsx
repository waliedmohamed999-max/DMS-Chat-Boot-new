"use client";

import { useState, useTransition } from "react";
import { updateAiAgentConfig } from "./actions";

/**
 * غلاف عميل حول `updateAiAgentConfig` — كان النموذج مربوطاً `<form action={updateAiAgentConfig}>`
 * مباشرة على مكوّن خادم بلا أي التقاط للنتيجة، فأي فشل (تجاوز حد الباقة، صلاحية ناقصة) كان يظهر
 * كشاشة خطأ Next.js غير معالجة، وحتى عند النجاح لا يوجد أي تأكيد مرئي (القيم المحفوظة تبدو مطابقة
 * لما كتبه التاجر للتو، فيبدو الأمر وكأن الحفظ لم يحدث إطلاقاً). نفس الخلل المُكتشَف والمُصلَح سابقاً
 * في InviteTeamMemberForm/InviteStaffForm، بنفس الحل هنا تحديداً.
 */
export function AiAgentSettingsForm({ children }: { children: React.ReactNode }) {
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [isPending, startTransition] = useTransition();

  function handleSubmit(formData: FormData) {
    setError(null);
    setSuccess(false);
    startTransition(async () => {
      try {
        await updateAiAgentConfig(formData);
        setSuccess(true);
      } catch (e) {
        setError(e instanceof Error ? e.message : "تعذّر حفظ الإعدادات");
      }
    });
  }

  return (
    <form action={handleSubmit} className="card max-w-3xl space-y-4 p-6">
      {error && (
        <div className="rounded-lg border border-danger-500/30 bg-danger-500/10 px-3 py-2 text-sm text-danger-500">{error}</div>
      )}
      {success && (
        <div className="rounded-lg border border-success-500/30 bg-success-500/10 px-3 py-2 text-sm text-success-500">
          ✅ تم حفظ إعدادات الموظف الذكي بنجاح.
        </div>
      )}
      {children}
      <button type="submit" disabled={isPending} className="btn-primary w-full disabled:opacity-50">
        {isPending ? "جارٍ الحفظ..." : "حفظ إعدادات الموظف الذكي"}
      </button>
    </form>
  );
}
