"use client";

import { useActionState } from "react";
import { finishMyMigration, sendMigrationFeedback } from "./migrationActions";

type Props = {
  status: "INVITED" | "D360_CONNECTED" | "COMPLETED" | "CANCELLED" | null;
  metaConnected: boolean;
  d360Connected: boolean;
  d360Ready: boolean;
  hasFeedback: boolean;
};

/** بطاقة نقل التاجر من ربط Meta المباشر إلى واتساب الرسمي عبر DMS (360dialog) — خطوات + إنهاء + تقييم. */
export function MigrationCard({ status, metaConnected, d360Connected, d360Ready, hasFeedback }: Props) {
  const [finishState, finish, finishing] = useActionState(finishMyMigration, null);
  const [fbState, feedback, sending] = useActionState(sendMigrationFeedback, null);

  if (status === "COMPLETED") {
    if (hasFeedback || fbState?.ok) {
      return fbState?.ok ? <div className="card p-4 text-sm text-success-500">{fbState.message}</div> : null;
    }
    return (
      <div className="card space-y-3 p-5">
        <p className="font-semibold text-white">✅ اكتمل نقل رقمك إلى واتساب الرسمي عبر DMS — كيف كانت التجربة؟</p>
        <form action={feedback} className="space-y-3">
          <div className="flex flex-wrap gap-3 text-sm text-slate-300">
            {[1, 2, 3, 4, 5].map((n) => (
              <label key={n} className="flex items-center gap-1">
                <input type="radio" name="rating" value={n} required /> {"★".repeat(n)}
              </label>
            ))}
          </div>
          <textarea name="comment" maxLength={1000} rows={2} placeholder="ملاحظاتك (اختياري)" className="input-field" />
          <div className="flex items-center gap-3">
            <button disabled={sending} className="btn-primary text-sm disabled:opacity-50">{sending ? "…" : "إرسال التقييم"}</button>
            {fbState && !fbState.ok && <span className="text-xs text-danger-500">{fbState.message}</span>}
          </div>
        </form>
      </div>
    );
  }
  // النقل تدريجي: البطاقة تظهر فقط لمن دعاه فريق المنصة (أو بدأ الربط بنفسه)، لا لكل تجار Meta دفعة واحدة.
  if (!metaConnected || !status || status === "CANCELLED") return null;

  const steps = [
    { done: false, text: "من WhatsApp Manager في Meta: عطّل التحقق بخطوتين (PIN) لرقمك — شرط لنقل الرقم." },
    { done: d360Connected, text: "اضغط \"🟢 ربط رقم واتساب\" في بطاقة واتساب الرسمي بالأسفل واختر نفس رقمك." },
    { done: d360Ready, text: "انتظر تفعيل الرقم (دقائق إلى ساعات) واشحن محفظة الرسائل." },
    { done: false, text: "اضغط \"إنهاء النقل\" لفصل الربط القديم." },
  ];

  return (
    <div className="card space-y-3 border border-accent-500/30 p-5">
      <div>
        <p className="font-semibold text-white">🔀 انقل رقمك إلى واتساب الرسمي عبر DMS</p>
        <p className="mt-1 text-sm text-slate-400">
          بلا بطاقة دفع في Meta: الرسائل تُدفع من محفظتك بسعر واضح، والرد على العملاء داخل 24 ساعة مجاني. نفس رقمك ومحادثاتك،
          وربطك الحالي يبقى يعمل حتى تنهي النقل.
        </p>
      </div>
      <ol className="space-y-1 text-sm">
        {steps.map((s, i) => (
          <li key={i} className={s.done ? "text-success-500" : "text-slate-300"}>{s.done ? "✓" : `${i + 1}.`} {s.text}</li>
        ))}
      </ol>
      {d360Ready && (
        <form
          action={finish}
          onSubmit={(e) => { if (!confirm("فصل ربط Meta القديم؟ سيكون الإرسال عبر واتساب الرسمي (DMS) فقط.")) e.preventDefault(); }}
          className="flex items-center gap-3"
        >
          <button disabled={finishing} className="btn-primary text-sm disabled:opacity-50">{finishing ? "…" : "إنهاء النقل"}</button>
          {finishState && <span className={`text-xs ${finishState.ok ? "text-success-500" : "text-danger-500"}`}>{finishState.message}</span>}
        </form>
      )}
      {status === "D360_CONNECTED" && !d360Ready && <p className="text-xs text-warning-500">⏳ رقمك على 360dialog قيد التفعيل — زر الإنهاء يظهر عند الجاهزية.</p>}
    </div>
  );
}
