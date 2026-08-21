import { rawDb, superAdminDb } from "@/lib/db";
import { TIER_RATE_PERCENT, tierForReferredCount } from "./tiers";
import { sendEmail } from "@/lib/email/send";
import { commissionApprovedEmail } from "@/lib/email/affiliateTemplates";

const NET_30_MS = 30 * 24 * 3600 * 1000;
const COMMISSION_WINDOW_MONTHS = 12;
const TIER_RANK: Record<string, number> = { STARTER: 0, GROWTH: 1, ELITE: 2 };

/**
 * مهمة مصالحة دورية (نفس نمط lib/accounting/revenueRecognition.ts) بدل ربط إنشاء العمولة مباشرة
 * بكل نقطة تحصيل فاتورة متفرّقة في الكود (admin/approvals، dashboard/billing، webhooks/payment...) —
 * قرار متعمَّد: نقاط تحصيل الفواتير الفعلية أكثر من نقطة واحدة، وربط منطق عمولة بكل واحدة يدوياً
 * هش وعرضة لنسيان نقطة مستقبلية بصمت. المصالحة الدورية ذاتية الشفاء ومصدر حقيقة واحد.
 *
 * Affiliate/Referral/Commission/Payout بلا RLS (لا tenantId على Affiliate نفسه، والبرنامج كله عابر
 * للمستأجرين بطبيعته) — تُقرأ/تُكتب عبر rawDb مباشرة. Invoice/Tenant محميّان بـRLS، فتُقرآن هنا حصراً
 * عبر superAdminDb (نفس نمط lib/admin/revenueAnalytics.ts للتقارير العابرة للمستأجرين) — قراءة فقط،
 * بلا أي كتابة على جداول مستأجرة من هذا الملف إطلاقاً.
 */
export async function syncAffiliateCommissions(): Promise<{ created: number; approved: number; tiersUpdated: number }> {
  const created = await generateCommissionsForNewlyPaidInvoices();
  const approved = await promotePendingToApproved();
  const tiersUpdated = await recalculateAffiliateTiers();
  return { created, approved, tiersUpdated };
}

async function generateCommissionsForNewlyPaidInvoices(): Promise<number> {
  const referrals = await rawDb.referral.findMany({
    select: { id: true, affiliateId: true, tenantId: true, convertedAt: true },
  });
  if (referrals.length === 0) return 0;

  const referralByTenantId = new Map(referrals.map((r) => [r.tenantId, r]));

  const invoices = await superAdminDb.invoice.findMany({
    where: { tenantId: { in: referrals.map((r) => r.tenantId) }, status: "PAID", paidAt: { not: null } },
    select: { id: true, tenantId: true, amountSar: true, paidAt: true },
  });
  if (invoices.length === 0) return 0;

  const alreadyHasCommission = new Set(
    (
      await rawDb.commission.findMany({
        where: { invoiceId: { in: invoices.map((i) => i.id) } },
        select: { invoiceId: true },
      })
    ).map((c) => c.invoiceId)
  );

  const affiliates = await rawDb.affiliate.findMany({
    where: { id: { in: [...new Set(referrals.map((r) => r.affiliateId))] } },
    select: { id: true, tier: true },
  });
  const tierByAffiliateId = new Map(affiliates.map((a) => [a.id, a.tier]));

  let created = 0;
  for (const invoice of invoices) {
    if (!invoice.paidAt || alreadyHasCommission.has(invoice.id)) continue;
    const referral = referralByTenantId.get(invoice.tenantId);
    if (!referral) continue;

    const windowEnd = new Date(referral.convertedAt);
    windowEnd.setMonth(windowEnd.getMonth() + COMMISSION_WINDOW_MONTHS);
    if (invoice.paidAt > windowEnd) continue; // خارج نافذة الـ12 شهراً من تاريخ التحويل

    const tier = tierByAffiliateId.get(referral.affiliateId);
    if (!tier) continue;

    const ratePercent = TIER_RATE_PERCENT[tier];
    const amountSar = Math.round((invoice.amountSar * ratePercent) / 100);
    const eligibleAt = new Date(invoice.paidAt.getTime() + NET_30_MS);

    await rawDb.commission.create({
      data: {
        affiliateId: referral.affiliateId,
        referralId: referral.id,
        invoiceId: invoice.id,
        amountSar,
        ratePercent,
        status: "PENDING",
        eligibleAt,
      },
    });
    created++;
  }
  return created;
}

