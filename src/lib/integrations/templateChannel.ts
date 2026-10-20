import { IntegrationProvider, Prisma, type TemplateStatus } from "@prisma/client";
import { withTenant } from "@/lib/db";
import { decryptSecret } from "@/lib/crypto";
import { isSandboxMode } from "@/lib/integrations/types";
import { d360Config } from "@/lib/integrations/d360/client";

/**
 * قوالب واتساب عبر القناة الفعلية للتاجر — 360dialog (الافتراضية لكل ربط جديد) أو Meta المباشر (القديم):
 *  - إرسال قالب للمراجعة.
 *  - مزامنة القوالب من المزوّد: استيراد قوالب الحساب المعتمدة مسبقاً (تاجر نُقل من Meta) + تحديث حالة
 *    القوالب قيد المراجعة (إشعار القرار قد لا يصل — المزامنة الدورية تضمن ألا يبقى قالب "قيد المراجعة" للأبد).
 * 360dialog: waba-v2.360dialog.io/v1/configs/templates بترويسة D360-API-KEY (docs.360dialog.com).
 */

export type TemplateButtonInput = { type: "QUICK_REPLY" | "URL" | "PHONE_NUMBER"; text: string; value?: string };
export type TemplateInput = {
  name: string;
  category: string;
  language: string;
  headerType?: string;
  headerText?: string;
  bodyText: string;
  footerText?: string;
  buttons?: TemplateButtonInput[];
};

export type TemplateChannel =
  | { kind: "d360"; apiKey: string }
  | { kind: "meta"; wabaId: string; accessToken: string }
  | { kind: "sandbox" };

const GRAPH = "https://graph.facebook.com/v20.0";

/** القناة الفعلية للقوالب: 360dialog الحقيقي أولاً، ثم Meta المباشر الحقيقي، ثم المحاكاة في وضع Sandbox. */
export async function resolveTemplateChannel(tenantId: string): Promise<TemplateChannel> {
  const rows = await withTenant(tenantId, (tx) =>
    tx.integration.findMany({ where: { tenantId, provider: { in: [IntegrationProvider.D360DIALOG, IntegrationProvider.META_WHATSAPP] }, status: "CONNECTED" } })
  );
  const d360 = rows.find((r) => r.provider === "D360DIALOG" && !r.isSandbox && r.encryptedAccessToken);
  if (d360) return { kind: "d360", apiKey: decryptSecret(d360.encryptedAccessToken!) };
  const meta = rows.find((r) => r.provider === "META_WHATSAPP" && !r.isSandbox && r.encryptedAccessToken);
  const wabaId = (meta?.metadataJson as { wabaId?: string } | null)?.wabaId;
  if (meta && wabaId) return { kind: "meta", wabaId, accessToken: decryptSecret(meta.encryptedAccessToken!) };
  if (await isSandboxMode()) return { kind: "sandbox" };
  throw new Error("لا يوجد رقم واتساب مربوط فعلياً لهذا التاجر — اربط الرقم أولاً من صفحة التكاملات.");
}

/** عدد المتغيرات {{n}} في النص — Meta تشترط أمثلة لكل متغير وإلا يُرفض القالب. */
function variableCount(text: string): number {
  const nums = [...text.matchAll(/\{\{\s*(\d+)\s*\}\}/g)].map((m) => Number(m[1]));
  return nums.length ? Math.max(...nums) : 0;
}

const SAMPLE_VALUES = ["أحمد", "#1024", "250 ر.س", "اليوم", "متجرنا", "الرابط"];

/** مكوّنات القالب بصيغة WhatsApp Cloud API (نفسها لـ Meta و360dialog). */
export function buildTemplateComponents(input: TemplateInput): Record<string, unknown>[] {
  const components: Record<string, unknown>[] = [];
  if (input.headerType && input.headerType !== "NONE") {
    if (input.headerType === "TEXT") {
      const n = variableCount(input.headerText ?? "");
      components.push({ type: "HEADER", format: "TEXT", text: input.headerText, ...(n ? { example: { header_text: SAMPLE_VALUES.slice(0, n) } } : {}) });
    } else {
      components.push({ type: "HEADER", format: input.headerType });
    }
  }
  const bodyVars = variableCount(input.bodyText);
  components.push({
    type: "BODY",
    text: input.bodyText,
    ...(bodyVars ? { example: { body_text: [Array.from({ length: bodyVars }, (_, i) => SAMPLE_VALUES[i % SAMPLE_VALUES.length]!)] } } : {}),
  });
  if (input.footerText) components.push({ type: "FOOTER", text: input.footerText });
  if (input.buttons?.length) {
    components.push({
      type: "BUTTONS",
      buttons: input.buttons.map((b) =>
        b.type === "URL" ? { type: "URL", text: b.text, url: b.value } : b.type === "PHONE_NUMBER" ? { type: "PHONE_NUMBER", text: b.text, phone_number: b.value } : { type: "QUICK_REPLY", text: b.text }
      ),
    });
  }
  return components;
}

