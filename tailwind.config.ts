import type { Config } from "tailwindcss";

const config: Config = {
  darkMode: "class",
  content: ["./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      fontFamily: {
        arabic: ["var(--font-cairo)", "Tahoma", "sans-serif"],
        latin: ["var(--font-inter)", "sans-serif"],
      },
      colors: {
        navy: {
          950: "#070B14",
          900: "#0B1220",
          800: "#111A2E",
          700: "#182338",
          600: "#243354",
        },
        accent: {
          400: "#8B7CFA",
          500: "#6D5EF8",
          600: "#5647D9",
          700: "#443AAE",
        },
        success: { 500: "#22C55E", 600: "#16A34A" },
        warning: { 500: "#F59E0B", 600: "#D97706" },
        danger: { 500: "#EF4444", 600: "#DC2626" },
        // درجات أخضر مستوحاة من عالم واتساب (وليس الشعار الرسمي) — اللون الأساسي للموقع التسويقي
        // العام فقط (ليس لوحة التحكم الداخلية التي تبقى بهويتها البنفسجية القائمة).
        wa: {
          50: "#EAFBF1", 100: "#D1F5E0", 300: "#7FE3AD", 400: "#3FCE84",
          500: "#25D366", 600: "#1DA851", 700: "#168040",
        },
      },
      borderRadius: {
        xl2: "1.25rem",
      },
      boxShadow: {
        card: "0 1px 2px 0 rgba(0,0,0,0.3), 0 0 0 1px rgba(255,255,255,0.04)",
      },
      keyframes: {
        // انيميشن Hero الرئيسي (بديل CSS/SVG خفيف عن Lottie — راجع DECISIONS.md): فقاعة رسالة
        // تتحرك من "المتجر" إلى "العميل" مع ظهور واختفاء تدريجي، بلا أي أصل JSON خارجي أو مكتبة إضافية.
        "wa-flow": {
          "0%": { transform: "translateY(-50%) translateX(0) scale(0.6)", opacity: "0" },
          "15%": { opacity: "1", transform: "translateY(-50%) translateX(0) scale(1)" },
          "85%": { opacity: "1" },
          "100%": { transform: "translateY(-50%) translateX(var(--wa-flow-distance, 220px)) scale(0.6)", opacity: "0" },
        },
        "wa-pulse-ring": {
          "0%": { transform: "scale(0.9)", opacity: "0.6" },
          "100%": { transform: "scale(1.4)", opacity: "0" },
        },
        // شريط الشعارات المتحرك (قسم "عملاء مميزون") — القائمة مكرَّرة مرتين في DOM، فتنتهي هذه
        // الحركة تماماً عند نصف الإزاحة (-50%) لتبدو حلقة لا نهائية سلسة بلا أي قفزة عند الإعادة.
        marquee: {
          "0%": { transform: "translateX(0)" },
          "100%": { transform: "translateX(-50%)" },
        },
      },
      animation: {
        "wa-flow": "wa-flow 3.2s ease-in-out infinite",
        "wa-pulse-ring": "wa-pulse-ring 2.4s ease-out infinite",
        marquee: "marquee 28s linear infinite",
      },
    },
  },
  plugins: [],
};

export default config;
