"use client";

import { useEffect, useRef, useState } from "react";
import QRCode from "qrcode";

const BANNER_SIZE = 1080; // مربع، يناسب انستقرام/فيسبوك
const BRAND_COLOR = "#0B1220"; // نفس خلفية navy-900 الأساسية في المشروع
const ACCENT_COLOR = "#25D366"; // wa-500

/** بانر ترويجي بسيط قابل للتحميل — <canvas> بلا أي مكتبة تصميم/رسم خارجية (نفس فلسفة BarChart/DonutChart
 * SVG بلا مكتبة). v1: بانر واحد ثابت التصميم، وليس نظام قوالب متعدد. */
export function ReferralBanner({ link, affiliateName }: { link: string; affiliateName: string }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let cancelled = false;

    async function draw() {
      const canvas = canvasRef.current;
      if (!canvas) return;
      const ctx = canvas.getContext("2d");
      if (!ctx) return;

      canvas.width = BANNER_SIZE;
      canvas.height = BANNER_SIZE;

      // خلفية
      ctx.fillStyle = BRAND_COLOR;
      ctx.fillRect(0, 0, BANNER_SIZE, BANNER_SIZE);

      // شريط علوي بلون العلامة التجارية
      ctx.fillStyle = ACCENT_COLOR;
      ctx.fillRect(0, 0, BANNER_SIZE, 16);

      // نص ترويجي
      ctx.fillStyle = "#FFFFFF";
      ctx.textAlign = "center";
      ctx.font = "bold 56px Arial, sans-serif";
      ctx.fillText("جرّب منصة DMS", BANNER_SIZE / 2, 180);
      ctx.font = "32px Arial, sans-serif";
      ctx.fillStyle = "#94A3B8";
      ctx.fillText("إدارة عملائك عبر واتساب — بذكاء اصطناعي", BANNER_SIZE / 2, 240);

      ctx.font = "28px Arial, sans-serif";
      ctx.fillStyle = ACCENT_COLOR;
      ctx.fillText(`مقدَّم لك من ${affiliateName}`, BANNER_SIZE / 2, 300);

      // QR Code
      try {
        const qrDataUrl = await QRCode.toDataURL(link, { width: 480, margin: 1 });
        if (cancelled) return;
        const img = new Image();
        await new Promise<void>((resolve, reject) => {
          img.onload = () => resolve();
          img.onerror = () => reject(new Error("qr image load failed"));
          img.src = qrDataUrl;
        });
        if (cancelled) return;

        const qrSize = 480;
        const qrX = (BANNER_SIZE - qrSize) / 2;
        const qrY = 360;
        // إطار أبيض حول QR (يبقى مقروءاً فوق الخلفية الداكنة)
        ctx.fillStyle = "#FFFFFF";
        ctx.fillRect(qrX - 20, qrY - 20, qrSize + 40, qrSize + 40);
        ctx.drawImage(img, qrX, qrY, qrSize, qrSize);
      } catch {
        // فشل توليد QR لا يمنع عرض باقي البانر — المستخدم يقدر يعتمد على الرابط النصي أسفله فقط
      }

      // نص الرابط
      ctx.fillStyle = "#FFFFFF";
      ctx.font = "26px Arial, sans-serif";
      ctx.fillText(link.replace(/^https?:\/\//, ""), BANNER_SIZE / 2, 940);

      if (!cancelled) setReady(true);
    }

    void draw();
    return () => {
      cancelled = true;
    };
  }, [link, affiliateName]);

  function download() {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const url = canvas.toDataURL("image/png");
    const a = document.createElement("a");
    a.href = url;
    a.download = "dms-referral-banner.png";
    a.click();
  }

  return (
    <div className="flex flex-col items-center gap-3">
      <canvas ref={canvasRef} className="w-full max-w-[280px] rounded-lg border border-white/10" />
      <button onClick={download} disabled={!ready} className="btn-primary text-sm disabled:opacity-50">
        {ready ? "تحميل البانر" : "جارٍ التجهيز..."}
      </button>
    </div>
  );
}
