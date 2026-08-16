"use client";

import { useEffect } from "react";
import { useSearchParams } from "next/navigation";

const REFERRAL_COOKIE_NAME = "dms_ref";
const REFERRAL_COOKIE_MAX_AGE_SECONDS = 90 * 24 * 3600;

/**
 * يلتقط ?ref=CODE من رابط إحالة مسوّق ويحفظه كوكي 90 يوماً — أول لمسة تفوز فقط (لا يُستبدَل كوكي
 * موجود بالفعل، حماية للمسوّق الأصلي من فقدان الإحالة لو المستخدم فتح رابط مسوّق آخر لاحقاً).
 * كوكي عادي (غير httpOnly) عمداً: القراءة الفعلية المعتمدة عليها في العمولة تحدث لاحقاً من الخادم
 * (lib/affiliates/referralCapture.ts) عبر next/headers — httpOnly غير ضروري هنا لأن أسوأ استغلال
 * ممكن هو تزوير إحالة نفسك، وليس تسريب بيانات حساسة.
 */
export function useCaptureReferral(): void {
  const searchParams = useSearchParams();

  useEffect(() => {
    const code = searchParams.get("ref");
    if (!code) return;
    const hasExisting = document.cookie.split("; ").some((c) => c.startsWith(`${REFERRAL_COOKIE_NAME}=`));
    if (hasExisting) return;
    document.cookie = `${REFERRAL_COOKIE_NAME}=${encodeURIComponent(code)}; max-age=${REFERRAL_COOKIE_MAX_AGE_SECONDS}; path=/; samesite=lax`;
  }, [searchParams]);
}
