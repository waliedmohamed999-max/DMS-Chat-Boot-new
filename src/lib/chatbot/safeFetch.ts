import dns from "dns/promises";
import net from "net";

const REQUEST_TIMEOUT_MS = 8000;
const MAX_RESPONSE_BYTES = 64 * 1024; // 64KB — كافٍ لأي رد JSON معقول من خدمة تاجر

/**
 * تحصين ضد هجمات SSRF — رابط استدعاء API يأتي من إعداد التاجر نفسه (غير موثوق بالكامل)، فيُحتمَل
 * أن يشير عمداً أو بالخطأ لعنوان داخلي/محلي (شبكة المزوّد السحابي نفسها، بما فيها endpoint البيانات
 * الوصفية الشهير 169.254.169.254). يُرفَض أي عنوان IP خاص/محجوز فوراً بعد حل اسم النطاق، قبل أي
 * اتصال شبكي فعلي.
 */
function isPrivateOrReservedIp(ip: string): boolean {
  const family = net.isIP(ip);
  if (family === 4) {
    const parts = ip.split(".").map(Number);
    const [a, b] = parts;
    if (a === 10) return true; // 10.0.0.0/8
    if (a === 172 && b !== undefined && b >= 16 && b <= 31) return true; // 172.16.0.0/12
    if (a === 192 && b === 168) return true; // 192.168.0.0/16
    if (a === 127) return true; // loopback
    if (a === 169 && b === 254) return true; // link-local (يشمل 169.254.169.254)
    if (a === 0) return true; // "this network"
    if (a === 100 && b !== undefined && b >= 64 && b <= 127) return true; // CGNAT شائع الاستخدام لبروكسيات داخلية سحابية
    return false;
  }
  if (family === 6) {
    const normalized = ip.toLowerCase();
    if (normalized === "::1") return true; // loopback
    if (normalized.startsWith("fe80:") || normalized.startsWith("fe80::")) return true; // link-local
    if (/^f[cd][0-9a-f]{2}:/.test(normalized)) return true; // fc00::/7 unique local
    if (normalized.startsWith("::ffff:")) {
      const v4 = normalized.replace("::ffff:", "");
      if (net.isIP(v4) === 4) return isPrivateOrReservedIp(v4);
    }
    return false;
  }
  return true; // صيغة غير معروفة — نرفض بحذر
}

export type UrlSafetyResult = { safe: true } | { safe: false; error: string };

/**
 * يتحقق فقط (بلا أي اتصال فعلي) أن رابطاً خارجياً آمن للاتصال به من خادمنا: HTTPS، ويُحلَّل لعنوان
 * IP عام وليس خاصاً/محجوزاً. يُستخدَم قبل أي عملية تجعل **خادمنا نفسه** يتصل برابط أدخله التاجر —
 * سواء استدعاء API مباشر (أدناه) أو تنزيل وسائط عبر Baileys (القناة التجريبية تُحمِّل الوسائط
 * بنفسها من خادمنا لإعادة رفعها لواتساب، خلافاً لقناة Meta الرسمية التي تُحمِّلها خوادم Meta نفسها).
 */
export async function assertUrlSafeForOutboundFetch(rawUrl: string): Promise<UrlSafetyResult> {
  let url: URL;
  try {
    url = new URL(rawUrl);
  } catch {
    return { safe: false, error: "الرابط غير صالح الصيغة." };
  }
  if (url.protocol !== "https:") {
    return { safe: false, error: "الرابط يجب أن يبدأ بـ https:// فقط." };
  }

  let addresses: string[];
  try {
    const resolved = await dns.lookup(url.hostname, { all: true });
    addresses = resolved.map((r) => r.address);
  } catch {
    return { safe: false, error: "تعذّر حلّ اسم النطاق." };
  }
  if (addresses.length === 0 || addresses.some((ip) => isPrivateOrReservedIp(ip))) {
    return { safe: false, error: "الرابط يشير لعنوان شبكة داخلي/محجوز — مرفوض لأسباب أمنية." };
  }
  return { safe: true };
}

export type SafeFetchResult = { success: true; status: number; body: string } | { success: false; error: string };

/** يستدعي رابطاً خارجياً بأمان (HTTPS فقط، رفض عناوين IP خاصة/محلية، مهلة، حد حجم استجابة، بلا تتبّع إعادة توجيه). */
export async function fetchWithSsrfProtection(rawUrl: string, body?: unknown): Promise<SafeFetchResult> {
  const safety = await assertUrlSafeForOutboundFetch(rawUrl);
  if (!safety.safe) return { success: false, error: safety.error };
  const url = new URL(rawUrl);

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  try {
    const res = await fetch(url, {
      method: body ? "POST" : "GET",
      headers: body ? { "Content-Type": "application/json" } : undefined,
      body: body ? JSON.stringify(body) : undefined,
      redirect: "manual", // لا تتبّع أي إعادة توجيه تلقائياً — قد يُعاد التوجيه لعنوان داخلي
      signal: controller.signal,
    });

    const reader = res.body?.getReader();
    let received = "";
    if (reader) {
      const decoder = new TextDecoder();
      let totalBytes = 0;
      while (totalBytes < MAX_RESPONSE_BYTES) {
        const { done, value } = await reader.read();
        if (done) break;
        totalBytes += value.byteLength;
        received += decoder.decode(value, { stream: true });
      }
      await reader.cancel().catch(() => {});
    }

    return { success: true, status: res.status, body: received.slice(0, MAX_RESPONSE_BYTES) };
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : "فشل الاتصال بالرابط الخارجي." };
  } finally {
    clearTimeout(timeout);
  }
}
