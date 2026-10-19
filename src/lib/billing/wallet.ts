import crypto from "crypto";
import { Prisma } from "@prisma/client";
import { superAdminDb } from "@/lib/db";
import { getPlatformSettings } from "@/lib/platformSettings";
import { sendEmail } from "@/lib/email/send";
import { walletLowBalanceEmail } from "@/lib/email/walletTemplates";

/**
 * محفظة الرسائل المسبقة الدفع (قناة 360dialog). المبادئ:
 *  - الخصم قبل الإرسال، والاسترداد عند فشل الإرسال — لا تُرسل رسالة غير مدفوعة.
 *  - الخصم ذرّي بشرط الرصيد داخل نفس جملة UPDATE (`balance >= cost`) — طلبات إرسال متزامنة لا يمكن أن
 *    تُنزل الرصيد تحت الصفر مهما كان التزامن.
 *  - كل حركة تُسجَّل في WalletTransaction (دفتر لا يُعدَّل)، وكل رسالة في MessageUsage.
 *  - تسعير لكل رسالة حسب الفئة والدولة (نموذج Meta منذ يوليو 2025): رسائل الخدمة (رد حر داخل نافذة
 *    الـ24 ساعة) مجانية؛ التسويق/الخدمات/المصادقة بسعر Meta من جدول MessageRate + هامش المنصة.
 */

export type MessageCategory = "MARKETING" | "UTILITY" | "AUTHENTICATION" | "SERVICE";
const PAID_CATEGORIES = new Set<MessageCategory>(["MARKETING", "UTILITY", "AUTHENTICATION"]);

export class InsufficientWalletBalanceError extends Error {
  readonly code = "INSUFFICIENT_BALANCE";
  constructor(public readonly required: number, public readonly balance: number) {
    super(`رصيد المحفظة غير كافٍ — المطلوب ${required.toFixed(4)} ر.س والمتاح ${balance.toFixed(4)} ر.س. اشحن المحفظة للمتابعة.`);
  }
}

export class MessageRateMissingError extends Error {
  readonly code = "RATE_NOT_CONFIGURED";
  constructor(country: string, category: string) {
    super(`لم يُضبط سعر رسائل ${category} لدولة ${country} — يضبطه مالك المنصة من لوحة الأدمن.`);
  }
}

// مفاتيح الدول الأطول أولاً (مثل 971 قبل 97) — يكفي للأسواق المستهدفة، والباقي "OTHER".
const COUNTRY_PREFIXES: Array<[string, string]> = [
  ["966", "SA"], ["971", "AE"], ["965", "KW"], ["974", "QA"], ["973", "BH"], ["968", "OM"],
  ["962", "JO"], ["961", "LB"], ["964", "IQ"], ["212", "MA"], ["216", "TN"], ["213", "DZ"], ["20", "EG"],
  ["90", "TR"], ["44", "GB"], ["1", "US"],
];

export function countryFromPhone(phoneE164: string): string {
  const digits = phoneE164.replace(/\D/g, "");
  return COUNTRY_PREFIXES.find(([prefix]) => digits.startsWith(prefix))?.[1] ?? "OTHER";
}

const round4 = (n: number) => Math.round(n * 10000) / 10000;
const dec = (n: number) => new Prisma.Decimal(round4(n).toFixed(4));

export type MessagePrice = { category: MessageCategory; country: string; baseCost: number; cost: number };

/** سعر رسالة واحدة على التاجر (بعد هامش المنصة). يرمي MessageRateMissingError لفئة مدفوعة بلا سعر مضبوط. */
export async function priceMessage(phoneE164: string, category: MessageCategory): Promise<MessagePrice> {
  const country = countryFromPhone(phoneE164);
  if (!PAID_CATEGORIES.has(category)) return { category, country, baseCost: 0, cost: 0 };

  const rate =
    (await superAdminDb.messageRate.findUnique({ where: { country_category: { country, category } } })) ??
    (await superAdminDb.messageRate.findUnique({ where: { country_category: { country: "*", category } } }));
  if (!rate) throw new MessageRateMissingError(country, category);

  const { walletMarkupBps } = await getPlatformSettings();
  const baseCost = Number(rate.baseRateSar);
  return { category, country, baseCost: round4(baseCost), cost: round4(baseCost * (1 + walletMarkupBps / 10000)) };
}

