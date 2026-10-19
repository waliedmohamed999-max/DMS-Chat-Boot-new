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
        slate: {
          50: "rgb(var(--app-slate-50, 248 250 252) / <alpha-value>)",
          100: "rgb(var(--app-slate-100, 241 245 249) / <alpha-value>)",
          200: "rgb(var(--app-slate-200, 226 232 240) / <alpha-value>)",
          300: "rgb(var(--app-slate-300, 203 213 225) / <alpha-value>)",
          400: "rgb(var(--app-slate-400, 148 163 184) / <alpha-value>)",
          500: "rgb(var(--app-slate-500, 100 116 139) / <alpha-value>)",
          600: "rgb(var(--app-slate-600, 71 85 105) / <alpha-value>)",
          700: "rgb(var(--app-slate-700, 51 65 85) / <alpha-value>)",
          800: "rgb(var(--app-slate-800, 30 41 59) / <alpha-value>)",
          900: "rgb(var(--app-slate-900, 15 23 42) / <alpha-value>)",
          950: "rgb(var(--app-slate-950, 2 6 23) / <alpha-value>)",
        },
        navy: {
          950: "rgb(var(--app-navy-950, 7 11 20) / <alpha-value>)",
          900: "rgb(var(--app-navy-900, 11 18 32) / <alpha-value>)",
          800: "rgb(var(--app-navy-800, 17 26 46) / <alpha-value>)",
          700: "rgb(var(--app-navy-700, 24 35 56) / <alpha-value>)",
          600: "rgb(var(--app-navy-600, 36 51 84) / <alpha-value>)",
        },
        accent: {
          400: "rgb(var(--app-accent-400, 139 124 250) / <alpha-value>)",
          500: "rgb(var(--app-accent-500, 109 94 248) / <alpha-value>)",
          600: "rgb(var(--app-accent-600, 86 71 217) / <alpha-value>)",
          700: "rgb(var(--app-accent-700, 68 58 174) / <alpha-value>)",
        },
        success: { 500: "rgb(var(--app-success-500, 34 197 94) / <alpha-value>)", 600: "rgb(var(--app-success-600, 22 163 74) / <alpha-value>)" },
        warning: { 500: "rgb(var(--app-warning-500, 245 158 11) / <alpha-value>)", 600: "rgb(var(--app-warning-600, 217 119 6) / <alpha-value>)" },
        danger: { 500: "rgb(var(--app-danger-500, 239 68 68) / <alpha-value>)", 600: "rgb(var(--app-danger-600, 220 38 38) / <alpha-value>)" },
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
