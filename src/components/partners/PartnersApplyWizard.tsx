"use client";

import { useRef, useState, useTransition } from "react";
import Link from "next/link";
import { submitPartnerApplication, type SubmitApplicationResult } from "@/app/partners/apply/actions";
import { useCaptureReferral } from "@/lib/affiliates/useReferralCapture";

type PublicPlan = {
  key: string;
  name: string;
  priceMonthlySar: number;
  maxUsers: number;
  maxWhatsappNumbers: number;
  maxMessagesPerMonth: number;
};

const ACTIVITY_TYPES = [
  "متجر إلكتروني", "مطعم أو كافيه", "عيادة أو مركز طبي", "صالون أو مركز تجميل",
  "خدمات لوجستية وشحن", "تعليم وتدريب", "عقارات", "أخرى",
];

type FormState = {
  activityType: string;
  storeName: string;
  ownerName: string;
  email: string;
  phone: string;
  city: string;
  planKey: string;
  termsAccepted: boolean;
  website: string; // حقل فخّ (honeypot) — يجب أن يبقى فارغاً؛ أي قيمة هنا تدل على تعبئة آلية (بوت)
};

const STEPS = ["نوع النشاط", "بيانات العمل", "اختر باقتك", "المراجعة والإرسال"] as const;

export function PartnersApplyWizard({ plans }: { plans: PublicPlan[] }) {
  useCaptureReferral();
  const [step, setStep] = useState(0);
  const [form, setForm] = useState<FormState>({
    activityType: "", storeName: "", ownerName: "", email: "", phone: "", city: "",
    planKey: plans[0]?.key ?? "", termsAccepted: false, website: "",
  });
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<SubmitApplicationResult | null>(null);
  const [isPending, startTransition] = useTransition();
  const renderedAtRef = useRef(Date.now());

  function update<K extends keyof FormState>(key: K, value: FormState[K]) {
    setForm((f) => ({ ...f, [key]: value }));
  }

  function validateStep(): string | null {
    if (step === 0 && !form.activityType) return "اختر نوع النشاط للمتابعة";
    if (step === 1) {
      if (!form.storeName.trim() || !form.ownerName.trim()) return "الاسم واسم النشاط مطلوبان";
      if (!/^\S+@\S+\.\S+$/.test(form.email)) return "بريد إلكتروني غير صالح";
      if (form.phone.trim().length < 8) return "رقم هاتف غير صالح";
      if (!form.city.trim()) return "المدينة مطلوبة";
    }
    if (step === 2 && !form.planKey) return "اختر باقة للمتابعة";
    if (step === 3 && !form.termsAccepted) return "يجب الموافقة على الشروط والأحكام";
    return null;
  }

  function next() {
    const err = validateStep();
    if (err) {
      setError(err);
      return;
    }
    setError(null);
    setStep((s) => Math.min(s + 1, STEPS.length - 1));
  }

  function back() {
    setError(null);
    setStep((s) => Math.max(s - 1, 0));
  }

  function submit() {
    const err = validateStep();
    if (err) {
      setError(err);
      return;
    }
    setError(null);
    startTransition(async () => {
      const fd = new FormData();
      fd.set("activityType", form.activityType);
      fd.set("storeName", form.storeName);
      fd.set("ownerName", form.ownerName);
      fd.set("email", form.email);
      fd.set("phone", form.phone);
      fd.set("city", form.city);
      fd.set("planKey", form.planKey);
      fd.set("termsAccepted", form.termsAccepted ? "on" : "");
      fd.set("formRenderedAt", String(renderedAtRef.current));
      fd.set("website", form.website);
      const res = await submitPartnerApplication(fd);
      setResult(res);
      if (!res.success) setError(res.error);
    });
  }

  if (result?.success) {
    return (
      <div className="card mx-auto max-w-lg p-8 text-center">
        <div className="mb-3 text-4xl">✅</div>
        <h2 className="mb-2 text-lg font-bold text-white">تم إرسال طلبك بنجاح!</h2>
        <p className="mb-4 text-sm text-slate-400">
          سيراجع فريقنا طلبك قريباً، وسنراسلك على بريدك الإلكتروني فور اتخاذ قرار.
        </p>
        <div className="mb-4 rounded-lg bg-navy-900 p-3 text-sm text-slate-300" dir="ltr">
          رقم الطلب: <span className="font-mono text-wa-400">{result.referenceId}</span>
        </div>
        <Link href="/partners/status" className="inline-block w-full rounded-lg bg-wa-500 px-4 py-2.5 text-center text-sm font-semibold text-white transition hover:bg-wa-600">
          تتبع حالة طلبك
        </Link>
      </div>
    );
  }

  const selectedPlan = plans.find((p) => p.key === form.planKey);

  return (
    <div className="card mx-auto max-w-lg p-6">
      <div className="mb-5 flex items-center gap-1.5">
        {STEPS.map((label, i) => (
          <div key={label} className={`h-1.5 flex-1 rounded-full ${i <= step ? "bg-wa-500" : "bg-navy-700"}`} />
        ))}
      </div>
      <p className="mb-4 text-xs font-medium text-slate-500">
        الخطوة {step + 1} من {STEPS.length} · {STEPS[step]}
      </p>

      {error && (
        <div className="mb-4 rounded-lg border border-danger-500/30 bg-danger-500/10 px-3 py-2 text-sm text-danger-500">
          {error}
        </div>
      )}

      {/* حقل فخّ (honeypot): مخفي بصرياً عن المستخدم الحقيقي عبر CSS، مُثبَّت دائماً بغض النظر عن
          الخطوة الحالية — بوتات تعبئة النماذج الآلية تميل لملء كل الحقول الموجودة في الصفحة. */}
      <input
        type="text"
        value={form.website}
        onChange={(e) => update("website", e.target.value)}
        tabIndex={-1}
        autoComplete="off"
        className="absolute -left-[9999px] h-0 w-0 opacity-0"
        aria-hidden="true"
      />

      {step === 0 && (
        <div className="space-y-2">
          <label className="label-field">ما نوع نشاطك التجاري؟</label>
          <div className="grid grid-cols-2 gap-2">
            {ACTIVITY_TYPES.map((type) => (
              <button
                key={type}
                type="button"
                onClick={() => update("activityType", type)}
                className={`rounded-lg border p-3 text-sm transition ${
                  form.activityType === type ? "border-wa-500 bg-wa-500/10 text-white" : "border-white/10 text-slate-300 hover:bg-white/5"
                }`}
              >
                {type}
              </button>
            ))}
          </div>
        </div>
      )}

      {step === 1 && (
        <div className="space-y-3">
          <div>
            <label className="label-field">اسم النشاط / المتجر</label>
            <input className="input-field" value={form.storeName} onChange={(e) => update("storeName", e.target.value)} placeholder="متجر الأناقة" />
          </div>
          <div>
            <label className="label-field">اسمك الكامل</label>
            <input className="input-field" value={form.ownerName} onChange={(e) => update("ownerName", e.target.value)} placeholder="اسمك الكامل" />
          </div>
          <div>
            <label className="label-field">البريد الإلكتروني</label>
            <input type="email" dir="ltr" className="input-field" value={form.email} onChange={(e) => update("email", e.target.value)} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="label-field">رقم الهاتف</label>
              <input dir="ltr" className="input-field" value={form.phone} onChange={(e) => update("phone", e.target.value)} placeholder="+9665xxxxxxxx" />
            </div>
            <div>
              <label className="label-field">المدينة</label>
              <input className="input-field" value={form.city} onChange={(e) => update("city", e.target.value)} placeholder="الرياض" />
            </div>
          </div>
        </div>
      )}

      {step === 2 && (
        <div className="space-y-2">
          <label className="label-field">اختر الباقة المناسبة لك</label>
          {plans.map((plan) => (
            <label
              key={plan.key}
              className={`block cursor-pointer rounded-lg border p-3 transition ${
                form.planKey === plan.key ? "border-wa-500 bg-wa-500/10" : "border-white/10 hover:bg-white/5"
              }`}
            >
              <input type="radio" name="planKey" value={plan.key} checked={form.planKey === plan.key} onChange={() => update("planKey", plan.key)} className="sr-only" />
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-semibold text-white">{plan.name}</p>
                  <p className="text-xs text-slate-500">
                    حتى {plan.maxUsers} مستخدمين · {plan.maxWhatsappNumbers} رقم واتساب · {plan.maxMessagesPerMonth.toLocaleString("ar-SA")} رسالة/شهر
                  </p>
                </div>
                <p className="text-lg font-bold text-wa-400">{plan.priceMonthlySar} ر.س</p>
              </div>
            </label>
          ))}
        </div>
      )}

      {step === 3 && (
        <div className="space-y-3">
          <div className="rounded-lg bg-navy-900 p-3 text-sm text-slate-300">
            <p><span className="text-slate-500">نوع النشاط:</span> {form.activityType}</p>
            <p><span className="text-slate-500">اسم النشاط:</span> {form.storeName}</p>
            <p><span className="text-slate-500">الاسم:</span> {form.ownerName}</p>
            <p dir="ltr"><span className="text-slate-500">البريد:</span> {form.email}</p>
            <p dir="ltr"><span className="text-slate-500">الهاتف:</span> {form.phone}</p>
            <p><span className="text-slate-500">المدينة:</span> {form.city}</p>
            <p><span className="text-slate-500">الباقة:</span> {selectedPlan?.name} ({selectedPlan?.priceMonthlySar} ر.س/شهرياً)</p>
          </div>
          <label className="flex items-start gap-2 text-sm text-slate-300">
            <input type="checkbox" checked={form.termsAccepted} onChange={(e) => update("termsAccepted", e.target.checked)} className="mt-0.5" />
            <span>أوافق على الشروط والأحكام وسياسة الخصوصية الخاصة بمنصة DMS.</span>
          </label>
        </div>
      )}

      <div className="mt-6 flex gap-2">
        {step > 0 && (
          <button type="button" onClick={back} disabled={isPending} className="btn-secondary flex-1">
            السابق
          </button>
        )}
        {step < STEPS.length - 1 ? (
          <button
            type="button"
            onClick={next}
            className="flex-1 rounded-lg bg-wa-500 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-wa-600"
          >
            التالي
          </button>
        ) : (
          <button
            type="button"
            onClick={submit}
            disabled={isPending}
            className="flex-1 rounded-lg bg-wa-500 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-wa-600 disabled:opacity-50"
          >
            {isPending ? "جارٍ الإرسال..." : "إرسال الطلب"}
          </button>
        )}
      </div>
    </div>
  );
}
