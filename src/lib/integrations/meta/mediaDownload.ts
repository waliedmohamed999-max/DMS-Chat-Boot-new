const MAX_MEDIA_BYTES = 16 * 1024 * 1024;

/** يجلب وسائط واتساب حقيقية بمعرّفها المؤقت — نداءان متتاليان إلزاميان في Meta Graph API:
 * الأول يُرجع رابط تحميل مؤقت (صالح دقائق معدودة)، والثاني يُنزّل البيانات الفعلية بنفس التوكن.
 * لا يُخزَّن أي ملف على القرص — Buffer في الذاكرة فقط، يُمرَّر مباشرة لـWhisper ثم يُهمَل. */
export async function downloadMetaMedia(mediaId: string, accessToken: string): Promise<{ buffer: Buffer; mimeType: string } | null> {
  try {
    const metaRes = await fetch(`https://graph.facebook.com/v20.0/${encodeURIComponent(mediaId)}`, {
      headers: { Authorization: `Bearer ${accessToken}` },
      signal: AbortSignal.timeout(15_000),
    });
    if (!metaRes.ok) return null;
    const meta = await metaRes.json();
    if (!meta.url) return null;

    // رابط التحميل يجب أن يكون من نطاقات Meta فقط — لا نرسل التوكن لأي مضيف آخر (SSRF/تسريب).
    const host = new URL(meta.url).hostname;
    if (!/(^|\.)(fbsbx\.com|facebook\.com|fbcdn\.net|whatsapp\.net)$/.test(host)) return null;
    const fileRes = await fetch(meta.url, { headers: { Authorization: `Bearer ${accessToken}` }, signal: AbortSignal.timeout(30_000) });
    if (!fileRes.ok) return null;
    if (Number(fileRes.headers.get("content-length") ?? 0) > MAX_MEDIA_BYTES) return null;
    const buffer = Buffer.from(await fileRes.arrayBuffer());
    if (buffer.length > MAX_MEDIA_BYTES) return null;
    return { buffer, mimeType: meta.mime_type ?? "audio/ogg" };
  } catch (err) {
    console.error("❌ فشل تنزيل وسائط واتساب من Meta:", err);
    return null;
  }
}
