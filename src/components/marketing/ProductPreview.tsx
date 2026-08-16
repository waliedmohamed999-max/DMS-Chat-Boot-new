import { WhatsAppMessageIcon } from "@/components/marketing/ServiceIcons";

/**
 * معاينة بصرية ثابتة لواجهة صندوق المحادثات الحقيقية في المنصة (نفس بنية /dashboard/inbox: قائمة
 * محادثات + نافذة محادثة + لوحة تفاصيل جانبية) — بيانات تجريبية بحتة (أسماء/رسائل وهمية)، وليست
 * التقاط شاشة فعلي حتى لا يُعرض أي بيانات عميل حقيقية على صفحة عامة. عنصر بصري بحت (aria-hidden).
 */
export function ProductPreview() {
  return (
    <div className="relative mx-auto w-full max-w-xl" aria-hidden="true">
      <div className="pointer-events-none absolute -inset-6 -z-10 rounded-[2rem] bg-wa-500/10 blur-3xl dark:bg-wa-500/5" />
      <div
        dir="rtl"
        className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-xl dark:border-white/10 dark:bg-slate-900"
      >
        {/* شريط المتصفح */}
        <div dir="ltr" className="flex items-center gap-3 border-b border-slate-100 bg-slate-50 px-4 py-2.5 dark:border-white/5 dark:bg-white/[0.03]">
          <div className="flex gap-1.5">
            <span className="h-2.5 w-2.5 rounded-full bg-danger-500/60" />
            <span className="h-2.5 w-2.5 rounded-full bg-warning-500/60" />
            <span className="h-2.5 w-2.5 rounded-full bg-success-500/60" />
          </div>
          <div className="mx-auto flex items-center gap-1.5 rounded-md bg-white px-3 py-1 text-[11px] text-slate-400 shadow-sm dark:bg-slate-800">
            app.dms.sa / dashboard / inbox
          </div>
        </div>

        <div className="flex h-[340px] text-right">
          {/* قائمة المحادثات */}
          <div className="hidden w-2/5 flex-col border-l border-slate-100 bg-slate-50/70 sm:flex dark:border-white/5 dark:bg-white/[0.02]">
            <div className="border-b border-slate-100 px-3 py-2.5 text-xs font-semibold text-slate-500 dark:border-white/5 dark:text-slate-400">
              المحادثات
            </div>
            {[
              { name: "سارة العتيبي", msg: "متى وصول الطلب؟", time: "الآن", active: true },
              { name: "أحمد الدوسري", msg: "شكراً لكم 🙏", time: "2د" },
              { name: "نورة القحطاني", msg: "هل يوجد خصم؟", time: "5د" },
              { name: "خالد الشمري", msg: "تم تأكيد الطلب", time: "12د" },
            ].map((c) => (
              <div
                key={c.name}
                className={`flex items-center gap-2.5 border-b border-slate-100 px-3 py-2.5 dark:border-white/5 ${c.active ? "bg-wa-50 dark:bg-wa-500/10" : ""}`}
              >
                <div className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full bg-wa-500/15 text-[11px] font-bold text-wa-600 dark:text-wa-400">
                  {c.name.slice(0, 1)}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-xs font-semibold text-slate-800 dark:text-slate-100">{c.name}</p>
                  <p className="truncate text-[11px] text-slate-400">{c.msg}</p>
                </div>
                <span className="flex-shrink-0 text-[10px] text-slate-400">{c.time}</span>
              </div>
            ))}
          </div>

          {/* نافذة المحادثة */}
          <div className="flex flex-1 flex-col bg-white dark:bg-slate-900">
            <div className="flex items-center gap-2 border-b border-slate-100 px-4 py-2.5 dark:border-white/5">
              <div className="flex h-7 w-7 items-center justify-center rounded-full bg-wa-500/15 text-[10px] font-bold text-wa-600 dark:text-wa-400">س</div>
              <p className="text-xs font-semibold text-slate-800 dark:text-slate-100">سارة العتيبي</p>
              <span className="mr-auto flex items-center gap-1 text-[10px] text-success-500">
                <span className="h-1.5 w-1.5 rounded-full bg-success-500" /> متصلة عبر واتساب
              </span>
            </div>
            <div className="flex flex-1 flex-col gap-2 overflow-hidden px-3 py-3">
              <div className="max-w-[75%] self-start rounded-xl rounded-br-sm bg-slate-100 px-3 py-2 text-[11px] text-slate-700 dark:bg-white/5 dark:text-slate-200">
                متى وصول الطلب رقم 4521؟
              </div>
              <div className="max-w-[75%] self-end rounded-xl rounded-bl-sm bg-wa-500 px-3 py-2 text-[11px] text-white">
                أهلاً سارة 👋 طلبك في الطريق، الوصول المتوقع خلال يومين.
              </div>
              <div className="flex max-w-[75%] items-center gap-1.5 self-end rounded-xl rounded-bl-sm bg-wa-500/90 px-3 py-2 text-[11px] text-white">
                <WhatsAppMessageIcon className="h-4 w-4 flex-shrink-0" />
                تم الإرسال تلقائياً بواسطة الموظف الذكي
              </div>
            </div>
            <div className="border-t border-slate-100 px-3 py-2 dark:border-white/5">
              <div className="rounded-lg bg-slate-100 px-3 py-1.5 text-[11px] text-slate-400 dark:bg-white/5">اكتب رسالة...</div>
            </div>
          </div>

          {/* لوحة التفاصيل */}
          <div className="hidden w-1/4 flex-col border-r border-slate-100 bg-slate-50/70 md:flex dark:border-white/5 dark:bg-white/[0.02]">
            <div className="border-b border-slate-100 px-3 py-2.5 text-xs font-semibold text-slate-500 dark:border-white/5 dark:text-slate-400">
              الموظف الذكي
            </div>
            <div className="space-y-2 px-3 py-3">
              <div className="rounded-lg border border-wa-500/20 bg-wa-500/5 p-2.5 text-[10.5px] leading-relaxed text-slate-600 dark:text-slate-300">
                نبرة العميل: <span className="font-semibold text-wa-600 dark:text-wa-400">إيجابية</span>
                <br />الاقتراح: تأكيد موعد التوصيل
              </div>
              <div className="rounded-lg bg-slate-100 p-2.5 text-[10.5px] text-slate-500 dark:bg-white/5 dark:text-slate-400">
                3 محادثات مشابهة هذا الأسبوع
              </div>
            </div>
          </div>
        </div>
      </div>
      <div className="mt-3 flex items-center justify-center gap-2 text-xs text-slate-500 dark:text-slate-400">
        <span className="h-2 w-2 rounded-full bg-wa-500" />
        صندوق محادثات موحّد — نفس واجهة لوحة تحكمك الفعلية
      </div>
    </div>
  );
}
