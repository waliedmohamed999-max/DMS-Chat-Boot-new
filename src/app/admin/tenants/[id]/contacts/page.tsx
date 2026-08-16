import Link from "next/link";
import { notFound } from "next/navigation";
import { superAdminDb } from "@/lib/db";
import { STAGE_LABELS_AR, CONTACT_SOURCE_LABELS_AR } from "@/lib/contacts/stages";

const PAGE_SIZE = 25;

export default async function TenantContactsPage({ params, searchParams }: { params: { id: string }; searchParams: { page?: string } }) {
  const tenant = await superAdminDb.tenant.findUnique({ where: { id: params.id }, select: { id: true, name: true } });
  if (!tenant) notFound();

  const page = Math.max(1, parseInt(searchParams.page ?? "1", 10) || 1);

  const [contacts, total] = await Promise.all([
    superAdminDb.contact.findMany({
      where: { tenantId: tenant.id },
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * PAGE_SIZE,
      take: PAGE_SIZE,
    }),
    superAdminDb.contact.count({ where: { tenantId: tenant.id } }),
  ]);
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  return (
    <div className="space-y-4">
      <div className="card overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-white/5 text-right text-xs text-slate-500">
              <th className="p-4 font-medium">الاسم</th>
              <th className="p-4 font-medium">الجوال</th>
              <th className="p-4 font-medium">المرحلة</th>
              <th className="p-4 font-medium">المصدر</th>
              <th className="p-4 font-medium">تاريخ الإضافة</th>
            </tr>
          </thead>
          <tbody>
            {contacts.map((c) => (
              <tr key={c.id} className="border-b border-white/5 last:border-0">
                <td className="p-4 text-slate-100">{c.name}</td>
                <td className="p-4 text-slate-400" dir="ltr">{c.phoneE164}</td>
                <td className="p-4"><span className="badge bg-white/5 text-slate-300">{STAGE_LABELS_AR[c.stage] ?? c.stage}</span></td>
                <td className="p-4 text-xs text-slate-400">{CONTACT_SOURCE_LABELS_AR[c.source] ?? c.source}</td>
                <td className="p-4 text-xs text-slate-500">{new Date(c.createdAt).toLocaleDateString("ar-SA")}</td>
              </tr>
            ))}
            {contacts.length === 0 && (
              <tr><td colSpan={5} className="p-8 text-center text-slate-500">لا توجد جهات اتصال بعد.</td></tr>
            )}
          </tbody>
        </table>
      </div>
      {totalPages > 1 && (
        <div className="flex items-center justify-center gap-2 text-sm">
          {Array.from({ length: totalPages }, (_, i) => i + 1).map((p) => (
            <Link
              key={p}
              href={`/admin/tenants/${tenant.id}/contacts?page=${p}`}
              className={`rounded-md px-3 py-1 ${p === page ? "bg-accent-500 text-white" : "text-slate-400 hover:bg-white/5"}`}
            >
              {p}
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
