/** رسم بياني عمودي SVG بسيط (بلا مكتبة خارجية — نفس قرار DonutChart) لعرض اتجاه شهري (مثال: MRR). */
export function BarChart({ data }: { data: { label: string; amountSar: number }[] }) {
  const max = Math.max(1, ...data.map((d) => d.amountSar));
  const width = 640;
  const height = 180;
  const barGap = 8;
  const barWidth = data.length > 0 ? (width - barGap * (data.length - 1)) / data.length : 0;

  return (
    <div className="overflow-x-auto">
      <svg width={width} height={height + 24} viewBox={`0 0 ${width} ${height + 24}`} className="min-w-[560px]">
        {data.map((d, i) => {
          const barHeight = (d.amountSar / max) * height;
          const x = i * (barWidth + barGap);
          const y = height - barHeight;
          return (
            <g key={`${d.label}-${i}`}>
              <rect x={x} y={y} width={barWidth} height={barHeight} rx={3} fill="#6D5EF8" />
              <text x={x + barWidth / 2} y={height + 16} textAnchor="middle" fontSize="9" fill="#94A3B8">
                {d.label.slice(0, 3)}
              </text>
            </g>
          );
        })}
      </svg>
    </div>
  );
}
