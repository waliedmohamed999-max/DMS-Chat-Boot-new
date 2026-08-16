"use client";

import { useRef } from "react";

type TeamMember = { id: string; name: string };

export function AssignTransferControls({
  assignedAgentId,
  teamMembers,
  onAssign,
  onTransfer,
}: {
  assignedAgentId: string | null;
  teamMembers: TeamMember[];
  onAssign: (agentUserId: string) => Promise<void>;
  onTransfer: (toUserId: string) => Promise<void>;
}) {
  const assignFormRef = useRef<HTMLFormElement>(null);
  const transferFormRef = useRef<HTMLFormElement>(null);

  return (
    <div className="flex flex-wrap items-center gap-3 border-b border-white/5 bg-navy-900/40 px-4 py-2 text-xs">
      <form ref={assignFormRef} action={(fd) => onAssign(String(fd.get("agentUserId")))} className="flex items-center gap-1.5">
        <label className="text-slate-400">إسناد إلى</label>
        <select
          name="agentUserId"
          defaultValue={assignedAgentId ?? ""}
          onChange={() => assignFormRef.current?.requestSubmit()}
          className="input-field !py-1 text-xs"
        >
          <option value="" disabled>اختر عضواً</option>
          {teamMembers.map((u) => (
            <option key={u.id} value={u.id}>{u.name}</option>
          ))}
        </select>
      </form>
      {assignedAgentId && (
        <form ref={transferFormRef} action={(fd) => onTransfer(String(fd.get("toUserId")))} className="flex items-center gap-1.5">
          <label className="text-slate-400">تحويل إلى</label>
          <select
            name="toUserId"
            defaultValue=""
            onChange={() => transferFormRef.current?.requestSubmit()}
            className="input-field !py-1 text-xs"
          >
            <option value="" disabled>اختر عضواً آخر</option>
            {teamMembers.filter((u) => u.id !== assignedAgentId).map((u) => (
              <option key={u.id} value={u.id}>{u.name}</option>
            ))}
          </select>
        </form>
      )}
    </div>
  );
}
