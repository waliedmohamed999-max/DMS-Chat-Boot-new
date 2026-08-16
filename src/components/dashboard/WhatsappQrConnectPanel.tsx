"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { startWhatsappQrTrialAction, getWhatsappQrStatusAction, type WhatsappQrTrialStatus } from "@/app/dashboard/integrations/whatsappQrActions";

const POLL_INTERVAL_MS = 2500;

export function WhatsappQrConnectPanel() {
  const router = useRouter();
  const [agreed, setAgreed] = useState(false);
  const [starting, setStarting] = useState(false);
  const [status, setStatus] = useState<WhatsappQrTrialStatus | null>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  function stopPolling() {
    if (pollRef.current) {
      clearInterval(pollRef.current);
      pollRef.current = null;
    }
  }

  useEffect(() => stopPolling, []);

  async function handleStart() {
    setStarting(true);
    await startWhatsappQrTrialAction();
    setStarting(false);
    setStatus({ state: "waiting_scan" });

    pollRef.current = setInterval(async () => {
      const next = await getWhatsappQrStatusAction();
      setStatus(next);
      if (next.state === "connected") {
        stopPolling();
        router.refresh();
      }
    }, POLL_INTERVAL_MS);
  }

  if (!status) {
    return (
      <div className="space-y-3 rounded-lg border border-warning-500/30 bg-warning-500/5 p-4">
        <p className="text-xs leading-relaxed text-warning-500">
          ⚠️ هذه قناة تجريبية غير رسمية (بديلة عن Meta) لتجربة المنصة سريعاً بمسح رمز QR — صالحة لمدة
          3 أيام فقط، وقد تعرّض رقم الواتساب لحظر من واتساب لأنها تخالف شروط استخدامه الرسمية. للاستخدام
          الفعلي والمستمر يُرجى ربط واتساب رسمياً عبر Meta Cloud API أعلاه.
        </p>
        <label className="flex items-center gap-2 text-xs text-slate-300">
          <input type="checkbox" checked={agreed} onChange={(e) => setAgreed(e.target.checked)} />
          أوافق وأفهم المخاطر، وأريد المتابعة للتجربة فقط
        </label>
        <button
          type="button"
          disabled={!agreed || starting}
          onClick={handleStart}
          className="btn-primary w-full text-xs disabled:opacity-50"
        >
          {starting ? "جارٍ التحضير..." : "بدء التجربة"}
        </button>
      </div>
    );
  }

  if (status.state === "waiting_scan" || (!status.qrDataUrl && status.state !== "connected")) {
    return (
      <div className="flex flex-col items-center gap-2 rounded-lg border border-white/5 p-4 text-center">
        {status.qrDataUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={status.qrDataUrl} alt="امسح رمز QR بواتساب هاتفك" className="h-48 w-48" />
        ) : (
          <p className="text-xs text-slate-400">جارٍ توليد رمز QR...</p>
        )}
        <p className="text-xs text-slate-400">افتح واتساب على هاتفك ← الأجهزة المرتبطة ← مسح رمز</p>
      </div>
    );
  }

  if (status.state === "error" || status.state === "disconnected") {
    return <p className="text-xs text-danger-500">{status.error ?? "تعذّر الاتصال، حاول مجدداً"}</p>;
  }

  return null;
}
