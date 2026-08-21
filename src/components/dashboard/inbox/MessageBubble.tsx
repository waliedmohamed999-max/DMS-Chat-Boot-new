const STATUS_TICKS: Record<string, { icon: string; className: string; label: string }> = {
  PENDING: { icon: "🕐", className: "opacity-60", label: "جارٍ الإرسال" },
  SENT: { icon: "✓", className: "text-slate-300", label: "أُرسلت" },
  DELIVERED: { icon: "✓✓", className: "text-slate-300", label: "تم التسليم" },
  READ: { icon: "✓✓", className: "text-sky-400", label: "تمت القراءة" },
  FAILED: { icon: "⚠️", className: "text-danger-500", label: "فشلت" },
};

export type MessageBubbleData = {
  id: string;
  direction: "INBOUND" | "OUTBOUND";
  senderType: "CONTACT" | "AGENT" | "BOT" | "SYSTEM";
  type: "TEXT" | "IMAGE" | "DOCUMENT" | "AUDIO" | "LOCATION" | "INTERACTIVE_REPLY" | "TEMPLATE";
  body: string;
  mediaUrl: string | null;
  latitude: number | null;
  longitude: number | null;
  status: string | null;
  failureReason: string | null;
  createdAt: string;
  quotedMessage: { id: string; body: string } | null;
};

// يمنع عرض روابط وسائط واردة من webhook كـ <img src> إلا إن كانت مصدراً موثوقاً معروفاً (data: من
// محاكي sandbox الداخلي، أو نطاقات Meta CDN الفعلية) — حماية من حقن رابط تعقّب/طلب خارجي عبر حقل
// وسائط وارد لم يُتحقق منه (خصوصاً لأن التحقق من توقيع webhook لا يمنع تزوير قيم داخل حمولة موقّعة
// فعلياً بمصدر آخر مستقبلاً). راجع نتائج المراجعة الأمنية الشاملة قبل الإطلاق.
const TRUSTED_MEDIA_HOST_SUFFIXES = ["fbcdn.net", "fbsbx.com", "facebook.com"];
function isSafeMediaUrl(url: string): boolean {
  if (url.startsWith("data:image/")) return true;
  try {
    const parsed = new URL(url);
    return (
      parsed.protocol === "https:" &&
      TRUSTED_MEDIA_HOST_SUFFIXES.some((suffix) => parsed.hostname === suffix || parsed.hostname.endsWith(`.${suffix}`))
    );
  } catch {
    return false;
  }
}

function MediaContent({ m }: { m: MessageBubbleData }) {
  if (m.type === "IMAGE") {
    const safeUrl = m.mediaUrl && isSafeMediaUrl(m.mediaUrl) ? m.mediaUrl : null;
    return (
      <div className="mb-1.5 overflow-hidden rounded-lg border border-white/10">
        {safeUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={safeUrl} alt={m.body || "صورة"} className="max-h-56 w-full object-cover" />
        ) : (
          <div className="flex h-32 items-center justify-center bg-black/20 text-3xl">🖼️</div>
        )}
      </div>
    );
  }
  if (m.type === "DOCUMENT") {
    return (
      <div className="mb-1.5 flex items-center gap-2 rounded-lg bg-black/15 p-2">
        <span className="text-xl">📄</span>
        <span className="truncate text-xs">{m.body || "مستند"}</span>
      </div>
    );
  }
  if (m.type === "AUDIO") {
    return (
      <div className="mb-1.5 rounded-lg bg-black/15 p-2">
        <div className="flex items-center gap-2 text-xs opacity-80">
          <span className="text-xl">🎙️</span>
          <span>رسالة صوتية</span>
        </div>
        {m.body && m.body !== "[رسالة صوتية]" && <p className="mt-1 text-xs italic opacity-90">&quot;{m.body}&quot;</p>}
      </div>
    );
  }
  if (m.type === "LOCATION") {
    return (
      <div className="mb-1.5 rounded-lg bg-black/15 p-2">
        <div className="mb-1 flex items-center gap-1.5 text-xs">
          <span>📍</span>
          <span>{m.body || "موقع مُشارَك"}</span>
        </div>
        {m.latitude != null && m.longitude != null && (
          <p className="text-[10px] opacity-60" dir="ltr">
            {m.latitude.toFixed(4)}, {m.longitude.toFixed(4)}
          </p>
        )}
      </div>
    );
  }
  return null;
}

export function MessageBubble({ message }: { message: MessageBubbleData }) {
  const isOutbound = message.direction === "OUTBOUND";
  const tick = message.status ? STATUS_TICKS[message.status] : null;

  return (
    <div className={`flex ${isOutbound ? "justify-start" : "justify-end"}`}>
      <div
        className={`max-w-md rounded-xl2 px-3 py-2 text-sm ${
          isOutbound ? "bg-accent-500 text-white" : "bg-navy-700 text-slate-100"
        }`}
      >
        {message.senderType === "BOT" && (
          <p className="mb-1 text-[10px] font-medium uppercase tracking-wide text-white/70">🤖 رد آلي من البوت</p>
        )}
        {message.quotedMessage && (
          <div className="mb-1.5 rounded border-r-2 border-white/40 bg-black/10 px-2 py-1 text-xs opacity-80">
            {message.quotedMessage.body.slice(0, 80)}
          </div>
        )}
        <MediaContent m={message} />
        {message.type !== "LOCATION" && message.type !== "AUDIO" && message.body && <p>{message.body}</p>}
        <div className="mt-1 flex items-center justify-end gap-1.5">
          {message.failureReason && <span className="text-[10px] text-danger-100">{message.failureReason}</span>}
          <p className="text-[10px] opacity-60">
            {new Date(message.createdAt).toLocaleTimeString("ar-SA", { hour: "2-digit", minute: "2-digit" })}
          </p>
          {isOutbound && tick && (
            <span className={`text-[11px] ${tick.className}`} title={tick.label}>
              {tick.icon}
            </span>
          )}
        </div>
      </div>
    </div>
  );
}
