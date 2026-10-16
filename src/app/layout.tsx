import type { Metadata } from "next";
import localFont from "next/font/local";
import "./globals.css";
import "./marketing.css";
import { Providers } from "./providers";

// خطوط محلية مضمَّنة في المشروع بدل next/font/google — بيئات بناء بلا وصول لـ fonts.googleapis.com
// (مثل Hostinger) كانت تفشل في `next build` عند محاولة تنزيل الخط وقت البناء.
const cairo = localFont({ src: "./fonts/Cairo-Variable.woff2", variable: "--font-cairo", weight: "200 1000", display: "swap" });
const inter = localFont({ src: "./fonts/Inter-Latin-Variable.woff2", variable: "--font-inter", weight: "100 900", display: "swap" });

export const metadata: Metadata = {
  applicationName: "DMS Tech",
  icons: { icon: "/logo.png", apple: "/logo.png" },
  title: "DMS Tech | CRM واتساب للتجار",
  description: "منصة إدارة علاقات العملاء عبر واتساب للتجار: حملات، شات بوت ذكي، ربط زد وسلة، وأكثر.",
};

// يُنفَّذ قبل أي رسم لتفادي وميض تغيّر اللون (FOUC) عند دخول صفحات الموقع التسويقي التي تدعم
// الوضع الفاتح/الداكن الفعلي — لوحة التحكم الداخلية لا تستخدم class="dark" إطلاقاً (ألوانها داكنة
// ثابتة بالكود)، فهذا السكربت بلا أي أثر عليها.
const themeInitScript = `
(function () {
  try {
    var saved = localStorage.getItem("dms-theme");
    var prefersDark = window.matchMedia("(prefers-color-scheme: dark)").matches;
    if (saved === "dark" || (!saved && prefersDark)) {
      document.documentElement.classList.add("dark");
    }
  } catch (e) {}
})();
`;

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ar" dir="rtl" className={`${cairo.variable} ${inter.variable}`}>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeInitScript }} />
      </head>
      <body>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
