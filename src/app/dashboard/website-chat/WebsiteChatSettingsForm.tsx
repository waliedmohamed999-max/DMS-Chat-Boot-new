"use client";

import { useState, useTransition } from "react";
import { updateWebsiteChatConfig } from "./actions";

/** غلاف عميل حول updateWebsiteChatConfig — نفس نمط AiAgentSettingsForm بالحرف (التقاط خطأ/نجاح
 * الحفظ بدل شاشة خطأ Next.js غير معالجة أو حفظ صامت بلا أي تأكيد مرئي). */
export function WebsiteChatSettingsForm({ defaultActive }: { defaultActive: boolean }) {
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [isPending, startTransition] = useTransition();

  function handleSubmit(formData: FormData) {
    setError(null);
    setSuccess(false);
    startTransition(async () => {
      try {
        await updateWebsiteChatConfig(formData);
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
          ✅ تم حفظ إعدادات شات الموقع بنجاح.
        </div>
      )}
      <label className="flex items-center gap-2 text-sm text-slate-200">
        <input type="checkbox" name="websiteWidgetActive" defaultChecked={defaultActive} className="h-4 w-4" />
        تفعيل ويدجت الشات على موقعي الخاص
      </label>
      <button type="submit" disabled={isPending} className="btn-primary w-full disabled:opacity-50">
        {isPending ? "جارٍ الحفظ..." : "حفظ"}
      </button>
    </form>
  );
}
