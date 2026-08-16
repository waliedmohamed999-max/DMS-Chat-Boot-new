import type { MetadataRoute } from "next";

const BASE_URL = process.env.NEXTAUTH_URL || "http://localhost:3000";

// صفحات الموقع التسويقي العام فقط — لوحة التاجر/الإدارة وروابط الشركاء الخاصة (مثل partners/setup/[token])
// لا تُفهرَس إطلاقاً (خاصة وحساسة)، ولا معنى لفهرستها لمحركات البحث أصلاً.
const PUBLIC_ROUTES = ["", "/services", "/about", "/vision", "/pricing", "/contact", "/terms", "/privacy", "/partners/join"];

export default function sitemap(): MetadataRoute.Sitemap {
  return PUBLIC_ROUTES.map((route) => ({
    url: `${BASE_URL}${route}`,
    lastModified: new Date(),
    changeFrequency: "weekly",
    priority: route === "" ? 1 : 0.7,
  }));
}
