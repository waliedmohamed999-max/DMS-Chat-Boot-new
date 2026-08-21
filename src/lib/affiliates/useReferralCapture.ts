"use client";

import { useEffect } from "react";
import { useSearchParams } from "next/navigation";

const REFERRAL_COOKIE_NAME = "dms_ref";
const REFERRAL_SOURCE_COOKIE_NAME = "dms_ref_src";
const REFERRAL_COOKIE_MAX_AGE_SECONDS = 90 * 24 * 3600;

/**
 * يلتقط ?ref=CODE (و?src=القناة اختيارياً) من رابط إحالة مسوّق ويحفظه كوكي 90 يوماً — أول لمسة تفوز
 * فقط (لا يُستبدَل كوكي موجود بالفعل، حماية للمسوّق الأصلي من فقدان الإحالة لو المستخدم فتح رابط
 * مسوّق آخر لاحقاً). كوكي عادي (غير httpOnly) عمداً: القراءة الفعلية المعتمدة عليها في العمولة تحدث
 * لاحقاً من الخادم (lib/affiliates/referralCapture.ts) عبر next/headers — httpOnly غير ضروري هنا لأن
 * أسوأ استغلال ممكن هو تزوير إحالة نفسك، وليس تسريب بيانات حساسة.
 *
 * يُستدعى من src/app/providers.tsx (مستوى الـlayout الجذري) وليس من صفحات فردية — رابط الإحالة الفعلي
 * (ReferralLinkBox.tsx) يشير للصفحة الرئيسية `/?ref=CODE`، فالتقاط محصور بصفحات معينة (كان الوضع
 * سابقاً) يفوّت الغالبية العظمى من الزيارات الحقيقية بصمت.
 */
export function useCaptureReferral(): void {
  const searchParams = useSearchParams();

  useEffect(() => {
    const code = searchParams.get("ref");
    if (!code) return;
    const hasExisting = document.cookie.split("; ").some((c) => c.startsWith(`${REFERRAL_COOKIE_NAME}=`));
    if (hasExisting) return;

    const source = searchParams.get("src");
    document.cookie = `${REFERRAL_COOKIE_NAME}=${encodeURIComponent(code)}; max-age=${REFERRAL_COOKIE_MAX_AGE_SECONDS}; path=/; samesite=lax`;
    if (source) {
      document.cookie = `${REFERRAL_SOURCE_COOKIE_NAME}=${encodeURIComponent(source)}; max-age=${REFERRAL_COOKIE_MAX_AGE_SECONDS}; path=/; samesite=lax`;
    }

    // تسجيل النقرة الخام — فشل الشبكة هنا لا يجب أن يمنع حفظ الكوكي (حدث فوق) بأي حال.
    fetch("/api/affiliates/click", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ code, source: source || undefined }),
    }).catch(() => {});
  }, [searchParams]);
}
