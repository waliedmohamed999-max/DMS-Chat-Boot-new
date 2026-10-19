"use server";

import crypto from "crypto";
import { revalidatePath } from "next/cache";
import { Prisma } from "@prisma/client";
import { requireSuperAdminSession } from "@/lib/session";
import { requireEffectivePermission } from "@/lib/rbac";
import { rawDb, superAdminDb } from "@/lib/db";
import { encryptSecret } from "@/lib/crypto";
import { invalidateZidConfig } from "@/lib/integrations/zid/config";
import { registerZidWebhooks } from "@/lib/integrations/zid/api";
import { startTrackedZidSync } from "@/lib/integrations/zid/sync";

export type SaveZidResult = { ok: boolean; message: string; generatedMarketSecret?: string } | null;

async function guard() {
  const session = await requireSuperAdminSession();
  requireEffectivePermission(session.user.permissions, "platform.settings.manage");
  return session;
}

/**
 * حفظ إعدادات تطبيق زد. الأسرار: فارغ = إبقاء، "مسح" = حذف (رجوع لمتغير البيئة). سر أحداث متجر التطبيقات
 * (ترويسة X-DMS-Zid-Token) يُولَّد هنا ويُعرض مرة واحدة لإضافته كترويسة مخصّصة في لوحة شركاء زد.
 */
export async function saveZidAppSettings(_prev: SaveZidResult, formData: FormData): Promise<SaveZidResult> {
  const session = await guard();
  const text = (k: string) => String(formData.get(k) ?? "").trim();
  const appId = text("appId");
  const clientId = text("clientId");
  if (appId && !/^\d{1,20}$/.test(appId)) return { ok: false, message: "رقم التطبيق (App ID) أرقام فقط — من صفحة التطبيق في لوحة شركاء زد" };
  if (clientId && (clientId.length > 200 || /\s/.test(clientId))) return { ok: false, message: "Client ID غير صالح" };

  const data: Prisma.PlatformSettingsUpdateInput = { zidAppId: appId || null, zidClientId: clientId || null };
  const clientSecret = text("clientSecret");
  if (formData.get("clientSecretClear") === "on") data.encryptedZidClientSecret = null;
  else if (clientSecret) {
    if (clientSecret.length < 8 || clientSecret.length > 500) return { ok: false, message: "Client Secret غير صالح" };
    data.encryptedZidClientSecret = encryptSecret(clientSecret);
  }
  let generatedMarketSecret: string | undefined;
  if (formData.get("generateMarketSecret") === "on") {
    generatedMarketSecret = crypto.randomBytes(32).toString("hex");
    data.encryptedZidMarketSecret = encryptSecret(generatedMarketSecret);
  } else if (formData.get("marketSecretClear") === "on") data.encryptedZidMarketSecret = null;

  const names = formData.getAll("planName").map((v) => String(v).trim());
  const keys = formData.getAll("planKey").map((v) => String(v).trim());
  const validKeys = new Set((await superAdminDb.plan.findMany({ select: { key: true } })).map((p) => p.key));
  const planMap: Record<string, string> = {};
  for (let i = 0; i < names.length; i++) {
    if (!names[i] || !keys[i]) continue;
    if (!validKeys.has(keys[i]!)) return { ok: false, message: `باقة غير موجودة: ${keys[i]}` };
    planMap[names[i]!.slice(0, 100)] = keys[i]!;
  }
  data.zidPlanMapJson = Object.keys(planMap).length ? planMap : Prisma.DbNull;

  await rawDb.platformSettings.upsert({ where: { id: "singleton" }, update: data, create: { id: "singleton", ...(data as Prisma.PlatformSettingsCreateInput) } });
  invalidateZidConfig();
  await superAdminDb.auditLog.create({
    data: {
      userId: session.user.id, action: "platform.zid_app_settings", targetType: "PlatformSettings", targetId: "singleton",
      metaJson: {
        appId: appId || null, clientId: clientId || null, plans: Object.keys(planMap).length,
        clientSecretChanged: "encryptedZidClientSecret" in data, marketSecretChanged: "encryptedZidMarketSecret" in data,
      },
    },
  });
  revalidatePath("/admin/zid");
  revalidatePath("/admin/setup");
  return {
    ok: true,
    message: generatedMarketSecret ? "تم الحفظ — انسخ سر أحداث المتجر الآن (لن يُعرض مرة أخرى)" : "تم حفظ إعدادات تطبيق زد",
    generatedMarketSecret,
  };
}

/** مزامنة متجر تاجر من لوحة الأدمن (دعم فني). */
export async function adminSyncZidStore(tenantId: string) {
  const session = await guard();
  if (await startTrackedZidSync(tenantId, "admin")) {
    await superAdminDb.auditLog.create({ data: { tenantId, userId: session.user.id, action: "platform.zid_sync", targetType: "Integration", targetId: "ZID" } });
  }
  revalidatePath("/admin/zid");
}

/** إعادة الاشتراك في أحداث متجر (بعد تغيّر الدومين أو تعطّل الاشتراكات). */
export async function adminResubscribeZidWebhooks(tenantId: string) {
  const session = await guard();
  const r = await registerZidWebhooks(tenantId).catch((err) => ({ created: 0, failed: [err instanceof Error ? err.message : "فشل"] }));
  await superAdminDb.auditLog.create({ data: { tenantId, userId: session.user.id, action: "platform.zid_resubscribe", targetType: "Integration", targetId: "ZID", metaJson: r } });
  revalidatePath("/admin/zid");
}
