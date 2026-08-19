import dns from "dns/promises";
import net from "net";
import https from "node:https";

const REQUEST_TIMEOUT_MS = 8000;
const MAX_RESPONSE_BYTES = 64 * 1024; // 64KB — كافٍ لأي رد JSON معقول من خدمة تاجر
const MAX_MEDIA_BYTES = 20 * 1024 * 1024; // 20MB — يطابق تقريباً حدود واتساب لحجم الوسائط

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

export type UrlSafetyResult = { safe: true; ip: string } | { safe: false; error: string };

/**
 * يتحقق فقط (بلا أي اتصال فعلي) أن رابطاً خارجياً آمن للاتصال به من خادمنا: HTTPS، ويُحلَّل لعنوان
 * IP عام وليس خاصاً/محجوزاً. يُستخدَم قبل أي عملية تجعل **خادمنا نفسه** يتصل برابط أدخله التاجر —
 * سواء استدعاء API مباشر (أدناه) أو تنزيل وسائط عبر Baileys (القناة التجريبية تُحمِّل الوسائط
 * بنفسها من خادمنا لإعادة رفعها لواتساب، خلافاً لقناة Meta الرسمية التي تُحمِّلها خوادم Meta نفسها).
 * يُعيد عنوان IP المُتحقَّق منه (وليس فقط true/false) ليُستخدَم مباشرة عند الاتصال الفعلي أدناه —
 * تفادياً لإعادة حلّ اسم النطاق مرة أخرى وقت الاتصال (نافذة DNS rebinding: تحقّق ناجح على IP عام ثم
 * حلّ مختلف وقت الاتصال الفعلي يُعيد عنوان IP داخلي/محجوز).
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
  const firstAddress = addresses[0];
  if (!firstAddress || addresses.some((ip) => isPrivateOrReservedIp(ip))) {
    return { safe: false, error: "الرابط يشير لعنوان شبكة داخلي/محجوز — مرفوض لأسباب أمنية." };
  }
  return { safe: true, ip: firstAddress };
}

type PinnedRequestResult = { success: true; status: number; buffer: Buffer } | { success: false; error: string };

/**
 * ينفّذ الاتصال الفعلي بعنوان IP مُتحقَّق منه مسبقاً (بلا إعادة حلّ اسم النطاق — يمنع DNS rebinding،
 * راجع تعليق assertUrlSafeForOutboundFetch أعلاه)، ويُعيد الجسم كـBuffer خام. مشتركة بين النسخة
 * النصية (استدعاء API — راجع fetchWithSsrfProtection) ونسخة الوسائط الثنائية (تنزيل صورة/فيديو/ملف
 * لإعادة رفعه عبر Baileys — راجع fetchMediaWithSsrfProtection) لتفادي ازدواج منطق الاتصال المُحصَّن.
 */
function requestPinned(url: URL, pinnedIp: string, maxBytes: number, bodyString?: string): Promise<PinnedRequestResult> {
  const pinnedFamily = net.isIP(pinnedIp);

  return new Promise<PinnedRequestResult>((resolve) => {
    const req = https.request(
      {
        hostname: url.hostname,
        servername: url.hostname, // SNI الصحيح رغم الاتصال بعنوان IP مباشرة
        port: url.port || 443,
        path: `${url.pathname}${url.search}`,
        method: bodyString ? "POST" : "GET",
        headers: {
          Host: url.hostname,
          ...(bodyString ? { "Content-Type": "application/json", "Content-Length": Buffer.byteLength(bodyString) } : {}),
        },
        timeout: REQUEST_TIMEOUT_MS,
        // لا يُعاد حلّ اسم النطاق هنا — يُعاد دائماً نفس عنوان IP المتحقَّق منه أعلاه فقط.
        lookup: (_hostname, _options, callback) => {
          callback(null, pinnedIp, pinnedFamily);
        },
      },
      (res) => {
        // لا تتبّع أي إعادة توجيه تلقائياً — قد يُعاد التوجيه لعنوان داخلي.
        const chunks: Buffer[] = [];
        let totalBytes = 0;
        res.on("data", (chunk: Buffer) => {
          if (totalBytes >= maxBytes) return;
          totalBytes += chunk.length;
          chunks.push(chunk);
        });
        res.on("end", () => {
          resolve({ success: true, status: res.statusCode ?? 0, buffer: Buffer.concat(chunks).subarray(0, maxBytes) });
        });
        res.on("error", (err) => {
          resolve({ success: false, error: err.message || "فشل الاتصال بالرابط الخارجي." });
        });
      }
    );

    req.on("timeout", () => req.destroy(new Error("انتهت مهلة الاتصال بالرابط الخارجي.")));
    req.on("error", (err) => resolve({ success: false, error: err.message || "فشل الاتصال بالرابط الخارجي." }));
    if (bodyString) req.write(bodyString);
    req.end();
  });
}

export type SafeFetchResult = { success: true; status: number; body: string } | { success: false; error: string };

/** يستدعي رابطاً خارجياً بأمان ويُعيد الرد كنص (استخدام API — عقدة "استدعاء API" في الشات بوت). */
export async function fetchWithSsrfProtection(rawUrl: string, body?: unknown): Promise<SafeFetchResult> {
  const safety = await assertUrlSafeForOutboundFetch(rawUrl);
  if (!safety.safe) return { success: false, error: safety.error };
  const url = new URL(rawUrl);
  const bodyString = body ? JSON.stringify(body) : undefined;

  const result = await requestPinned(url, safety.ip, MAX_RESPONSE_BYTES, bodyString);
  if (!result.success) return result;
  return { success: true, status: result.status, body: result.buffer.toString("utf8") };
}

export type SafeMediaFetchResult = { success: true; status: number; buffer: Buffer } | { success: false; error: string };

/**
 * يُنزِّل وسائط (صورة/فيديو/ملف) من رابط أدخله التاجر بأمان ويُعيدها كـBuffer خام — يُستخدَم بدل تمرير
 * الرابط مباشرة لمكتبة خارجية (مثل Baileys) لتُنزِّله بنفسها، لأن ذلك يتجاوز تحصين SSRF بالكامل (لا
 * تحقّق أصلاً على الرابط الذي تتصل به المكتبة، ولا تثبيت لعنوان IP يمنع DNS rebinding).
 */
export async function fetchMediaWithSsrfProtection(rawUrl: string): Promise<SafeMediaFetchResult> {
  const safety = await assertUrlSafeForOutboundFetch(rawUrl);
  if (!safety.safe) return { success: false, error: safety.error };
  const url = new URL(rawUrl);
  return requestPinned(url, safety.ip, MAX_MEDIA_BYTES);
}
