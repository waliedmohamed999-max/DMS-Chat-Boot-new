import Link from "next/link";
import { notFound } from "next/navigation";
import { requireTenantSession } from "@/lib/session";
import { withTenant } from "@/lib/db";
import { updateContactStage, updateContactOptIn, updateContact } from "../actions";
import { TagEditor } from "./TagEditor";
import { STAGE_LABELS_AR, CONTACT_STAGES_ORDERED, CONTACT_SOURCE_LABELS_AR } from "@/lib/contacts/stages";

const ORDER_STATUS_LABELS: Record<string, string> = {
  ABANDONED_CART: "🛒 سلة متروكة",
  PENDING: "⏳ قيد الانتظار",
  PAID: "✅ مدفوع",
  SHIPPED: "🚚 تم الشحن",
  DELIVERED: "📦 تم التسليم",
  CANCELLED: "❌ ملغي",
};

const CONVERSATION_STATUS_LABELS: Record<string, string> = {
  NEW: "جديدة", NEEDS_REPLY: "بانتظار رد", OPEN: "مفتوحة", RESOLVED: "محلولة",
};

const RECIPIENT_STATUS_LABELS: Record<string, string> = {
  PENDING: "قيد الإرسال", SENT: "أُرسلت", DELIVERED: "وصلت", READ: "قُرئت", REPLIED: "رُدَّ عليها", FAILED: "فشلت",
};

