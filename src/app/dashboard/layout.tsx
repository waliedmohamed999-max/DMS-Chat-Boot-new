import { requireTenantSession } from "@/lib/session";
import { rawDb, withTenant } from "@/lib/db";
import { ROLE_LABELS_AR, hasPermission, type Permission } from "@/lib/rbac";
import { Sidebar, type NavItem } from "@/components/layout/Sidebar";
import { Topbar } from "@/components/layout/Topbar";
import { BottomTabBar } from "@/components/layout/BottomTabBar";
import { ImpersonationBanner } from "@/components/layout/ImpersonationBanner";
import { PendingReviewScreen } from "@/components/dashboard/PendingReviewScreen";
import { AnnouncementBanner } from "@/components/dashboard/AnnouncementBanner";
import { getPlatformSettings } from "@/lib/platformSettings";
import { TENANT_STATUS_LABELS_AR } from "@/lib/tenantStatus";

const NAV_ITEMS: (NavItem & { requires?: Permission })[] = [
  { href: "/dashboard", label: "نظرة عامة", icon: "📊" },
  { href: "/dashboard/chatbot", label: "الأتمتة", icon: "🔔" },
  { href: "/dashboard/ai-agent", label: "الموظف الذكي", icon: "🤖", requires: "chatbot.edit" },
  { href: "/dashboard/inbox", label: "صندوق المحادثات", icon: "💬" },
  { href: "/dashboard/contacts", label: "جهات الاتصال", icon: "👥" },
  { href: "/dashboard/campaigns", label: "الحملات", icon: "📣" },
  { href: "/dashboard/templates", label: "قوالب الرسائل", icon: "📝" },
  { href: "/dashboard/integrations", label: "التكاملات", icon: "🔌" },
  { href: "/dashboard/billing", label: "الفوترة والاشتراك", icon: "💳", requires: "billing.manage" },
  { href: "/dashboard/settings", label: "الفريق والإعدادات", icon: "⚙️", requires: "team.manage" },
];

/**
 * PlatformAnnouncement جدول عام (لا tenantId، غير خاضع لـ RLS) — القراءة عبر rawDb آمنة.
 * AnnouncementDismissal مستأجَر (RLS) فيُقرأ عبر withTenant. الفلترة حسب الجمهور تتم في الذاكرة
 * لأن عدد الإعلانات صغير عملياً ولا يستدعي استعلام JSON معقّد على audienceTenantIdsJson.
 */
