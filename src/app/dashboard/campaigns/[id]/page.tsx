import Link from "next/link";
import { notFound } from "next/navigation";
import { requireTenantSession } from "@/lib/session";
import { withTenant } from "@/lib/db";
import { hasPermission } from "@/lib/rbac";
import { linkCampaignConversions } from "@/lib/campaigns/conversions";
import { retryFailedRecipients, duplicateCampaign, setTriggeredCampaignActive, runTriggerScanNow } from "../actions";

const STATUS_LABELS: Record<string, { label: string; className: string }> = {
  DRAFT: { label: "مسودة", className: "bg-slate-500/10 text-slate-400" },
  SCHEDULED: { label: "مجدولة", className: "bg-warning-500/10 text-warning-500" },
  SENDING: { label: "قيد الإرسال", className: "bg-accent-500/10 text-accent-400" },
  ACTIVE: { label: "🟢 نشطة (مستمرة)", className: "bg-success-500/10 text-success-500" },
  PAUSED: { label: "⏸️ متوقفة مؤقتاً", className: "bg-slate-500/10 text-slate-400" },
  COMPLETED: { label: "مكتملة", className: "bg-success-500/10 text-success-500" },
  FAILED: { label: "فشلت", className: "bg-danger-500/10 text-danger-500" },
};

const RECIPIENT_STATUS_LABELS: Record<string, { label: string; className: string }> = {
  PENDING: { label: "بانتظار الإرسال", className: "bg-slate-500/10 text-slate-400" },
  SENT: { label: "أُرسلت", className: "bg-accent-500/10 text-accent-400" },
  DELIVERED: { label: "تم التسليم", className: "bg-accent-500/10 text-accent-400" },
  READ: { label: "تمت القراءة", className: "bg-success-500/10 text-success-500" },
  REPLIED: { label: "تم الرد", className: "bg-success-500/10 text-success-500" },
  FAILED: { label: "فشلت", className: "bg-danger-500/10 text-danger-500" },
};

const TRIGGER_EVENT_LABELS: Record<string, string> = {
  ABANDONED_CART: "🛒 سلة متروكة",
  CUSTOMER_INACTIVE: "😴 عميل غير نشط",
};

function pct(part: number, total: number): string {
  if (total === 0) return "0%";
  return `${Math.round((part / total) * 100)}%`;
}

