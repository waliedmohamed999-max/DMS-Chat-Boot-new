const COLORS = ["#6D5EF8", "#22C55E", "#F59E0B", "#EF4444", "#06B6D4", "#EC4899", "#8B5CF6", "#10B981"];

/**
 * دونات SVG بسيط بلا أي مكتبة رسم بياني (لا توجد مكتبة كهذه في المشروع أصلاً — قرار موثَّق في
 * DECISIONS.md تفضيل SVG خفيف بدل إضافة تبعية جديدة لرسم بياني واحد أو اثنين). مكوّن خادم بحت
 * (بلا "use client")، القيم تُحسَب أثناء render مباشرة بدون أي حالة تفاعلية.
 */
export function DonutChart({ data }: { data: { label: string; value: number }[] }) {
  const total = data.reduce((s, d) => s + d.value, 0);
  const size = 160;
  const radius = 60;
  const strokeWidth = 24;
  const center = size / 2;
  const circumference = 2 * Math.PI * radius;

  let offsetAcc = 0;

  if (total === 0) {
    return <p className="text-sm text-slate-500">لا توجد بيانات كافية لعرض الرسم البياني.</p>;
  }

  return (
    <div className="flex flex-wrap items-center gap-6">
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
        <g transform={`rotate(-90 ${center} ${center})`}>
          {data.map((d, i) => {
            const fraction = d.value / total;
            const dash = fraction * circumference;
            const dashArray = `${dash} ${circumference - dash}`;
            const el = (
              <circle
                key={d.label}
                cx={center}
                cy={center}
                r={radius}
                fill="none"
                stroke={COLORS[i % COLORS.length]}
                strokeWidth={strokeWidth}
                strokeDasharray={dashArray}
                strokeDashoffset={-offsetAcc}
              />
            );
            offsetAcc += dash;
            return el;
          })}
        </g>
      </svg>
      <ul className="space-y-1 text-xs">
        {data.map((d, i) => (
          <li key={d.label} className="flex items-center gap-2">
            <span className="inline-block h-2.5 w-2.5 rounded-full" style={{ backgroundColor: COLORS[i % COLORS.length] }} />
            <span className="text-slate-300">{d.label}</span>
            <span className="text-slate-500" dir="ltr">
              {d.value} ({total > 0 ? Math.round((d.value / total) * 100) : 0}%)
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}
