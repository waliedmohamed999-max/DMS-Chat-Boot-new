import { NextRequest, NextResponse } from "next/server";
import { requireSuperAdminSession } from "@/lib/session";
import { requirePermission } from "@/lib/rbac";
import { superAdminDb } from "@/lib/db";
import { buildJournalWhere, type LedgerSearchParams } from "@/lib/admin/ledgerFilters";

const MAX_EXPORT_ROWS = 10000;

function escapeCsvField(value: string): string {
  if (/[",\n]/.test(value)) return `"${value.replace(/"/g, '""')}"`;
  return value;
}

/**
 * تصدير دفتر القيود بصيغة CSV بترتيب أعمدة قياسي (Date, Account, Debit, Credit, Memo) — نفس الترتيب
 * الذي تقبله أدوات استيراد القيود اليدوية في QuickBooks/Zoho Books (بند 5 في برومنت الإيرادات:
 * "تصدير يفهمه محاسب خارجي"). كل سطر في الملف = بند واحد (Debit أو Credit)، وليس القيد كاملاً في سطر
 * واحد — هذا هو الشكل المتوقَّع من مستورِدات القيود اليدوية في كلا النظامين.
 */
export async function GET(req: NextRequest) {
  const session = await requireSuperAdminSession();
  try {
    requirePermission(session.user.role, "platform.view_revenue");
  } catch {
    return NextResponse.json({ error: "لا تملك صلاحية تصدير دفتر القيود." }, { status: 403 });
  }

  const params = req.nextUrl.searchParams;
  const filterParams: LedgerSearchParams = {
    sourceType: params.get("sourceType") ?? undefined,
    dateFrom: params.get("dateFrom") ?? undefined,
    dateTo: params.get("dateTo") ?? undefined,
  };

  const where = buildJournalWhere(filterParams);
  const entries = await superAdminDb.journalEntry.findMany({
    where,
    include: { lines: { include: { debitAccount: true, creditAccount: true } } },
    orderBy: { entryDate: "desc" },
    take: MAX_EXPORT_ROWS,
  });

  await superAdminDb.auditLog.create({
    data: { userId: session.user.id, action: "platform.ledger_export", targetType: "JournalEntry", metaJson: { count: entries.length, filters: filterParams } },
  });

  const HEADERS = ["Date", "Account", "Debit", "Credit", "Memo"];
  const rows: string[][] = [];
  for (const entry of entries) {
    const dateStr = entry.entryDate.toISOString().slice(0, 10);
    for (const line of entry.lines) {
      rows.push([
        dateStr,
        line.debitAccount?.name ?? line.creditAccount?.name ?? "",
        line.debitAccountId ? String(line.amountSar) : "",
        line.creditAccountId ? String(line.amountSar) : "",
        entry.description,
      ]);
    }
  }

  const filename = `دفتر-القيود-${new Date().toISOString().slice(0, 10)}.csv`;
  const lines = [HEADERS.join(","), ...rows.map((r) => r.map(escapeCsvField).join(","))];
  const csv = "﻿" + lines.join("\r\n");

  return new NextResponse(csv, {
    headers: { "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": `attachment; filename="${encodeURIComponent(filename)}"` },
  });
}