export default async function CampaignDetailPage({ params }: { params: { id: string } }) {
  const session = await requireTenantSession();
  const tenantId = session.user.tenantId;
  const canManage = hasPermission(session.user.role, "campaigns.manage");

  if (!hasPermission(session.user.role, "campaigns.view")) {
    return <div className="card p-8 text-center text-slate-400">ليس لديك صلاحية عرض الحملات.</div>;
  }

  const campaign = await withTenant(tenantId, async (tx) => {
    await linkCampaignConversions(tx, params.id);
    return tx.campaign.findUnique({
      where: { id: params.id, tenantId },
      include: {
        template: true,
        segment: true,
        recipients: { include: { contact: true, convertedOrder: true }, orderBy: { sentAt: "desc" }, take: 100 },
      },
    });
  });

  if (!campaign) notFound();

  const status = STATUS_LABELS[campaign.status]!;
  const delivered = campaign.deliveredCount + campaign.readCount + campaign.repliedCount;
  const read = campaign.readCount + campaign.repliedCount;
  const totalRevenue = campaign.recipients.reduce((sum, r) => sum + (r.conversionRevenueSar ?? 0), 0);
  const convertedCount = campaign.recipients.filter((r) => r.convertedOrderId).length;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <Link href="/dashboard/campaigns" className="text-sm text-accent-400 hover:underline">
          ← رجوع للحملات
        </Link>
        {canManage && (
          <div className="flex gap-2">
            {campaign.type === "TRIGGERED" && (
              <>
                <form action={runTriggerScanNow.bind(null, campaign.id)}>
                  <button className="btn-secondary text-xs">🔍 فحص الآن</button>
                </form>
                <form action={setTriggeredCampaignActive.bind(null, campaign.id, campaign.status !== "ACTIVE")}>
                  <button className="btn-secondary text-xs">{campaign.status === "ACTIVE" ? "⏸️ إيقاف مؤقت" : "▶️ إعادة التفعيل"}</button>
                </form>
              </>
            )}
            {campaign.failedCount > 0 && (
              <form action={retryFailedRecipients.bind(null, campaign.id)}>
                <button className="btn-secondary text-xs">🔁 إعادة إرسال للفاشلين ({campaign.failedCount})</button>
              </form>
            )}
            <form action={duplicateCampaign.bind(null, campaign.id)}>
              <button className="btn-secondary text-xs">📋 تكرار الحملة</button>
            </form>
          </div>
        )}
      </div>

      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-white">{campaign.name}</h1>
          <p className="text-sm text-slate-400">
            {campaign.type === "TRIGGERED"
              ? `حملة آلية — ${TRIGGER_EVENT_LABELS[campaign.triggerEvent ?? ""] ?? campaign.triggerEvent}`
              : `الجمهور: ${campaign.audienceType === "ALL" ? "كل جهات الاتصال" : campaign.segment?.name ?? "شريحة مخصصة"}`}{" "}
            • القالب: <span dir="ltr">{campaign.template.name}</span>
          </p>
        </div>
        <span className={`badge ${status.className}`}>{status.label}</span>
      </div>

      <div className="grid grid-cols-2 gap-4 md:grid-cols-5">
        <div className="card p-4">
          <p className="text-xs text-slate-400">مُرسل</p>
          <p className="mt-1 font-bold text-white">{campaign.sentCount}</p>
        </div>
        <div className="card p-4">
          <p className="text-xs text-slate-400">تم التسليم</p>
          <p className="mt-1 font-bold text-accent-400">{delivered} <span className="text-xs font-normal text-slate-500">({pct(delivered, campaign.sentCount)})</span></p>
        </div>
        <div className="card p-4">
          <p className="text-xs text-slate-400">تمت القراءة</p>
          <p className="mt-1 font-bold text-success-500">{read} <span className="text-xs font-normal text-slate-500">({pct(read, campaign.sentCount)})</span></p>
        </div>
        <div className="card p-4">
          <p className="text-xs text-slate-400">تم الرد</p>
          <p className="mt-1 font-bold text-success-500">{campaign.repliedCount} <span className="text-xs font-normal text-slate-500">({pct(campaign.repliedCount, campaign.sentCount)})</span></p>
        </div>
        <div className="card p-4">
          <p className="text-xs text-slate-400">فشل</p>
          <p className="mt-1 font-bold text-danger-500">{campaign.failedCount} <span className="text-xs font-normal text-slate-500">({pct(campaign.failedCount, campaign.sentCount)})</span></p>
        </div>
      </div>

      <div className="card overflow-hidden">
        <div className="flex h-3 w-full">
          {campaign.sentCount > 0 && (
            <>
              <div className="bg-success-500" style={{ width: `${(read / campaign.sentCount) * 100}%` }} title="قراءة/رد" />
              <div className="bg-accent-500" style={{ width: `${((delivered - read) / campaign.sentCount) * 100}%` }} title="تسليم فقط" />
              <div className="bg-danger-500" style={{ width: `${(campaign.failedCount / campaign.sentCount) * 100}%` }} title="فشل" />
            </>
          )}
        </div>
      </div>

      <div className="card p-5">
        <h2 className="mb-2 flex items-center justify-between text-sm font-semibold text-white">
          <span>💰 الإيراد الناتج عن هذه الحملة</span>
          <span className="text-lg font-bold text-success-500" dir="ltr">{totalRevenue.toLocaleString("en-US")} ر.س</span>
        </h2>
        <p className="text-xs text-slate-500">
          {convertedCount} طلب فعلي على زد/سلة تم ربطه بهذه الحملة (خلال 7 أيام من إرسال الرسالة لكل عميل) من أصل {campaign.sentCount} رسالة مُرسلة.
        </p>
      </div>

      <div className="card p-5">
        <h2 className="mb-3 text-sm font-semibold text-white">نص الرسالة</h2>
        <p className="rounded-lg bg-navy-900 p-3 text-sm text-slate-300">{campaign.template.bodyText}</p>
      </div>

      <div className="card overflow-hidden">
        <h2 className="border-b border-white/5 p-4 text-sm font-semibold text-white">
          المستلمون {campaign.type === "TRIGGERED" && <span className="font-normal text-slate-500">(آخر 100 — الحملة مستمرة وتستهدف حالات جديدة تلقائياً)</span>}
        </h2>
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-white/5 text-right text-xs text-slate-500">
              <th className="p-3 font-medium">جهة الاتصال</th>
              <th className="p-3 font-medium">الحالة</th>
              <th className="p-3 font-medium">التحويل</th>
              <th className="p-3 font-medium">ملاحظات</th>
            </tr>
          </thead>
          <tbody>
            {campaign.recipients.map((r) => {
              const rStatus = RECIPIENT_STATUS_LABELS[r.status]!;
              return (
                <tr key={r.id} className="border-b border-white/5 last:border-0">
                  <td className="p-3 text-slate-300">
                    {r.contact.name} <span className="text-xs text-slate-500" dir="ltr">({r.contact.phoneE164})</span>
                  </td>
                  <td className="p-3"><span className={`badge ${rStatus.className}`}>{rStatus.label}</span></td>
                  <td className="p-3 text-xs">
                    {r.convertedOrderId ? (
                      <span className="text-success-500" dir="ltr">✓ طلب بقيمة {r.conversionRevenueSar} ر.س</span>
                    ) : (
                      <span className="text-slate-600">—</span>
                    )}
                  </td>
                  <td className="p-3 text-xs text-danger-500">{r.errorMessage ?? <span className="text-slate-600">—</span>}</td>
                </tr>
              );
            })}
            {campaign.recipients.length === 0 && (
              <tr><td colSpan={4} className="p-8 text-center text-slate-500">لم يتم الإرسال بعد.</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
