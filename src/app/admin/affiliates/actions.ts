"use server";

import bcrypt from "bcryptjs";
import { revalidatePath } from "next/cache";
import { requireSuperAdminSession } from "@/lib/session";
import { requireEffectivePermission } from "@/lib/rbac";
import { rawDb } from "@/lib/db";
import { sendEmail } from "@/lib/email/send";
import { payoutPaidEmail } from "@/lib/email/affiliateTemplates";
import { REFERRAL_CODE_PATTERN, generateReferralCode, normalizeReferralCode } from "@/lib/affiliates/referralCode";
import type { AffiliatePayoutDetails } from "@/lib/affiliates/payoutDetails";
import type { AffiliateTier } from "@prisma/client";

export async function approveAffiliate(affiliateId: string) {
  const session = await requireSuperAdminSession();
  requireEffectivePermission(session.user.permissions, "platform.affiliates.manage");
  await rawDb.affiliate.update({ where: { id: affiliateId }, data: { status: "ACTIVE", rejectionReason: null } });
  revalidatePath("/admin/affiliates");
}

export async function rejectAffiliate(affiliateId: string, reason: string) {
  const session = await requireSuperAdminSession();
  requireEffectivePermission(session.user.permissions, "platform.affiliates.manage");
  await rawDb.affiliate.update({ where: { id: affiliateId }, data: { status: "REJECTED", rejectionReason: reason || null } });
  revalidatePath("/admin/affiliates");
}

export async function suspendAffiliate(affiliateId: string) {
  const session = await requireSuperAdminSession();
  requireEffectivePermission(session.user.permissions, "platform.affiliates.manage");
  await rawDb.affiliate.update({ where: { id: affiliateId }, data: { status: "SUSPENDED" } });
  revalidatePath("/admin/affiliates");
}

export async function reactivateAffiliate(affiliateId: string) {
  const session = await requireSuperAdminSession();
  requireEffectivePermission(session.user.permissions, "platform.affiliates.manage");
  await rawDb.affiliate.update({ where: { id: affiliateId }, data: { status: "ACTIVE" } });
  revalidatePath("/admin/affiliates");
}

/** تعديل يدوي استثنائي للمستوى (ترقية تقديرية، أو تصحيح خطأ) — الترقية التلقائية العادية تتم عبر
 * lib/affiliates/commissionSync.ts، هذا فقط لتدخّل مالك المنصة اليدوي المباشر. */
export async function setAffiliateTier(affiliateId: string, tier: AffiliateTier) {
  const session = await requireSuperAdminSession();
  requireEffectivePermission(session.user.permissions, "platform.affiliates.manage");
  await rawDb.affiliate.update({ where: { id: affiliateId }, data: { tier } });
  revalidatePath("/admin/affiliates");
}

export async function markPayoutPaid(payoutId: string, reference: string) {
  const session = await requireSuperAdminSession();
  requireEffectivePermission(session.user.permissions, "platform.affiliates.manage");

  const payout = await rawDb.$transaction(async (tx) => {
    const updated = await tx.payout.update({
      where: { id: payoutId },
      data: { status: "PAID", paidAt: new Date(), reference: reference || null },
      include: { affiliate: { select: { email: true, name: true } } },
    });
    await tx.commission.updateMany({ where: { payoutId }, data: { status: "PAID" } });
    return updated;
  });

  await sendEmail(
    payoutPaidEmail({ to: payout.affiliate.email, name: payout.affiliate.name, amountSar: payout.amountSar, reference: payout.reference })
  ).catch((err) => {
    console.error(`❌ فشل إرسال بريد تأكيد الصرف للمسوّق ${payout.affiliateId}:`, err);
  });

  revalidatePath("/admin/affiliates");
}

/** فشل الصرف الفعلي (تحويل بنكي مرفوض مثلاً) — يُعيد العمولات لحالة "معتمدة ومتاحة" من جديد
 * (payoutId يُصفَّر) بدل أن تبقى عالقة داخل طلب صرف فاشل للأبد. */
