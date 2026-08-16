import type { MetadataRoute } from "next";

const BASE_URL = process.env.NEXTAUTH_URL || "http://localhost:3000";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: "*",
      allow: ["/", "/services", "/about", "/vision", "/pricing", "/contact", "/terms", "/privacy", "/partners/join", "/partners/apply", "/partners/status"],
      // لوحات الدخول والتحكم الداخلية وروابط الإعداد الحسّاسة (تحمل رمزاً في الرابط نفسه) لا تُفهرَس أبداً
      disallow: ["/dashboard", "/admin", "/login", "/register", "/partners/setup"],
    },
    sitemap: `${BASE_URL}/sitemap.xml`,
  };
}
