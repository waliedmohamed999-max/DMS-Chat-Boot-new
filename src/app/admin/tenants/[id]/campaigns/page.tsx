import { notFound } from "next/navigation";
import { superAdminDb } from "@/lib/db";

const STATUS_LABELS: Record<string, { label: string; className: string }> = {
  DRAFT: { label: "مسودة", className: "bg-slate-500/10 text-slate-400" },
  SCHEDULED: { label: "مجدولة", className: "bg-warning-500/10 text-warning-500" },
  SENDING: { label: "قيد الإرسال", className: "bg-accent-500/10 text-accent-400" },
  ACTIVE: { label: "🟢 نشطة", className: "bg-success-500/10 text-success-500" },
  PAUSED: { label: "⏸️ متوقفة", className: "bg-slate-500/10 text-slate-400" },
  COMPLETED: { label: "مكتملة", className: "bg-success-500/10 text-success-500" },
  FAILED: { label: "فشلت", className: "bg-danger-500/10 text-danger-500" },
};

export default async function TenantCampaignsPage({ params }: { params: { id: string } }) {
  const tenant = await superAdminDb.tenant.findUnique({ where: { id: params.id }, select: { id: true } });
  if (!tenant) notFound();

  const campaigns = await superAdminDb.campaign.findMany({
    where: { tenantId: tenant.id },
    include: { template: true },
    orderBy: { createdAt: "desc" },
  });

  return (
    <div className="card overflow-hidden">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-white/5 text-right text-xs text-slate-500">
            <th className="p-4 font-medium">اسم الحملة</th>
            <th className="p-4 font-medium">النوع</th>
            <th className="p-4 font-medium">القالب</th>
            <th className="p-4 font-medium">الحالة</th>
            <th className="p-4 font-medium">مُرسل</th>
            <th className="p-4 font-medium">تم التسليم</th>
            <th className="p-4 font-medium">فشل</th>
          </tr>
        </thead>
        <tbody>
          {campaigns.map((c) => {
            const status = STATUS_LABELS[c.status] ?? { label: c.status, className: "bg-white/5 text-slate-300" };
            const delivered = c.deliveredCount + c.readCount + c.repliedCount;
            return (
              <tr key={c.id} className="border-b border-white/5 last:border-0">
                <td className="p-4 text-slate-100">{c.name}</td>
                <td className="p-4 text-slate-400">{c.type === "TRIGGERED" ? "⚡ آلية" : "لمرة واحدة"}</td>
                <td className="p-4 text-slate-400" dir="ltr">{c.template.name}</td>
                <td className="p-4"><span className={`badge ${status.className}`}>{status.label}</span></td>
                <td className="p-4 text-slate-300">{c.sentCount}</td>
                <td className="p-4 text-success-500">{delivered}</td>
                <td className="p-4 text-danger-500">{c.failedCount}</td>
              </tr>
            );
          })}
          {campaigns.length === 0 && (
            <tr><td colSpan={7} className="p-8 text-center text-slate-500">لا توجد حملات بعد.</td></tr>
          )}
        </tbody>
      </table>
    </div>
  );
}
