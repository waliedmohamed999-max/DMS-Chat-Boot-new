"use client";

import type { FlowGraph } from "@/lib/chatbot/types";
import { buildHappyPathBubbles, type SimulationBubble } from "@/lib/chatbot/simulate";

/**
 * معاينة حية على شكل جهاز موبايل حقيقي. افتراضياً تعرض المسار الأساسي (happy path) الثابت — فقط
 * لإعطاء فكرة عامة سريعة (يُستخدَم هذا الوضع في بطاقات صفحة القائمة، حيث لا معنى لكتابة رسالة تجريبية).
 * عند تمرير `liveLog` (نتيجة اختبار حقيقي متعدد الأدوار عبر advanceSimulation) و`input` (لتفعيل شريط الكتابة
 * الفعلي أسفل الموبايل)، تعرض المحادثة الحقيقية المطابقة لما كتبه المستخدم فعلاً — بدل مسار ثابت
 * واحد لا يتغيّر بغض النظر عن الاختيار (كان يبدو "عشوائياً" للتاجر: يعرض دائماً أول فرع فقط).
 */
export function WhatsAppPreview({
  graph,
  storeName,
  liveLog,
  input,
  connectedPhoneNumber,
}: {
  graph: FlowGraph;
  storeName: string;
  liveLog?: SimulationBubble[];
  input?: { value: string; onChange: (value: string) => void; onSend: () => void };
  /** الرقم الحقيقي المتصل فعلياً لهذا التاجر (Meta أو QR) — `null`/`undefined` = لا رقم متصل بعد. */
  connectedPhoneNumber?: string | null;
}) {
  const bubbles = liveLog && liveLog.length > 0 ? liveLog : buildHappyPathBubbles(graph);
  const now = new Date();
  const time = now.toLocaleTimeString("ar-EG", { hour: "2-digit", minute: "2-digit", hour12: false });

  return (
    <div className="mx-auto w-full max-w-[280px]">
      {/* إطار الموبايل */}
      <div className="relative rounded-[2.5rem] border-[6px] border-slate-800 bg-slate-800 shadow-2xl">
        {/* الشق العلوي (notch) */}
        <div className="absolute left-1/2 top-0 z-20 h-5 w-28 -translate-x-1/2 rounded-b-2xl bg-slate-800" />

        <div className="overflow-hidden rounded-[2rem] bg-[#0b141a]">
          {/* شريط الحالة */}
          <div className="flex items-center justify-between bg-[#0b141a] px-5 pb-1 pt-2 text-[10px] font-medium text-white/90" dir="ltr">
            <span>{time}</span>
            <div className="flex items-center gap-1">
              <span>📶</span>
              <span>🔋</span>
            </div>
          </div>

          {/* رأس واتساب */}
          <div className="flex items-center gap-2 bg-[#005c4b] px-3 py-2.5">
            <span className="text-base text-white/90">‹</span>
            <div className="flex h-8 w-8 items-center justify-center rounded-full bg-white/20 text-sm">🏪</div>
            <div className="flex-1">
              <p className="text-sm font-semibold text-white">{storeName}</p>
              <p className="text-[10px] text-white/70" dir={connectedPhoneNumber ? "ltr" : undefined}>
                {connectedPhoneNumber || "واتساب أعمال — لم يُربَط رقم حقيقي بعد"}
              </p>
            </div>
            <div className="flex items-center gap-2.5 text-sm text-white/85">
              <span>📹</span>
              <span>📞</span>
            </div>
          </div>

          {/* منطقة المحادثة */}
          <div className="flex h-[420px] flex-col gap-2 overflow-y-auto bg-[#0b141a] bg-[radial-gradient(circle_at_1px_1px,rgba(255,255,255,0.03)_1px,transparent_0)] bg-[size:16px_16px] p-3">
            {bubbles.length === 0 && (
              <p className="m-auto text-center text-xs text-white/40">أضف خطوات للتدفق لمعاينة المحادثة هنا</p>
            )}
            {bubbles.map((b, i) =>
              b.diagnostic ? (
                // ملاحظة تشخيصية داخلية (تقييم شرط، تحويل صامت...) — ليست رسالة عميل حقيقية، فتُعرَض
                // كملاحظة نظام مركزية صغيرة (بنفس أسلوب رسائل واتساب النظامية: "تم تفويت مكالمة"...)
                // بدل فقاعة محادثة عادية، حتى لا تبدو للتاجر كأنها ستصل فعلياً للعميل.
                <div key={i} className="flex justify-center">
                  <span className="rounded-full bg-white/5 px-2.5 py-1 text-center text-[10px] text-white/50">{b.text}</span>
                </div>
              ) : (
                <div key={i} className={`flex ${b.from === "bot" ? "justify-start" : "justify-end"}`}>
                  <div className="max-w-[85%]">
                    <div
                      className={`overflow-hidden rounded-lg shadow ${
                        b.from === "bot" ? "bg-[#202c33] text-slate-100" : "bg-[#005c4b] text-white"
                      } ${b.link ? "rounded-b-none" : ""}`}
                    >
                      {b.media?.type === "image" && (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={b.media.url} alt="" className="max-h-40 w-full object-cover" onError={(e) => (e.currentTarget.style.display = "none")} />
                      )}
                      {b.media?.type === "video" && <video src={b.media.url} controls muted className="max-h-40 w-full" />}
                      {b.media?.type === "document" && (
                        <div className="flex items-center gap-2 border-b border-white/10 bg-black/10 px-2.5 py-2">
                          <span className="text-lg">📎</span>
                          <span className="truncate text-[11px]">{b.media.filename || "ملف مرفق"}</span>
                        </div>
                      )}
                      {b.text && <div className="px-2.5 py-1.5 text-[11px] leading-relaxed">{b.text}</div>}
                    </div>
                    {b.link && (
                      <div className="flex items-center justify-center gap-1 rounded-b-lg border-t border-white/10 bg-[#202c33] px-2.5 py-1.5 text-[11px] font-medium text-[#53bdeb]">
                        <span>🔗</span>
                        <span>{b.link.text}</span>
                      </div>
                    )}
                  </div>
                </div>
              )
            )}
          </div>

          {/* شريط الإدخال السفلي — فعلي (يشغّل اختباراً حقيقياً) عند تمرير input، وإلا زخرفي فقط */}
          <div className="flex items-center gap-2 bg-[#0b141a] px-2.5 py-2">
            <div className="flex flex-1 items-center gap-2 rounded-full bg-[#202c33] px-3 py-1.5 text-[11px]">
              <span>😊</span>
              {input ? (
                <input
                  value={input.value}
                  onChange={(e) => input.onChange(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && input.onSend()}
                  placeholder="اكتب رسالة"
                  className="w-full bg-transparent text-white placeholder:text-white/40 focus:outline-none"
                />
              ) : (
                <span className="text-white/40">اكتب رسالة</span>
              )}
            </div>
            <button
              onClick={input?.onSend}
              disabled={!input}
              className="flex h-7 w-7 items-center justify-center rounded-full bg-[#00a884] text-xs text-white disabled:opacity-70"
            >
              {input ? "➤" : "🎤"}
            </button>
          </div>

          {/* مؤشر الهوم */}
          <div className="flex justify-center bg-[#0b141a] pb-1.5 pt-1">
            <div className="h-1 w-24 rounded-full bg-white/30" />
          </div>
        </div>
      </div>
    </div>
  );
}
