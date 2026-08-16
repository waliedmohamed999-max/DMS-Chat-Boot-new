import type { Prisma } from "@prisma/client";

export type LedgerSearchParams = {
  sourceType?: string;
  dateFrom?: string; // YYYY-MM-DD
  dateTo?: string; // YYYY-MM-DD
};

/** فلاتر دفتر القيود (بند 4-ب: "شاشة دفتر يومية قابلة للفلترة بالتاريخ ونوع الحدث"). */
export function buildJournalWhere(params: LedgerSearchParams): Prisma.JournalEntryWhereInput {
  const where: Prisma.JournalEntryWhereInput = {};

  if (params.sourceType) where.sourceType = params.sourceType;

  if (params.dateFrom || params.dateTo) {
    where.entryDate = {
      ...(params.dateFrom ? { gte: new Date(`${params.dateFrom}T00:00:00.000Z`) } : {}),
      ...(params.dateTo ? { lte: new Date(`${params.dateTo}T23:59:59.999Z`) } : {}),
    };
  }

  return where;
}
