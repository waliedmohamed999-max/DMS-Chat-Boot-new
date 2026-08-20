import Link from "next/link";
import { requireTenantSession } from "@/lib/session";
import { withTenant } from "@/lib/db";
import { hasEffectivePermission } from "@/lib/rbac";
import { getTenantCampaignLimits, isUnlimited } from "@/lib/campaigns/limits";
import { setTriggeredCampaignActive, runTriggerScanNow } from "./actions";
import type { CampaignStatus, Prisma } from "@prisma/client";

type OneTimeCampaignRow = Prisma.CampaignGetPayload<{ include: { template: true; _count: { select: { recipients: true } } } }>;
type TriggeredCampaignRow = Prisma.CampaignGetPayload<{ include: { template: true } }> & { runCount: number; totalRevenueSar: number };

const PAGE_SIZE = 10;

const STATUS_LABELS: Record<string, { label: string; className: string }> = {
  DRAFT: { label: "مسودة", className: "bg-slate-500/10 text-slate-400" },
  SCHEDULED: { label: "مجدولة", className: "bg-warning-500/10 text-warning-500" },
  SENDING: { label: "قيد الإرسال", className: "bg-accent-500/10 text-accent-400" },
  COMPLETED: { label: "مكتملة", className: "bg-success-500/10 text-success-500" },
  FAILED: { label: "فشلت", className: "bg-danger-500/10 text-danger-500" },
};

const TRIGGER_EVENT_LABELS: Record<string, string> = {
  ABANDONED_CART: "🛒 سلة متروكة",
  CUSTOMER_INACTIVE: "😴 عميل غير نشط",
};

function buildQuery(params: Record<string, string | undefined>) {
  const q = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) if (v) q.set(k, v);
  const s = q.toString();
  return s ? `?${s}` : "";
}

