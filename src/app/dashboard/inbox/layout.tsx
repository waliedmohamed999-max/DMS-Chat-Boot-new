import { requireTenantSession } from "@/lib/session";
import { withTenant } from "@/lib/db";
import { ConversationList } from "@/components/dashboard/ConversationList";
import { InboxLivePoller } from "@/components/dashboard/inbox/InboxLivePoller";

export default async function InboxLayout({ children }: { children: React.ReactNode }) {
  const session = await requireTenantSession();
  const tenantId = session.user.tenantId;

  const teamMembers = await withTenant(tenantId, (tx) =>
    tx.user.findMany({ where: { tenantId, isActive: true }, select: { id: true, name: true }, orderBy: { name: "asc" } })
  );

  return (
    <div className="flex h-full gap-4">
      <InboxLivePoller />
      <ConversationList teamMembers={teamMembers} />
      <div className="flex-1 overflow-hidden">{children}</div>
    </div>
  );
}
