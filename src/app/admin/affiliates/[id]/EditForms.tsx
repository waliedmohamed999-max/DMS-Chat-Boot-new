"use client";

import { useState, useTransition } from "react";
import { updateAffiliateReferralCode, updateAffiliateProfile, updateAffiliatePayoutInfo } from "../actions";
import type { AffiliatePayoutDetails } from "@/lib/affiliates/payoutDetails";

/** نفس نمط AiAgentSettingsForm/WebsiteChatSettingsForm بالحرف — التقاط خطأ/نجاح الحفظ بدل شاشة خطأ
 * Next.js غير معالَجة أو حفظ صامت بلا أي تأكيد مرئي. مُشترَك بين الأشكال الثلاثة أدناه. */
function useFormFeedback() {
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [isPending, startTransition] = useTransition();

  function run(fn: () => Promise<void>) {
    setError(null);
    setSuccess(false);
    startTransition(async () => {
      try {
        await fn();
        setSuccess(true);
      } catch (e) {
        setError(e instanceof Error ? e.message : "حدث خطأ غير متوقع");
      }
    });
  }

  return { error, success, isPending, run };
}

function FormFeedback({ error, success, successMessage }: { error: string | null; success: boolean; successMessage: string }) {
  return (
    <>
      {error && <div className="rounded-lg border border-danger-500/30 bg-danger-500/10 px-3 py-2 text-xs text-danger-500">{error}</div>}
      {success && <div className="rounded-lg border border-success-500/30 bg-success-500/10 px-3 py-2 text-xs text-success-500">{successMessage}</div>}
    </>
  );
}

/** تعديل كود الإحالة — كان غير قابل للتعديل إطلاقاً سابقاً (schema.prisma كان يوثّق هذا صراحة). */
export function ReferralCodeForm({ affiliateId, currentCode }: { affiliateId: string; currentCode: string }) {
  const { error, success, isPending, run } = useFormFeedback();
  const [code, setCode] = useState(currentCode);

  function handleSubmit(formData: FormData) {
    run(() => updateAffiliateReferralCode(affiliateId, String(formData.get("referralCode") ?? "")));
  }

  return (
    <form action={handleSubmit} className="space-y-2">
      <FormFeedback error={error} success={success} successMessage="✅ تم تحديث كود الإحالة — أي رابط منشور بالكود السابق لن يعمل بعد الآن." />
      <input
        name="referralCode" value={code} onChange={(e) => setCode(e.target.value.toUpperCase())}
        className="input-field text-sm" dir="ltr" maxLength={32} required
      />
      <p className="text-xs text-slate-500">أحرف إنجليزية/أرقام فقط (يُسمح أيضاً بـ - و _)، من 3 إلى 32 حرفاً. تغييره يُعطِّل فوراً أي رابط منشور بالكود القديم.</p>
      <button type="submit" disabled={isPending} className="btn-secondary text-xs disabled:opacity-50">
        {isPending ? "جارٍ الحفظ..." : "حفظ الكود"}
      </button>
    </form>
  );
}

/** تعديل البيانات الشخصية الأساسية. */
export function ProfileForm({ affiliateId, name, email, phone }: { affiliateId: string; name: string; email: string; phone: string | null }) {
  const { error, success, isPending, run } = useFormFeedback();

  function handleSubmit(formData: FormData) {
    run(() => updateAffiliateProfile(affiliateId, formData));
  }

  return (
    <form action={handleSubmit} className="space-y-2">
      <FormFeedback error={error} success={success} successMessage="✅ تم حفظ البيانات الشخصية." />
      <div>
        <label className="label-field text-xs">الاسم</label>
        <input name="name" defaultValue={name} required className="input-field text-sm" />
      </div>
      <div>
        <label className="label-field text-xs">البريد الإلكتروني</label>
        <input name="email" type="email" defaultValue={email} required dir="ltr" className="input-field text-sm" />
      </div>
      <div>
        <label className="label-field text-xs">الهاتف</label>
        <input name="phone" defaultValue={phone ?? ""} dir="ltr" className="input-field text-sm" />
      </div>
      <button type="submit" disabled={isPending} className="btn-secondary text-xs disabled:opacity-50">
        {isPending ? "جارٍ الحفظ..." : "حفظ البيانات الشخصية"}
      </button>
    </form>
  );
}

