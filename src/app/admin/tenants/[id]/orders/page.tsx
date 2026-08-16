import { notFound } from "next/navigation";
import { superAdminDb } from "@/lib/db";

const ORDER_STATUS_LABELS_AR: Record<string, string> = {
  ABANDONED_CART: "🛒 سلة متروكة", PENDING: "⏳ قيد الانتظار", PAID: "✅ مدفوع",
  SHIPPED: "🚚 تم الشحن", DELIVERED: "📦 تم التسليم", CANCELLED: "❌ ملغي",
};

export default async function TenantOrdersPage({ params }: { params: { id: string } }) {
  const tenant = await superAdminDb.tenant.findUnique({ where: { id: params.id }, select: { id: true } });
  if (!tenant) notFound();

  const [orders, products] = await Promise.all([
    superAdminDb.order.findMany({ where: { tenantId: tenant.id }, include: { contact: true }, orderBy: { createdAt: "desc" }, take: 50 }),
    superAdminDb.product.findMany({ where: { tenantId: tenant.id }, orderBy: { updatedAt: "desc" }, take: 50 }),
  ]);

  return (
    <div className="space-y-4">
      <div className="card overflow-hidden">
        <h2 className="border-b border-white/5 p-4 font-semibold text-white">الطلبات ({orders.length})</h2>
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-white/5 text-right text-xs text-slate-500">
              <th className="p-3 font-medium">العميل</th>
              <th className="p-3 font-medium">المصدر</th>
              <th className="p-3 font-medium">الحالة</th>
              <th className="p-3 font-medium">المبلغ</th>
            </tr>
          </thead>
          <tbody>
            {orders.map((o) => (
              <tr key={o.id} className="border-b border-white/5 last:border-0">
                <td className="p-3 text-slate-300">{o.contact.name}</td>
                <td className="p-3 text-slate-500">{o.externalSource}</td>
                <td className="p-3 text-slate-400">{ORDER_STATUS_LABELS_AR[o.status] ?? o.status}</td>
                <td className="p-3 text-slate-100" dir="ltr">{o.totalSar} ر.س</td>
              </tr>
            ))}
            {orders.length === 0 && <tr><td colSpan={4} className="p-8 text-center text-slate-500">لا توجد طلبات بعد.</td></tr>}
          </tbody>
        </table>
      </div>

      <div className="card overflow-hidden">
        <h2 className="border-b border-white/5 p-4 font-semibold text-white">المنتجات ({products.length})</h2>
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-white/5 text-right text-xs text-slate-500">
              <th className="p-3 font-medium">المنتج</th>
              <th className="p-3 font-medium">المصدر</th>
              <th className="p-3 font-medium">السعر</th>
              <th className="p-3 font-medium">المخزون</th>
            </tr>
          </thead>
          <tbody>
            {products.map((p) => (
              <tr key={p.id} className="border-b border-white/5 last:border-0">
                <td className="p-3 text-slate-300">{p.name}</td>
                <td className="p-3 text-slate-500">{p.externalSource}</td>
                <td className="p-3 text-slate-100" dir="ltr">{p.priceSar} ر.س</td>
                <td className="p-3 text-slate-400">{p.stockQty}</td>
              </tr>
            ))}
            {products.length === 0 && <tr><td colSpan={4} className="p-8 text-center text-slate-500">لا توجد منتجات مزامنة بعد.</td></tr>}
          </tbody>
        </table>
      </div>
    </div>
  );
}
