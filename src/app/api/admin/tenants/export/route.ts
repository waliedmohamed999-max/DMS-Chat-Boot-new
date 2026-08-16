import { NextRequest, NextResponse } from "next/server";
import ExcelJS from "exceljs";
import { requireSuperAdminSession } from "@/lib/session";
import { requirePermission } from "@/lib/rbac";
import { superAdminDb } from "@/lib/db";
import { buildTenantListWhere, type TenantListSearchParams } from "@/lib/admin/tenantFilters";

const MAX_EXPORT_ROWS = 5000;

const STATUS_LABELS_AR: Record<string, string> = {
  PENDING_REVIEW: "بانتظار المراجعة", TRIAL: "تجربة مجانية", ACTIVE: "نشط",
  SUSPENDED: "معلَّق", CANCELLED: "مُلغى", REJECTED: "مرفوض",
};

function escapeCsvField(value: string): string {
  if (/[",\n]/.test(value)) return `"${value.replace(/"/g, '""')}"`;
  return value;
}

export async function GET(req: NextRequest) {
  const session = await requireSuperAdminSession();
  try {
    requirePermission(session.user.role, "platform.merchants.view");
  } catch {
    return NextResponse.json({ error: "لا تملك صلاحية عرض/تصدير بيانات التجار." }, { status: 403 });
  }

  const params = req.nextUrl.searchParams;
  const format = params.get("format") === "csv" ? "csv" : "xlsx";
  const filterParams: TenantListSearchParams = {
    q: params.get("q") ?? undefined,
    status: (params.get("status") as TenantListSearchParams["status"]) ?? undefined,
    planId: params.get("planId") ?? undefined,
    health: (params.get("health") as TenantListSearchParams["health"]) ?? undefined,
  };

  const where = await buildTenantListWhere(filterParams);
  const tenants = await superAdminDb.tenant.findMany({
    where,
    include: { subscription: { include: { plan: true } }, users: { where: { role: "OWNER" }, take: 1 } },
    orderBy: { createdAt: "desc" },
    take: MAX_EXPORT_ROWS,
  });

  const lastLogins = await superAdminDb.user.groupBy({
    by: ["tenantId"],
    where: { tenantId: { in: tenants.map((t) => t.id) } },
    _max: { lastLoginAt: true },
  });
  const lastLoginByTenant = new Map(lastLogins.map((l) => [l.tenantId, l._max.lastLoginAt]));

  const rows = tenants.map((t) => ({
    name: t.name,
    slug: t.slug,
    status: STATUS_LABELS_AR[t.status] ?? t.status,
    plan: t.subscription?.plan.name ?? "—",
    ownerEmail: t.users[0]?.email ?? "—",
    createdAt: t.createdAt.toISOString().slice(0, 10),
    lastActivity: lastLoginByTenant.get(t.id)?.toISOString().slice(0, 10) ?? "—",
  }));

  await superAdminDb.auditLog.create({
    data: { userId: session.user.id, action: "platform.tenants_export", targetType: "Tenant", metaJson: { count: rows.length, format } },
  });

  const HEADERS = ["اسم المتجر", "المعرّف", "الحالة", "الباقة", "بريد صاحب الحساب", "تاريخ الانضمام", "آخر نشاط"];
  const filename = `التجار-المشتركون-${new Date().toISOString().slice(0, 10)}.${format}`;

  if (format === "csv") {
    const lines = [
      HEADERS.join(","),
      ...rows.map((r) => [r.name, r.slug, r.status, r.plan, r.ownerEmail, r.createdAt, r.lastActivity].map(escapeCsvField).join(",")),
    ];
    const csv = "﻿" + lines.join("\r\n");
    return new NextResponse(csv, {
      headers: { "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": `attachment; filename="${encodeURIComponent(filename)}"` },
    });
  }

  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet("التجار المشتركون");
  sheet.views = [{ rightToLeft: true }];
  sheet.addRow(HEADERS);
  sheet.getRow(1).font = { bold: true };
  for (const r of rows) sheet.addRow([r.name, r.slug, r.status, r.plan, r.ownerEmail, r.createdAt, r.lastActivity]);
  sheet.columns.forEach((col) => { col.width = 22; });

  const buffer = await workbook.xlsx.writeBuffer();
  return new NextResponse(new Uint8Array(buffer), {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="${encodeURIComponent(filename)}"`,
    },
  });
}
