export type FunnelWeekData = { weekLabel: string; clicks: number; referrals: number };
export type ChannelBreakdownRow = { channel: string; clicks: number; referrals: number; conversionRate: number };

const WEEK_MS = 7 * 24 * 3600 * 1000;
const FUNNEL_WEEKS = 8;

/** يبني بيانات آخر 8 أسابيع (الأقدم يساراً) من نقرات/تحويلات خام — مصدر حقيقة واحد يُستخدَم من لوحة
 * المسوّق (لبياناته هو فقط) ولوحة مالك المنصة (عبر كل المسوّقين معاً، أو مسوّق واحد في صفحة تفاصيله). */
export function buildWeeklyFunnelData(
  clicks: { createdAt: Date }[],
  referrals: { convertedAt: Date }[]
): FunnelWeekData[] {
  const now = Date.now();
  const weeksAgo = (d: Date) => Math.floor((now - d.getTime()) / WEEK_MS);
  const buckets = Array.from({ length: FUNNEL_WEEKS }, () => ({ clicks: 0, referrals: 0 }));
  for (const c of clicks) {
    const idx = weeksAgo(c.createdAt);
    if (idx >= 0 && idx < FUNNEL_WEEKS) buckets[idx]!.clicks++;
  }
  for (const r of referrals) {
    const idx = weeksAgo(r.convertedAt);
    if (idx >= 0 && idx < FUNNEL_WEEKS) buckets[idx]!.referrals++;
  }
  return buckets.map((b, i) => ({ weekLabel: i === 0 ? "الحالي" : `-${i}أ`, clicks: b.clicks, referrals: b.referrals })).reverse();
}

/** الأداء حسب القناة (نقرات/تحويلات/معدّل تحويل لكل قناة) — نفس مصدر الحقيقة الوحيد المُستخدَم من
 * لوحتي المسوّق ومالك المنصة معاً. */
export function buildChannelBreakdown(
  clicks: { source: string | null }[],
  referrals: { source: string | null }[]
): ChannelBreakdownRow[] {
  const channelKeys = new Set<string>(["عام"]);
  for (const c of clicks) channelKeys.add(c.source ?? "عام");
  for (const r of referrals) channelKeys.add(r.source ?? "عام");

  return Array.from(channelKeys).map((channel) => {
    const channelClicks = clicks.filter((c) => (c.source ?? "عام") === channel).length;
    const channelReferrals = referrals.filter((r) => (r.source ?? "عام") === channel).length;
    return {
      channel,
      clicks: channelClicks,
      referrals: channelReferrals,
      conversionRate: channelClicks > 0 ? (channelReferrals / channelClicks) * 100 : 0,
    };
  });
}
