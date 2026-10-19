import { NextRequest, NextResponse } from "next/server";

/**
 * رابط رجوع قديم — الربط الحالي (من متجر تطبيقات زد ومن لوحة DMS) يمر عبر /api/zid/oauth/callback.
 * يُحوَّل له أي طلب يصل هنا (روابط تفويض قديمة) بنفس المعاملات.
 */
export function GET(req: NextRequest) {
  const url = new URL("/api/zid/oauth/callback", req.nextUrl.origin);
  req.nextUrl.searchParams.forEach((v, k) => url.searchParams.set(k, v));
  return NextResponse.redirect(url);
}
