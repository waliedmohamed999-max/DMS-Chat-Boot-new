import Link from "next/link";
import { requireTenantSession } from "@/lib/session";
import { withTenant } from "@/lib/db";
import { createQuickReply, deleteQuickReply } from "../actions";

export default async function QuickRepliesPage() {
  const session = await requireTenantSession();
  const tenantId = session.user.tenantId;

  const quickReplies = await withTenant(tenantId, (tx) =>
    tx.quickReply.findMany({ where: { tenantId }, orderBy: { shortcut: "asc" } })
  );

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <Link href="/dashboard/inbox" className="text-sm text-accent-400 hover:underline">
        ← رجوع لصندوق المحادثات
      </Link>
      <div>
        <h1 className="text-xl font-bold text-white">الردود السريعة</h1>
        <p className="text-sm text-slate-400">
          جهّز ردوداً جاهزة للأسئلة المتكررة — اكتب "/" متبوعاً بالاختصار داخل صندوق الرد لإدراجها فوراً.
        </p>
      </div>

      <form action={createQuickReply} className="card space-y-3 p-5">
        <div>
          <label className="label-field">الاختصار</label>
          <input name="shortcut" required className="input-field" placeholder="مثال: شكر" dir="ltr" />
        </div>
        <div>
          <label className="label-field">نص الرد</label>
          <textarea name="body" required rows={3} className="input-field" placeholder="شكراً لتواصلك معنا! 🙏" />
        </div>
        <button type="submit" className="btn-primary w-full">إضافة رد سريع</button>
      </form>

      <div className="card overflow-hidden">
        {quickReplies.map((q) => (
          <div key={q.id} className="flex items-center justify-between border-b border-white/5 p-4 last:border-0">
            <div>
              <p className="text-sm font-medium text-accent-400" dir="ltr">/{q.shortcut}</p>
              <p className="mt-0.5 text-sm text-slate-300">{q.body}</p>
            </div>
            <form action={deleteQuickReply.bind(null, q.id)}>
              <button className="text-xs text-danger-500 hover:underline">حذف</button>
            </form>
          </div>
        ))}
        {quickReplies.length === 0 && <p className="p-8 text-center text-sm text-slate-500">لا توجد ردود سريعة بعد.</p>}
      </div>
    </div>
  );
}
