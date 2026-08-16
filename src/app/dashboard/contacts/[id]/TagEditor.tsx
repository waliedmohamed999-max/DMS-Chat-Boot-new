"use client";

import { useRef, useState, useTransition } from "react";
import { addTagToContact, removeTagFromContact } from "../actions";
import { TagChip } from "@/components/dashboard/TagChip";

type Tag = { tagId: string; tag: { name: string; color: string } };

export function TagEditor({ contactId, tags }: { contactId: string; tags: Tag[] }) {
  const [name, setName] = useState("");
  const [isPending, startTransition] = useTransition();
  const inputRef = useRef<HTMLInputElement>(null);

  function handleAdd() {
    const trimmed = name.trim();
    if (!trimmed) return;
    startTransition(async () => {
      await addTagToContact(contactId, trimmed);
      setName("");
      inputRef.current?.focus();
    });
  }

  function handleRemove(tagId: string) {
    startTransition(() => removeTagFromContact(contactId, tagId));
  }

  return (
    <div>
      <label className="label-field">الوسوم</label>
      <div className="mb-2 flex flex-wrap gap-1.5">
        {tags.length === 0 && <span className="text-xs text-slate-500">لا توجد وسوم</span>}
        {tags.map((t) => (
          <TagChip key={t.tagId} name={t.tag.name} color={t.tag.color} onRemove={() => handleRemove(t.tagId)} />
        ))}
      </div>
      <div className="flex gap-1.5">
        <input
          ref={inputRef}
          value={name}
          onChange={(e) => setName(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && (e.preventDefault(), handleAdd())}
          placeholder="أضف وسماً جديداً..."
          className="input-field flex-1 text-xs"
        />
        <button onClick={handleAdd} disabled={isPending} className="btn-secondary text-xs disabled:opacity-50">إضافة</button>
      </div>
    </div>
  );
}
