"use server";

import crypto from "crypto";
import { revalidatePath } from "next/cache";
import { Prisma } from "@prisma/client";
import { requireSuperAdminSession } from "@/lib/session";
import { requireEffectivePermission } from "@/lib/rbac";
import { rawDb, superAdminDb } from "@/lib/db";
import { encryptSecret } from "@/lib/crypto";
import { invalidateSallaConfig } from "@/lib/integrations/salla/config";
import { startTrackedSallaSync } from "@/lib/integrations/salla/sync";

export type SaveSallaResult = { ok: boolean; message: string; generatedFunctionsSecret?: string } | null;

async function guard() {
  const session = await requireSuperAdminSession();
  requireEffectivePermission(session.user.permissions, "platform.settings.manage");
  return session;
}

/**
 * حفظ إعدادات تطبيق سلة من لوحة الأدمن. الأسرار: حقل فارغ = إبقاء القيمة الحالية، مربع "مسح" = حذفها
 * (يعود الاحتياط لمتغير البيئة). سر الدوال يمكن توليده هنا ويُعرض مرة واحدة فقط لنسخه في كود دوال سلة.
 */
export async function saveSallaAppSettings(_prev: SaveSallaResult, formData: FormData): Promise<SaveSallaResult> {
  const session = await guard();
  const text = (k: string) => String(formData.get(k) ?? "").trim();

  const appId = text("appId");
  const clientId = text("clientId");
  if (appId && !/^\d{3,20}$/.test(appId)) return { ok: false, message: "رقم التطبيق (App ID) أرقام فقط — من أعلى صفحة التطبيق في بوابة الشركاء" };
  if (clientId && clientId.length > 200) return { ok: false, message: "Client ID غير صالح" };

  const data: Prisma.PlatformSettingsUpdateInput = { sallaAppId: appId || null, sallaClientId: clientId || null };
  const secretField = (field: string, column: "encryptedSallaClientSecret" | "encryptedSallaWebhookSecret" | "encryptedSallaFunctionsSecret") => {
    const value = text(field);
    if (formData.get(`${field}Clear`) === "on") data[column] = null;
    else if (value) {
      if (value.length < 8 || value.length > 500) throw new Error("قيمة سر غير صالحة");
      data[column] = encryptSecret(value);
    }
  };

  let generatedFunctionsSecret: string | undefined;
  try {
    secretField("clientSecret", "encryptedSallaClientSecret");
    secretField("webhookSecret", "encryptedSallaWebhookSecret");
    if (formData.get("generateFunctionsSecret") === "on") {
      generatedFunctionsSecret = crypto.randomBytes(32).toString("hex");
      data.encryptedSallaFunctionsSecret = encryptSecret(generatedFunctionsSecret);
    } else {
      secretField("functionsSecret", "encryptedSallaFunctionsSecret");
    }
  } catch (err) {
    return { ok: false, message: err instanceof Error ? err.message : "قيمة غير صالحة" };
  }

  // ربط باقات سلة بباقات DMS: صفوف (اسم باقة سلة ← مفتاح باقة DMS)، الفارغ يُتجاهل.
  const names = formData.getAll("planName").map((v) => String(v).trim());
  const keys = formData.getAll("planKey").map((v) => String(v).trim());
  const validKeys = new Set((await superAdminDb.plan.findMany({ select: { key: true } })).map((p) => p.key));
  const planMap: Record<string, string> = {};
  for (let i = 0; i < names.length; i++) {
    if (!names[i] || !keys[i]) continue;
    if (!validKeys.has(keys[i]!)) return { ok: false, message: `باقة غير موجودة: ${keys[i]}` };
    planMap[names[i]!.slice(0, 100)] = keys[i]!;
  }
  data.sallaPlanMapJson = Object.keys(planMap).length ? planMap : Prisma.DbNull;

  await rawDb.platformSettings.upsert({ where: { id: "singleton" }, update: data, create: { id: "singleton", ...(data as Prisma.PlatformSettingsCreateInput) } });
  invalidateSallaConfig();
  await superAdminDb.auditLog.create({
    data: {
      userId: session.user.id, action: "platform.salla_app_settings", targetType: "PlatformSettings", targetId: "singleton",
      // لا تُسجَّل أي قيمة سرية — فقط أي الحقول تغيّرت.
      metaJson: {
        appId: appId || null, clientId: clientId || null, plans: Object.keys(planMap).length,
        clientSecretChanged: "encryptedSallaClientSecret" in data, webhookSecretChanged: "encryptedSallaWebhookSecret" in data,
        functionsSecretChanged: "encryptedSallaFunctionsSecret" in data,
      },
    },
  });
  revalidatePath("/admin/salla");
  revalidatePath("/admin/setup");
  return {
    ok: true,
    message: generatedFunctionsSecret ? "تم الحفظ — انسخ سر الدوال الجديد الآن (لن يُعرض مرة أخرى)" : "تم حفظ إعدادات تطبيق سلة",
    generatedFunctionsSecret,
  };
}

/** مزامنة متجر تاجر من لوحة الأدمن (دعم فني) — نفس المزامنة المتتبَّعة بالخلفية. */
export async function adminSyncSallaStore(tenantId: string) {
  const session = await guard();
  const started = await startTrackedSallaSync(tenantId, "admin");
  if (started) {
    await superAdminDb.auditLog.create({
      data: { tenantId, userId: session.user.id, action: "platform.salla_sync", targetType: "Integration", targetId: "SALLA" },
    });
  }
  revalidatePath("/admin/salla");
}
