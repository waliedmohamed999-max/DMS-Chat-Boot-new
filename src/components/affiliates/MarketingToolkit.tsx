"use client";

import { useState } from "react";
import { copyToClipboard } from "@/lib/clipboard";
import { ReferralQrCode } from "./ReferralQrCode";
import { ReferralBanner } from "./ReferralBanner";

const CHANNELS: { key: string; label: string }[] = [
  { key: "whatsapp", label: "واتساب" },
  { key: "twitter", label: "تويتر / X" },
  { key: "instagram", label: "انستقرام" },
  { key: "direct", label: "عام" },
];

const READY_TEXTS = [
  "اكتشفت منصة رهيبة لإدارة عملائك على واتساب بذكاء اصطناعي 🤖 جرّبها من هنا: {link}",
  "لو عندك متجر إلكتروني وتبي تنظم تواصلك مع عملائك على واتساب، جرّب DMS: {link}",
  "منصة DMS بتخليك ترد على عملائك تلقائياً وتتابع طلباتهم بسهولة — جرّبها مجاناً: {link}",
];

/** صندوق أدوات تسويقية جاهزة للمسوّق — روابط منفصلة لكل قناة، نصوص جاهزة بأزرار مشاركة، QR Code،
 * وبانر قابل للتحميل. يُستدعى من affiliates/dashboard/page.tsx بجانب ReferralLinkBox الحالي. */
export function MarketingToolkit({ referralCode, affiliateName }: { referralCode: string; affiliateName: string }) {
  const [origin, setOrigin] = useState("");
  // window غير متاح وقت الرسم على الخادم — نفس نمط ReferralLinkBox.tsx بالحرف.
  if (typeof window !== "undefined" && !origin) setOrigin(window.location.origin);
  const base = origin || "https://app.dms.sa";

  const [selectedChannel, setSelectedChannel] = useState<string>("whatsapp");
  const [copiedKey, setCopiedKey] = useState<string | null>(null);

  function linkFor(channelKey: string): string {
    return channelKey === "direct" ? `${base}/?ref=${referralCode}` : `${base}/?ref=${referralCode}&src=${channelKey}`;
  }

  async function copy(key: string, text: string) {
    if (await copyToClipboard(text)) {
      setCopiedKey(key);
      setTimeout(() => setCopiedKey((k) => (k === key ? null : k)), 2000);
    }
  }

  const selectedLink = linkFor(selectedChannel);

  return (
    <div className="card space-y-6 p-5">
      <div>
        <h2 className="mb-1 font-semibold text-white">أدوات تسويقية</h2>
        <p className="text-xs text-slate-500">
          روابط منفصلة لكل قناة (لتعرف أي قناة فعلياً بتجيب عملاء)، نصوص جاهزة، QR Code، وبانر قابل للتحميل.
        </p>
      </div>

      {/* أ) روابط لكل قناة */}
      <div className="space-y-2">
        <p className="label-field">روابط حسب القناة</p>
        {CHANNELS.map((c) => {
          const link = linkFor(c.key);
          return (
            <div key={c.key} className="flex items-center gap-2">
              <span className="w-20 shrink-0 text-xs text-slate-400">{c.label}</span>
              <input readOnly value={link} dir="ltr" className="input-field flex-1 text-xs" onFocus={(e) => e.target.select()} />
              <button onClick={() => copy(c.key, link)} className="btn-secondary shrink-0 px-3 text-xs">
                {copiedKey === c.key ? "✓ تم" : "نسخ"}
              </button>
            </div>
          );
        })}
      </div>

      {/* ب) نصوص جاهزة + مشاركة بضغطة واحدة */}
      <div className="space-y-3">
        <p className="label-field">نصوص جاهزة للمشاركة</p>
        {READY_TEXTS.map((template, i) => {
          const text = template.replace("{link}", linkFor("whatsapp"));
          const whatsappUrl = `https://wa.me/?text=${encodeURIComponent(text)}`;
          const twitterUrl = `https://twitter.com/intent/tweet?text=${encodeURIComponent(text)}`;
          const textKey = `text-${i}`;
          return (
            <div key={textKey} className="rounded-lg bg-navy-900 p-3">
              <p className="mb-2 text-sm text-slate-300">{text}</p>
              <div className="flex flex-wrap gap-2">
                <a href={whatsappUrl} target="_blank" rel="noopener noreferrer" className="btn-secondary text-xs">
                  📱 مشاركة واتساب
                </a>
                <a href={twitterUrl} target="_blank" rel="noopener noreferrer" className="btn-secondary text-xs">
                  🐦 مشاركة تويتر/X
                </a>
                <button onClick={() => copy(textKey, text)} className="btn-secondary text-xs">
                  {copiedKey === textKey ? "✓ تم النسخ" : "📋 نسخ (لإنستقرام: الصق في الـBio أو الـStory)"}
                </button>
              </div>
            </div>
          );
        })}
      </div>

      {/* ج + د) QR وبانر — يشتركان في اختيار القناة نفسه */}
      <div className="grid grid-cols-1 gap-6 sm:grid-cols-2">
        <div className="space-y-2">
          <p className="label-field">رمز QR</p>
          <select value={selectedChannel} onChange={(e) => setSelectedChannel(e.target.value)} className="input-field text-xs">
            {CHANNELS.map((c) => (
              <option key={c.key} value={c.key}>{c.label}</option>
            ))}
          </select>
          <ReferralQrCode link={selectedLink} />
        </div>
        <div className="space-y-2">
          <p className="label-field">بانر جاهز للمشاركة</p>
          <ReferralBanner link={selectedLink} affiliateName={affiliateName} />
        </div>
      </div>
    </div>
  );
}
