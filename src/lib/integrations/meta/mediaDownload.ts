/** يجلب وسائط واتساب حقيقية بمعرّفها المؤقت — نداءان متتاليان إلزاميان في Meta Graph API:
 * الأول يُرجع رابط تحميل مؤقت (صالح دقائق معدودة)، والثاني يُنزّل البيانات الفعلية بنفس التوكن.
 * لا يُخزَّن أي ملف على القرص — Buffer في الذاكرة فقط، يُمرَّر مباشرة لـWhisper ثم يُهمَل. */
export async function downloadMetaMedia(mediaId: string, accessToken: string): Promise<{ buffer: Buffer; mimeType: string } | null> {
  try {
    const metaRes = await fetch(`https://graph.facebook.com/v20.0/${mediaId}`, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    if (!metaRes.ok) return null;
    const meta = await metaRes.json();
    if (!meta.url) return null;

    const fileRes = await fetch(meta.url, { headers: { Authorization: `Bearer ${accessToken}` } });
    if (!fileRes.ok) return null;
    const buffer = Buffer.from(await fileRes.arrayBuffer());
    return { buffer, mimeType: meta.mime_type ?? "audio/ogg" };
  } catch (err) {
    console.error("❌ فشل تنزيل وسائط واتساب من Meta:", err);
    return null;
  }
}
