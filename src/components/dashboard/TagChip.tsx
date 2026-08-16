/**
 * وسم واحد قابل للعرض. unicodeBidi: "isolate" (وليس dir="ltr") لأن اسم الوسم غالباً عربي بالكامل —
 * dir="ltr" كان سيعكس اتجاه النص العربي نفسه. isolate يعزل اتجاه المحتوى عن السياق المحيط بدل فرض
 * اتجاه معيّن، فيمنع تشوّه بصري (bidi) لو تضمّن اسم الوسم أرقاماً/نصاً لاتينياً بلا كسر النص العربي.
 * كان غياب هذا العزل جزءاً من سبب ظهور طابع زمني خام مشوَّهاً بصرياً في وسوم دفعات الاستيراد القديمة.
 */
export function TagChip({ name, color, onRemove }: { name: string; color: string; onRemove?: () => void }) {
  return (
    <span className="badge inline-flex items-center gap-1 bg-white/5" style={{ color }}>
      <span style={{ unicodeBidi: "isolate" }}>{name}</span>
      {onRemove && (
        <button type="button" onClick={onRemove} className="text-slate-500 hover:text-danger-500" aria-label={`إزالة وسم ${name}`}>
          ×
        </button>
      )}
    </span>
  );
}
