import { NextRequest, NextResponse } from "next/server";
import { requireSuperAdminSession } from "@/lib/session";
import { requirePermission } from "@/lib/rbac";
import { superAdminDb } from "@/lib/db";
import { buildAuditLogWhere, type AuditLogSearchParams } from "@/lib/admin/auditLogFilters";

const MAX_EXPORT_ROWS = 10000;

function escapeCsvField(value: string): string {
  if (/[",\n]/.test(value)) return `"${value.replace(/"/g, '""')}"`;
  return value;
}

export async function GET(req: NextRequest) {
  const session = await requireSuperAdminSession();
  try {
    requirePermission(session.user.role, "platform.audit_log.view");
  } catch {
    return NextResponse.json({ error: "لا تملك صلاحية عرض/تصدير سجل التدقيق." }, { status: 403 });
  }

  const params = req.nextUrl.searchParams;
  const filterParams: AuditLogSearchParams = {
    userId: params.get("userId") ?? undefined,
    tenantId: params.get("tenantId") ?? undefined,
    action: params.get("action") ?? undefined,
    dateFrom: params.get("dateFrom") ?? undefined,
    dateTo: params.get("dateTo") ?? undefined,
  };

  const where = buildAuditLogWhere(filterParams);
  const logs = await superAdminDb.auditLog.findMany({
    where,
    include: { user: true, tenant: true },
    orderBy: { createdAt: "desc" },
    take: MAX_EXPORT_ROWS,
  });

  await superAdminDb.auditLog.create({
    data: { userId: session.user.id, action: "platform.audit_log_export", targetType: "AuditLog", metaJson: { count: logs.length, filters: filterParams } },
  });

  const HEADERS = ["الإجراء", "بواسطة", "التاجر المتأثر", "نوع الهدف", "معرّف الهدف", "التاريخ"];
  const rows = logs.map((log) => [
    log.action,
    log.user?.name ?? "النظام",
    log.tenant?.name ?? "—",
    log.targetType,
    log.targetId ?? "—",
    log.createdAt.toISOString(),
  ]);

  const filename = `سجل-التدقيق-${new Date().toISOString().slice(0, 10)}.csv`;
  const lines = [HEADERS.join(","), ...rows.map((r) => r.map(escapeCsvField).join(","))];
  const csv = "﻿" + lines.join("\r\n");

  return new NextResponse(csv, {
    headers: { "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": `attachment; filename="${encodeURIComponent(filename)}"` },
  });
}
