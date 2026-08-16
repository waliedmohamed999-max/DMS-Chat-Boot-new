import { cookies } from "next/headers";
import { rawDb } from "@/lib/db";

export const REFERRAL_COOKIE_NAME = "dms_ref";
export const REFERRAL_COOKIE_MAX_AGE_SECONDS = 90 * 24 * 3600; // نافذة إحالة 90 يوماً

/** يقرأ كوكي الإحالة (إن وُجد) ويتحقق أن الكود يخص مسوّقاً ACTIVE فعلياً — لا عمولة لكود مسوّق
 * معلَّق/بانتظار المراجعة/مرفوض. */
export async function resolveReferralAffiliateId(): Promise<string | null> {
  const code = cookies().get(REFERRAL_COOKIE_NAME)?.value;
  if (!code) return null;
  const affiliate = await rawDb.affiliate.findUnique({ where: { referralCode: code }, select: { id: true, status: true } });
  if (!affiliate || affiliate.status !== "ACTIVE") return null;
  return affiliate.id;
}

/** يُستدعى فور إنشاء تينانت جديد فعلياً (register أو موافقة partners/apply) — أول لمسة تفوز، لذلك
 * لا يفعل شيئاً إن كان التينانت مربوطاً بإحالة مسبقاً (القيد الفريد على Referral.tenantId يمنع
 * التكرار على أي حال، لكن الفحص هنا يتجنّب استثناءً غير ضروري). */
export async function createReferralIfAny(tenantId: string): Promise<void> {
  const affiliateId = await resolveReferralAffiliateId();
  if (!affiliateId) return;

  const existing = await rawDb.referral.findUnique({ where: { tenantId } });
  if (existing) return;

  await rawDb.referral.create({ data: { affiliateId, tenantId } });
}
