import crypto from "crypto";

// تشفير مفاتيح API الخاصة بكل تاجر (Meta/Zid/Salla access tokens) قبل تخزينها.
// AES-256-GCM مع مفتاح مشتق من ENCRYPTION_KEY (env). لا نخزّن أي token كنص صريح أبداً.

const ALGORITHM = "aes-256-gcm";

/**
 * لا يوجد أي fallback هنا عمداً (لا لقيمة ثابتة ولا لإعادة استخدام NEXTAUTH_SECRET) — كانا يسمحان
 * بتشفير بيانات حقيقية (Meta/Zid/Salla access tokens) بمفتاح مكشوف علناً في الكود المصدري إذا نُسي
 * ضبط ENCRYPTION_KEY في بيئة الإنتاج. الفشل الصريح عند الإقلاع أفضل من تشفير ضعيف صامت.
 */
function getKey(): Buffer {
  const secret = process.env.ENCRYPTION_KEY;
  if (!secret) {
    throw new Error("ENCRYPTION_KEY غير مضبوط — لا يمكن تشفير/فك تشفير أي بيانات حساسة بدونه. اضبطه في متغيرات البيئة قبل التشغيل.");
  }
  return crypto.createHash("sha256").update(secret).digest();
}

export function encryptSecret(plaintext: string): string {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv(ALGORITHM, getKey(), iv);
  const encrypted = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const authTag = cipher.getAuthTag();
  return [iv.toString("base64"), authTag.toString("base64"), encrypted.toString("base64")].join(".");
}

export function decryptSecret(ciphertext: string): string {
  const [ivB64, authTagB64, dataB64] = ciphertext.split(".");
  if (!ivB64 || !authTagB64 || !dataB64) {
    throw new Error("Invalid ciphertext format");
  }
  const decipher = crypto.createDecipheriv(ALGORITHM, getKey(), Buffer.from(ivB64, "base64"));
  decipher.setAuthTag(Buffer.from(authTagB64, "base64"));
  const decrypted = Buffer.concat([
    decipher.update(Buffer.from(dataB64, "base64")),
    decipher.final(),
  ]);
  return decrypted.toString("utf8");
}

export function verifyHmacSignature(payload: string, signature: string, secret: string): boolean {
  const expected = crypto.createHmac("sha256", secret).update(payload).digest("hex");
  const expectedBuf = Buffer.from(expected);
  const sigBuf = Buffer.from(signature.replace(/^sha256=/, ""));
  if (expectedBuf.length !== sigBuf.length) return false;
  return crypto.timingSafeEqual(expectedBuf, sigBuf);
}

/** مقارنة نصّية بزمن ثابت — لأي مقارنة "سرّ مقابل سرّ" (مثل رموز تحقق webhook) بدل `===` العادية. */
export function timingSafeStringEqual(a: string, b: string): boolean {
  const aBuf = Buffer.from(a);
  const bBuf = Buffer.from(b);
  if (aBuf.length !== bBuf.length) return false;
  return crypto.timingSafeEqual(aBuf, bBuf);
}
