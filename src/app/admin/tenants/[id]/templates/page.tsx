import { notFound } from "next/navigation";
import { superAdminDb } from "@/lib/db";

const STATUS_LABELS: Record<string, { label: string; className: string }> = {
  DRAFT: { label: "مسودة", className: "bg-slate-500/10 text-slate-400" },
  PENDING: { label: "بانتظار المراجعة", className: "bg-warning-500/10 text-warning-500" },
  APPROVED: { label: "معتمد", className: "bg-success-500/10 text-success-500" },
  REJECTED: { label: "مرفوض", className: "bg-danger-500/10 text-danger-500" },
};

export default async function TenantTemplatesPage({ params }: { params: { id: string } }) {
  const tenant = await superAdminDb.tenant.findUnique({ where: { id: params.id }, select: { id: true } });
  if (!tenant) notFound();

  const templates = await superAdminDb.messageTemplate.findMany({
    where: { tenantId: tenant.id },
    orderBy: { createdAt: "desc" },
  });

  return (
    <div className="card overflow-hidden">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-white/5 text-right text-xs text-slate-500">
            <th className="p-4 font-medium">الاسم</th>
            <th className="p-4 font-medium">النوع</th>
            <th className="p-4 font-medium">الحالة</th>
            <th className="p-4 font-medium">ملاحظات</th>
          </tr>
        </thead>
        <tbody>
          {templates.map((t) => {
            const status = STATUS_LABELS[t.status]!;
            return (
              <tr key={t.id} className="border-b border-white/5 last:border-0">
                <td className="p-4">
                  <p className="text-slate-100" dir="ltr">{t.name}</p>
                  <p className="mt-0.5 text-xs text-slate-500">{t.bodyText}</p>
                </td>
                <td className="p-4 text-slate-400">{t.category}</td>
                <td className="p-4"><span className={`badge ${status.className}`}>{status.label}</span></td>
                <td className="p-4 text-xs text-danger-500">{t.rejectionReason ?? "—"}</td>
              </tr>
            );
          })}
          {templates.length === 0 && (
            <tr><td colSpan={4} className="p-8 text-center text-slate-500">لا توجد قوالب بعد.</td></tr>
          )}
        </tbody>
      </table>
    </div>
  );
}
