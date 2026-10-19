import { Prisma } from "@prisma/client";
import { superAdminDb } from "@/lib/db";
import { sendEmail } from "@/lib/email/send";
import { migrationInviteEmail } from "@/lib/email/walletTemplates";
import { getIntegrationAdapter } from "@/lib/integrations/registry";

/**
 * نقل التجار الحاليين من ربط Meta المباشر (القديم) إلى 360dialog تدريجياً (المرحلة 4).
 * حالة النقل تُحفظ داخل metadataJson لربط Meta نفسه (`migration`) — بلا جدول جديد:
 *   INVITED        → دُعي التاجر (بريد + بطاقة في صفحة التكاملات بالخطوات).
 *   D360_CONNECTED → ربط رقمه عبر 360dialog؛ الإرسال يمر تلقائياً عبر 360dialog (أولوية في registry)
 *                    والفوترة من المحفظة، بينما ربط Meta القديم ما زال قائماً احتياطاً.
 *   COMPLETED      → فُصل ربط Meta القديم نهائياً.
 *   CANCELLED      → أُلغيت الدعوة (يبقى التاجر على Meta كما هو).
 * لا شيء يُنقل دون فعل من التاجر نفسه: نقل الرقم يتطلب موافقته في صفحة 360dialog.
 */

export type MigrationStatus = "INVITED" | "D360_CONNECTED" | "COMPLETED" | "CANCELLED";
export type MigrationFeedback = { rating: number; comment: string; at: string; userId: string };
export type MigrationState = {
  status: MigrationStatus;
  invitedAt?: string;
  invitedBy?: string;
  connectedAt?: string;
  completedAt?: string;
  completedBy?: string;
  feedback?: MigrationFeedback;
};

export const MIGRATION_STATUS_LABELS: Record<MigrationStatus | "NOT_INVITED", string> = {
  NOT_INVITED: "لم يُدعَ",
  INVITED: "مدعو",
  D360_CONNECTED: "ربط 360dialog — بانتظار الإنهاء",
  COMPLETED: "اكتمل النقل",
  CANCELLED: "أُلغيت الدعوة",
};

type Json = Record<string, unknown>;

function metaOf(value: Prisma.JsonValue | null | undefined): Json {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Json) : {};
}

export function readMigrationState(metadataJson: Prisma.JsonValue | null | undefined): MigrationState | null {
  const m = metaOf(metadataJson).migration;
  return m && typeof m === "object" && "status" in (m as Json) ? (m as MigrationState) : null;
}

async function writeState(integrationId: string, metadataJson: Prisma.JsonValue | null, next: MigrationState) {
  await superAdminDb.integration.update({
    where: { id: integrationId },
    data: { metadataJson: { ...metaOf(metadataJson), migration: next } as Prisma.InputJsonValue },
  });
}

/** ربط Meta مباشر حقيقي (غير تجريبي) — الوحيد المعني بالنقل. */
async function findLiveMeta(tenantId: string) {
  return superAdminDb.integration.findFirst({ where: { tenantId, provider: "META_WHATSAPP", isSandbox: false } });
}

export type MigrationRow = {
  tenantId: string;
  tenantName: string;
  integrationId: string;
  phone: string | null;
  metaStatus: string;
  state: MigrationState | null;
  d360: { status: string; ready: boolean; phone: string | null } | null;
};

/** كل التجار على Meta المباشر (أو الذين مرّوا بالنقل) مع حالة ربط 360dialog لكل منهم — للوحة الأدمن. */
export async function listMigrationRows(): Promise<MigrationRow[]> {
  const metas = (
    await superAdminDb.integration.findMany({
      where: { provider: "META_WHATSAPP", isSandbox: false },
      include: { tenant: { select: { name: true } } },
      orderBy: { createdAt: "asc" },
    })
  ).filter((m) => m.status !== "DISCONNECTED" || readMigrationState(m.metadataJson) !== null);
  const d360s = await superAdminDb.integration.findMany({
    where: { provider: "D360DIALOG", tenantId: { in: metas.map((m) => m.tenantId) } },
  });
  const d360By = new Map(d360s.map((d) => [d.tenantId, d]));
  return metas.map((m) => {
    const meta = metaOf(m.metadataJson);
    const d = d360By.get(m.tenantId);
    const dMeta = d ? metaOf(d.metadataJson) : {};
    return {
      tenantId: m.tenantId,
      tenantName: m.tenant.name,
      integrationId: m.id,
      phone: (meta.displayPhoneNumber as string) ?? (meta.connectedPhoneE164 as string) ?? null,
      metaStatus: m.status,
      state: readMigrationState(m.metadataJson),
      d360: d ? { status: d.status, ready: d.status === "CONNECTED" && !d.isSandbox && !d.pendingVerification, phone: (dMeta.displayPhoneNumber as string) ?? null } : null,
    };
  });
}

/**
 * دعوة دفعة من التجار للنقل (تدريجياً — الأدمن يختار من يُدعى). يتخطى من دُعي أو اكتمل نقله مسبقاً،
 * ويرسل بريداً لمالك كل متجر. يعيد عدد الدعوات الجديدة الفعلية.
 */
