import type { RecipientStatus } from "@prisma/client";

const SANDBOX_FAILURE_REASONS = [
  "رقم غير صحيح أو غير مسجَّل على واتساب",
  "انتهت صلاحية نافذة الـ24 ساعة منذ آخر تفاعل — يلزم قالب معتمد جديد",
  "الرقم محظور أو أوقف استقبال الرسائل التسويقية",
  "تعذّر الوصول للجهاز (خارج التغطية)",
];

/** يختار سبب فشل واقعياً عشوائياً — يُستخدم من metaAdapter.sendMessage في وضع sandbox فقط. */
export function pickRandomFailureReason(): string {
  return SANDBOX_FAILURE_REASONS[Math.floor(Math.random() * SANDBOX_FAILURE_REASONS.length)]!;
}

export type EngagementOutcome = {
  status: Extract<RecipientStatus, "DELIVERED" | "READ" | "REPLIED">;
  deliveredAt: Date;
  readAt: Date | null;
};

/**
 * يحاكي عمق تفاعل العميل بعد نجاح تسليم رسالة فعلياً (وضع sandbox فقط، طالما لا يوجد اتصال Meta
 * حقيقي بإشعارات قراءة/رد فعلية): ~65% من المُسلَّم تُقرأ، ومن المقروء ~20% يحصل رد فعلي.
 * محاكاة صريحة موثّقة أعلاه في التعليق وفي DECISIONS.md — وليست بيانات مقدَّمة كحقيقية.
 */
export function simulateEngagementFunnel(now: Date = new Date()): EngagementOutcome {
  const wasRead = Math.random() < 0.65;
  if (!wasRead) return { status: "DELIVERED", deliveredAt: now, readAt: null };

  const replied = Math.random() < 0.2;
  return { status: replied ? "REPLIED" : "READ", deliveredAt: now, readAt: now };
}