/** يُرقّي كل عمولة تجاوزت فترة حجز Net 30 إلى APPROVED، ثم يبعث بريد إشعار واحد مجمَّع لكل مسوّق
 * (وليس بريداً منفصلاً لكل عمولة) بإجمالي المبلغ الجديد المعتمَد هذه الدورة + رصيده الكلي المتاح
 * للصرف الآن. */
async function promotePendingToApproved(): Promise<number> {
  // يُجلَب بنفس شرط استعلام updateMany **قبل** تنفيذه — بعد التحديث لا يمكن تمييز العمولات التي
  // اعتُمدت هذه الدورة تحديداً عن أي عمولة اعتُمدت في دورة سابقة (كلاهما status=APPROVED حينها).
  const newlyEligible = await rawDb.commission.findMany({
    where: { status: "PENDING", eligibleAt: { lte: new Date() } },
    select: { id: true, affiliateId: true, amountSar: true },
  });
  if (newlyEligible.length === 0) return 0;

  await rawDb.commission.updateMany({
    where: { id: { in: newlyEligible.map((c) => c.id) } },
    data: { status: "APPROVED" },
  });

  const newlyApprovedByAffiliateId = new Map<string, number>();
  for (const c of newlyEligible) {
    newlyApprovedByAffiliateId.set(c.affiliateId, (newlyApprovedByAffiliateId.get(c.affiliateId) ?? 0) + c.amountSar);
  }
  const affiliateIds = [...newlyApprovedByAffiliateId.keys()];

  const [affiliates, totalApprovedGroups] = await Promise.all([
    rawDb.affiliate.findMany({ where: { id: { in: affiliateIds } }, select: { id: true, email: true, name: true } }),
    rawDb.commission.groupBy({
      by: ["affiliateId"],
      where: { affiliateId: { in: affiliateIds }, status: "APPROVED", payoutId: null },
      _sum: { amountSar: true },
    }),
  ]);
  const totalApprovedByAffiliateId = new Map(totalApprovedGroups.map((g) => [g.affiliateId, g._sum.amountSar ?? 0]));

  for (const affiliate of affiliates) {
    const amountSar = newlyApprovedByAffiliateId.get(affiliate.id) ?? 0;
    const totalApprovedSar = totalApprovedByAffiliateId.get(affiliate.id) ?? amountSar;
    await sendEmail(commissionApprovedEmail({ to: affiliate.email, name: affiliate.name, amountSar, totalApprovedSar })).catch((err) => {
      console.error(`❌ فشل إرسال بريد اعتماد عمولة للمسوّق ${affiliate.id}:`, err);
    });
  }

  return newlyEligible.length;
}

/** ترقية تلقائية فقط (أبداً تخفيض تلقائي) — راجع DECISIONS.md لسبب هذا القرار. */
async function recalculateAffiliateTiers(): Promise<number> {
  const affiliates = await rawDb.affiliate.findMany({ where: { status: "ACTIVE" }, select: { id: true, tier: true } });

  let updated = 0;
  for (const affiliate of affiliates) {
    const paidReferredCount = await rawDb.referral.count({
      where: { affiliateId: affiliate.id, commissions: { some: {} } },
    });
    const eligibleTier = tierForReferredCount(paidReferredCount);
    if (TIER_RANK[eligibleTier]! > TIER_RANK[affiliate.tier]!) {
      await rawDb.affiliate.update({ where: { id: affiliate.id }, data: { tier: eligibleTier } });
      updated++;
    }
  }
  return updated;
}
