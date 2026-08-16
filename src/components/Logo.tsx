"use client";

import { useEffect, useState } from "react";

/**
 * شعار المنصة (Digital Messaging System / DMS) — يحاول عرض ملف الشعار الفعلي أولاً
 * (`/logo.png` في مجلد public)، وإن لم يوجد بعد (لم يُرفَع الملف الحقيقي حتى الآن) يعرض علامة
 * بديلة مرسومة (SVG) بنفس ألوان الهوية (أخضر/كحلي) بدل أيقونة مكسورة أو حرف واحد عشوائي — بحيث
 * الموقع يعمل بمظهر احترافي فوراً، وبمجرد إضافة `public/logo.png` الحقيقي يظهر تلقائياً بلا أي
 * تعديل كود إضافي (لا اعتماد صعب على وجود ملف واحد بعينه).
 */
const SIZES = {
  sm: { box: "h-9 w-9", text: "text-xl", sub: "text-[9px]", full: "h-9" },
  md: { box: "h-12 w-12", text: "text-2xl", sub: "text-[10px]", full: "h-12" },
  lg: { box: "h-16 w-16", text: "text-4xl", sub: "text-xs", full: "h-16" },
} as const;

/** يُبرِز أول حرف من كل كلمة (بلون العلامة الأخضر) — يُظهر بصرياً أن DMS هي بالضبط الحرف الأول من كل كلمة. */
function EmphasizedWord({ word }: { word: string }) {
  return (
    <span>
      <span className="font-extrabold text-wa-500">{word[0]}</span>
      <span className="text-slate-400 dark:text-slate-500">{word.slice(1)}</span>
    </span>
  );
}

function FallbackMark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 48 48" className={className} aria-hidden="true">
      <path d="M24 6c7 0 11 4 13 9-4-3-9-4-13-1-3 2-5 2-8 0 2-5 5-8 8-8Z" fill="#25D366" />
      <path d="M11 15c-3 4-3 10 0 15 1-5 4-8 9-9 3-1 4-3 4-6-5-2-9-2-13 0Z" fill="#0B1220" />
      <path d="M37 15c3 4 3 10 0 15-1-5-4-8-9-9-3-1-4-3-4-6 5-2 9-2 13 0Z" fill="#25D366" />
      <path d="M24 42c-7 0-11-4-13-9 4 3 9 4 13 1 3-2 5-2 8 0-2 5-5 8-8 8Z" fill="#0B1220" />
    </svg>
  );
}

/**
 * أيقونة مصغَّرة فقط (بلا اسم نصي) — تُستخدم دائماً كعلامة مرسومة (SVG) بدل اقتصاص شعار
 * `logo.png` الكامل (المحتوي على النص أيضاً) لأن اقتصاصه في مربع صغير جداً (شارة الشريط الجانبي
 * مثلاً) يُشوِّه النص. تُطابق نفس ألوان الهوية دائماً، بصرف النظر عن رفع الملف الحقيقي أم لا.
 */
export function LogoMark({ size = "md", className = "" }: { size?: keyof typeof SIZES; className?: string }) {
  const s = SIZES[size];
  return <FallbackMark className={`${s.box} ${className}`} />;
}

/**
 * الشعار الكامل (أيقونة + اسم) — للاستخدام في رأس/تذييل الموقع التسويقي وأعلى نماذج الدخول.
 *
 * ملاحظة تقنية مهمة: الاعتماد على `onError` وحده على عنصر `<img>` مُصيَّر من الخادم (SSR) غير
 * موثوق — المتصفح قد يحاول تحميل الصورة ويفشل (404) *قبل* أن يُكمل React عملية الـhydration
 * ويُعلِّق مُستمِع onError فعلياً، فيُفقَد الحدث تماماً ويبقى وسم `<img>` المكسور ظاهراً بلا أي
 * fallback (خطأ حقيقي اكتُشف بالاختبار الفعلي: alt text المكسور كان يظهر باستمراراً رغم أن المسار
 * يرجع 404 فعلياً). الحل: عنصر `<img>` لا يُضاف للـDOM إطلاقاً إلا بعد اكتمال التركيب (mount) على
 * العميل — عندها يكون مُستمِع onError مُعلَّقاً بالفعل قبل بدء تحميل الصورة، فيستحيل فوات الحدث.
 */
export function LogoFull({ size = "md", light = false }: { size?: "sm" | "md" | "lg"; light?: boolean }) {
  const [mounted, setMounted] = useState(false);
  const [broken, setBroken] = useState(false);
  const s = SIZES[size];

  useEffect(() => setMounted(true), []);

  if (mounted && !broken) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src="/logo.png"
        alt="Digital Messaging System"
        className={`${s.full} w-auto object-contain`}
        onError={() => setBroken(true)}
      />
    );
  }

  return (
    <div className="flex items-center gap-3">
      <FallbackMark className={s.box} />
      {/* dir="ltr" إلزامي هنا: العلامة اسم إنجليزي، والصفحة بأكملها RTL — بدونه يعكس flex ترتيب
          الكلمات الثلاث بصرياً (System Messaging Digital بدل Digital Messaging System). */}
      <div dir="ltr" className="text-center leading-none">
        <p className={`font-extrabold tracking-wide ${s.text} ${light ? "text-white" : "text-slate-900 dark:text-white"}`}>DMS</p>
        <p className={`mt-1 flex items-center justify-center gap-1 font-semibold uppercase tracking-wide ${s.sub}`}>
          <EmphasizedWord word="Digital" />
          <EmphasizedWord word="Messaging" />
          <EmphasizedWord word="System" />
        </p>
      </div>
    </div>
  );
}
