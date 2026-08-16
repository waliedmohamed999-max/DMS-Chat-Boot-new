"use client";

import { useState, useTransition } from "react";
import { connectMetaManualAction, resubscribeWebhookAction } from "@/app/dashboard/integrations/actions";

type QualityRating = "GREEN" | "YELLOW" | "RED" | "UNKNOWN";

const QUALITY_LABELS: Record<QualityRating, { label: string; className: string }> = {
  GREEN: { label: "🟢 ممتازة", className: "text-success-500" },
  YELLOW: { label: "🟡 متوسطة", className: "text-warning-500" },
  RED: { label: "🔴 منخفضة", className: "text-danger-500" },
  UNKNOWN: { label: "غير معروفة بعد", className: "text-slate-500" },
};

export function MetaConnectionWizard({ connectSandbox }: { connectSandbox: () => Promise<void> }) {
  const [method, setMethod] = useState<"idle" | "embedded" | "manual">("idle");
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [wabaId, setWabaId] = useState("");
  const [phoneNumberId, setPhoneNumberId] = useState("");
  const [accessToken, setAccessToken] = useState("");

  function handleEmbedded() {
    setError(null);
    startTransition(async () => {
      try {
        await connectSandbox();
      } catch (e) {
        setError(e instanceof Error ? e.message : "تعذّر الربط");
      }
    });
  }

  function handleManualSubmit() {
    setError(null);
    startTransition(async () => {
      const result = await connectMetaManualAction({ wabaId, phoneNumberId, accessToken });
      if (!result.success) setError(result.error ?? "تعذّر الربط");
    });
  }

  if (method === "idle") {
    return (
      <div className="space-y-2">
        {error && <p className="rounded-lg bg-danger-500/10 px-2 py-1.5 text-[11px] text-danger-500">{error}</p>}
        <button onClick={() => setMethod("embedded")} className="btn-primary w-full text-xs">
          🔗 ربط عبر Facebook (موصى به)
        </button>
        <button onClick={() => setMethod("manual")} className="btn-secondary w-full text-xs">
          ⚙️ ربط يدوي (WABA ID / Access Token)
        </button>
      </div>
    );
  }

  if (method === "embedded") {
    return (
      <div className="space-y-2 rounded-lg border border-white/10 p-3">
        <p className="text-xs text-slate-400">
          سيتم فتح تسجيل الدخول المضمّن من Meta (Embedded Signup) لربط رقم واتساب أعمالك مباشرة دون مغادرة هذه الصفحة.
        </p>
        {error && <p className="rounded-lg bg-danger-500/10 px-2 py-1.5 text-[11px] text-danger-500">{error}</p>}
        <div className="flex gap-2">
          <button onClick={handleEmbedded} disabled={isPending} className="btn-primary flex-1 text-xs">
            {isPending ? "جارٍ الربط..." : "متابعة الربط عبر Facebook"}
          </button>
          <button onClick={() => setMethod("idle")} className="btn-secondary text-xs">رجوع</button>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-2 rounded-lg border border-white/10 p-3">
      {error && <p className="rounded-lg bg-danger-500/10 px-2 py-1.5 text-[11px] text-danger-500">{error}</p>}
      <input value={wabaId} onChange={(e) => setWabaId(e.target.value)} className="input-field !py-1.5 text-xs" placeholder="WABA ID" dir="ltr" />
      <input value={phoneNumberId} onChange={(e) => setPhoneNumberId(e.target.value)} className="input-field !py-1.5 text-xs" placeholder="Phone Number ID" dir="ltr" />
      <input value={accessToken} onChange={(e) => setAccessToken(e.target.value)} type="password" className="input-field !py-1.5 text-xs" placeholder="Access Token" dir="ltr" />
      <div className="flex gap-2">
        <button onClick={handleManualSubmit} disabled={isPending} className="btn-primary flex-1 text-xs">
          {isPending ? "جارٍ التحقق..." : "تحقق واربط"}
        </button>
        <button onClick={() => setMethod("idle")} className="btn-secondary text-xs">رجوع</button>
      </div>
    </div>
  );
}

export function ConnectionHealthPanel({
  status,
  pendingVerification,
  qualityRating,
  messagingTier,
  webhookSubscribed,
  displayPhoneNumber,
}: {
  status: string;
  pendingVerification: boolean;
  qualityRating?: string;
  messagingTier?: string;
  webhookSubscribed: boolean;
  displayPhoneNumber?: string;
}) {
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const quality = QUALITY_LABELS[(qualityRating as QualityRating) ?? "UNKNOWN"] ?? QUALITY_LABELS.UNKNOWN;

  function handleResubscribe() {
    setError(null);
    startTransition(async () => {
      const result = await resubscribeWebhookAction();
      if (!result.success) setError(result.error ?? "فشلت إعادة الاشتراك");
    });
  }

  return (
    <div className="mt-2 space-y-1.5 rounded-lg border border-white/10 bg-navy-900 p-3 text-xs">
      <p className="font-medium text-slate-300">📶 صحة الاتصال</p>
      {displayPhoneNumber && <p className="text-slate-400" dir="ltr">{displayPhoneNumber}</p>}
      <div className="flex items-center justify-between">
        <span className="text-slate-500">حالة الرقم</span>
        <span className={status === "CONNECTED" && !pendingVerification ? "text-success-500" : "text-warning-500"}>
          {status === "CONNECTED" ? (pendingVerification ? "نشط (بانتظار تحقق المنصة)" : "نشط") : "معلَّق"}
        </span>
      </div>
      <div className="flex items-center justify-between">
        <span className="text-slate-500">جودة الرقم</span>
        <span className={quality.className}>{quality.label}</span>
      </div>
      <div className="flex items-center justify-between">
        <span className="text-slate-500">حد الرسائل (Messaging Tier)</span>
        <span className="text-slate-300" dir="ltr">{messagingTier ?? "—"}</span>
      </div>
      <div className="flex items-center justify-between">
        <span className="text-slate-500">Webhook</span>
        {webhookSubscribed ? (
          <span className="text-success-500">✅ متصل</span>
        ) : (
          <span className="text-danger-500">⚠️ منقطع</span>
        )}
      </div>
      {error && <p className="rounded bg-danger-500/10 px-2 py-1 text-danger-500">{error}</p>}
      {!webhookSubscribed && (
        <button onClick={handleResubscribe} disabled={isPending} className="btn-secondary w-full text-[11px]">
          {isPending ? "جارٍ إعادة الاشتراك..." : "🔁 إعادة الاشتراك في Webhook"}
        </button>
      )}
    </div>
  );
}
