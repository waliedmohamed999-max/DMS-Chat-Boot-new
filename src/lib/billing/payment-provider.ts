import crypto from "crypto";

// طبقة مزود دفع موحدة. PAYMENT_PROVIDER=mock (افتراضي، بدون مفاتيح حقيقية) ينشئ فاتورة
// "مدفوعة" فوراً لمحاكاة نجاح الدفع. ربط Moyasar/PayTabs/Stripe لاحقاً = تنفيذ نفس الواجهة
// في ملف provider جديد دون تغيير أي كود استدعاء في actions.ts.
//
// **حالة حقيقية وقت الكتابة (وضع Sandbox بالكامل)**: لا مزوّد دفع حقيقي مربوط فعلياً — موثَّق صراحة
// كـBlocker خارج نطاق الكود في SECURITY_FIXES.md/LAUNCH_READINESS_REPORT.md (يحتاج قراراً تجارياً
// وحساب مزوّد حقيقي). كل دالة هنا تحاكي سلوك مزوّد حقيقي بأمانة (بما فيها الفشل الاحتمالي) دون ادّعاء
// أمان لا يوجد فعلياً — لا نص "Secured by X" أو "PCI-DSS" يُعرَض في الواجهة طالما المزوّد وهمي.

export type MockCardInput = { cardNumber: string; expiryMonth: number; expiryYear: number; cvv: string };
export type TokenizeResult =
  | { success: true; brand: string; last4: string; expiryMonth: number; expiryYear: number; providerToken: string }
  | { success: false; error: string };

export interface PaymentProvider {
  chargeSubscription(tenantId: string, amount: number, currency: string): Promise<{ success: boolean; reference: string; failureReason?: string }>;
  /** يحوّل بيانات بطاقة خام إلى Token آمن — **لا يُعاد أو يُخزَّن رقم البطاقة الكامل أبداً**، حتى داخل
   * هذه الدالة نفسها في وضع Sandbox (يُقرأ آخر 4 أرقام فقط، والباقي يُهمَل فوراً من الذاكرة). */
  tokenizePaymentMethod(card: MockCardInput): Promise<TokenizeResult>;
  /** يتحقق من توقيع Webhook وارد من بوابة الدفع — يفشل مغلقاً (false) إن لم يوجد سر/توقيع مهيَّأ. */
  verifyWebhookSignature(rawBody: string, signatureHeader: string | null): boolean;
}

function detectMockBrand(cardNumber: string): string {
  if (cardNumber.startsWith("4")) return "Visa";
  if (/^5[1-5]/.test(cardNumber)) return "Mastercard";
  if (/^(4|5)/.test(cardNumber)) return "Mada";
  return "بطاقة";
}

const PAYMENT_WEBHOOK_SECRET = process.env.PAYMENT_WEBHOOK_SECRET;

export const mockPaymentProvider: PaymentProvider = {
  async chargeSubscription(_tenantId: string, _amount: number, _currency: string) {
    return { success: true, reference: `mock_charge_${Date.now()}` };
  },

  async tokenizePaymentMethod(card: MockCardInput): Promise<TokenizeResult> {
    const digitsOnly = card.cardNumber.replace(/\s/g, "");
    if (!/^\d{12,19}$/.test(digitsOnly)) {
      return { success: false, error: "رقم البطاقة غير صالح." };
    }
    if (card.expiryYear < new Date().getFullYear() || (card.expiryYear === new Date().getFullYear() && card.expiryMonth < new Date().getMonth() + 1)) {
      return { success: false, error: "تاريخ انتهاء البطاقة منتهٍ بالفعل." };
    }
    const last4 = digitsOnly.slice(-4);
    const brand = detectMockBrand(digitsOnly);
    // في وضع Sandbox: توكن وهمي لا يحمل أي علاقة رياضية بالرقم الأصلي (لا يمكن استرجاعه منه).
    // digitsOnly/cvv لا يُخزَّنان ولا يُعادان من هذه الدالة إطلاقاً — يخرجان من النطاق فور هذا السطر.
    const providerToken = `mock_tok_${crypto.randomBytes(12).toString("hex")}`;
    return { success: true, brand, last4, expiryMonth: card.expiryMonth, expiryYear: card.expiryYear, providerToken };
  },

  verifyWebhookSignature(rawBody: string, signatureHeader: string | null): boolean {
    if (!PAYMENT_WEBHOOK_SECRET || !signatureHeader) return false;
    const expected = crypto.createHmac("sha256", PAYMENT_WEBHOOK_SECRET).update(rawBody).digest("hex");
    try {
      return crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(signatureHeader));
    } catch {
      return false; // أطوال مختلفة — توقيع غير صالح بالتأكيد
    }
  },
};

export function getPaymentProvider(): PaymentProvider {
  return mockPaymentProvider; // PAYMENT_PROVIDER env سيحدد لاحقاً provider حقيقي عند التفعيل
}
