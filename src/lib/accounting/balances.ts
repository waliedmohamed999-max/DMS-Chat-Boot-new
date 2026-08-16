import { superAdminDb } from "@/lib/db";
import type { AccountType } from "@prisma/client";

const DEBIT_NORMAL: AccountType[] = ["ASSET", "EXPENSE"];

/**
 * رصيد كل حساب فعلياً من مجموع بنود دفتر القيود المرحَّلة إليه (بند 4-أ: "كل حساب برصيد محسوب
 * فعلياً") — بلا أي رقم ثابت. الأصول/المصروفات طبيعتها مدينة (رصيد = مدين − دائن)، والخصوم/حقوق
 * الملكية/الإيرادات طبيعتها دائنة (رصيد = دائن − مدين).
 */
export async function computeAllAccountBalances(): Promise<Map<string, number>> {
  const [debitSums, creditSums] = await Promise.all([
    superAdminDb.journalLine.groupBy({ by: ["debitAccountId"], _sum: { amountSar: true }, where: { debitAccountId: { not: null } } }),
    superAdminDb.journalLine.groupBy({ by: ["creditAccountId"], _sum: { amountSar: true }, where: { creditAccountId: { not: null } } }),
  ]);

  const debitByAccount = new Map(debitSums.map((s) => [s.debitAccountId as string, s._sum.amountSar ?? 0]));
  const creditByAccount = new Map(creditSums.map((s) => [s.creditAccountId as string, s._sum.amountSar ?? 0]));

  const accounts = await superAdminDb.account.findMany({ select: { id: true, type: true } });
  const balances = new Map<string, number>();
  for (const acc of accounts) {
    const debit = debitByAccount.get(acc.id) ?? 0;
    const credit = creditByAccount.get(acc.id) ?? 0;
    balances.set(acc.id, DEBIT_NORMAL.includes(acc.type) ? debit - credit : credit - debit);
  }
  return balances;
}
