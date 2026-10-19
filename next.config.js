/** @type {import('next').NextConfig} */

// 'unsafe-eval' لازم لوضع التطوير فقط (إعادة التحميل السريع) — بناء الإنتاج لا يحتاجه، وإزالته تضيّق أثر أي XSS.
const SCRIPT_SRC = process.env.NODE_ENV === "production" ? "script-src 'self' 'unsafe-inline'" : "script-src 'self' 'unsafe-inline' 'unsafe-eval'";

// CSP بلا nonce (Next.js App Router بلا middleware مخصّص لهذا) يتطلب 'unsafe-inline'/'unsafe-eval'
// لسكربتات Next.js نفسها (hydration + HMR في التطوير) — نفس التوصية الرسمية لـNext.js لإعداد CSP
// بدون بنية nonce كاملة. img-src يسمح https: عمداً (لا يقتصر على 'self'): عقدة "رسالة" في الشات بوت
// تعرض صوراً من روابط يُدخلها التاجر نفسه (معاينة موبايل حقيقية) — انظر WhatsAppPreview.tsx.
// connect-src يتضمن https://api.openai.com: ChatWidget.tsx (ومثيله embed/chat/[tenantId]/page.tsx)
// يستدعيان `https://api.openai.com/v1/realtime/calls` مباشرة من المتصفح لتبادل SDP في المكالمة
// الصوتية الحية (Realtime API عبر WebRTC، بلا مرور بخادمنا) — بدون هذا، CSP كان سيحظر ذلك الاستدعاء
// بصمت في الإنتاج (لم يُكتشف وقت شحن ميزة المكالمة الصوتية الأولى لغياب مفتاح OpenAI حقيقي محلياً
// للاختبار الفعلي، اكتُشف عند بناء نسخة التاجر التي تستخدم نفس النمط بالضبط).
const CSP = [
  "default-src 'self'",
  SCRIPT_SRC,
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: https:",
  "font-src 'self' data:",
  "media-src 'self' https:",
  "connect-src 'self' https://api.openai.com",
  "frame-ancestors 'none'",
  "base-uri 'self'",
  "form-action 'self'",
].join("; ");

// نظير CSP أعلاه لصفحة /embed/chat/[tenantId] تحديداً — يجب أن تُضمَّن فعلياً داخل iframe على نطاق
// (origin) موقع التاجر الخاص نفسه، وهو غير معروف مسبقاً لمنصتنا (لا قائمة نطاقات مسموحة في نسخة v1،
// قرار تبسيط صريح: تضمين iframe بسيط بلا سكربت JS). frame-ancestors * تسمح بالتضمين من أي نطاق (لا
// بديل عملي بلا قائمة نطاقات تاجر مُسجَّلة مسبقاً)، وX-Frame-Options يُستبعَد كلياً لهذا المسار (وليس
// مجرد قيمة مختلفة — القيم القياسية الوحيدة لـXFO هي DENY/SAMEORIGIN/ALLOW-FROM المهجورة وأيٌّ منها
// لا يدعم تعدد نطاقات غير معروفة مسبقاً؛ frame-ancestors في CSP هي البديل الحديث الصحيح ويتجاوزها
// المتصفح تلقائياً عند وجودها).
const EMBED_CSP = [
  "default-src 'self'",
  SCRIPT_SRC,
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: https:",
  "font-src 'self' data:",
  "media-src 'self' https:",
  "connect-src 'self' https://api.openai.com",
  "frame-ancestors *",
  "base-uri 'self'",
  "form-action 'self'",
].join("; ");