export default async function CampaignsPage({
  searchParams,
}: {
  searchParams: { tab?: string; status?: string; templateId?: string; q?: string; dateFrom?: string; dateTo?: string; page?: string };
}) {
  const session = await requireTenantSession();
  const tenantId = session.user.tenantId;
  const canManage = hasEffectivePermission(session.user.permissions, "campaigns.manage");

  if (!hasEffectivePermission(session.user.permissions, "campaigns.view")) {
    return <div className="card p-8 text-center text-slate-400">ليس لديك صلاحية عرض الحملات.</div>;
  }

  const tab = searchParams.tab === "triggered" ? "triggered" : "one_time";
  const page = Math.max(1, parseInt(searchParams.page ?? "1", 10) || 1);

  const [limits, templates, oneTimeData, triggeredCampaigns] = await withTenant(tenantId, async (tx) => {
    const campaignLimits = await getTenantCampaignLimits(tenantId);
    const templateList = await tx.messageTemplate.findMany({ where: { tenantId }, orderBy: { name: "asc" } });

    let oneTime: { campaigns: OneTimeCampaignRow[]; total: number } = { campaigns: [], total: 0 };
    if (tab === "one_time") {
      const where = {
        tenantId,
        type: "ONE_TIME" as const,
        ...(searchParams.status ? { status: searchParams.status as CampaignStatus } : {}),
        ...(searchParams.templateId ? { templateId: searchParams.templateId } : {}),
        ...(searchParams.q ? { name: { contains: searchParams.q, mode: "insensitive" as const } } : {}),
        ...(searchParams.dateFrom || searchParams.dateTo
          ? {
              createdAt: {
                ...(searchParams.dateFrom ? { gte: new Date(searchParams.dateFrom) } : {}),
                ...(searchParams.dateTo ? { lte: new Date(`${searchParams.dateTo}T23:59:59`) } : {}),
              },
            }
          : {}),
      };
      const [campaigns, total] = await Promise.all([
        tx.campaign.findMany({
          where, include: { template: true, _count: { select: { recipients: true } } },
          orderBy: { createdAt: "desc" }, skip: (page - 1) * PAGE_SIZE, take: PAGE_SIZE,
        }),
        tx.campaign.count({ where }),
      ]);
      oneTime = { campaigns, total };
    }

    let triggered: TriggeredCampaignRow[] = [];
    if (tab === "triggered") {
      const campaigns = await tx.campaign.findMany({
        where: { tenantId, type: "TRIGGERED" }, include: { template: true }, orderBy: { createdAt: "desc" },
      });
      triggered = await Promise.all(
        campaigns.map(async (c) => {
          const [runCount, revenueAgg] = await Promise.all([
            tx.campaignRecipient.count({ where: { campaignId: c.id } }),
            tx.campaignRecipient.aggregate({ where: { campaignId: c.id, conversionRevenueSar: { not: null } }, _sum: { conversionRevenueSar: true } }),
          ]);
          return { ...c, runCount, totalRevenueSar: revenueAgg._sum.conversionRevenueSar ?? 0 };
        })
      );
    }

    return [campaignLimits, templateList, oneTime, triggered] as const;
  });

  const usagePercent = Math.min(100, Math.round((limits.messagesUsedThisPeriod / limits.maxMessagesPerMonth) * 100) || 0);
  const totalPages = Math.max(1, Math.ceil(oneTimeData.total / PAGE_SIZE));

  const currentFilters = { status: searchParams.status, templateId: searchParams.templateId, q: searchParams.q, dateFrom: searchParams.dateFrom, dateTo: searchParams.dateTo };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-white">الحملات</h1>
          <p className="text-sm text-slate-400">إرسال جماعي عبر واتساب بقوالب معتمدة</p>
        </div>
        {canManage && (
          <Link href="/dashboard/campaigns/new" className="btn-primary">
            + حملة جديدة
          </Link>
        )}
      </div>

      <div className="card p-4">
        <div className="mb-1 flex items-center justify-between text-xs text-slate-400">
          <span>رصيد الرسائل المستخدم هذا الشهر ({limits.planName})</span>
          <span dir="ltr">{limits.messagesUsedThisPeriod} / {limits.maxMessagesPerMonth}</span>
        </div>
        <div className="h-2 overflow-hidden rounded-full bg-navy-700">
          <div
            className={`h-full rounded-full ${usagePercent > 90 ? "bg-danger-500" : usagePercent > 70 ? "bg-warning-500" : "bg-accent-500"}`}
            style={{ width: `${usagePercent}%` }}
          />
        </div>
        {usagePercent >= 90 && (
          <p className="mt-2 text-xs text-warning-500">
            ⚠️ اقتربت من حد رسائل باقتك.{" "}
            <Link href="/dashboard/billing" className="underline">رقّي باقتك</Link>
          </p>
        )}
        {!isUnlimited(limits.maxCampaignsPerMonth) && (
          <p className="mt-2 text-xs text-slate-500">أقصى عدد حملات هذا الشهر: {limits.maxCampaignsPerMonth}</p>
        )}
      </div>

      <div className="flex gap-2 border-b border-white/5">
        <Link href="/dashboard/campaigns?tab=one_time" className={`px-3 py-2 text-sm ${tab === "one_time" ? "border-b-2 border-accent-500 text-white" : "text-slate-400"}`}>
          الحملات لمرة واحدة
        </Link>
        <Link href="/dashboard/campaigns?tab=triggered" className={`px-3 py-2 text-sm ${tab === "triggered" ? "border-b-2 border-accent-500 text-white" : "text-slate-400"}`}>
          ⚡ الحملات الآلية
        </Link>
      </div>

      {tab === "one_time" ? (
        <>
          <form method="get" className="card flex flex-wrap items-end gap-2 p-4">
            <input type="hidden" name="tab" value="one_time" />
            <div>
              <label className="label-field">بحث بالاسم</label>
              <input name="q" defaultValue={searchParams.q} className="input-field text-sm" placeholder="اسم الحملة" />
            </div>
            <div>
              <label className="label-field">الحالة</label>
              <select name="status" defaultValue={searchParams.status ?? ""} className="input-field text-sm">
                <option value="">الكل</option>
                {Object.entries(STATUS_LABELS).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
              </select>
            </div>
            <div>
              <label className="label-field">القالب</label>
              <select name="templateId" defaultValue={searchParams.templateId ?? ""} className="input-field text-sm">
                <option value="">الكل</option>
                {templates.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
              </select>
            </div>
            <div>
              <label className="label-field">من تاريخ</label>
              <input type="date" name="dateFrom" defaultValue={searchParams.dateFrom} className="input-field text-sm" dir="ltr" />
            </div>
            <div>
              <label className="label-field">إلى تاريخ</label>
              <input type="date" name="dateTo" defaultValue={searchParams.dateTo} className="input-field text-sm" dir="ltr" />
            </div>
            <button type="submit" className="btn-secondary text-sm">تصفية</button>
            {(searchParams.status || searchParams.templateId || searchParams.q || searchParams.dateFrom || searchParams.dateTo) && (
              <Link href="/dashboard/campaigns?tab=one_time" className="text-xs text-accent-400 hover:underline">مسح الفلاتر</Link>
            )}
          </form>

          <div className="card overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-white/5 text-right text-xs text-slate-500">
                  <th className="p-4 font-medium">اسم الحملة</th>
                  <th className="p-4 font-medium">القالب</th>
                  <th className="p-4 font-medium">الحالة</th>
                  <th className="p-4 font-medium">الجمهور المستهدف</th>
                  <th className="p-4 font-medium">مُرسل</th>
                  <th className="p-4 font-medium">معدل التسليم</th>
                </tr>
              </thead>
              <tbody>
                {oneTimeData.campaigns.map((c) => {
                  const status = STATUS_LABELS[c.status]!;
                  const delivered = c.deliveredCount + c.readCount + c.repliedCount;
                  const deliveryRate = c.sentCount > 0 ? Math.round((delivered / c.sentCount) * 100) : null;
                  return (
                    <tr key={c.id} className="border-b border-white/5 last:border-0 hover:bg-white/5">
                      <td className="p-4">
                        <Link href={`/dashboard/campaigns/${c.id}`} className="font-medium text-slate-100 hover:text-accent-400">
                          {c.name}
                        </Link>
                      </td>
                      <td className="p-4 text-slate-400" dir="ltr">{c.template.name}</td>
                      <td className="p-4"><span className={`badge ${status.className}`}>{status.label}</span></td>
                      <td className="p-4 text-slate-300">{c._count.recipients}</td>
                      <td className="p-4 text-slate-300">{c.sentCount}</td>
                      <td className="p-4">
                        {deliveryRate === null ? <span className="text-slate-500">—</span> : (
                          <span className={deliveryRate >= 80 ? "text-success-500" : deliveryRate >= 50 ? "text-warning-500" : "text-danger-500"}>
                            {deliveryRate}%
                          </span>
                        )}
                      </td>
                    </tr>
                  );
                })}
                {oneTimeData.campaigns.length === 0 && (
                  <tr><td colSpan={6} className="p-8 text-center text-slate-500">لا توجد حملات مطابقة.</td></tr>
                )}
              </tbody>
            </table>
          </div>

          {totalPages > 1 && (
            <div className="flex items-center justify-center gap-2 text-sm">
              {Array.from({ length: totalPages }, (_, i) => i + 1).map((p) => (
                <Link
                  key={p}
                  href={`/dashboard/campaigns${buildQuery({ ...currentFilters, tab: "one_time", page: String(p) })}`}
                  className={`rounded-md px-3 py-1 ${p === page ? "bg-accent-500 text-white" : "text-slate-400 hover:bg-white/5"}`}
                >
                  {p}
                </Link>
              ))}
            </div>
          )}
        </>
      ) : (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          {triggeredCampaigns.map((c) => (
            <div key={c.id} className="card space-y-3 p-5">
              <div className="flex items-center justify-between">
                <div>
                  <p className="font-semibold text-white">{c.name}</p>
                  <p className="text-xs text-slate-400">{TRIGGER_EVENT_LABELS[c.triggerEvent ?? ""] ?? c.triggerEvent}</p>
                </div>
                <span className={`badge ${c.status === "ACTIVE" ? "bg-success-500/10 text-success-500" : "bg-slate-500/10 text-slate-400"}`}>
                  {c.status === "ACTIVE" ? "🟢 نشطة" : "⏸️ متوقفة"}
                </span>
              </div>

              <div className="grid grid-cols-2 gap-2 text-center">
                <div className="rounded-lg bg-navy-900 p-3">
                  <p className="text-xs text-slate-400">مرات التشغيل</p>
                  <p className="text-xl font-bold text-white" dir="ltr">{c.runCount}</p>
                </div>
                <div className="rounded-lg bg-navy-900 p-3">
                  <p className="text-xs text-slate-400">إيراد مسترد</p>
                  <p className="text-xl font-bold text-success-500" dir="ltr">{c.totalRevenueSar.toLocaleString("en-US")} ر.س</p>
                </div>
              </div>

              <Link href={`/dashboard/campaigns/${c.id}`} className="block text-center text-xs text-accent-400 hover:underline">
                عرض التفاصيل ←
              </Link>

              {canManage && (
                <div className="flex gap-2">
                  <form action={setTriggeredCampaignActive.bind(null, c.id, c.status !== "ACTIVE")} className="flex-1">
                    <button className="btn-secondary w-full text-xs">{c.status === "ACTIVE" ? "⏸️ إيقاف مؤقت" : "▶️ إعادة التفعيل"}</button>
                  </form>
                  <form action={runTriggerScanNow.bind(null, c.id)} className="flex-1">
                    <button className="btn-secondary w-full text-xs">🔍 فحص الآن</button>
                  </form>
                </div>
              )}
            </div>
          ))}
          {triggeredCampaigns.length === 0 && (
            <div className="card col-span-full p-8 text-center text-slate-500">
              لا توجد حملات آلية بعد. أنشئ حملة جديدة واختر نوع "آلية" لبناء أول حملة استرداد سلة متروكة أو استهداف عملاء غير نشطين.
            </div>
          )}
        </div>
      )}
    </div>
  );
}
