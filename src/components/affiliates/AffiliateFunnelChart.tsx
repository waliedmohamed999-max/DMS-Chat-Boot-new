/** رسم بياني اتجاه أسبوعي (نقرات مقابل تحويلات) — نفس نمط BarChart.tsx بالحرف (SVG بلا مكتبة خارجية)،
 * لكن بعمودين متجاورين لكل أسبوع بدل عمود واحد. مكوّن خادم بحت (بلا "use client")، التجميع الأسبوعي
 * يحدث في الصفحة المستدعية (affiliates/dashboard/page.tsx) وليس هنا. */
export function AffiliateFunnelChart({ data }: { data: { weekLabel: string; clicks: number; referrals: number }[] }) {
  const max = Math.max(1, ...data.map((d) => Math.max(d.clicks, d.referrals)));
  const width = 640;
  const height = 180;
  const groupGap = 12;
  const barGap = 3;
  const groupWidth = data.length > 0 ? (width - groupGap * (data.length - 1)) / data.length : 0;
  const barWidth = Math.max(0, (groupWidth - barGap) / 2);

  if (data.length === 0) {
    return <p className="text-sm text-slate-500">لا توجد بيانات كافية لعرض الرسم البياني.</p>;
  }

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-4 text-xs text-slate-400">
        <span className="flex items-center gap-1.5">
          <span className="inline-block h-2.5 w-2.5 rounded-sm bg-slate-500" /> نقرات
        </span>
        <span className="flex items-center gap-1.5">
          <span className="inline-block h-2.5 w-2.5 rounded-sm bg-wa-500" /> تحويلات
        </span>
      </div>
      <div className="overflow-x-auto">
        <svg width={width} height={height + 24} viewBox={`0 0 ${width} ${height + 24}`} className="min-w-[560px]">
          {data.map((d, i) => {
            const groupX = i * (groupWidth + groupGap);
            const clicksHeight = (d.clicks / max) * height;
            const referralsHeight = (d.referrals / max) * height;
            return (
              <g key={`${d.weekLabel}-${i}`}>
                <rect x={groupX} y={height - clicksHeight} width={barWidth} height={clicksHeight} rx={2} fill="#64748B" />
                <rect x={groupX + barWidth + barGap} y={height - referralsHeight} width={barWidth} height={referralsHeight} rx={2} fill="#25D366" />
                <text x={groupX + groupWidth / 2} y={height + 16} textAnchor="middle" fontSize="9" fill="#94A3B8">
                  {d.weekLabel}
                </text>
              </g>
            );
          })}
        </svg>
      </div>
    </div>
  );
}
