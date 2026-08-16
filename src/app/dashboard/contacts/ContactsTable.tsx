"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { deleteContact, bulkDeleteContacts, bulkTagContacts, bulkAddToCampaignAudience } from "./actions";
import { STAGE_LABELS_AR, STAGE_BADGE_CLASSNAMES } from "@/lib/contacts/stages";
import { TagChip } from "@/components/dashboard/TagChip";

type ContactRow = {
  id: string;
  name: string;
  phoneE164: string;
  stage: keyof typeof STAGE_LABELS_AR;
  tags: { tagId: string; tag: { name: string; color: string; isSystem: boolean } }[];
};

export function ContactsTable({ contacts, canExport, canDelete }: { contacts: ContactRow[]; canExport: boolean; canDelete: boolean }) {
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [isPending, startTransition] = useTransition();
  const [bulkTagName, setBulkTagName] = useState("");
  const [showTagInput, setShowTagInput] = useState(false);

  const allSelected = contacts.length > 0 && selected.size === contacts.length;

  function toggleAll() {
    setSelected(allSelected ? new Set() : new Set(contacts.map((c) => c.id)));
  }
  function toggleOne(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function handleBulkDelete() {
    if (!window.confirm(`حذف ${selected.size} جهة اتصال نهائياً؟ لا يمكن التراجع.`)) return;
    startTransition(async () => {
      await bulkDeleteContacts(Array.from(selected));
      setSelected(new Set());
    });
  }

  function handleBulkTag() {
    if (!bulkTagName.trim()) return;
    startTransition(async () => {
      await bulkTagContacts(Array.from(selected), bulkTagName.trim());
      setBulkTagName("");
      setShowTagInput(false);
      setSelected(new Set());
    });
  }

  function handleAddToCampaign() {
    startTransition(() => bulkAddToCampaignAudience(Array.from(selected)));
  }

  const exportSelectedHref = `/api/contacts/export?scope=selected&ids=${Array.from(selected).join(",")}`;

  return (
    <div>
      {selected.size > 0 && (
        <div className="mb-3 flex flex-wrap items-center gap-2 rounded-lg border border-accent-500/30 bg-accent-500/10 px-3 py-2 text-sm">
          <span className="font-medium text-accent-400">{selected.size} محدَّدة</span>
          <button onClick={handleAddToCampaign} disabled={isPending} className="btn-secondary text-xs disabled:opacity-50">
            📣 إضافة كجمهور حملة
          </button>
          {canExport && (
            <a href={exportSelectedHref} className="btn-secondary text-xs">
              ⬇️ تصدير المحدَّد
            </a>
          )}
          {showTagInput ? (
            <span className="flex items-center gap-1">
              <input
                value={bulkTagName}
                onChange={(e) => setBulkTagName(e.target.value)}
                placeholder="اسم الوسم"
                className="input-field h-8 w-32 text-xs"
              />
              <button onClick={handleBulkTag} disabled={isPending} className="btn-secondary text-xs disabled:opacity-50">تأكيد</button>
            </span>
          ) : (
            <button onClick={() => setShowTagInput(true)} className="btn-secondary text-xs">🏷️ إضافة وسم</button>
          )}
          {canDelete && (
            <button onClick={handleBulkDelete} disabled={isPending} className="text-xs text-danger-500 hover:underline disabled:opacity-50">
              حذف الكل
            </button>
          )}
          <button onClick={() => setSelected(new Set())} className="mr-auto text-xs text-slate-500 hover:underline">إلغاء التحديد</button>
        </div>
      )}

      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-white/5 text-right text-xs text-slate-500">
              <th className="w-8 pb-3">
                <input type="checkbox" checked={allSelected} onChange={toggleAll} />
              </th>
              <th className="pb-3 font-medium">الاسم</th>
              <th className="pb-3 font-medium">الجوال</th>
              <th className="pb-3 font-medium">المرحلة</th>
              <th className="pb-3 font-medium">الوسوم</th>
              <th className="pb-3 font-medium"></th>
            </tr>
          </thead>
          <tbody>
            {contacts.map((c) => {
              const visibleTags = c.tags.filter((t) => !t.tag.isSystem);
              return (
                <tr key={c.id} className="border-b border-white/5 last:border-0">
                  <td className="py-3">
                    <input type="checkbox" checked={selected.has(c.id)} onChange={() => toggleOne(c.id)} />
                  </td>
                  <td className="py-3">
                    <Link href={`/dashboard/contacts/${c.id}`} className="font-medium text-slate-100 hover:text-accent-400">
                      {c.name}
                    </Link>
                  </td>
                  <td className="py-3 text-slate-400" dir="ltr">{c.phoneE164}</td>
                  <td className="py-3">
                    <span className={`badge ${STAGE_BADGE_CLASSNAMES[c.stage]}`}>{STAGE_LABELS_AR[c.stage]}</span>
                  </td>
                  <td className="py-3">
                    <div className="flex flex-wrap gap-1">
                      {visibleTags.length === 0 && <span className="text-xs text-slate-600">—</span>}
                      {visibleTags.map((t) => <TagChip key={t.tagId} name={t.tag.name} color={t.tag.color} />)}
                    </div>
                  </td>
                  <td className="py-3 text-left">
                    {canDelete && (
                      <form action={deleteContact.bind(null, c.id)}>
                        <button className="text-xs text-danger-500 hover:underline">حذف</button>
                      </form>
                    )}
                  </td>
                </tr>
              );
            })}
            {contacts.length === 0 && (
              <tr>
                <td colSpan={6} className="py-8 text-center text-slate-500">
                  لا توجد جهات اتصال مطابقة لهذا الفلتر.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