export async function getWallet(tenantId: string) {
  return superAdminDb.walletBalance.upsert({ where: { tenantId }, update: {}, create: { tenantId } });
}

export type ChargeResult = { usageId: string; cost: number; balanceAfter: number | null };

/**
 * خصم تكلفة رسالة قبل إرسالها. يعيد معرّف MessageUsage لربطه بالرسالة بعد الإرسال (attachMessageId)
 * أو لاستردادها عند فشل الإرسال (refundMessage). يرمي InsufficientWalletBalanceError عند عدم كفاية الرصيد.
 */
export async function chargeMessage(tenantId: string, phoneE164: string, category: MessageCategory): Promise<ChargeResult> {
  const price = await priceMessage(phoneE164, category);

  if (price.cost === 0) {
    const usage = await superAdminDb.messageUsage.create({
      data: { tenantId, category, country: price.country, baseCost: dec(0), cost: dec(0), status: "FREE" },
    });
    return { usageId: usage.id, cost: 0, balanceAfter: null };
  }

  await getWallet(tenantId);
  const result = await superAdminDb.$transaction(async (tx) => {
    // الخصم المشروط ذرّياً: لا صف = رصيد غير كافٍ (لا قراءة ثم كتابة منفصلتان قابلتان للتسابق).
    const rows = await tx.$queryRaw<Array<{ balance: Prisma.Decimal }>>`
      UPDATE "WalletBalance" SET "balance" = "balance" - ${dec(price.cost)}, "updatedAt" = NOW()
      WHERE "tenantId" = ${tenantId} AND "balance" >= ${dec(price.cost)}
      RETURNING "balance"`;
    if (rows.length === 0) {
      const wallet = await tx.walletBalance.findUnique({ where: { tenantId } });
      throw new InsufficientWalletBalanceError(price.cost, Number(wallet?.balance ?? 0));
    }
    const balanceAfter = rows[0]!.balance;
    const usage = await tx.messageUsage.create({
      data: { tenantId, category, country: price.country, baseCost: dec(price.baseCost), cost: dec(price.cost), status: "CHARGED" },
    });
    await tx.walletTransaction.create({
      data: {
        tenantId, type: "DEBIT", amount: dec(-price.cost), balanceAfter,
        description: `رسالة ${CATEGORY_LABELS[category]} (${price.country})`, reference: usage.id,
      },
    });
    return { usageId: usage.id, cost: price.cost, balanceAfter: Number(balanceAfter) };
  });

  await maybeNotifyLowBalance(tenantId).catch((err) => console.error("low balance notify failed:", err));
  return result;
}

export async function attachMessageId(usageId: string, messageId: string | undefined) {
  if (!messageId) return;
  await superAdminDb.messageUsage.update({ where: { id: usageId }, data: { messageId } });
}

/** استرداد تكلفة رسالة فشل إرسالها — آمن للتكرار (idempotencyKey لكل رسالة). */
export async function refundMessage(usageId: string, reason: string) {
  const usage = await superAdminDb.messageUsage.findUnique({ where: { id: usageId } });
  if (!usage || usage.status !== "CHARGED") return;
  const amount = Number(usage.cost);
  await superAdminDb.$transaction(async (tx) => {
    const updated = await tx.messageUsage.updateMany({ where: { id: usageId, status: "CHARGED" }, data: { status: "REFUNDED" } });
    if (updated.count === 0) return; // استُرد مسبقاً
    const wallet = await tx.walletBalance.update({ where: { tenantId: usage.tenantId }, data: { balance: { increment: dec(amount) } } });
    await tx.walletTransaction.create({
      data: {
        tenantId: usage.tenantId, type: "REFUND", amount: dec(amount), balanceAfter: wallet.balance,
        description: `استرداد رسالة لم تُرسل: ${reason.slice(0, 200)}`, reference: usageId, idempotencyKey: `refund:${usageId}`,
      },
    });
  });
}

