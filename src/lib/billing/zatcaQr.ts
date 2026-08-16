import QRCode from "qrcode";

/**
 * ترميز TLV (Tag-Length-Value) المطلوب من هيئة الزكاة والضريبة والجمارك (ZATCA) للمرحلة الأولى —
 * كل حقل: [وسم بايت واحد][طول بايت واحد][قيمة UTF-8]، ثم كل الحقول الخمسة تُرمَّز Base64 معاً لتُدرَج
 * كنص داخل رمز QR. الحقول الخمسة الإلزامية بالترتيب: اسم البائع، الرقم الضريبي، الطابع الزمني (ISO
 * 8601)، إجمالي الفاتورة شامل الضريبة، إجمالي الضريبة.
 */
function tlvField(tag: number, value: string): Buffer {
  const valueBuffer = Buffer.from(value, "utf-8");
  return Buffer.concat([Buffer.from([tag, valueBuffer.length]), valueBuffer]);
}

export function buildZatcaTlvBase64(input: {
  sellerName: string;
  vatNumber: string;
  timestampIso: string;
  invoiceTotal: string;
  vatTotal: string;
}): string {
  const buffer = Buffer.concat([
    tlvField(1, input.sellerName),
    tlvField(2, input.vatNumber),
    tlvField(3, input.timestampIso),
    tlvField(4, input.invoiceTotal),
    tlvField(5, input.vatTotal),
  ]);
  return buffer.toString("base64");
}

/** يُعيد رمز QR كـdata URI (PNG) يحمل نص TLV بصيغة Base64 — جاهز للتضمين المباشر في PDF عبر doc.image(). */
export async function generateZatcaQrDataUri(input: {
  sellerName: string;
  vatNumber: string;
  timestampIso: string;
  invoiceTotal: string;
  vatTotal: string;
}): Promise<string> {
  const tlvBase64 = buildZatcaTlvBase64(input);
  return QRCode.toDataURL(tlvBase64, { margin: 1, width: 160 });
}