async function getApplicableAnnouncement(tenantId: string) {
  const [announcements, dismissals, subscription] = await Promise.all([
    rawDb.platformAnnouncement.findMany({ orderBy: { createdAt: "desc" }, take: 20 }),
    withTenant(tenantId, (tx) => tx.announcementDismissal.findMany({ where: { tenantId } })),
    withTenant(tenantId, (tx) => tx.subscription.findUnique({ where: { tenantId } })),
  ]);
  const dismissedIds = new Set(dismissals.map((d) => d.announcementId));

  return announcements.find((a) => {
    if (dismissedIds.has(a.id)) return false;
    if (a.audienceType === "ALL") return true;
    if (a.audienceType === "SPECIFIC_PLAN") return a.audiencePlanId === subscription?.planId;
    if (a.audienceType === "SPECIFIC_TENANTS") {
      const ids = (a.audienceTenantIdsJson as string[] | null) ?? [];
      return ids.includes(tenantId);
    }
    return false;
  });
}

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const session = await requireTenantSession();
  const [tenant, settings] = await Promise.all([
    rawDb.tenant.findUniqueOrThrow({ where: { id: session.user.tenantId } }),
    getPlatformSettings(),
  ]);

  // وضع الصيانة العام يمنع كل التجار فوراً — باستثناء جلسة انتحال (فريق المنصة يحتاج الدخول
  // فعلياً للتحقق من المشكلة أثناء الصيانة نفسها).
  if (settings.maintenanceMode && !session.user.impersonation.active) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-navy-900 px-4">
        <div className="card w-full max-w-md p-8 text-center">
          <div className="mb-4 text-5xl">🛠️</div>
          <h1 className="mb-2 text-lg font-bold text-white">المنصة تحت الصيانة حالياً</h1>
          <p className="text-sm text-slate-400">
            {settings.maintenanceMessage || "نجري صيانة مجدولة الآن، سنعود قريباً."}
          </p>
        </div>
      </div>
    );
  }

  // تسجيل الدخول مسموح به لحالة "بانتظار المراجعة" فقط لعرض شاشة الانتظار — لا وصول فعلي
  // لأي وحدة من المنصة قبل موافقة مالك المنصة عبر مركز الموافقات.
  if (tenant.status === "PENDING_REVIEW" || tenant.status === "REJECTED") {
    const latestRequest = await withTenant(tenant.id, (tx) =>
      tx.approvalRequest.findFirst({ where: { tenantId: tenant.id, type: "NEW_TENANT" }, orderBy: { createdAt: "desc" } })
    );
    return (
      <PendingReviewScreen
        status={tenant.status}
        reviewerNote={latestRequest?.status === "NEEDS_INFO" ? latestRequest.reviewerNote : null}
        rejectionReason={tenant.rejectionReason}
        supportEmail={settings.supportEmail}
      />
    );
  }

  const waIntegration = await withTenant(session.user.tenantId, (tx) =>
    tx.integration.findUnique({
      where: { tenantId_provider: { tenantId: session.user.tenantId, provider: "META_WHATSAPP" } },
    })
  );
  // الشارة تختفي فقط عندما يكون رقم واتساب حقيقي متصلاً فعلياً (وليس sandbox)
  const isSandbox = !(waIntegration?.status === "CONNECTED" && !waIntegration.isSandbox);

  const activeAnnouncement = await getApplicableAnnouncement(tenant.id);
  const allowedNavItems = NAV_ITEMS.filter((item) => !item.requires || hasPermission(session.user.role, item.requires));

  return (
    <div className="flex h-screen flex-col overflow-hidden bg-navy-900">
      {session.user.impersonation.active && (
        <ImpersonationBanner tenantName={session.user.impersonation.tenantName} superAdminName={session.user.impersonation.superAdminName} />
      )}
      <div className="flex flex-1 overflow-hidden">
        <Sidebar
          items={allowedNavItems}
          brandName={tenant.name}
          brandColor={tenant.primaryColor}
          brandInitial={tenant.name.slice(0, 1)}
          logoUrl={tenant.logoUrl}
          footer={
            <div className="mt-4 rounded-lg border border-white/5 bg-navy-800 p-3 text-xs text-slate-400">
              <p className="font-medium text-slate-300">مساحة عمل: {tenant.slug}</p>
              <p className="mt-0.5">
                الحالة: {tenant.status === "ACTIVE" ? "🟢 " : ""}
                {TENANT_STATUS_LABELS_AR[tenant.status] ?? tenant.status}
              </p>
            </div>
          }
        />
        <div className="flex flex-1 flex-col overflow-hidden">
          <Topbar userName={session.user.name ?? "مستخدم"} roleLabel={ROLE_LABELS_AR[session.user.role]} sandboxMode={isSandbox} />
          {/* pb-24 على الموبايل فقط — يمنع BottomTabBar الثابت أسفل الشاشة من تغطية آخر المحتوى */}
          <main className="flex-1 overflow-y-auto p-6 pb-24 lg:pb-6">
            {activeAnnouncement && (
              <div className="mb-4">
                <AnnouncementBanner id={activeAnnouncement.id} title={activeAnnouncement.title} body={activeAnnouncement.body} />
              </div>
            )}
            {children}
          </main>
        </div>
      </div>
      <BottomTabBar items={allowedNavItems} />
    </div>
  );
}