/**
 * إضافة رصيد (شحن ناجح أو تعديل يدوي من الأدمن). idempotencyKey إلزامي للشحن (معرّف الدفعة) حتى لا
 * تُضاف نفس الدفعة مرتين إذا وصل إشعار الدفع أكثر من مرة.
 */
export async function creditWallet(
  tenantId: string,
  amountSar: number,
  opts: { type: "RECHARGE" | "ADJUSTMENT"; idempotencyKey: string; description: string; reference?: string }
): Promise<{ applied: boolean; balance: number }> {
  if (!(amountSar > 0)) throw new Error("مبلغ الشحن يجب أن يكون أكبر من صفر");
  if (await superAdminDb.walletTransaction.findUnique({ where: { idempotencyKey: opts.idempotencyKey }, select: { id: true } })) {
    return { applied: false, balance: Number((await getWallet(tenantId)).balance) }; // نفس الدفعة طُبّقت سابقاً
  }
  await getWallet(tenantId);
  try {
    const balance = await superAdminDb.$transaction(async (tx) => {
      const wallet = await tx.walletBalance.update({
        where: { tenantId },
        data: { balance: { increment: dec(amountSar) } },
      });
      await tx.walletTransaction.create({
        data: {
          tenantId, type: opts.type, amount: dec(amountSar), balanceAfter: wallet.balance,
          description: opts.description, reference: opts.reference, idempotencyKey: opts.idempotencyKey,
        },
      });
      // رصيد عاد فوق عتبة التنبيه ⇐ يُسمح بتنبيه جديد عند الهبوط القادم.
      if (wallet.balance.greaterThanOrEqualTo(wallet.minAlert)) {
        await tx.walletBalance.update({ where: { tenantId }, data: { lowBalanceNotifiedAt: null } });
      }
      return Number(wallet.balance);
    });
    return { applied: true, balance };
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") {
      return { applied: false, balance: Number((await getWallet(tenantId)).balance) }; // نفس الدفعة طُبّقت سابقاً
    }
    throw err;
  }
}

/** تقدير تكلفة حملة قبل بدئها (عدد المستلمين × سعر الرسالة لفئة القالب، حسب دولة كل مستلم). */
export async function estimateCampaignCost(phones: string[], category: MessageCategory): Promise<number> {
  const byCountry = new Map<string, number>();
  for (const p of phones) byCountry.set(countryFromPhone(p), (byCountry.get(countryFromPhone(p)) ?? 0) + 1);
  let total = 0;
  for (const [country, count] of byCountry) {
    const samplePhone = phones.find((p) => countryFromPhone(p) === country)!;
    total += (await priceMessage(samplePhone, category)).cost * count;
  }
  return round4(total);
}

const LOW_BALANCE_RENOTIFY_MS = 24 * 3600 * 1000;

/** تنبيه رصيد منخفض/نافد لمالك الحساب — مرة لكل هبوط (يُعاد السماح بعد الشحن أو بعد 24 ساعة). */
export async function maybeNotifyLowBalance(tenantId: string) {
  const wallet = await superAdminDb.walletBalance.findUnique({ where: { tenantId } });
  if (!wallet || wallet.balance.greaterThanOrEqualTo(wallet.minAlert)) return;
  if (wallet.lowBalanceNotifiedAt && Date.now() - wallet.lowBalanceNotifiedAt.getTime() < LOW_BALANCE_RENOTIFY_MS) return;
  const claimed = await superAdminDb.walletBalance.updateMany({
    where: { tenantId, OR: [{ lowBalanceNotifiedAt: null }, { lowBalanceNotifiedAt: { lt: new Date(Date.now() - LOW_BALANCE_RENOTIFY_MS) } }] },
    data: { lowBalanceNotifiedAt: new Date() },
  });
  if (claimed.count === 0) return; // عملية أخرى أرسلت التنبيه للتو
  const owner = await superAdminDb.user.findFirst({ where: { tenantId, role: "OWNER", isActive: true }, orderBy: { createdAt: "asc" } });
  if (!owner) return;
  await sendEmail(walletLowBalanceEmail({ to: owner.email, name: owner.name, balance: Number(wallet.balance), threshold: Number(wallet.minAlert) }));
}

