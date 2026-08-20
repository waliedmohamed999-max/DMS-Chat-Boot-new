import Link from "next/link";
import { requireTenantSession } from "@/lib/session";
import { withTenant } from "@/lib/db";
import { hasEffectivePermission } from "@/lib/rbac";
import { buildOrderListWhere, type OrderListSearchParams } from "@/lib/orders/filters";
import { ORDER_STATUS_LABELS_AR, ORDER_STATUSES_ORDERED } from "@/lib/orders/labels";
import { OrdersTable } from "./OrdersTable";
import type { OrderStatus } from "@prisma/client";

const PAGE_SIZE = 25;

type Tab = "all" | OrderStatus;
const TAB_ORDER: Tab[] = ["all", ...ORDER_STATUSES_ORDERED];

type SearchParams = OrderListSearchParams & { page?: string };

export default async function OrdersPage({ searchParams }: { searchParams: SearchParams }) {
  const session = await requireTenantSession();
  const tenantId = session.user.tenantId;

  if (!hasEffectivePermission(session.user.permissions, "orders.view")) {
    return (
      <div className="card p-8 text-center text-slate-400">
        ليس لديك صلاحية عرض الطلبات. تواصل مع صاحب الحساب أو المدير.
      </div>
    );
  }
  const canManageOrders = hasEffectivePermission(session.user.permissions, "orders.manage");
  const canManageCampaigns = hasEffectivePermission(session.user.permissions, "campaigns.manage");

  // نفس طريقة تحقق integrations/page.tsx بالضبط: تكامل بحالة CONNECTED فعلياً، وليس مجرد صف Integration
  // موجود بأي حالة (DISCONNECTED افتراضياً لكل تكامل غير مربوط بعد).
  const storeIntegrations = await withTenant(tenantId, (tx) =>
    tx.integration.findMany({ where: { tenantId, provider: { in: ["ZID", "SALLA"] }, status: "CONNECTED" } })
  );

  if (storeIntegrations.length === 0) {
    return (
      <div className="card flex flex-col items-center gap-4 p-12 text-center">
        <div className="text-4xl">📦</div>
        <div>
          <h1 className="mb-1 text-lg font-bold text-white">الطلبات</h1>
          <p className="text-sm text-slate-400">
            اربط متجرك على زد أو سلة أولاً لعرض طلباتك (بما فيها السلات المتروكة) واستهداف عملائك مباشرة عبر واتساب.
          </p>
        </div>
        <Link href="/dashboard/integrations" className="btn-primary text-sm">ربط متجرك الآن</Link>
      </div>
    );
  }

  const tab: Tab = TAB_ORDER.includes(searchParams.tab as Tab) ? (searchParams.tab as Tab) : "all";
  const page = Math.max(1, parseInt(searchParams.page ?? "1", 10) || 1);
  const where = buildOrderListWhere(tenantId, { ...searchParams, tab });

  const [orders, filteredCount, tabCounts] = await withTenant(tenantId, (tx) =>
    Promise.all([
      tx.order.findMany({
        where,
        include: { contact: { select: { id: true, name: true, phoneE164: true } } },
        orderBy: { createdAt: "desc" },
        skip: (page - 1) * PAGE_SIZE,
        take: PAGE_SIZE,
      }),
      tx.order.count({ where }),
      tx.order.groupBy({ by: ["status"], where: { tenantId }, _count: true }),
    ])
  );

  // القوالب المعتمدة فقط — لوحة "إرسال سريع الآن" تعرض هذه القائمة حصراً (بدل عرض كل القوالب وتعطيل
  // غير المعتمد منها كما في معالج الحملة الكامل)، فرضاً حقيقياً من الخادم لقيد Meta لا مجرد فلتر واجهة.
  const approvedTemplates = await withTenant(tenantId, (tx) =>
    tx.messageTemplate.findMany({
      where: { tenantId, status: "APPROVED" },
      select: { id: true, name: true, bodyText: true },
      orderBy: { name: "asc" },
    })
  );

  const countsByStatus: Record<string, number> = Object.fromEntries(tabCounts.map((t) => [t.status, t._count]));
  const totalCount = tabCounts.reduce((sum, t) => sum + t._count, 0);
  const totalPages = Math.max(1, Math.ceil(filteredCount / PAGE_SIZE));

  function tabHref(t: Tab) {
    const p = new URLSearchParams();
    p.set("tab", t);
    return `/dashboard/orders?${p.toString()}`;
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-bold text-white">الطلبات</h1>
        <p className="text-sm text-slate-400">{totalCount} طلب من {storeIntegrations.map((i) => (i.provider === "ZID" ? "زد" : "سلة")).join(" و")}</p>
      </div>

      {/* تبويبات بالحالة — نفس نمط تبويبات صفحة جهات الاتصال */}
      <div className="flex flex-wrap gap-2 border-b border-white/5 pb-3">
        {TAB_ORDER.map((t) => (
          <Link
            key={t}
            href={tabHref(t)}
            className={`rounded-full px-3 py-1.5 text-sm ${
              tab === t ? "bg-accent-500 text-white" : "bg-white/5 text-slate-300 hover:bg-white/10"
            }`}
          >
            {t === "all" ? "الكل" : ORDER_STATUS_LABELS_AR[t]} <span className="text-xs opacity-70">({t === "all" ? totalCount : countsByStatus[t] ?? 0})</span>
          </Link>
        ))}
      </div>

      <div className="card p-5">
        <form className="mb-4 flex flex-wrap gap-2">
          <input type="hidden" name="tab" value={tab} />
          <input
            type="search" name="q" defaultValue={searchParams.q}
            placeholder="بحث بالاسم أو الجوال..." className="input-field flex-1 min-w-[160px] text-sm"
          />
          {storeIntegrations.length > 1 && (
            <select name="source" defaultValue={searchParams.source ?? ""} className="input-field text-sm">
              <option value="">كل المصادر</option>
              <option value="ZID">🟩 زد</option>
              <option value="SALLA">⬛ سلة</option>
            </select>
          )}
          <input type="date" name="dateFrom" defaultValue={searchParams.dateFrom} className="input-field text-sm" dir="ltr" />
          <input type="date" name="dateTo" defaultValue={searchParams.dateTo} className="input-field text-sm" dir="ltr" />
          <button type="submit" className="btn-secondary text-sm">تصفية</button>
        </form>

        <OrdersTable
          orders={orders.map((o) => ({
            id: o.id,
            status: o.status,
            totalSar: o.totalSar,
            externalSource: o.externalSource,
            createdAt: o.createdAt.toISOString(),
            recoveryMessageSentAt: o.recoveryMessageSentAt?.toISOString() ?? null,
            contact: o.contact,
          }))}
          showRecoveryColumn={tab === "ABANDONED_CART"}
          canManageOrders={canManageOrders}
          canManageCampaigns={canManageCampaigns}
          approvedTemplates={approvedTemplates}
        />

        {totalPages > 1 && (
          <div className="mt-4 flex items-center justify-center gap-2 text-sm">
            {Array.from({ length: totalPages }, (_, i) => i + 1).map((p) => {
              const params = new URLSearchParams();
              params.set("tab", tab);
              params.set("page", String(p));
              if (searchParams.q) params.set("q", searchParams.q);
              if (searchParams.source) params.set("source", searchParams.source);
              if (searchParams.dateFrom) params.set("dateFrom", searchParams.dateFrom);
              if (searchParams.dateTo) params.set("dateTo", searchParams.dateTo);
              return (
                <Link
                  key={p}
                  href={`/dashboard/orders?${params.toString()}`}
                  className={`rounded-md px-3 py-1 ${p === page ? "bg-accent-500 text-white" : "text-slate-400 hover:bg-white/5"}`}
                >
                  {p}
                </Link>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
