import { NextRequest, NextResponse } from "next/server";
import { IntegrationProvider } from "@prisma/client";
import { getCurrentSession } from "@/lib/session";
import { withTenant } from "@/lib/db";
import { isPlatformRole } from "@/lib/rbac";
import { decryptSecret } from "@/lib/crypto";
import { checkTenantRateLimit } from "@/lib/rateLimit";
import { downloadD360Media } from "@/lib/integrations/d360/client";
import { downloadMetaMedia } from "@/lib/integrations/meta/mediaDownload";

/** أنواع تُعرض داخل الصفحة مباشرة — أي نوع آخر يُنزَّل كملف (لا تنفيذ HTML/SVG/JS من محتوى عميل خارجي). */
const INLINE_TYPES = /^(image\/(jpeg|png|webp|gif)|audio\/(ogg|mpeg|mp4|aac|amr|opus)|video\/(mp4|3gpp)|application\/pdf)(;.*)?$/i;

/**
 * وسائط رسالة واردة (صورة/صوت/مستند) تُجلب لحظياً من مزوّد واتساب بمعرّفها — بلا تخزين ملفات على خوادمنا.
 * الوصول: جلسة تاجر صاحب المحادثة فقط (العزل عبر withTenant + RLS)، والملف لا يُخزَّن في ذاكرة المتصفح
 * المشتركة. المعرّف صالح ~7 أيام (360dialog) / 30 يوماً (Meta) — بعدها يعيد 410.
 */
export async function GET(_req: NextRequest, props: { params: Promise<{ messageId: string }> }) {
  const session = await getCurrentSession();
  if (!session?.user || isPlatformRole(session.user.role) || !session.user.tenantId) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const tenantId = session.user.tenantId;
  const { messageId } = await props.params;
  if (!/^[A-Za-z0-9_-]{10,40}$/.test(messageId)) return NextResponse.json({ error: "not found" }, { status: 404 });
  if (!(await checkTenantRateLimit(tenantId, "inbox-media", 600, 60)).allowed) return new NextResponse("Rate limit exceeded", { status: 429 });

  const { message, integrations } = await withTenant(tenantId, async (tx) => ({
    message: await tx.message.findFirst({ where: { id: messageId, tenantId }, select: { providerMediaId: true, type: true } }),
    integrations: await tx.integration.findMany({
      where: { tenantId, provider: { in: [IntegrationProvider.D360DIALOG, IntegrationProvider.META_WHATSAPP] }, isSandbox: false, encryptedAccessToken: { not: null } },
      select: { provider: true, encryptedAccessToken: true },
    }),
  }));
  if (!message?.providerMediaId) return NextResponse.json({ error: "not found" }, { status: 404 });

  // القناة التي استلمت الرسالة: 360dialog أولاً (الافتراضية) ثم Meta المباشر (رقم قديم أو قبل النقل).
  let media: { buffer: Buffer; mimeType: string } | null = null;
  for (const provider of [IntegrationProvider.D360DIALOG, IntegrationProvider.META_WHATSAPP]) {
    const integration = integrations.find((i) => i.provider === provider);
    if (!integration?.encryptedAccessToken) continue;
    const key = decryptSecret(integration.encryptedAccessToken);
    media = provider === "D360DIALOG" ? await downloadD360Media(message.providerMediaId, key) : await downloadMetaMedia(message.providerMediaId, key);
    if (media) break;
  }
  if (!media) return NextResponse.json({ error: "انتهت صلاحية الوسائط لدى واتساب أو تعذّر جلبها" }, { status: 410 });

  const inline = INLINE_TYPES.test(media.mimeType);
  return new NextResponse(new Uint8Array(media.buffer), {
    headers: {
      "Content-Type": inline ? media.mimeType : "application/octet-stream",
      "Content-Disposition": inline ? "inline" : `attachment; filename="file-${messageId}"`,
      "Cache-Control": "private, max-age=3600",
      "X-Content-Type-Options": "nosniff",
      "Content-Security-Policy": "default-src 'none'; sandbox",
    },
  });
}
