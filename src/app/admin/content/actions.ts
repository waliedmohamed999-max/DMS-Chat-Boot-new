"use server";

import { revalidatePath } from "next/cache";
import { requireSuperAdminSession } from "@/lib/session";
import { requireEffectivePermission } from "@/lib/rbac";
import { superAdminDb } from "@/lib/db";

/** يفكّك textarea بسطر واحد لكل عنصر، وحقول كل سطر مفصولة بـ"|" — نفس فلسفة Plan.features (سطر لكل عنصر) مع دعم حقول متعددة. */
function parseDelimitedLines(raw: string, fieldCount: number): string[][] {
  return raw
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const parts = line.split("|").map((p) => p.trim());
      while (parts.length < fieldCount) parts.push("");
      return parts.slice(0, fieldCount);
    });
}

function revalidateHomepage() {
  revalidatePath("/admin/content");
  revalidatePath("/");
}

async function authorize() {
  const session = await requireSuperAdminSession();
  requireEffectivePermission(session.user.permissions, "platform.content.manage");
  return session;
}

export async function updateHeroContent(formData: FormData) {
  const session = await authorize();
  const data = {
    heroHeadline: String(formData.get("heroHeadline") ?? "").trim(),
    heroSubheadline: String(formData.get("heroSubheadline") ?? "").trim(),
    heroCtaPrimary: String(formData.get("heroCtaPrimary") ?? "").trim(),
    heroCtaSecondary: String(formData.get("heroCtaSecondary") ?? "").trim(),
  };

  await superAdminDb.siteContent.update({ where: { id: "singleton" }, data });
  await superAdminDb.auditLog.create({
    data: { userId: session.user.id, action: "platform.content_update", targetType: "SiteContent", targetId: "hero" },
  });
  revalidateHomepage();
}

export async function updateFeaturesContent(formData: FormData) {
  const session = await authorize();
  const featuresHeading = String(formData.get("featuresHeading") ?? "").trim();
  const features = parseDelimitedLines(String(formData.get("features") ?? ""), 2).map(([title, body]) => ({ title, body }));

  await superAdminDb.siteContent.update({ where: { id: "singleton" }, data: { featuresHeading, features } });
  await superAdminDb.auditLog.create({
    data: { userId: session.user.id, action: "platform.content_update", targetType: "SiteContent", targetId: "features" },
  });
  revalidateHomepage();
}

export async function updateStatsContent(formData: FormData) {
  const session = await authorize();
  const stats = parseDelimitedLines(String(formData.get("stats") ?? ""), 2).map(([value, label]) => ({ value, label }));

  await superAdminDb.siteContent.update({ where: { id: "singleton" }, data: { stats } });
  await superAdminDb.auditLog.create({
    data: { userId: session.user.id, action: "platform.content_update", targetType: "SiteContent", targetId: "stats" },
  });
  revalidateHomepage();
}

export async function updateTestimonialsContent(formData: FormData) {
  const session = await authorize();
  const testimonialsHeading = String(formData.get("testimonialsHeading") ?? "").trim();
  const testimonials = parseDelimitedLines(String(formData.get("testimonials") ?? ""), 3).map(([name, role, quote]) => ({ name, role, quote }));

  await superAdminDb.siteContent.update({ where: { id: "singleton" }, data: { testimonialsHeading, testimonials } });
  await superAdminDb.auditLog.create({
    data: { userId: session.user.id, action: "platform.content_update", targetType: "SiteContent", targetId: "testimonials" },
  });
  revalidateHomepage();
}

export async function updateClientsContent(formData: FormData) {
  const session = await authorize();
  const clientsHeading = String(formData.get("clientsHeading") ?? "").trim();
  const clientsSubtext = String(formData.get("clientsSubtext") ?? "").trim();
  const clientLogos = parseDelimitedLines(String(formData.get("clientLogos") ?? ""), 2).map(([name, imageUrl]) => ({
    name,
    ...(imageUrl ? { imageUrl } : {}),
  }));

  await superAdminDb.siteContent.update({ where: { id: "singleton" }, data: { clientsHeading, clientsSubtext, clientLogos } });
  await superAdminDb.auditLog.create({
    data: { userId: session.user.id, action: "platform.content_update", targetType: "SiteContent", targetId: "clients" },
  });
  revalidateHomepage();
}

/** صفحة /about (بند ل في برومنت التدقيق الشامل: توسيع الـCMS خارج الرئيسية) — فقرة واحدة لكل سطر. */
export async function updateAboutContent(formData: FormData) {
  const session = await authorize();
  const aboutHeading = String(formData.get("aboutHeading") ?? "").trim();
  const aboutParagraphs = String(formData.get("aboutParagraphs") ?? "")
    .split("\n")
    .map((p) => p.trim())
    .filter(Boolean);

  await superAdminDb.siteContent.update({ where: { id: "singleton" }, data: { aboutHeading, aboutParagraphs } });
  await superAdminDb.auditLog.create({
    data: { userId: session.user.id, action: "platform.content_update", targetType: "SiteContent", targetId: "about" },
  });
  revalidatePath("/about");
  revalidatePath("/admin/content");
}

/**
 * صفحة /services — 5 عناصر ثابتة العدد والترتيب (تُقرَن بالأيقونات الثابتة بالكود عبر الترتيب فقط).
 * صيغة كل سطر: "العنوان | الوصف | نقطة1;نقطة2;نقطة3". أي سطر زائد عن 5 أو ناقص عنها يُقصّ/يُكمَّل
 * دفاعياً بدل رمي خطأ يمنع الحفظ — نفس روح "لا تعطيل الحفظ لخطأ إدخال بسيط" في باقي أقسام الـCMS.
 */
export async function updateServicesContent(formData: FormData) {
  const session = await authorize();
  const servicesHeading = String(formData.get("servicesHeading") ?? "").trim();
  const servicesSubheading = String(formData.get("servicesSubheading") ?? "").trim();
  const servicesItems = parseDelimitedLines(String(formData.get("servicesItems") ?? ""), 3)
    .map(([title, body, pointsRaw]) => ({
      title, body, points: (pointsRaw ?? "").split(";").map((p) => p.trim()).filter(Boolean),
    }))
    .slice(0, 5);

  await superAdminDb.siteContent.update({ where: { id: "singleton" }, data: { servicesHeading, servicesSubheading, servicesItems } });
  await superAdminDb.auditLog.create({
    data: { userId: session.user.id, action: "platform.content_update", targetType: "SiteContent", targetId: "services" },
  });
  revalidatePath("/services");
  revalidatePath("/admin/content");
}

export async function updateContactBannerContent(formData: FormData) {
  const session = await authorize();
  const data = {
    contactHeading: String(formData.get("contactHeading") ?? "").trim(),
    contactBody: String(formData.get("contactBody") ?? "").trim(),
    contactCtaLabel: String(formData.get("contactCtaLabel") ?? "").trim(),
  };

  await superAdminDb.siteContent.update({ where: { id: "singleton" }, data });
  await superAdminDb.auditLog.create({
    data: { userId: session.user.id, action: "platform.content_update", targetType: "SiteContent", targetId: "contact_banner" },
  });
  revalidateHomepage();
}
