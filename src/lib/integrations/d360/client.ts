import crypto from "crypto";

/**
 * عميل 360dialog (مزوّد حلول أعمال واتساب — BSP):
 *  - Partner API (https://hub.360dialog.io/api/v2، ترويسة x-api-key): إدارة قنوات العملاء وتوليد مفاتيحها.
 *  - Messaging API (https://waba-v2.360dialog.io، ترويسة D360-API-KEY لكل قناة): إرسال الرسائل وضبط webhook.
 * العناوين قابلة للتغيير عبر البيئة للاختبار المحلي (خادم وهمي) — الافتراضي خوادم 360dialog الحقيقية.
 * docs.360dialog.com/partner/partner-api/overview
 */

export function d360Config() {
  return {
    partnerId: process.env.D360_PARTNER_ID?.trim() || null,
    partnerApiKey: process.env.D360_API_KEY?.trim() || null,
    webhookSecret: process.env.D360_WEBHOOK_SECRET?.trim() || null,
    hubUrl: (process.env.D360_HUB_URL || "https://hub.360dialog.io/api/v2").replace(/\/$/, ""),
    messagingUrl: (process.env.D360_MESSAGING_URL || "https://waba-v2.360dialog.io").replace(/\/$/, ""),
    onboardingUrl: (process.env.D360_ONBOARDING_URL || "https://app.360dialog.com/onboarding").replace(/\/$/, ""),
  };
}

export function isD360Configured(): boolean {
  const c = d360Config();
  return Boolean(c.partnerId && c.partnerApiKey);
}

/** رابط "Integrated Onboarding" — التاجر يربط رقمه عبر صفحة 360dialog ثم يعود لـ redirectUrl ومعه معرّفات القنوات. */
export function d360OnboardingUrl(redirectUrl: string, state?: string): string {
  const c = d360Config();
  const params = new URLSearchParams({ redirect_url: redirectUrl, ...(state ? { state } : {}) });
  return `${c.onboardingUrl}/${encodeURIComponent(c.partnerId ?? "")}?${params.toString()}`;
}

async function partnerFetch<T = any>(path: string, init: RequestInit = {}): Promise<T> {
  const c = d360Config();
  if (!c.partnerId || !c.partnerApiKey) throw new Error("حساب شريك 360dialog غير مضبوط (D360_PARTNER_ID / D360_API_KEY)");
  const res = await fetch(`${c.hubUrl}/partners/${encodeURIComponent(c.partnerId)}${path}`, {
    ...init,
    headers: { "x-api-key": c.partnerApiKey, "Content-Type": "application/json", Accept: "application/json", ...(init.headers ?? {}) },
    signal: AbortSignal.timeout(20_000),
  });
  const body = await res.json().catch(() => null);
  if (!res.ok) {
    console.error(`❌ 360dialog Partner API ${path} (${res.status}):`, JSON.stringify(body)?.slice(0, 500));
    throw new Error(`فشل طلب 360dialog (${res.status})`);
  }
  return body as T;
}

/** فحص اتصال حساب الشريك (لصفحة جاهزية الربط): يجلب أول قناة فقط ويعيد إجمالي القنوات إن توفر. */
export async function pingD360Partner(): Promise<{ channels: number | null }> {
  const body = await partnerFetch(`/channels?limit=1`);
  const total = typeof body?.total === "number" ? body.total : Array.isArray(body?.partner_channels) ? body.partner_channels.length : null;
  return { channels: total };
}

export type D360ChannelInfo = {
  channelId: string;
  phoneNumber: string | null;
  phoneName: string | null;
  wabaId: string | null;
  availability: string | null; // ready | setting_up | error
  status: string | null;
};

export async function getD360Channel(channelId: string): Promise<D360ChannelInfo> {
  const body = await partnerFetch(`/channels?filters=${encodeURIComponent(JSON.stringify({ id: channelId }))}`);
  const list = Array.isArray(body?.partner_channels) ? body.partner_channels : Array.isArray(body?.channels) ? body.channels : Array.isArray(body) ? body : [];
  const ch = list.find((x: any) => String(x?.id) === channelId) ?? list[0];
  if (!ch) throw new Error("قناة 360dialog غير موجودة لدى الشريك");
  return {
    channelId: String(ch.id),
    phoneNumber: ch.setup_info?.phone_number ?? ch.phone_number ?? null,
    phoneName: ch.setup_info?.phone_name ?? null,
    wabaId: ch.waba_account?.external_id ?? ch.waba_account?.id ?? null,
    availability: ch.availability_status ?? null,
    status: ch.status ?? null,
  };
}

/** توليد مفتاح Messaging API لقناة عميل (يُعرض مرة واحدة فقط — يُخزَّن مشفَّراً فوراً). */
export async function generateD360ChannelApiKey(channelId: string): Promise<string> {
  const body = await partnerFetch(`/channels/${encodeURIComponent(channelId)}/api_keys`, { method: "POST", body: "{}" });
  const key = body?.api_key ?? body?.key ?? body?.data?.api_key;
  if (typeof key !== "string" || !key) throw new Error("لم تُرجع 360dialog مفتاح API للقناة");
  return key;
}

/** ضبط رابط webhook رسائل القناة (رسائل واردة + حالات التسليم) على Messaging API. */
export async function setD360ChannelWebhook(apiKey: string, url: string): Promise<void> {
  const c = d360Config();
  const res = await fetch(`${c.messagingUrl}/v1/configs/webhook`, {
    method: "POST",
    headers: { "D360-API-KEY": apiKey, "Content-Type": "application/json" },
    body: JSON.stringify({ url }),
    signal: AbortSignal.timeout(15_000),
  });
  if (!res.ok) {
    console.error(`❌ فشل ضبط webhook قناة 360dialog (${res.status}):`, (await res.text()).slice(0, 300));
    throw new Error(`فشل ضبط webhook القناة (${res.status})`);
  }
}

export async function sendD360Message(apiKey: string, payload: Record<string, unknown>): Promise<{ ok: boolean; messageId?: string; error?: string }> {
  const c = d360Config();
  const res = await fetch(`${c.messagingUrl}/messages`, {
    method: "POST",
    headers: { "D360-API-KEY": apiKey, "Content-Type": "application/json" },
    body: JSON.stringify(payload),
    signal: AbortSignal.timeout(20_000),
  }).catch((err) => ({ ok: false, status: 0, json: async () => ({ error: { message: String(err?.message ?? err) } }) }) as unknown as Response);
  const data = await res.json().catch(() => null);
  if (!res.ok) return { ok: false, error: data?.error?.message ?? data?.meta?.developer_message ?? `فشل الإرسال عبر 360dialog (${res.status})` };
  return { ok: true, messageId: data?.messages?.[0]?.id };
}

/** توقيع webhooks الشريك: x-360dialog-signature = HMAC-SHA256(الجسم الخام، سر المنصة) — مقارنة بزمن ثابت. */
export function verifyD360PartnerSignature(rawBody: string, signature: string | null): boolean {
  const secret = d360Config().webhookSecret;
  if (!secret || !signature) return false;
  const expected = crypto.createHmac("sha256", secret).update(rawBody).digest("hex");
  const a = Buffer.from(expected);
  const b = Buffer.from(signature.replace(/^sha256=/, "").trim());
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}
