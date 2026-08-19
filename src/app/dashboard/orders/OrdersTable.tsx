"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import type { OrderStatus } from "@prisma/client";
import { ORDER_STATUS_LABELS_AR, ORDER_STATUS_BADGE_CLASSNAMES } from "@/lib/orders/labels";
import { formatMoney } from "@/lib/currency";
import { getOrderContactSendRoute, quickSendOrderTemplate, type OrderSendRoute } from "./actions";

const SOURCE_LABELS_AR: Record<string, string> = { ZID: "🟩 زد", SALLA: "⬛ سلة" };

type OrderRow = {
  id: string;
  status: OrderStatus;
  totalSar: number;
  externalSource: string;
  createdAt: string; // ISO
  recoveryMessageSentAt: string | null; // ISO
  contact: { id: string; name: string; phoneE164: string };
};

type ApprovedTemplate = { id: string; name: string; bodyText: string };

export function OrdersTable({
  orders,
  showRecoveryColumn,
  canManageOrders,
  canManageCampaigns,
  approvedTemplates,
}: {
  orders: OrderRow[];
  showRecoveryColumn: boolean;
  canManageOrders: boolean;
  canManageCampaigns: boolean;
  approvedTemplates: ApprovedTemplate[];
}) {
  const router = useRouter();
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [isPending, startTransition] = useTransition();
  const [message, setMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);

  // حالة "إرسال سريع الآن" — orderId الجاري إرساله الآن + نتيجة قرار المسار (صندوق محادثات/قالب)
  const [sendingOrderId, setSendingOrderId] = useState<string | null>(null);
  const [sendRoute, setSendRoute] = useState<OrderSendRoute | null>(null);
  const [templateId, setTemplateId] = useState("");

  const allSelected = orders.length > 0 && selected.size === orders.length;
  const selectedOrders = orders.filter((o) => selected.has(o.id));
  const distinctStatuses = new Set(selectedOrders.map((o) => o.status));
  // "استهدف بحملة" يستخدم segmentFilter.order = {status, withinDays} الموجود أصلاً في audience.ts —
  // فلتر بحالة واحدة فقط، فلا معنى له لو التحديد يخلط حالات مختلفة (لا نخترع فلتر "قائمة حالات").
  const canTargetCampaign = canManageOrders && canManageCampaigns && selectedOrders.length > 0 && distinctStatuses.size === 1;

  function toggleAll() {
    setSelected(allSelected ? new Set() : new Set(orders.map((o) => o.id)));
  }
  function toggleOne(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  /**
   * يوجّه لمعالج الحملة الجديدة بفلتر شريحة "حالة طلب خلال نافذة زمنية" مُعبّأ مسبقاً — نفس آلية
   * `audienceTagId` الموجودة أصلاً لجهات الاتصال (campaigns/new/page.tsx)، بلا أي منطق استهداف جديد.
   * ملاحظة تصميم: لا يوجد audienceType يستهدف جهات اتصال بعينها في معالج الحملة حالياً (ALL أو SEGMENT
   * فقط) — فلو التحديد صفاً واحداً، يُحسَب withinDays من عمر هذا الطلب نفسه بدل تمرير contactId مباشرة
   * (غير مدعوم). لو احتجت لاحقاً استهداف جهة اتصال واحدة بدقة تامة، هذا يتطلب إضافة audienceType جديد
   * ("SINGLE_CONTACT") للمعالج نفسه — امتداد مستقبلي، وليس هذه الجولة.
   */
  function handleTargetCampaign() {
    if (!canTargetCampaign) return;
    const status = selectedOrders[0]!.status;
    const oldestMs = Math.min(...selectedOrders.map((o) => new Date(o.createdAt).getTime()));
    const withinDays = Math.max(1, Math.ceil((Date.now() - oldestMs) / 86400000));
    const params = new URLSearchParams({ orderStatus: status, orderWithinDays: String(withinDays) });
    router.push(`/dashboard/campaigns/new?${params.toString()}`);
  }

  function handleQuickSendClick(orderId: string) {
    setMessage(null);
    setSendingOrderId(orderId);
    setSendRoute(null);
    setTemplateId("");
    startTransition(async () => {
      const result = await getOrderContactSendRoute(orderId);
      if (result.route === "inbox") {
        router.push(`/dashboard/inbox/${result.conversationId}`);
        return;
      }
      if (result.route === "error") {
        setMessage({ type: "error", text: result.message });
        setSendingOrderId(null);
        return;
      }
      setSendRoute(result);
    });
  }

  function handleConfirmQuickSend() {
    if (!sendingOrderId || !templateId) return;
    startTransition(async () => {
      const result = await quickSendOrderTemplate(sendingOrderId, templateId);
      if (result.success) {
        setMessage({ type: "success", text: "أُرسلت الرسالة بنجاح." });
        setSelected(new Set());
      } else {
        setMessage({ type: "error", text: result.error });
      }
      setSendingOrderId(null);
      setSendRoute(null);
    });
  }

  return (
    <div>
      {message && (
        <div
          className={`mb-3 rounded-lg border px-3 py-2 text-sm ${
            message.type === "success" ? "border-success-500/30 bg-success-500/10 text-success-500" : "border-danger-500/30 bg-danger-500/10 text-danger-500"
          }`}
        >
          {message.text}
        </div>
      )}

      {canManageOrders && selected.size > 0 && (
        <div className="mb-3 flex flex-wrap items-center gap-2 rounded-lg border border-accent-500/30 bg-accent-500/10 px-3 py-2 text-sm">
          <span className="font-medium text-accent-400">{selected.size} محدَّد</span>
          <button
            onClick={handleTargetCampaign}
            disabled={!canTargetCampaign || isPending}
            title={distinctStatuses.size > 1 ? "اختر طلبات بنفس الحالة فقط لاستهدافها بحملة واحدة" : undefined}
            className="btn-secondary text-xs disabled:opacity-50"
          >
            📣 استهدف بحملة
          </button>
          <button
            onClick={() => handleQuickSendClick(selectedOrders[0]!.id)}
            disabled={selected.size !== 1 || isPending}
            title={selected.size !== 1 ? "إرسال سريع الآن متاح لطلب واحد فقط" : undefined}
            className="btn-secondary text-xs disabled:opacity-50"
          >
            ⚡ إرسال سريع الآن
          </button>
          <button onClick={() => setSelected(new Set())} className="mr-auto text-xs text-slate-500 hover:underline">
            إلغاء التحديد
          </button>
        </div>
      )}

      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-white/5 text-right text-xs text-slate-500">
              {canManageOrders && (
                <th className="w-8 pb-3">
                  <input type="checkbox" checked={allSelected} onChange={toggleAll} />
                </th>
              )}
              <th className="pb-3 font-medium">العميل</th>
              <th className="pb-3 font-medium">المصدر</th>
              <th className="pb-3 font-medium">الحالة</th>
              <th className="pb-3 font-medium">المبلغ</th>
              <th className="pb-3 font-medium">تاريخ الطلب</th>
              {showRecoveryColumn && <th className="pb-3 font-medium">حالة التواصل</th>}
            </tr>
          </thead>
          <tbody>
            {orders.map((o) => (
              <tr key={o.id} className="border-b border-white/5 last:border-0">
                {canManageOrders && (
                  <td className="py-3">
                    <input type="checkbox" checked={selected.has(o.id)} onChange={() => toggleOne(o.id)} />
                  </td>
                )}
                <td className="py-3">
                  <Link href={`/dashboard/contacts/${o.contact.id}`} className="font-medium text-slate-100 hover:text-accent-400">
                    {o.contact.name}
                  </Link>
                  <p className="text-xs text-slate-500" dir="ltr">{o.contact.phoneE164}</p>
                </td>
                <td className="py-3 text-slate-400">{SOURCE_LABELS_AR[o.externalSource] ?? o.externalSource}</td>
                <td className="py-3">
                  <span className={`badge ${ORDER_STATUS_BADGE_CLASSNAMES[o.status]}`}>{ORDER_STATUS_LABELS_AR[o.status]}</span>
                </td>
                <td className="py-3 text-slate-100" dir="ltr">{formatMoney(o.totalSar, "SAR")}</td>
                <td className="py-3 text-slate-400">{new Date(o.createdAt).toLocaleDateString("ar-SA")}</td>
                {showRecoveryColumn && (
                  <td className="py-3 text-xs">
                    {o.recoveryMessageSentAt ? (
                      <span className="text-slate-400">آخر تواصل: {new Date(o.recoveryMessageSentAt).toLocaleDateString("ar-SA")}</span>
                    ) : (
                      <span className="text-warning-500">لم يُتواصَل بعد</span>
                    )}
                  </td>
                )}
              </tr>
            ))}
            {orders.length === 0 && (
              <tr>
                <td colSpan={6} className="py-8 text-center text-slate-500">لا توجد طلبات مطابقة لهذا الفلتر.</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {sendingOrderId && sendRoute?.route === "template" && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4" onClick={() => setSendingOrderId(null)}>
          <div className="card w-full max-w-sm p-6" onClick={(e) => e.stopPropagation()}>
            <h3 className="mb-2 text-lg font-bold text-white">إرسال سريع الآن</h3>
            <p className="mb-4 text-sm text-slate-400">
              لا توجد محادثة نشطة حالياً مع هذا العميل — سياسة واتساب تسمح فقط بقالب رسالة معتمد لبدء/استئناف التواصل.
            </p>
            {approvedTemplates.length === 0 ? (
              <p className="rounded-lg bg-warning-500/10 px-3 py-2 text-sm text-warning-500">
                لا توجد قوالب معتمدة بعد من Meta — قدّم قالباً من صفحة "قوالب الرسائل" أولاً.
              </p>
            ) : (
              <>
                <select value={templateId} onChange={(e) => setTemplateId(e.target.value)} className="input-field mb-4 text-sm">
                  <option value="">اختر قالباً معتمداً...</option>
                  {approvedTemplates.map((t) => (
                    <option key={t.id} value={t.id}>{t.name}</option>
                  ))}
                </select>
                {templateId && (
                  <p className="mb-4 rounded-lg border border-white/10 bg-navy-800 p-2 text-xs text-slate-300">
                    {approvedTemplates.find((t) => t.id === templateId)?.bodyText}
                  </p>
                )}
              </>
            )}
            <div className="flex gap-2">
              <button onClick={() => setSendingOrderId(null)} className="btn-secondary flex-1 text-sm">إلغاء</button>
              <button
                onClick={handleConfirmQuickSend}
                disabled={!templateId || isPending}
                className="btn-primary flex-1 text-sm disabled:opacity-50"
              >
                إرسال
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
