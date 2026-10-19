import Link from "next/link";
import { requireSuperAdminSession } from "@/lib/session";
import { hasEffectivePermission } from "@/lib/rbac";
import { superAdminDb } from "@/lib/db";
import { monthlyUsageByTenant } from "@/lib/billing/wallet";
import { ConfirmSubmitButton } from "@/components/dashboard/ConfirmSubmitButton";
import { disconnectNumber, refreshD360Channel } from "./actions";

export const metadata = { title: "أرقام واتساب — DMS Tech" };

const PROVIDER_LABELS: Record<string, string> = { D360DIALOG: "360dialog (عبر DMS)", META_WHATSAPP: "Meta مباشر (قديم)" };
const FILTERS = [
  { key: "all", label: "الكل" },
  { key: "issues", label: "بها مشكلة" },
  { key: "pending", label: "قيد التحقق" },
  { key: "d360", label: "360dialog فقط" },
] as const;

type Meta = { displayPhoneNumber?: string; connectedPhoneE164?: string; qualityRating?: string; availability?: string; connectedAt?: string };

export default async function AdminNumbersPage(props: { searchParams: Promise<{ filter?: string }> }) {
  const session = await requireSuperAdminSession();
  if (!hasEffectivePermission(session.user.permissions, "platform.merchants.view")) {
    return <div className="card p-8 text-center text-slate-400">ليس لديك صلاحية عرض أرقام التجار.</div>;
  }
  const canManage = hasEffectivePermission(session.user.permissions, "platform.manage_tenants");
  const { filter = "all" } = await props.searchParams;

  const integrations = await superAdminDb.integration.findMany({
    where: { provider: { in: ["D360DIALOG", "META_WHATSAPP"] }, status: { not: "DISCONNECTED" } },
    include: { tenant: { select: { id: true, name: true, status: true } } },
    orderBy: { updatedAt: "desc" },
  });
  const tenantIds = [...new Set(integrations.map((i) => i.tenantId))];
  const [wallets, usage] = await Promise.all([
    superAdminDb.walletBalance.findMany({ where: { tenantId: { in: tenantIds } } }),
    monthlyUsageByTenant(tenantIds),
  ]);
  const walletBy = new Map(wallets.map((w) => [w.tenantId, w]));

  const rows = integrations.map((i) => {
    const meta = (i.metadataJson ?? {}) as Meta;
    const wallet = walletBy.get(i.tenantId);
    const lowBalance = i.provider === "D360DIALOG" && !i.isSandbox && (!wallet || wallet.balance.lessThan(wallet.minAlert));
    const badQuality = meta.qualityRating && !["GREEN", "HIGH", "UNKNOWN"].includes(String(meta.qualityRating).toUpperCase());
    const issues = [
      i.pendingVerification ? "قيد التحقق" : null,
      i.status !== "CONNECTED" ? "يحتاج إعادة ربط" : null,
      badQuality ? `جودة ${meta.qualityRating}` : null,
      lowBalance ? "رصيد منخفض" : null,
      i.lastError ? "خطأ" : null,
    ].filter(Boolean) as string[];
    return { i, meta, wallet, issues, usage: usage.get(i.tenantId) };
  });
  const visible = rows.filter((r) =>
    filter === "issues" ? r.issues.length > 0 : filter === "pending" ? r.i.pendingVerification : filter === "d360" ? r.i.provider === "D360DIALOG" : true
  );

  const d360Count = rows.filter((r) => r.i.provider === "D360DIALOG" && !r.i.isSandbox).length;
  const stats = [
    { label: "أرقام 360dialog فعلية", value: d360Count },
    { label: "قيد التحقق", value: rows.filter((r) => r.i.pendingVerification).length },
    { label: "بها مشكلة", value: rows.filter((r) => r.issues.length > 0).length },
    { label: "رسائل مدفوعة هذا الشهر", value: [...usage.values()].reduce((n, u) => n + u.messages, 0) },
  ];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-bold text-white">أرقام واتساب التجار</h1>
        <p className="text-sm text-slate-400">
          كل رقم مربوط على المنصة وحالته. الأرقام الجديدة تُربط عبر 360dialog من صفحة تكاملات التاجر، وتوثيق النشاط التجاري
          (Business Verification) يتم من لوحة شريك 360dialog.
        </p>
      </div>

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        {stats.map((s) => (
          <div key={s.label} className="card p-4">
            <p className="text-xs text-slate-400">{s.label}</p>
            <p className="mt-1 text-2xl font-bold text-white">{s.value.toLocaleString("ar-SA")}</p>
          </div>
        ))}
      </div>

      <div className="flex flex-wrap gap-2">
        {FILTERS.map((f) => (
          <Link key={f.key} href={`/admin/numbers?filter=${f.key}`} className={`rounded-lg px-3 py-1.5 text-xs ${filter === f.key ? "bg-accent-500 text-white" : "bg-white/5 text-slate-300 hover:bg-white/10"}`}>
            {f.label}
          </Link>
        ))}
      </div>

      <div className="card overflow-x-auto">
        {visible.length === 0 ? (
          <p className="p-8 text-center text-sm text-slate-500">لا أرقام في هذا التصنيف.</p>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-white/5 text-right text-xs text-slate-500">
                <th className="p-3 font-medium">التاجر</th>
                <th className="p-3 font-medium">الرقم</th>
                <th className="p-3 font-medium">القناة</th>
                <th className="p-3 font-medium">الحالة</th>
                <th className="p-3 font-medium">رصيد المحفظة</th>
                <th className="p-3 font-medium">هذا الشهر</th>
                {canManage && <th className="p-3 font-medium"></th>}
              </tr>
            </thead>
            <tbody>
              {visible.map(({ i, meta, wallet, issues, usage: u }) => (
                <tr key={i.id} className="border-b border-white/5 align-top">
                  <td className="p-3">
                    <Link href={`/admin/tenants/${i.tenant.id}`} className="font-medium text-white hover:underline">{i.tenant.name}</Link>
                    <p className="text-xs text-slate-500">{i.tenant.status}</p>
                  </td>
                  <td className="p-3 font-mono text-slate-200" dir="ltr">{meta.displayPhoneNumber ?? meta.connectedPhoneE164 ?? "—"}</td>
                  <td className="p-3 text-xs text-slate-300">
                    {PROVIDER_LABELS[i.provider] ?? i.provider}
                    {i.isSandbox && <span className="mr-1 text-warning-500">(تجريبي)</span>}
                  </td>
                  <td className="p-3">
                    {issues.length === 0 ? (
                      <span className="badge bg-success-500/10 text-success-500">سليم</span>
                    ) : (
                      <div className="flex flex-wrap gap-1">
                        {issues.map((x) => <span key={x} className="badge bg-warning-500/10 text-warning-500">{x}</span>)}
                      </div>
                    )}
                    {i.lastError && <p className="mt-1 max-w-xs text-xs text-danger-500">{i.lastError}</p>}
                  </td>
                  <td className="p-3" dir="ltr">
                    {i.provider === "D360DIALOG" ? (
                      <Link href={`/admin/wallets/${i.tenantId}`} className="text-slate-200 hover:underline">{Number(wallet?.balance ?? 0).toFixed(2)} SAR</Link>
                    ) : (
                      <span className="text-xs text-slate-500">—</span>
                    )}
                  </td>
                  <td className="p-3 text-xs text-slate-300">
                    {u ? `${u.messages.toLocaleString("ar-SA")} رسالة · ${u.revenue.toFixed(2)} ر.س` : "—"}
                  </td>
                  {canManage && (
                    <td className="p-3">
                      <div className="flex flex-wrap justify-end gap-2">
                        {i.provider === "D360DIALOG" && i.channelId && !i.isSandbox && (
                          <form action={refreshD360Channel.bind(null, i.id)}>
                            <button className="btn-secondary text-xs">تحديث الحالة</button>
                          </form>
                        )}
                        <ConfirmSubmitButton action={disconnectNumber.bind(null, i.id)} confirmMessage={`فصل رقم ${i.tenant.name}؟ سيتوقف الإرسال والاستقبال فوراً.`} className="btn-danger text-xs">
                          فصل
                        </ConfirmSubmitButton>
                      </div>
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
