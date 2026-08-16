import type { Metadata } from "next";
import { Cairo, Inter } from "next/font/google";
import "./globals.css";
import { Providers } from "./providers";

const cairo = Cairo({ subsets: ["arabic", "latin"], variable: "--font-cairo", weight: ["400", "500", "600", "700", "800"] });
const inter = Inter({ subsets: ["latin"], variable: "--font-inter" });

export const metadata: Metadata = {
  title: "DMS — Digital Messaging System | CRM واتساب للتجار",
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
