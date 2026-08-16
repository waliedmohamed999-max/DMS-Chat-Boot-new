import { superAdminDb, rawDb } from "@/lib/db";
import type { AccountType } from "@prisma/client";

/** رموز الحسابات الثابتة (غير المرتبطة بباقة) — مصدر واحد بدل نصوص "1.1"/"2.1" متناثرة في الكود. */
export const ACCOUNT_CODES = {
  CASH: "1.1",
  ACCOUNTS_RECEIVABLE: "1.2",
  DEFERRED_REVENUE: "2.1",
  VAT_PAYABLE: "2.2",
  ACCOUNTS_PAYABLE_GATEWAY: "2.3",
  RETAINED_EARNINGS: "3.1",
  EXPENSE_GATEWAY_FEES: "5.1",
  EXPENSE_WHATSAPP_COSTS: "5.2",
  EXPENSE_REFUNDS: "5.3",
  REVENUE_ENTERPRISE: "4.enterprise",
} as const;

async function upsertAccount(code: string, name: string, type: AccountType, parentCode: string | null, isSystemAccount: boolean) {
  const parent = parentCode ? await superAdminDb.account.findUnique({ where: { code: parentCode } }) : null;
  return superAdminDb.account.upsert({
    where: { code },
    update: { name, parentId: parent?.id ?? null },
    create: { code, name, type, parentId: parent?.id ?? null, isSystemAccount },
  });
}

/** رمز حساب الإيراد الفرعي لباقة معيّنة — باقات Enterprise المخصصة (كل واحدة بمفتاح فريد) تُجمَّع
 * كلها في حساب "إيراد Enterprise" مشترك واحد بدل حساب منفصل لكل عميل Enterprise (يُبقي الشجرة قابلة
 * للقراءة بدل تضخّمها بحساب جديد لكل صفقة Enterprise). */
export async function resolveRevenueAccountCode(planKey: string): Promise<string> {
  const plan = await rawDb.plan.findUnique({ where: { key: planKey } });
  if (!plan || plan.isCustomForTenantId) return ACCOUNT_CODES.REVENUE_ENTERPRISE;
  return `4.${plan.key}`;
}

/**
 * ينشئ/يحدّث دليل الحسابات الثابت (بند 4-أ في البرومنت) — بلا حذف أبداً، فقط upsert بالرمز. يُستدعى
 * بأمان من أي مكان (idempotent بالكامل) — من صفحة الإيرادات عند التحميل، ومن إجراءات الباقات عند
 * إنشاء/تعديل باقة، لضمان تطابق حسابات الإيراد الفرعية مع كتالوج الباقات الحقيقي دائماً.
 */
export async function ensureChartOfAccounts(): Promise<void> {
  await upsertAccount("1", "الأصول", "ASSET", null, true);
  await upsertAccount("2", "الخصوم", "LIABILITY", null, true);
  await upsertAccount("3", "حقوق الملكية", "EQUITY", null, true);
  await upsertAccount("4", "الإيرادات", "REVENUE", null, true);
  await upsertAccount("5", "المصروفات", "EXPENSE", null, true);

  await upsertAccount(ACCOUNT_CODES.CASH, "النقدية وما يعادلها (بوابة الدفع)", "ASSET", "1", true);
  await upsertAccount(ACCOUNT_CODES.ACCOUNTS_RECEIVABLE, "ذمم مدينة", "ASSET", "1", true);

  await upsertAccount(ACCOUNT_CODES.DEFERRED_REVENUE, "إيراد مؤجل", "LIABILITY", "2", true);
  await upsertAccount(ACCOUNT_CODES.VAT_PAYABLE, "ضريبة القيمة المضافة المستحقة", "LIABILITY", "2", true);
  await upsertAccount(ACCOUNT_CODES.ACCOUNTS_PAYABLE_GATEWAY, "ذمم دائنة (عمولة بوابة الدفع)", "LIABILITY", "2", true);

  await upsertAccount(ACCOUNT_CODES.RETAINED_EARNINGS, "الأرباح المرحّلة", "EQUITY", "3", true);

  await upsertAccount(ACCOUNT_CODES.EXPENSE_GATEWAY_FEES, "عمولات بوابة الدفع", "EXPENSE", "5", true);
  await upsertAccount(ACCOUNT_CODES.EXPENSE_WHATSAPP_COSTS, "تكلفة رسائل واتساب (Meta Conversation Pricing)", "EXPENSE", "5", true);
  await upsertAccount(ACCOUNT_CODES.EXPENSE_REFUNDS, "المبالغ المستردة (Refunds)", "EXPENSE", "5", true);

  const plans = await rawDb.plan.findMany({ where: { isCustomForTenantId: null } });
  for (const plan of plans) {
    await upsertAccount(`4.${plan.key}`, `إيراد اشتراكات — ${plan.name}`, "REVENUE", "4", true);
  }
  await upsertAccount(ACCOUNT_CODES.REVENUE_ENTERPRISE, "إيراد باقات Enterprise المخصصة", "REVENUE", "4", true);
}