export const CATEGORY_LABELS: Record<MessageCategory, string> = {
  MARKETING: "تسويقية", UTILITY: "خدمية", AUTHENTICATION: "مصادقة", SERVICE: "رد خدمة",
};

/**
 * تعديل يدوي من مالك المنصة (تعويض، تصحيح، شحن بتحويل بنكي). موجب = إضافة، سالب = خصم — الخصم
 * مشروط ذرّياً بكفاية الرصيد (لا رصيد سالب أبداً). يُسجَّل في الدفتر وسجل التدقيق بهوية المنفّذ.
 */
export async function adjustWallet(tenantId: string, amountSar: number, reason: string, actorUserId: string): Promise<number> {
  const amount = round4(amountSar);
  if (!amount) throw new Error("أدخل مبلغاً غير صفري");
  if (!reason.trim()) throw new Error("سبب التعديل مطلوب");
  const description = `تعديل يدوي: ${reason.trim().slice(0, 200)}`;

  let balance: number;
  if (amount > 0) {
    balance = (await creditWallet(tenantId, amount, { type: "ADJUSTMENT", idempotencyKey: `adj:${crypto.randomUUID()}`, description })).balance;
  } else {
    await getWallet(tenantId);
    balance = await superAdminDb.$transaction(async (tx) => {
      const rows = await tx.$queryRaw<Array<{ balance: Prisma.Decimal }>>`
        UPDATE "WalletBalance" SET "balance" = "balance" - ${dec(-amount)}, "updatedAt" = NOW()
        WHERE "tenantId" = ${tenantId} AND "balance" >= ${dec(-amount)}
        RETURNING "balance"`;
      if (rows.length === 0) throw new Error("الرصيد الحالي أقل من مبلغ الخصم المطلوب");
      await tx.walletTransaction.create({
        data: { tenantId, type: "ADJUSTMENT", amount: dec(amount), balanceAfter: rows[0]!.balance, description },
      });
      return Number(rows[0]!.balance);
    });
  }
  await superAdminDb.auditLog.create({
    data: { tenantId, userId: actorUserId, action: "wallet.manual_adjustment", targetType: "WalletBalance", targetId: tenantId, metaJson: { amount, reason: reason.trim(), balanceAfter: balance } },
  });
  return balance;
}

export async function setWalletMinAlert(tenantId: string, minAlert: number) {
  if (!(minAlert >= 0)) throw new Error("حد التنبيه يجب أن يكون صفراً أو أكثر");
  await getWallet(tenantId);
  await superAdminDb.walletBalance.update({ where: { tenantId }, data: { minAlert: dec(minAlert), lowBalanceNotifiedAt: null } });
}

export function startOfMonth(d = new Date()) {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1));
}

/** استهلاك الشهر الحالي لكل تاجر: عدد الرسائل المدفوعة، المحصَّل منه، وصافي هامش المنصة. */
export async function monthlyUsageByTenant(tenantIds?: string[]) {
  const rows = await superAdminDb.messageUsage.groupBy({
    by: ["tenantId"],
    where: { createdAt: { gte: startOfMonth() }, status: { in: ["CHARGED", "FREE"] }, ...(tenantIds ? { tenantId: { in: tenantIds } } : {}) },
    _count: { _all: true },
    _sum: { cost: true, baseCost: true },
  });
  return new Map(rows.map((r) => [r.tenantId, {
    messages: r._count._all,
    revenue: round4(Number(r._sum.cost ?? 0)),
    margin: round4(Number(r._sum.cost ?? 0) - Number(r._sum.baseCost ?? 0)),
  }]));
}