/** تعديل سجل بيانات الصرف المرجعي — راجع تعليق lib/affiliates/payoutDetails.ts للفرق عن
 * Payout.method لكل طلب صرف على حدة. */
export function PayoutInfoForm({
  affiliateId, payoutMethod, details,
}: {
  affiliateId: string;
  payoutMethod: string | null;
  details: AffiliatePayoutDetails | null;
}) {
  const { error, success, isPending, run } = useFormFeedback();
  const [paymentType, setPaymentType] = useState<"bank" | "wallet">(details?.paymentType ?? "bank");

  function handleSubmit(formData: FormData) {
    run(() => updateAffiliatePayoutInfo(affiliateId, formData));
  }

  return (
    <form action={handleSubmit} className="space-y-3">
      <FormFeedback error={error} success={success} successMessage="✅ تم حفظ بيانات الصرف." />
      <div>
        <label className="label-field text-xs">طريقة الاستلام (وصف مختصر)</label>
        <input name="payoutMethod" defaultValue={payoutMethod ?? ""} placeholder="مثال: تحويل بنكي — الأهلي" className="input-field text-sm" />
      </div>

      <div className="flex gap-3 text-xs text-slate-300">
        <label className="flex items-center gap-1.5">
          <input type="radio" name="paymentType" value="bank" checked={paymentType === "bank"} onChange={() => setPaymentType("bank")} />
          تحويل بنكي
        </label>
        <label className="flex items-center gap-1.5">
          <input type="radio" name="paymentType" value="wallet" checked={paymentType === "wallet"} onChange={() => setPaymentType("wallet")} />
          محفظة إلكترونية
        </label>
      </div>

      {paymentType === "bank" ? (
        <div className="space-y-2 rounded-lg border border-white/5 p-3">
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="label-field text-xs">اسم البنك</label>
              <input name="bankName" defaultValue={details?.bankName ?? ""} className="input-field text-sm" />
            </div>
            <div>
              <label className="label-field text-xs">اسم صاحب الحساب</label>
              <input name="accountHolderName" defaultValue={details?.accountHolderName ?? ""} className="input-field text-sm" />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="label-field text-xs">رقم الحساب</label>
              <input name="accountNumber" defaultValue={details?.accountNumber ?? ""} dir="ltr" className="input-field text-sm" />
            </div>
            <div>
              <label className="label-field text-xs">IBAN</label>
              <input name="iban" defaultValue={details?.iban ?? ""} dir="ltr" className="input-field text-sm" />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="label-field text-xs">SWIFT/BIC Code</label>
              <input name="swiftCode" defaultValue={details?.swiftCode ?? ""} dir="ltr" className="input-field text-sm" />
            </div>
            <div>
              <label className="label-field text-xs">اسم/عنوان الفرع</label>
              <input name="branchName" defaultValue={details?.branchName ?? ""} className="input-field text-sm" />
            </div>
          </div>
          <div>
            <label className="label-field text-xs">رقم الهوية/الإقامة لصاحب الحساب</label>
            <input name="nationalId" defaultValue={details?.nationalId ?? ""} dir="ltr" className="input-field text-sm" />
          </div>
        </div>
      ) : (
        <div className="space-y-2 rounded-lg border border-white/5 p-3">
          <div>
            <label className="label-field text-xs">مزوّد المحفظة</label>
            <input name="walletProvider" defaultValue={details?.walletProvider ?? ""} placeholder="مثال: STC Pay" className="input-field text-sm" />
          </div>
          <div>
            <label className="label-field text-xs">رقم المحفظة/الجوال</label>
            <input name="walletNumber" defaultValue={details?.walletNumber ?? ""} dir="ltr" className="input-field text-sm" />
          </div>
        </div>
      )}

      <div>
        <label className="label-field text-xs">ملاحظات</label>
        <textarea name="notes" defaultValue={details?.notes ?? ""} rows={2} className="input-field text-sm" />
      </div>
      <button type="submit" disabled={isPending} className="btn-secondary text-xs disabled:opacity-50">
        {isPending ? "جارٍ الحفظ..." : "حفظ بيانات الصرف"}
      </button>
    </form>
  );
}
