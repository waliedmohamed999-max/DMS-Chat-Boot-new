import { NextRequest, NextResponse } from "next/server";
import ExcelJS from "exceljs";
import { requireTenantSession } from "@/lib/session";
import { withTenant } from "@/lib/db";
import { requireEffectivePermission } from "@/lib/rbac";
import { writeAuditLog } from "@/lib/audit";
import { buildContactListWhere, type ContactListSearchParams } from "@/lib/contacts/filters";
import { STAGE_LABELS_AR, CONTACT_SOURCE_LABELS_AR } from "@/lib/contacts/stages";

/** حد أقصى صف واحد لكل تصدير — نفس حد الاستيراد (2000)، يمنع تصديراً ضخماً يجمّد الخادم (تصدير
 * غير محدود لأعداد كبيرة جداً من التجار يحتاج معالجة خلفية/queue، مؤجَّل حتى الحاجة الفعلية —
 * انظر DECISIONS.md). */
const MAX_EXPORT_ROWS = 20000;

function escapeCsvField(value: string): string {
  if (/[",\n]/.test(value)) return `"${value.replace(/"/g, '""')}"`;
  return value;
}

export async function GET(req: NextRequest) {
  const session = await requireTenantSession();
  // بيانات حساسة (أرقام هواتف حقيقية) — مقيَّد بصلاحية Owner/Admin فقط (قاعدة أمنية صريحة)، وليس
  // نفس صلاحية contacts.manage العامة المتاحة للموظفين أيضاً. 403 صريح بدل ترك الاستثناء يتحوّل
  // لخطأ 500 عام (يعمل أمنياً في الحالتين، لكن 403 هو المعنى الصحيح فعلياً هنا).
  try {
    requireEffectivePermission(session.user.permissions, "contacts.export");
  } catch {
    return NextResponse.json({ error: "لا تملك صلاحية تصدير جهات الاتصال." }, { status: 403 });
  }
  const tenantId = session.user.tenantId;

  const params = req.nextUrl.searchParams;
  const format = params.get("format") === "csv" ? "csv" : "xlsx";
  const scope = params.get("scope") ?? "filtered";

  const contacts = await withTenant(tenantId, (tx) => {
    if (scope === "selected") {
      const ids = (params.get("ids") ?? "").split(",").map((s) => s.trim()).filter(Boolean);
      if (ids.length === 0) return Promise.resolve([]);
      return tx.contact.findMany({
        where: { tenantId, id: { in: ids } },
        include: { tags: { include: { tag: true } } },
        orderBy: { createdAt: "desc" },
        take: MAX_EXPORT_ROWS,
      });
    }

    const filterParams: ContactListSearchParams =
      scope === "all"
        ? {}
        : {
            q: params.get("q") ?? undefined,
            tab: (params.get("tab") as ContactListSearchParams["tab"]) ?? undefined,
            campaignId: params.get("campaignId") ?? undefined,
            stage: (params.get("stage") as ContactListSearchParams["stage"]) ?? undefined,
            tagId: params.get("tagId") ?? undefined,
            city: params.get("city") ?? undefined,
            optIn: (params.get("optIn") as ContactListSearchParams["optIn"]) ?? undefined,
            dateFrom: params.get("dateFrom") ?? undefined,
            dateTo: params.get("dateTo") ?? undefined,
          };

    return tx.contact.findMany({
      where: buildContactListWhere(tenantId, filterParams),
      include: { tags: { include: { tag: true } } },
      orderBy: { createdAt: "desc" },
      take: MAX_EXPORT_ROWS,
    });
  });

  const rows = contacts.map((c) => ({
    name: c.name,
    phone: c.phoneE164,
    email: c.email ?? "",
    tags: c.tags.filter((t) => !t.tag.isSystem).map((t) => t.tag.name).join(", "),
    stage: STAGE_LABELS_AR[c.stage] ?? c.stage,
    source: CONTACT_SOURCE_LABELS_AR[c.source] ?? c.source,
    city: c.city ?? "",
    optIn: c.marketingOptIn === true ? "نعم" : c.marketingOptIn === false ? "لا" : "غير محدد",
    createdAt: c.createdAt.toISOString().slice(0, 10),
  }));

  await writeAuditLog({
    tenantId, userId: session.user.id,
    action: "contact.export", targetType: "Contact",
    metaJson: { count: rows.length, scope, format },
  });

  const HEADERS = ["الاسم", "الجوال", "البريد الإلكتروني", "الوسوم", "المرحلة", "المصدر", "المدينة", "الموافقة التسويقية", "تاريخ الإضافة"];
  const filename = `جهات-الاتصال-${new Date().toISOString().slice(0, 10)}.${format}`;

  if (format === "csv") {
    const lines = [
      HEADERS.join(","),
      ...rows.map((r) =>
        [r.name, r.phone, r.email, r.tags, r.stage, r.source, r.city, r.optIn, r.createdAt].map(escapeCsvField).join(",")
      ),
    ];
    // ﻿: BOM حتى يفتح Excel نفسه الملف كـUTF-8 صحيحاً بدل تفسير النص العربي كترميز خاطئ.
    const csv = "﻿" + lines.join("\r\n");
    return new NextResponse(csv, {
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="${encodeURIComponent(filename)}"`,
      },
    });
  }

  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet("جهات الاتصال");
  sheet.views = [{ rightToLeft: true }];
  sheet.addRow(HEADERS);
  sheet.getRow(1).font = { bold: true };
  for (const r of rows) {
    sheet.addRow([r.name, r.phone, r.email, r.tags, r.stage, r.source, r.city, r.optIn, r.createdAt]);
  }
  sheet.columns.forEach((col) => { col.width = 20; });

  const buffer = await workbook.xlsx.writeBuffer();
  return new NextResponse(buffer as ArrayBuffer, {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="${encodeURIComponent(filename)}"`,
    },
  });
}
