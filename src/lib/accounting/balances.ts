import { superAdminDb } from "@/lib/db";
import type { AccountType } from "@prisma/client";

const DEBIT_NORMAL: AccountType[] = ["ASSET", "EXPENSE"];

/**
 * رصيد كل حساب فعلياً من مجموع بنود دفتر القيود المرحَّلة إليه (بند 4-أ: "كل حساب برصيد محسوب
 * فعلياً") — بلا أي رقم ثابت. الأصول/المصروفات طبيعتها مدينة (رصيد = مدين − دائن)، والخصوم/حقوق
 * الملكية/الإيرادات طبيعتها دائنة (رصيد = دائن − مدين).
 *
 * التجميع هنا لكل (حساب + عملة) معاً وليس لكل حساب فقط — لا يُجمَع رصيد بعملتين مختلفتين في رقم
 * واحد أبداً (مثال: "1,000 ر.س" + "500 د.إ" لا يصيران "1,500" أياً كانت وحدتها). القيمة الراجعة
 * لكل حساب هي كائن {عملة → رصيد}، والواجهة تعرض سطراً منفصلاً لكل عملة موجودة فعلياً لذلك الحساب.
 */
export async function computeAllAccountBalances(): Promise<Map<string, Record<string, number>>> {
  const [debitSums, creditSums] = await Promise.all([
    superAdminDb.journalLine.groupBy({ by: ["debitAccountId", "currency"], _sum: { amountSar: true }, where: { debitAccountId: { not: null } } }),
    superAdminDb.journalLine.groupBy({ by: ["creditAccountId", "currency"], _sum: { amountSar: true }, where: { creditAccountId: { not: null } } }),
  ]);

  const debitByAccount = new Map<string, Record<string, number>>();
  for (const s of debitSums) {
    const accountId = s.debitAccountId as string;
    const byCurrency = debitByAccount.get(accountId) ?? {};
    byCurrency[s.currency] = s._sum.amountSar ?? 0;
    debitByAccount.set(accountId, byCurrency);
  }
  const creditByAccount = new Map<string, Record<string, number>>();
  for (const s of creditSums) {
    const accountId = s.creditAccountId as string;
    const byCurrency = creditByAccount.get(accountId) ?? {};
    byCurrency[s.currency] = s._sum.amountSar ?? 0;
    creditByAccount.set(accountId, byCurrency);
  }

  const accounts = await superAdminDb.account.findMany({ select: { id: true, type: true } });
  const balances = new Map<string, Record<string, number>>();
  for (const acc of accounts) {
    const debitByCurrency = debitByAccount.get(acc.id) ?? {};
    const creditByCurrency = creditByAccount.get(acc.id) ?? {};
    const currencies = new Set([...Object.keys(debitByCurrency), ...Object.keys(creditByCurrency)]);
    const perCurrency: Record<string, number> = {};
    for (const currency of currencies) {
      const debit = debitByCurrency[currency] ?? 0;
      const credit = creditByCurrency[currency] ?? 0;
      perCurrency[currency] = DEBIT_NORMAL.includes(acc.type) ? debit - credit : credit - debit;
    }
    balances.set(acc.id, perCurrency);
  }
  return balances;
}
