"use client";

import { useEffect, useRef } from "react";
import { useRouter } from "next/navigation";

const POLL_INTERVAL_MS = 4000;

function playNotificationBeep() {
  try {
    const AudioCtx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    const ctx = new AudioCtx();
    const oscillator = ctx.createOscillator();
    const gain = ctx.createGain();
    oscillator.type = "sine";
    oscillator.frequency.value = 880;
    gain.gain.setValueAtTime(0.15, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.35);
    oscillator.connect(gain);
    gain.connect(ctx.destination);
    oscillator.start();
    oscillator.stop(ctx.currentTime + 0.35);
  } catch {
    // بيئات بدون دعم Web Audio (نادر) — تجاهل صامت، التحديث اللحظي نفسه يبقى يعمل عبر router.refresh()
  }
}

/**
 * يستطلع (polling) نقطة خفيفة كل بضع ثوانٍ لاكتشاف رسائل واردة جديدة، يُشغّل تنبيهاً صوتياً عند
 * وصولها، ويُحدّث محتوى الصفحة (قائمة المحادثات + المحادثة المفتوحة) عبر router.refresh() —
 * الحد الأدنى المسموح به صراحة في البرومنت ("Polling قصير المدى") لعدم توفر بنية WebSocket/SSE.
 */
export function InboxLivePoller() {
  const router = useRouter();
  const lastMessageIdRef = useRef<string | null>(null);
  const isFirstCheckRef = useRef(true);

  useEffect(() => {
    let cancelled = false;

    async function poll() {
      try {
        const res = await fetch("/api/inbox/unread-count", { cache: "no-store" });
        if (!res.ok || cancelled) return;
        const data = await res.json();

        if (!isFirstCheckRef.current && data.latestMessageId && data.latestMessageId !== lastMessageIdRef.current) {
          playNotificationBeep();
          router.refresh();
        }

        lastMessageIdRef.current = data.latestMessageId;
        isFirstCheckRef.current = false;
      } catch {
        // فشل شبكي عابر — يُعاد المحاولة في الدورة التالية دون إظهار خطأ للمستخدم
      }
    }

    const interval = setInterval(poll, POLL_INTERVAL_MS);
    poll();

    return () => {
      cancelled = true;
      clearInterval(interval);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return null;
}
