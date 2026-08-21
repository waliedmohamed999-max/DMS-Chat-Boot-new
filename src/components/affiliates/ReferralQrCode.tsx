"use client";

import { useEffect, useState } from "react";
import QRCode from "qrcode";

/** يولّد QR Code لرابط الإحالة عبر حزمة qrcode المثبَّتة بالفعل في المشروع (بلا مكتبة جديدة). يُعاد
 * توليده تلقائياً عند تغيّر الرابط (تبديل القناة في MarketingToolkit). */
export function ReferralQrCode({ link, size = 180 }: { link: string; size?: number }) {
  const [dataUrl, setDataUrl] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    QRCode.toDataURL(link, { width: size, margin: 1 })
      .then((url) => {
        if (!cancelled) setDataUrl(url);
      })
      .catch(() => {
        if (!cancelled) setDataUrl(null);
      });
    return () => {
      cancelled = true;
    };
  }, [link, size]);

  if (!dataUrl) {
    return <div className="flex items-center justify-center rounded-lg bg-navy-900 text-xs text-slate-500" style={{ width: size, height: size }}>جارٍ التوليد...</div>;
  }

  return (
    <div className="flex flex-col items-center gap-2">
      {/* eslint-disable-next-line @next/next/no-img-element -- data: URI، لا فائدة من next/image هنا */}
      <img src={dataUrl} alt="رمز QR لرابط الإحالة" width={size} height={size} className="rounded-lg bg-white p-2" />
      <a href={dataUrl} download="dms-referral-qr.png" className="btn-secondary text-xs">
        تحميل QR
      </a>
    </div>
  );
}
