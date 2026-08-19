import { requireSuperAdminSession } from "@/lib/session";
import { hasPermission } from "@/lib/rbac";
import { superAdminDb } from "@/lib/db";
import { ApprovalCard } from "@/components/admin/ApprovalCard";

export default async function ApprovalsCenterPage() {
  const session = await requireSuperAdminSession();
  if (!hasPermission(session.user.role, "platform.approvals.review")) {
    return (
      <div className="card p-8 text-center text-slate-400">
        ليس لديك صلاحية مراجعة الموافقات. هذه الصفحة محصورة بفريق الدعم الفني ومالك المنصة.
      </div>
    );
  }

  const requests = await superAdminDb.approvalRequest.findMany({
    where: { status: { in: ["PENDING", "NEEDS_INFO"] } },
    include: { tenant: { select: { id: true, name: true, slug: true, country: true } } },
    orderBy: { createdAt: "asc" },
  });

  const serialized = requests.map((r) => {
    // passwordHash (طلبات PARTNER_APPLICATION الحديثة) لا يُعرَض أبداً في الواجهة — يُنزَع هنا قبل
    // إرسال الـpayload للعميل، دفاع إضافي رخيص رغم أن bcrypt hash نفسه غير قابل للعكس أصلاً.
    const payload = r.payloadJson as Record<string, unknown> | null;
    const { passwordHash: _passwordHash, ...safePayload } = payload ?? {};
    return {
      id: r.id,
      type: r.type as "NEW_TENANT" | "CUSTOM_PLAN" | "WHATSAPP_VERIFICATION" | "MESSAGE_TEMPLATE" | "PARTNER_APPLICATION",
      status: r.status as "PENDING" | "NEEDS_INFO",
      payloadJson: safePayload,
      applicantEmail: r.applicantEmail,
      reviewerNote: r.reviewerNote,
      createdAt: r.createdAt.toISOString(),
      tenant: r.tenant,
    };
  });

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-bold text-white">مركز الموافقات</h1>
        <p className="text-sm text-slate-400">
          {requests.length > 0
            ? `${requests.length} طلب بانتظار مراجعتك`
            : "لا توجد طلبات بانتظار المراجعة حالياً"}
        </p>
      </div>

      {requests.length === 0 ? (
        <div className="card flex flex-col items-center gap-2 p-12 text-center text-slate-500">
          <span className="text-4xl">✅</span>
          <p>كل الطلبات تمت مراجعتها. لا شيء ينتظرك الآن.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          {serialized.map((r) => (
            <ApprovalCard key={r.id} request={r} />
          ))}
        </div>
      )}
    </div>
  );
}
