"use server";

import { headers } from "next/headers";
import { superAdminDb } from "@/lib/db";
import { checkTenantRateLimit } from "@/lib/rateLimit";

export type PartnerStatusResult =
  | { found: true; status: "PENDING" | "APPROVED" | "REJECTED" | "NEEDS_INFO"; reviewerNote: string | null; createdAt: string; storeName: string }
  | { found: false; error: string };

/**
 * تتبّع عام لحالة طلب انضمام بدون تسجيل دخول — التحقق بمطابقة (رقم الطلب + البريد الإلكتروني) معاً
 * يمنع تخمين حالة طلب غير مملوك (رقم الطلب وحده cuid غير قابل للتخمين عملياً، والبريد طبقة تحقق إضافية).
 */
export async function checkPartnerApplicationStatus(formData: FormData): Promise<PartnerStatusResult> {
  const referenceId = String(formData.get("referenceId") ?? "").trim();
  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  if (!referenceId || !email) {
    return { found: false, error: "رقم الطلب والبريد الإلكتروني مطلوبان" };
  }

  const ip = headers().get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";
  const rateLimit = await checkTenantRateLimit(ip, "partner-status-check", 20, 3600);
  if (!rateLimit.allowed) {
    return { found: false, error: "عدد محاولات كبير جداً — حاول لاحقاً." };
  }

  const request = await superAdminDb.approvalRequest.findFirst({
    where: { id: referenceId, applicantEmail: email, type: "PARTNER_APPLICATION" },
  });

  // رسالة "غير موجود" واحدة موحّدة سواء كان رقم الطلب خاطئاً أو البريد غير مطابق — يمنع كشف أيهما صحيح.
  if (!request) {
    return { found: false, error: "لم يُعثر على طلب مطابق لهذا الرقم والبريد الإلكتروني." };
  }

  const payload = request.payloadJson as { storeName?: string } | null;
  return {
    found: true,
    status: request.status,
    reviewerNote: request.status === "REJECTED" || request.status === "NEEDS_INFO" ? request.reviewerNote : null,
    createdAt: request.createdAt.toISOString(),
    storeName: payload?.storeName ?? "—",
  };
}
