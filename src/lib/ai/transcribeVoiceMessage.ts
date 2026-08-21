import { getOpenAiClient } from "@/lib/ai/openaiClient";

/**
 * يفرّغ Buffer صوتي واحد عبر Whisper — تُستدعى من مسارَي الاستقبال (Meta وBaileys) بعد التحقق من
 * أن الباقة تسمح بالميزة (voiceMessagesEnabled). بلا مفتاح OpenAI مُعدّ أو أي فشل شبكي: ترجع null
 * بدل رمي استثناء يوقف استقبال الرسالة بالكامل — رسالة صوتية غير مُفرَّغة أفضل من فقدان الرسالة نفسها.
 *
 * تُبنى `File` عبر باني `File` العام في Node (بلا استيراد `toFile` من حزمة `openai`) — نفس القيد
 * الموثَّق في openaiClient.ts: لا كود آخر في المشروع يستورد حزمة `openai` مباشرة إلا ذلك الملف.
 */
export async function transcribeVoiceMessage(buffer: Buffer, mimeType: string): Promise<string | null> {
  const openai = await getOpenAiClient();
  if (!openai) return null;
  try {
    const file = new File([new Uint8Array(buffer)], "voice-note.ogg", { type: mimeType || "audio/ogg" });
    const transcription = await openai.client.audio.transcriptions.create({ file, model: "whisper-1" });
    return transcription.text?.trim() || null;
  } catch (err) {
    console.error("❌ فشل تفريغ رسالة صوتية واردة عبر Whisper:", err);
    return null;
  }
}