export async function markPayoutFailed(payoutId: string) {
  const session = await requireSuperAdminSession();
  requireEffectivePermission(session.user.permissions, "platform.affiliates.manage");

  await rawDb.$transaction(async (tx) => {
    await tx.payout.update({ where: { id: payoutId }, data: { status: "FAILED" } });
    await tx.commission.updateMany({ where: { payoutId }, data: { payoutId: null } });
  });

  revalidatePath("/admin/affiliates");
}

/** تعديل كود الإحالة يدوياً من الأدمن (كان غير قابل للتعديل إطلاقاً سابقاً) — يفرض نفس صيغة/طول
 * generateReferralCode والتحقق من الفرادة، مع تحويل لحالة أحرف كبيرة دائماً (نفس منطق التوليد
 * التلقائي) لتفادي التباس تطابق حساس لحالة الأحرف عند مطابقة الكود لاحقاً. **تحذير**: أي رابط منشور
 * فعلياً بالكود القديم يتوقف عن العمل فوراً بعد هذا التعديل — لا إعادة توجيه تلقائية من الكود القديم.
 */
export async function updateAffiliateReferralCode(affiliateId: string, rawCode: string) {
  const session = await requireSuperAdminSession();
  requireEffectivePermission(session.user.permissions, "platform.affiliates.manage");

  const code = normalizeReferralCode(rawCode);
  if (!REFERRAL_CODE_PATTERN.test(code)) {
    throw new Error("كود الإحالة يجب أن يكون 3-32 حرفاً إنجليزياً/رقماً فقط (يُسمح أيضاً بـ - و _)");
  }

  const taken = await rawDb.affiliate.findFirst({ where: { referralCode: code, id: { not: affiliateId } } });
  if (taken) throw new Error("كود الإحالة هذا مُستخدَم بالفعل لمسوّق آخر");

  await rawDb.affiliate.update({ where: { id: affiliateId }, data: { referralCode: code } });
  revalidatePath(`/admin/affiliates/${affiliateId}`);
  revalidatePath("/admin/affiliates");
}

/** تعديل البيانات الشخصية الأساسية (الاسم/البريد/الهاتف) من الأدمن — البريد فريد عبر جدول Affiliate
 * كاملاً (يُستخدَم لتسجيل الدخول)، فيُتحقَّق من عدم تعارضه مع مسوّق آخر بنفس أسلوب فحص referralCode. */
export async function updateAffiliateProfile(affiliateId: string, formData: FormData) {
  const session = await requireSuperAdminSession();
  requireEffectivePermission(session.user.permissions, "platform.affiliates.manage");

  const name = String(formData.get("name") ?? "").trim();
  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  const phone = String(formData.get("phone") ?? "").trim() || null;

  if (!name) throw new Error("الاسم مطلوب");
  if (!email || !email.includes("@")) throw new Error("بريد إلكتروني غير صالح");

  const taken = await rawDb.affiliate.findFirst({ where: { email, id: { not: affiliateId } } });
  if (taken) throw new Error("هذا البريد الإلكتروني مستخدَم بالفعل لمسوّق آخر");

  await rawDb.affiliate.update({ where: { id: affiliateId }, data: { name, email, phone } });
  revalidatePath(`/admin/affiliates/${affiliateId}`);
}

/** تعديل سجل بيانات الصرف المرجعي (Affiliate.payoutMethod/payoutDetailsJson) — راجع تعليق
 * lib/affiliates/payoutDetails.ts للفرق عن Payout.method لكل طلب صرف على حدة. */
