import { NextResponse } from "next/server";
import { requireSuperAdminSession } from "@/lib/session";
import { requirePermission } from "@/lib/rbac";
import { superAdminDb } from "@/lib/db";
import { ensureChartOfAccounts } from "@/lib/accounting/chartOfAccounts";
import { computeAllAccountBalances } from "@/lib/accounting/balances";

function escapeCsvField(value: string): string {
  if (/[",\n]/.test(value)) return `"${value.replace(/"/g, '""')}"`;
  return value;
}

const TYPE_LABELS_AR: Record<string, string> = { ASSET: "أصول", LIABILITY: "خصوم", EQUITY: "حقوق ملكية", REVENUE: "إيرادات", EXPENSE: "مصروفات" };

export async function GET() {
  const session = await requireSuperAdminSession();
  try {
    requirePermission(session.user.role, "platform.view_revenue");
  } catch {
    return NextResponse.json({ error: "لا تملك صلاحية تصدير دليل الحسابات." }, { status: 403 });
  }

  await ensureChartOfAccounts();

  const [accounts, balances] = await Promise.all([
    superAdminDb.account.findMany({ include: { parent: true }, orderBy: { code: "asc" } }),
    computeAllAccountBalances(),
  ]);

  await superAdminDb.auditLog.create({
    data: { userId: session.user.id, action: "platform.chart_of_accounts_export", targetType: "Account", metaJson: { count: accounts.length } },
  });

  const HEADERS = ["Code", "Name", "Type", "Parent Code", "Balance (SAR)"];
  const rows = accounts.map((a) => [a.code, a.name, TYPE_LABELS_AR[a.type] ?? a.type, a.parent?.code ?? "", String(balances.get(a.id) ?? 0)]);

  const filename = `دليل-الحسابات-${new Date().toISOString().slice(0, 10)}.csv`;
  const lines = [HEADERS.join(","), ...rows.map((r) => r.map(escapeCsvField).join(","))];
  const csv = "﻿" + lines.join("\r\n");

  return new NextResponse(csv, {
    headers: { "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": `attachment; filename="${encodeURIComponent(filename)}"` },
  });
}
