import type { Prisma, ContactStage, OrderStatus } from "@prisma/client";

/**
 * شكل فلتر الشريحة الفعلي — يُبنى من معالج إنشاء الحملة (خطوة "الجمهور") ويُخزَّن كما هو في
 * Segment.filterJson. كل حقل اختياري ويُطبَّق كشرط AND إضافي (وليس OR) على جهات الاتصال.
 */
export type SegmentFilter = {
  stage?: ContactStage | "ALL";
  tagIds?: string[];
  /** نشاط المحادثة: "active_within" = تفاعل خلال آخر N يوم، "inactive_since" = بلا تفاعل منذ N يوم */
  activity?: { mode: "active_within" | "inactive_since"; days: number } | null;
  /** حالة طلب من زد/سلة خلال نافذة زمنية (مثال: سلات متروكة خلال 7 أيام، أو مشتريات خلال 30 يوم) */
  order?: { status: OrderStatus; withinDays: number } | null;
  optInOnly?: boolean;
};

export const EMPTY_SEGMENT_FILTER: SegmentFilter = {};

/** يبني شرط Prisma Where لجهات الاتصال بناءً على فلتر شريحة. */
export function buildContactWhere(tenantId: string, filter: SegmentFilter): Prisma.ContactWhereInput {
  const where: Prisma.ContactWhereInput = { tenantId };

  if (filter.stage && filter.stage !== "ALL") {
    where.stage = filter.stage;
  }
  if (filter.tagIds?.length) {
    where.tags = { some: { tagId: { in: filter.tagIds } } };
  }
  if (filter.optInOnly) {
    where.marketingOptIn = true;
  }
  if (filter.activity) {
    const cutoff = new Date(Date.now() - filter.activity.days * 86400000);
    where.conversations =
      filter.activity.mode === "active_within"
        ? { some: { lastMessageAt: { gte: cutoff } } }
        : { none: { lastMessageAt: { gte: cutoff } } };
  }
  if (filter.order) {
    const cutoff = new Date(Date.now() - filter.order.withinDays * 86400000);
    where.orders = { some: { status: filter.order.status, createdAt: { gte: cutoff } } };
  }

  return where;
}

/**
 * يبني شرط جهات الاتصال الفعلي لحملة معيّنة (ALL أو شريحة)، مع فرض شرط الامتثال الإلزامي
 * (marketingOptIn = true) دائماً بصرف النظر عن اختيار التاجر — طبقة حماية إضافية لسياسة واتساب
 * وليست مجرد فلتر اختياري (دفاع متعدد الطبقات، بنفس منطق فرض حدود الباقة من الخادم في وحدة الشات بوت).
 */
export function resolveAudienceWhere(
  tenantId: string,
  audienceType: "ALL" | "SEGMENT",
  filter: SegmentFilter | null
): Prisma.ContactWhereInput {
  const base = audienceType === "SEGMENT" && filter ? buildContactWhere(tenantId, filter) : { tenantId };
  return { ...base, marketingOptIn: true };
}