async function readJson(res: Response): Promise<any> {
  return res.json().catch(() => null);
}

function providerError(body: any, fallback: string): string {
  return body?.error?.error_user_msg ?? body?.error?.message ?? body?.meta?.developer_message ?? body?.message ?? fallback;
}

/** يرسل القالب لمراجعة واتساب عبر قناة التاجر. يعيد معرّف القالب لدى المزوّد. */
export async function submitTemplateToChannel(channel: Exclude<TemplateChannel, { kind: "sandbox" }>, input: TemplateInput): Promise<{ externalTemplateId: string }> {
  const body = { name: input.name, category: input.category, language: input.language, components: buildTemplateComponents(input) };
  if (channel.kind === "d360") {
    const res = await fetch(`${d360Config().messagingUrl}/v1/configs/templates`, {
      method: "POST",
      headers: { "D360-API-KEY": channel.apiKey, "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify({ ...body, allow_category_change: true }),
      signal: AbortSignal.timeout(20_000),
    });
    const data = await readJson(res);
    if (!res.ok) throw new Error(providerError(data, `فشل إرسال القالب للمراجعة عبر 360dialog (${res.status})`));
    return { externalTemplateId: String(data?.id ?? data?.template_id ?? `d360:${input.name}:${input.language}`) };
  }
  const res = await fetch(`${GRAPH}/${channel.wabaId}/message_templates`, {
    method: "POST",
    headers: { Authorization: `Bearer ${channel.accessToken}`, "Content-Type": "application/json" },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(20_000),
  });
  const data = await readJson(res);
  if (!res.ok) throw new Error(providerError(data, "فشل إرسال القالب لمراجعة Meta."));
  return { externalTemplateId: String(data.id) };
}

type ProviderTemplate = {
  id: string | null;
  name: string;
  language: string;
  category: string;
  status: TemplateStatus;
  rejectedReason: string | null;
  components: Array<Record<string, any>>;
};

/** حالات المزوّد (APPROVED/approved/submitted/in_appeal/…) → حالة المنصة. */
export function mapProviderStatus(raw: unknown): TemplateStatus {
  const s = String(raw ?? "").toLowerCase().replace(/[\s-]/g, "_");
  if (s === "approved" || s.startsWith("active")) return "APPROVED";
  if (s === "rejected") return "REJECTED";
  if (s === "paused") return "PAUSED";
  if (s === "disabled" || s === "deleted") return "DISABLED";
  return "PENDING";
}

async function listChannelTemplates(channel: Exclude<TemplateChannel, { kind: "sandbox" }>): Promise<ProviderTemplate[]> {
  const out: ProviderTemplate[] = [];
  if (channel.kind === "d360") {
    for (let offset = 0; offset < 5000; offset += 500) {
      const res = await fetch(`${d360Config().messagingUrl}/v1/configs/templates?limit=500&offset=${offset}`, {
        headers: { "D360-API-KEY": channel.apiKey, Accept: "application/json" },
        signal: AbortSignal.timeout(30_000),
      });
      const data = await readJson(res);
      if (!res.ok) throw new Error(providerError(data, `فشل جلب القوالب من 360dialog (${res.status})`));
      const items: any[] = data?.waba_templates ?? data?.templates ?? [];
      for (const t of items) {
        out.push({
          id: t.id != null ? String(t.id) : t["external id"] != null ? String(t["external id"]) : t.external_id != null ? String(t.external_id) : null,
          name: String(t.name), language: String(t.language), category: String(t.category ?? "MARKETING").toUpperCase(),
          status: mapProviderStatus(t.status), rejectedReason: t.rejected_reason && t.rejected_reason !== "NONE" ? String(t.rejected_reason) : null,
          components: Array.isArray(t.components) ? t.components : [],
        });
      }
      const total = Number(data?.total ?? data?.count ?? items.length);
      if (items.length < 500 || offset + items.length >= total) break;
    }
    return out;
  }
  let url: string | null = `${GRAPH}/${channel.wabaId}/message_templates?limit=200&fields=id,name,language,category,status,rejected_reason,components`;
  for (let page = 0; url && page < 25; page++) {
    const res: Response = await fetch(url, { headers: { Authorization: `Bearer ${channel.accessToken}` }, signal: AbortSignal.timeout(30_000) });
    const data = await readJson(res);
    if (!res.ok) throw new Error(providerError(data, "فشل جلب القوالب من Meta"));
    for (const t of data?.data ?? []) {
      out.push({
        id: String(t.id), name: String(t.name), language: String(t.language), category: String(t.category ?? "MARKETING").toUpperCase(),
        status: mapProviderStatus(t.status), rejectedReason: t.rejected_reason && t.rejected_reason !== "NONE" ? String(t.rejected_reason) : null,
        components: Array.isArray(t.components) ? t.components : [],
      });
    }
    url = data?.paging?.next ?? null;
  }
  return out;
}

function fromComponents(components: Array<Record<string, any>>) {
  const header = components.find((c) => String(c.type).toUpperCase() === "HEADER");
  const body = components.find((c) => String(c.type).toUpperCase() === "BODY");
  const footer = components.find((c) => String(c.type).toUpperCase() === "FOOTER");
  const buttons = components.find((c) => String(c.type).toUpperCase() === "BUTTONS");
  return {
    headerType: header ? String(header.format ?? "TEXT").toUpperCase() : null,
    headerText: header && String(header.format ?? "TEXT").toUpperCase() === "TEXT" ? (header.text ?? null) : null,
    bodyText: String(body?.text ?? ""),
    footerText: footer?.text ?? null,
    buttonsJson: Array.isArray(buttons?.buttons) && buttons.buttons.length
      ? (buttons.buttons.map((b: any) => ({ type: String(b.type).toUpperCase(), text: String(b.text ?? ""), value: b.url ?? b.phone_number ?? undefined })) as Prisma.InputJsonValue)
      : undefined,
  };
}

export type TemplateSyncResult = { imported: number; updated: number; total: number; channel: TemplateChannel["kind"] };

/**
 * يطابق قوالب المنصة مع قوالب الحساب لدى المزوّد (بالاسم+اللغة): يُحدّث الحالة وسبب الرفض والمعرّف، ويستورد
 * القوالب غير الموجودة عندنا (معتمدة مسبقاً في الحساب). لا يحذف شيئاً محلياً.
 */
export async function syncTemplatesFromChannel(tenantId: string): Promise<TemplateSyncResult> {
  const channel = await resolveTemplateChannel(tenantId);
  if (channel.kind === "sandbox") return { imported: 0, updated: 0, total: 0, channel: "sandbox" };
  const remote = await listChannelTemplates(channel);
  let imported = 0;
  let updated = 0;
  await withTenant(tenantId, async (tx) => {
    const local = await tx.messageTemplate.findMany({ where: { tenantId } });
    const byKey = new Map(local.map((t) => [`${t.name}|${t.language}`, t]));
    for (const r of remote) {
      if (!r.name || !r.language) continue;
      const existing = byKey.get(`${r.name}|${r.language}`);
      if (existing) {
        const statusChanged = existing.status !== r.status;
        const reason = r.status === "REJECTED" || r.status === "PAUSED" ? r.rejectedReason ?? existing.rejectionReason ?? "لم يُحدَّد سبب" : null;
        if (statusChanged || (r.id && existing.externalTemplateId !== r.id) || existing.rejectionReason !== reason) {
          await tx.messageTemplate.update({
            where: { id: existing.id },
            data: { status: r.status, rejectionReason: reason, ...(r.id ? { externalTemplateId: r.id } : {}), ...(statusChanged && r.status !== "PENDING" ? { decidedAt: new Date() } : {}) },
          });
          updated++;
        }
        continue;
      }
      const parts = fromComponents(r.components);
      if (!parts.bodyText) continue;
      await tx.messageTemplate.create({
        data: {
          tenantId, name: r.name, language: r.language, category: ["MARKETING", "UTILITY", "AUTHENTICATION"].includes(r.category) ? r.category : "MARKETING",
          status: r.status, rejectionReason: r.status === "REJECTED" ? r.rejectedReason : null, externalTemplateId: r.id,
          headerType: parts.headerType, headerText: parts.headerText, bodyText: parts.bodyText, footerText: parts.footerText,
          buttonsJson: parts.buttonsJson, submittedAt: new Date(), decidedAt: r.status === "PENDING" ? null : new Date(),
        },
      });
      imported++;
    }
  });
  return { imported, updated, total: remote.length, channel: channel.kind };
}
