import { notFound } from "next/navigation";
import { superAdminDb } from "@/lib/db";
import type { FlowGraph } from "@/lib/chatbot/types";

export default async function TenantChatbotPage({ params }: { params: { id: string } }) {
  const tenant = await superAdminDb.tenant.findUnique({ where: { id: params.id }, select: { id: true } });
  if (!tenant) notFound();

  const flows = await superAdminDb.chatbotFlow.findMany({
    where: { tenantId: tenant.id },
    orderBy: { updatedAt: "desc" },
  });

  return (
    <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
      {flows.map((f) => {
        const stepCount = (f.nodesJson as unknown as FlowGraph).nodes.length;
        return (
          <div key={f.id} className="card p-5">
            <div className="mb-2 flex items-center justify-between">
              <h3 className="font-semibold text-white">{f.name}</h3>
              <span className={`badge ${f.status === "PUBLISHED" ? "bg-success-500/10 text-success-500" : "bg-slate-500/10 text-slate-400"}`}>
                {f.status === "PUBLISHED" ? "منشور" : "مسودة"}
              </span>
            </div>
            <p className="text-xs text-slate-500">{stepCount} خطوة · اختُبر {f.testRunCount} مرة</p>
            <p className="mt-1 text-xs text-slate-600">آخر تعديل: {new Date(f.updatedAt).toLocaleDateString("ar-SA")}</p>
          </div>
        );
      })}
      {flows.length === 0 && (
        <div className="card col-span-full p-8 text-center text-slate-500">لا توجد تدفقات شات بوت بعد.</div>
      )}
    </div>
  );
}