const SECURITY_HEADERS = [
  { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains; preload" },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  // microphone=(self) بدل الحظر الكامل السابق (microphone=()) — ذاك كان يحظر getUserMedia حتى على
  // نطاقنا نفسه، أي يكسر زر 🎙️/📞 في ChatWidget.tsx على الموقع التسويقي العام بصمت في الإنتاج (نفس
  // اكتشاف connect-src أعلاه بالضبط).
  { key: "Permissions-Policy", value: "camera=(), microphone=(self), geolocation=(), payment=()" },
  { key: "Content-Security-Policy", value: CSP },
];

// نظير SECURITY_HEADERS لمسار /embed تحديداً: بلا X-Frame-Options إطلاقاً (راجع تعليق EMBED_CSP)،
// وmicrophone=(self) يسمح للصفحة نفسها (المُضمَّنة كـiframe) باستخدام الميكروفون — التفويض الفعلي من
// صفحة التاجر المُضيفة يتم عبر خاصية allow="microphone" على وسم iframe نفسه (راجع كود التضمين في
// dashboard/website-chat/page.tsx)، وPermissions-Policy هنا لا يمنع ذلك التفويض.
const EMBED_HEADERS = [
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(self), geolocation=(), payment=()" },
  { key: "Content-Security-Policy", value: EMBED_CSP },
];

// صفحة DMS داخل لوحة تحكم سلة (/salla/app — "الصفحات المضمنة" في بوابة شركاء سلة): نفس CSP العام
// لكن التضمين مسموح من نطاقات سلة فقط (لوحة التاجر s.salla.sa وبقية نطاقات سلة)، وبلا X-Frame-Options
// (DENY كان سيمنع التضمين؛ frame-ancestors هي البديل الحديث ويتجاوزها المتصفح تلقائياً).
const SALLA_EMBEDDED_CSP = CSP.replace("frame-ancestors 'none'", "frame-ancestors https://s.salla.sa https://*.salla.sa https://salla.sa https://*.salla.dev");
const SALLA_EMBEDDED_HEADERS = [
  { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains; preload" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=(), payment=()" },
  { key: "Content-Security-Policy", value: SALLA_EMBEDDED_CSP },
];

// صفحة تطبيق DMS لتاجر زد (/zid/app): زد يفتح "رابط التطبيق" في تبويب أو داخل لوحة التاجر — التضمين
// مسموح من نطاقات زد فقط.
const ZID_APP_HEADERS = SALLA_EMBEDDED_HEADERS.map((h) =>
  h.key === "Content-Security-Policy" ? { ...h, value: CSP.replace("frame-ancestors 'none'", "frame-ancestors https://web.zid.sa https://*.zid.sa https://zid.sa") } : h
);

const nextConfig = {
  distDir: process.env.NEXT_DIST_DIR || ".next",
  reactStrictMode: true,
  poweredByHeader: false, // لا تُسرِّب "X-Powered-By: Next.js" لكل استجابة
  // pdfkit يحمّل ملفات خط .afm ديناميكياً عبر path.join(__dirname, ...) وقت التشغيل — تجميع
  // webpack العادي يكسر هذا المسار، فيُستثنى هنا (نفس السبب والنمط لـbullmq/ioredis أعلاه).
  // baileys: مكتبة خادم فقط بتبعيات اختيارية (jimp/sharp/link-preview-js) يفشل Turbopack في حلّها وقت التجميع.
  serverExternalPackages: ["bullmq", "ioredis", "pdfkit", "@whiskeysockets/baileys"],
  experimental: {
    // الافتراضي 1MB غير كافٍ لملف Excel حقيقي — هذا أيضاً حد أمني أول ضد رفع ملفات ضخمة كوسيلة
    // استنزاف موارد، بالإضافة لتحقق صريح من file.size داخل كل Server Action نفسها (دفاع مزدوج).
    serverActions: { bodySizeLimit: "5mb" },
  },
  async headers() {
    return [
      // استبعاد صريح لمسار /embed عبر regex سلبي (وليس الاعتماد على ترتيب استبدال رؤوس متشابهة
      // المفتاح بين قاعدتين متطابقتين لنفس المسار) — واضح ومضمون بصرف النظر عن تفاصيل دمج Next.js
      // الداخلية لرؤوس متعددة القواعد المتطابقة.
      { source: "/:path((?!embed/|salla/app|zid/app).*)", headers: SECURITY_HEADERS },
      { source: "/embed/:path*", headers: EMBED_HEADERS },
      { source: "/salla/app", headers: SALLA_EMBEDDED_HEADERS },
      { source: "/zid/app", headers: ZID_APP_HEADERS },
    ];
  },
};

module.exports = nextConfig;
