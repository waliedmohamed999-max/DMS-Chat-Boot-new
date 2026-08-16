"use client";

import { useRef, useState, useTransition } from "react";
import { submitContactMessage, type ContactFormResult } from "./actions";
import { INQUIRY_TYPES } from "./constants";
import { CheckCircleIcon } from "@/components/marketing/ServiceIcons";

export function ContactForm() {
  const [result, setResult] = useState<ContactFormResult | null>(null);
  const [isPending, startTransition] = useTransition();
  const renderedAtRef = useRef(Date.now());
  const [website, setWebsite] = useState("");

  function handleSubmit(formData: FormData) {
    formData.set("formRenderedAt", String(renderedAtRef.current));
    formData.set("website", website);
    startTransition(async () => {
      setResult(await submitContactMessage(formData));
    });
  }

  if (result?.success) {
    return (
      <div className="rounded-2xl border border-wa-500/30 bg-wa-50 p-6 text-center dark:border-wa-500/20 dark:bg-wa-500/10">
        <CheckCircleIcon className="mx-auto mb-2 h-10 w-10 text-wa-500" />
        <p className="font-semibold text-slate-900 dark:text-white">تم إرسال رسالتك بنجاح!</p>
        <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">سيتواصل معك فريقنا في أقرب وقت.</p>
      </div>
    );
  }

  return (
    <form action={handleSubmit} className="space-y-4 rounded-2xl border border-slate-200 bg-white p-6 shadow-card dark:border-white/10 dark:bg-slate-900">
      {result && !result.success && (
        <div className="rounded-lg border border-danger-500/30 bg-danger-500/10 px-3 py-2 text-sm text-danger-500">{result.error}</div>
      )}
      <div>
        <label className="mb-1.5 block text-sm font-medium text-slate-700 dark:text-slate-300">نوع الاستفسار</label>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-5">
          {INQUIRY_TYPES.map((type, i) => (
            <label key={type} className="cursor-pointer">
              <input type="radio" name="inquiryType" value={type} defaultChecked={i === 0} className="peer sr-only" />
              <span className="block rounded-lg border border-slate-300 px-2 py-2 text-center text-xs font-medium text-slate-600 transition peer-checked:border-wa-500 peer-checked:bg-wa-500/10 peer-checked:text-wa-600 dark:border-white/15 dark:text-slate-300 dark:peer-checked:text-wa-400">
                {type}
              </span>
            </label>
          ))}
        </div>
      </div>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div>
          <label className="mb-1.5 block text-sm font-medium text-slate-700 dark:text-slate-300">الاسم</label>
          <input name="name" required className="w-full rounded-lg border border-slate-300 bg-white px-3.5 py-2.5 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-wa-400 dark:border-white/15 dark:bg-slate-800 dark:text-white" />
        </div>
        <div>
          <label className="mb-1.5 block text-sm font-medium text-slate-700 dark:text-slate-300">البريد الإلكتروني</label>
          <input name="email" type="email" dir="ltr" required className="w-full rounded-lg border border-slate-300 bg-white px-3.5 py-2.5 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-wa-400 dark:border-white/15 dark:bg-slate-800 dark:text-white" />
        </div>
        <div>
          <label className="mb-1.5 block text-sm font-medium text-slate-700 dark:text-slate-300">رقم الجوال</label>
          <input name="phone" dir="ltr" required className="w-full rounded-lg border border-slate-300 bg-white px-3.5 py-2.5 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-wa-400 dark:border-white/15 dark:bg-slate-800 dark:text-white" placeholder="+9665xxxxxxxx" />
        </div>
        <div>
          <label className="mb-1.5 block text-sm font-medium text-slate-700 dark:text-slate-300">نوع النشاط</label>
          <input name="activityType" required className="w-full rounded-lg border border-slate-300 bg-white px-3.5 py-2.5 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-wa-400 dark:border-white/15 dark:bg-slate-800 dark:text-white" placeholder="متجر إلكتروني، عيادة..." />
        </div>
      </div>
      <div>
        <label className="mb-1.5 block text-sm font-medium text-slate-700 dark:text-slate-300">رسالتك</label>
        <textarea name="message" required rows={4} className="w-full rounded-lg border border-slate-300 bg-white px-3.5 py-2.5 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-wa-400 dark:border-white/15 dark:bg-slate-800 dark:text-white" />
      </div>

      {/* حقل فخّ (honeypot) مخفي بصرياً — نفس نمط partners/apply */}
      <input
        type="text"
        value={website}
        onChange={(e) => setWebsite(e.target.value)}
        tabIndex={-1}
        autoComplete="off"
        aria-hidden="true"
        className="absolute -left-[9999px] h-0 w-0 opacity-0"
      />

      <button type="submit" disabled={isPending} className="w-full rounded-lg bg-wa-500 px-4 py-3 text-sm font-bold text-white transition hover:bg-wa-600 disabled:opacity-50">
        {isPending ? "جارٍ الإرسال..." : "أرسل رسالتك"}
      </button>
    </form>
  );
}
