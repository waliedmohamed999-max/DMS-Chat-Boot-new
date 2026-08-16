/** @type {import('next').NextConfig} */

// CSP بلا nonce (Next.js App Router بلا middleware مخصّص لهذا) يتطلب 'unsafe-inline'/'unsafe-eval'
// لسكربتات Next.js نفسها (hydration + HMR في التطوير) — نفس التوصية الرسمية لـNext.js لإعداد CSP
// بدون بنية nonce كاملة. img-src يسمح https: عمداً (لا يقتصر على 'self'): عقدة "رسالة" في الشات بوت
// تعرض صوراً من روابط يُدخلها التاجر نفسه (معاينة موبايل حقيقية) — انظر WhatsAppPreview.tsx.
const CSP = [
  "default-src 'self'",
  "script-src 'self' 'unsafe-inline' 'unsafe-eval'",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: https:",
  "font-src 'self' data:",
  "media-src 'self' https:",
  "connect-src 'self'",
  "frame-ancestors 'none'",
  "base-uri 'self'",
  "form-action 'self'",
].join("; ");

const SECURITY_HEADERS = [
  { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains; preload" },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=(), payment=()" },
  { key: "Content-Security-Policy", value: CSP },
];

const nextConfig = {
  reactStrictMode: true,
  poweredByHeader: false, // لا تُسرِّب "X-Powered-By: Next.js" لكل استجابة
  experimental: {
    // pdfkit يحمّل ملفات خط .afm ديناميكياً عبر path.join(__dirname, ...) وقت التشغيل — تجميع
    // webpack العادي يكسر هذا المسار، فيُستثنى هنا (نفس السبب والنمط لـbullmq/ioredis أعلاه).
    serverComponentsExternalPackages: ["bullmq", "ioredis", "pdfkit"],
    // الافتراضي 1MB غير كافٍ لملف Excel حقيقي — هذا أيضاً حد أمني أول ضد رفع ملفات ضخمة كوسيلة
    // استنزاف موارد، بالإضافة لتحقق صريح من file.size داخل كل Server Action نفسها (دفاع مزدوج).
    serverActions: { bodySizeLimit: "5mb" },
  },
  async headers() {
    return [{ source: "/:path*", headers: SECURITY_HEADERS }];
  },
};

module.exports = nextConfig;
