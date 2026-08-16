"use client";

import { useState, useTransition } from "react";
import { inviteInternalStaff } from "./actions";

/**
 * غلاف عميل حول `inviteInternalStaff` — الصفحة السابقة كانت تربط `<form action={inviteInternalStaff}>`
 * مباشرة على مكوّن خادم بلا أي التقاط للنتيجة، فأي فشل (بريد مكرَّر، تحقق بيانات) كان يظهر كشاشة خطأ
 * Next.js غير معالجة بدل رسالة ودّية داخل الصفحة. خلل حقيقي اكتُشف واختُبر فعلياً وأُصلح هنا.
 */
export function InviteStaffForm() {
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [isPending, startTransition] = useTransition();

  function handleSubmit(formData: FormData) {
    setError(null);
    setSuccess(false);
    startTransition(async () => {
      const result = await inviteInternalStaff(formData);
      if (result.success) {
        setSuccess(true);
      } else {
        setError(result.error);
      }
    });
  }

  return (
    <form action={handleSubmit} className="space-y-3">
      {error && (
        <div className="rounded-lg border border-danger-500/30 bg-danger-500/10 px-3 py-2 text-sm text-danger-500">{error}</div>
      )}
      {success && (
        <div className="rounded-lg border border-success-500/30 bg-success-500/10 px-3 py-2 text-sm text-success-500">
          تم إرسال الدعوة! سيصل العضو رابط إعداد حساب آمن على بريده الإلكتروني.
        </div>
      )}
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
          <option value="PLATFORM_SUPPORT">دعم فني (موافقات + انتحال هوية)</option>
          <option value="PLATFORM_BILLING">مالي (إيرادات فقط)</option>
        </select>
      </div>
      <button type="submit" disabled={isPending} className="btn-primary w-full">
        {isPending ? "جارٍ الإرسال..." : "إرسال الدعوة"}
      </button>
    </form>
  );
}