export async function updateAffiliatePayoutInfo(affiliateId: string, formData: FormData) {
  const session = await requireSuperAdminSession();
  requireEffectivePermission(session.user.permissions, "platform.affiliates.manage");

  const payoutMethod = String(formData.get("payoutMethod") ?? "").trim() || null;
  const paymentTypeRaw = String(formData.get("paymentType") ?? "bank");
  const details: AffiliatePayoutDetails = {
    paymentType: paymentTypeRaw === "wallet" ? "wallet" : "bank",
    bankName: String(formData.get("bankName") ?? "").trim() || undefined,
    accountHolderName: String(formData.get("accountHolderName") ?? "").trim() || undefined,
    accountNumber: String(formData.get("accountNumber") ?? "").trim() || undefined,
    iban: String(formData.get("iban") ?? "").trim() || undefined,
    swiftCode: String(formData.get("swiftCode") ?? "").trim() || undefined,
    branchName: String(formData.get("branchName") ?? "").trim() || undefined,
    nationalId: String(formData.get("nationalId") ?? "").trim() || undefined,
    walletProvider: String(formData.get("walletProvider") ?? "").trim() || undefined,
    walletNumber: String(formData.get("walletNumber") ?? "").trim() || undefined,
    notes: String(formData.get("notes") ?? "").trim() || undefined,
  };
  // paymentType نفسه دائماً "موجود" (قيمة افتراضية "bank")، فلا يصح استخدامه وحده لتقرير وجود أي
  // بيانات فعلية — نفحص بقية الحقول تحديداً بدل Object.values(details).some(Boolean) كما كان سابقاً.
  const { paymentType: _paymentType, ...detailFieldsOnly } = details;
  const hasAnyDetail = Object.values(detailFieldsOnly).some(Boolean);

  await rawDb.affiliate.update({
    where: { id: affiliateId },
    data: { payoutMethod, payoutDetailsJson: hasAnyDetail ? details : undefined },
  });
  revalidatePath(`/admin/affiliates/${affiliateId}`);
}

export type CreateAffiliateManuallyResult = { success: true; referralCode: string } | { success: false; error: string };

/** إنشاء مسوّق جديد يدوياً من الأدمن بكود إحالة مخصَّص اختياري — بديل مسار التقديم الذاتي
 * (affiliates/apply) لشركاء يتواصل معهم فريق المبيعات مباشرة (لا حاجة لمرورهم بمركز المراجعة، نفس
 * فلسفة createTenantManually في admin/tenants/actions.ts). كلمة المرور يحدّدها الأدمن نفسه هنا
 * ويبلّغها للمسوّق يدوياً (لا بنية setup-token/بريد مخصَّصة لـAffiliate حالياً، خلافاً لـUser). */
export async function createAffiliateManually(formData: FormData): Promise<CreateAffiliateManuallyResult> {
  const session = await requireSuperAdminSession();
  requireEffectivePermission(session.user.permissions, "platform.affiliates.manage");

  const name = String(formData.get("name") ?? "").trim();
  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  const phone = String(formData.get("phone") ?? "").trim() || null;
  const password = String(formData.get("password") ?? "");
  const tierRaw = String(formData.get("tier") ?? "STARTER");
  const tier: AffiliateTier = tierRaw === "GROWTH" || tierRaw === "ELITE" ? tierRaw : "STARTER";
  const rawCode = String(formData.get("referralCode") ?? "").trim();

  if (!name) return { success: false, error: "الاسم مطلوب" };
  if (!email || !email.includes("@")) return { success: false, error: "بريد إلكتروني غير صالح" };
  if (password.length < 8) return { success: false, error: "كلمة المرور يجب أن تكون 8 أحرف على الأقل" };

  const emailTaken = await rawDb.affiliate.findUnique({ where: { email } });
  if (emailTaken) return { success: false, error: "هذا البريد الإلكتروني مسجَّل بالفعل في برنامج التسويق بالعمولة" };

  let referralCode: string;
  if (rawCode) {
    referralCode = normalizeReferralCode(rawCode);
    if (!REFERRAL_CODE_PATTERN.test(referralCode)) {
      return { success: false, error: "كود الإحالة يجب أن يكون 3-32 حرفاً إنجليزياً/رقماً فقط (يُسمح أيضاً بـ - و _)" };
    }
    const taken = await rawDb.affiliate.findUnique({ where: { referralCode } });
    if (taken) return { success: false, error: "كود الإحالة هذا مُستخدَم بالفعل" };
  } else {
    referralCode = generateReferralCode();
    // إعادة محاولة بسيطة عند تصادم نادر — نفس منطق submitAffiliateApplication بالحرف.
    for (let attempt = 0; attempt < 5; attempt++) {
      const taken = await rawDb.affiliate.findUnique({ where: { referralCode } });
      if (!taken) break;
      referralCode = generateReferralCode();
    }
  }

  const passwordHash = await bcrypt.hash(password, 10);
  await rawDb.affiliate.create({
    data: { name, email, phone, passwordHash, referralCode, tier, status: "ACTIVE" },
  });

  revalidatePath("/admin/affiliates");
  return { success: true, referralCode };
}