export default async function ContactDetailPage({ params }: { params: { id: string } }) {
  const session = await requireTenantSession();
  const tenantId = session.user.tenantId;

  const contact = await withTenant(tenantId, async (tx) => {
    return tx.contact.findUnique({
      where: { id: params.id, tenantId },
      include: {
        tags: { include: { tag: true }, where: { tag: { isSystem: false } } },
        orders: { orderBy: { createdAt: "desc" } },
        conversations: { orderBy: { lastMessageAt: "desc" } },
        campaignRecipients: {
          include: { campaign: { select: { id: true, name: true } } },
          orderBy: { sentAt: "desc" },
        },
        sourceCampaign: { select: { id: true, name: true } },
        importBatch: { select: { fileName: true, createdAt: true } },
      },
    });
  });

  if (!contact) notFound();

  return (
    <div className="space-y-6">
      <Link href="/dashboard/contacts" className="text-sm text-accent-400 hover:underline">
        ← رجوع لجهات الاتصال
      </Link>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <div className="card p-5">
          <div className="mb-4 flex items-center gap-3">
            <div className="flex h-12 w-12 items-center justify-center rounded-full bg-accent-500/20 text-lg font-bold text-accent-400">
              {contact.name.slice(0, 1)}
            </div>
            <div>
              <h1 className="font-bold text-white">{contact.name}</h1>
              <p className="text-sm text-slate-400" dir="ltr">{contact.phoneE164}</p>
            </div>
          </div>

          <form action={updateContact.bind(null, contact.id)} className="mb-4 space-y-2">
            <div>
              <label className="label-field text-xs">الاسم</label>
              <input name="name" defaultValue={contact.name} required className="input-field text-sm" />
            </div>
            <div>
              <label className="label-field text-xs">البريد الإلكتروني</label>
              <input name="email" type="email" defaultValue={contact.email ?? ""} className="input-field text-sm" dir="ltr" />
            </div>
            <div>
              <label className="label-field text-xs">المدينة</label>
              <input name="city" defaultValue={contact.city ?? ""} className="input-field text-sm" />
            </div>
            <div>
              <label className="label-field text-xs">ملاحظات داخلية</label>
              <textarea name="notes" defaultValue={contact.notes ?? ""} rows={2} className="input-field text-sm" />
            </div>
            <button type="submit" className="btn-secondary w-full text-xs">حفظ البيانات</button>
          </form>

          <div className="mb-4">
            <label className="label-field">مرحلة العميل</label>
            <div className="flex flex-wrap gap-2">
              {CONTACT_STAGES_ORDERED.map((stage) => (
                <form key={stage} action={updateContactStage.bind(null, contact.id, stage)}>
                  <button
                    className={`badge border ${
                      contact.stage === stage
                        ? "border-accent-500 bg-accent-500/10 text-accent-400"
                        : "border-white/10 text-slate-400 hover:bg-white/5"
                    }`}
                  >
                    {STAGE_LABELS_AR[stage]}
                  </button>
                </form>
              ))}
            </div>
          </div>

          <div className="mb-4">
            <label className="label-field">الموافقة على التسويق</label>
            <div className="flex gap-2">
              {([
                { value: true, label: "موافق" },
                { value: false, label: "غير موافق" },
                { value: null, label: "غير محدد" },
              ] as const).map((opt) => (
                <form key={String(opt.value)} action={updateContactOptIn.bind(null, contact.id, opt.value)}>
                  <button
                    className={`badge border ${
                      contact.marketingOptIn === opt.value
                        ? "border-success-500 bg-success-500/10 text-success-500"
                        : "border-white/10 text-slate-400 hover:bg-white/5"
                    }`}
                  >
                    {opt.label}
                  </button>
                </form>
              ))}
            </div>
            {contact.optInUpdatedAt && (
              <p className="mt-1 text-xs text-slate-500">
                آخر تحديث: {new Date(contact.optInUpdatedAt).toLocaleDateString("ar-SA")}
              </p>
            )}
          </div>

          <div className="mb-4">
            <TagEditor contactId={contact.id} tags={contact.tags} />
          </div>

          <div className="rounded-lg border border-white/5 bg-navy-900 p-3 text-xs text-slate-400">
            <p>المصدر: {CONTACT_SOURCE_LABELS_AR[contact.source] ?? contact.source}</p>
            {contact.sourceCampaign && (
              <p>
                من حملة:{" "}
                <Link href={`/dashboard/campaigns/${contact.sourceCampaign.id}`} className="text-accent-400 hover:underline">
                  {contact.sourceCampaign.name}
                </Link>
              </p>
            )}
            {contact.importBatch && (
              <p>من ملف استيراد: {contact.importBatch.fileName} ({new Date(contact.importBatch.createdAt).toLocaleDateString("ar-SA")})</p>
            )}
            {contact.externalZidId && <p>مرتبط بعميل زد: {contact.externalZidId}</p>}
            {contact.externalSallaId && <p>مرتبط بعميل سلة: {contact.externalSallaId}</p>}
            <p className="mt-1">أُضيفت في: {new Date(contact.createdAt).toLocaleDateString("ar-SA")}</p>
          </div>
        </div>

        <div className="card p-5">
          <h2 className="mb-4 font-semibold text-white">سجل الطلبات</h2>
          <div className="space-y-2">
            {contact.orders.length === 0 && <p className="text-sm text-slate-500">لا توجد طلبات مرتبطة.</p>}
            {contact.orders.map((o) => (
              <div key={o.id} className="rounded-lg border border-white/5 p-3">
                <div className="flex items-center justify-between text-sm">
                  <span className="text-slate-300">{o.externalId}</span>
                  <span className="font-medium text-slate-100">{o.totalSar} ر.س</span>
                </div>
                <p className="mt-1 text-xs text-slate-500">{ORDER_STATUS_LABELS[o.status]}</p>
              </div>
            ))}
          </div>

          <h2 className="mb-4 mt-6 font-semibold text-white">سجل المحادثات</h2>
          <div className="space-y-2">
            {contact.conversations.length === 0 && <p className="text-sm text-slate-500">لا توجد محادثات بعد.</p>}
            {contact.conversations.map((c) => (
              <Link
                key={c.id}
                href={`/dashboard/inbox/${c.id}`}
                className="block rounded-lg border border-white/5 p-3 text-sm hover:bg-white/5"
              >
                <div className="flex items-center justify-between">
                  <span className="text-slate-300">{new Date(c.lastMessageAt).toLocaleDateString("ar-SA")}</span>
                  <span className="badge bg-white/5 text-slate-400">{CONVERSATION_STATUS_LABELS[c.status] ?? c.status}</span>
                </div>
              </Link>
            ))}
          </div>
        </div>

        <div className="card p-5">
          <h2 className="mb-4 font-semibold text-white">سجل الحملات (Activity Timeline)</h2>
          <div className="space-y-2">
            {contact.campaignRecipients.length === 0 && <p className="text-sm text-slate-500">لم تُستهدَف بأي حملة بعد.</p>}
            {contact.campaignRecipients.map((r) => (
              <Link
                key={r.id}
                href={`/dashboard/campaigns/${r.campaign.id}`}
                className="block rounded-lg border border-white/5 p-3 text-sm hover:bg-white/5"
              >
                <div className="flex items-center justify-between">
                  <span className="text-slate-300">{r.campaign.name}</span>
                  <span className={`badge ${r.status === "FAILED" ? "bg-danger-500/10 text-danger-500" : "bg-white/5 text-slate-400"}`}>
                    {RECIPIENT_STATUS_LABELS[r.status] ?? r.status}
                  </span>
                </div>
                {r.sentAt && <p className="mt-1 text-xs text-slate-500">{new Date(r.sentAt).toLocaleDateString("ar-SA")}</p>}
                {r.errorMessage && <p className="mt-1 text-xs text-danger-500">{r.errorMessage}</p>}
              </Link>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
