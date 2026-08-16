export function UsageBar({ label, used, max }: { label: string; used: number; max: number }) {
  const unlimited = max < 0;
  const percent = unlimited ? 0 : Math.min(100, Math.round((used / Math.max(1, max)) * 100));
  const barColor = percent >= 100 ? "bg-danger-500" : percent >= 80 ? "bg-warning-500" : "bg-accent-500";

  return (
    <div>
      <div className="mb-1 flex justify-between text-xs text-slate-400">
        <span>{label}</span>
        <span dir="ltr">{unlimited ? `${used} / غير محدود` : `${used} / ${max}`}</span>
      </div>
      <div className="h-2 overflow-hidden rounded-full bg-navy-700">
        {!unlimited && <div className={`h-full rounded-full ${barColor}`} style={{ width: `${percent}%` }} />}
      </div>
    </div>
  );
}