export async function inviteTenantsToMigration(tenantIds: string[], actorUserId: string): Promise<{ invited: number; skipped: number }> {
  let invited = 0;
  let skipped = 0;
  for (const tenantId of [...new Set(tenantIds)]) {
    const meta = await findLiveMeta(tenantId);
    const current = meta ? readMigrationState(meta.metadataJson) : null;
    if (!meta || meta.status === "DISCONNECTED" || (current && current.status !== "CANCELLED")) {
      skipped++;
      continue;
    }
    await writeState(meta.id, meta.metadataJson, { status: "INVITED", invitedAt: new Date().toISOString(), invitedBy: actorUserId });
    await superAdminDb.auditLog.create({
      data: { tenantId, userId: actorUserId, action: "platform.migration_invite", targetType: "Integration", targetId: meta.id },
    });
    const owner = await superAdminDb.user.findFirst({ where: { tenantId, role: "OWNER", isActive: true }, orderBy: { createdAt: "asc" } });
    if (owner) {
      await sendEmail(migrationInviteEmail({ to: owner.email, name: owner.name })).catch((err) =>
        console.error(`⚠️ تعذّر إرسال دعوة النقل للتاجر ${tenantId}:`, err instanceof Error ? err.message : err)
      );
    }
    invited++;
  }
  return { invited, skipped };
}

export async function cancelMigrationInvite(tenantId: string, actorUserId: string) {
  const meta = await findLiveMeta(tenantId);
  const current = meta ? readMigrationState(meta.metadataJson) : null;
  if (!meta || !current || current.status !== "INVITED") throw new Error("لا توجد دعوة نقل قائمة لهذا التاجر");
  await writeState(meta.id, meta.metadataJson, { ...current, status: "CANCELLED" });
  await superAdminDb.auditLog.create({
    data: { tenantId, userId: actorUserId, action: "platform.migration_cancel", targetType: "Integration", targetId: meta.id },
  });
}

/**
 * يُستدعى بعد ربط قناة 360dialog بنجاح (connectD360Channel): إن كان للتاجر ربط Meta مباشر قائم
 * تُسجَّل الخطوة — حتى لو لم يُدعَ (ربط من تلقاء نفسه) — ليظهر في لوحة النقل ويُنهى لاحقاً.
 */
export async function markMigrationD360Connected(tenantId: string) {
  const meta = await findLiveMeta(tenantId);
  if (!meta || meta.status === "DISCONNECTED") return;
  const current = readMigrationState(meta.metadataJson);
  if (current?.status === "COMPLETED") return;
  await writeState(meta.id, meta.metadataJson, { ...(current ?? {}), status: "D360_CONNECTED", connectedAt: new Date().toISOString() });
}

/**
 * إنهاء النقل: يفصل ربط Meta المباشر القديم. مشروط بأن قناة 360dialog متصلة وجاهزة فعلاً (لا تحقق
 * معلَّق) — وإلا يبقى التاجر بلا قناة إرسال. يستطيع التاجر نفسه أو الأدمن تنفيذه.
 */
export async function completeMigration(tenantId: string, actorUserId: string): Promise<void> {
  const d360 = await superAdminDb.integration.findFirst({ where: { tenantId, provider: "D360DIALOG" } });
  if (!d360 || d360.status !== "CONNECTED" || d360.isSandbox) throw new Error("اربط رقمك عبر 360dialog أولاً قبل فصل الربط القديم");
  if (d360.pendingVerification) throw new Error("قناة 360dialog ما زالت قيد التفعيل — انتظر حتى تصبح جاهزة ثم أنهِ النقل");
  const meta = await findLiveMeta(tenantId);
  if (!meta) throw new Error("لا يوجد ربط Meta مباشر لهذا الحساب");
  const current = readMigrationState(meta.metadataJson);
  if (current?.status === "COMPLETED") return;

  if (meta.status !== "DISCONNECTED") await getIntegrationAdapter("META_WHATSAPP").disconnect(tenantId);
  const fresh = await superAdminDb.integration.findUniqueOrThrow({ where: { id: meta.id } });
  await writeState(meta.id, fresh.metadataJson, {
    ...(current ?? {}), status: "COMPLETED", completedAt: new Date().toISOString(), completedBy: actorUserId,
  });
  await superAdminDb.auditLog.create({
    data: { tenantId, userId: actorUserId, action: "integration.migration_complete", targetType: "Integration", targetId: meta.id, metaJson: { d360ChannelId: d360.channelId } },
  });
}

/** تقييم التاجر لتجربة النقل (1–5 + ملاحظة) — يظهر في لوحة النقل لدى الأدمن. */
export async function saveMigrationFeedback(tenantId: string, userId: string, rating: number, comment: string) {
  if (!Number.isInteger(rating) || rating < 1 || rating > 5) throw new Error("اختر تقييماً من 1 إلى 5");
  const meta = await findLiveMeta(tenantId);
  const current = meta ? readMigrationState(meta.metadataJson) : null;
  if (!meta || !current || current.status !== "COMPLETED") throw new Error("التقييم متاح بعد اكتمال النقل");
  const feedback: MigrationFeedback = { rating, comment: comment.trim().slice(0, 1000), at: new Date().toISOString(), userId };
  await writeState(meta.id, meta.metadataJson, { ...current, feedback });
  await superAdminDb.auditLog.create({
    data: { tenantId, userId, action: "integration.migration_feedback", targetType: "Integration", targetId: meta.id, metaJson: { rating } },
  });
}

/** حالة النقل لتاجر واحد — لصفحة التكاملات. null = لا ربط Meta مباشر حقيقي (لا شيء يُعرض). */
export async function getTenantMigration(tenantId: string) {
  const meta = await findLiveMeta(tenantId);
  if (!meta) return null;
  const state = readMigrationState(meta.metadataJson);
  if (meta.status === "DISCONNECTED" && state?.status !== "COMPLETED") return null;
  const d360 = await superAdminDb.integration.findFirst({ where: { tenantId, provider: "D360DIALOG" } });
  return {
    state,
    metaConnected: meta.status !== "DISCONNECTED",
    d360Connected: Boolean(d360 && d360.status === "CONNECTED" && !d360.isSandbox),
    d360Ready: Boolean(d360 && d360.status === "CONNECTED" && !d360.isSandbox && !d360.pendingVerification),
  };
}
