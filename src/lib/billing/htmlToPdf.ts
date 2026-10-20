import { existsSync } from "fs";
import type { Browser } from "puppeteer";

/**
 * محرك عرض متصفح حقيقي (Puppeteer/Headless Chrome) بدل مكتبة رسم PDF منخفضة المستوى — هذا هو
 * الإصلاح الجذري لعطل النص العربي المشوَّه (كان pdfkit يرسم الحروف مباشرة بلا محرك تخطيط نص/تشكيل
 * عربي/RTL إطلاقاً، فينتج رموزاً غير مترابطة بصرف النظر عن الخط المُستخدَم — راجع DECISIONS.md).
 *
 * متصفح واحد مشترك عبر كل الطلبات (وليس عملية Chromium جديدة لكل فاتورة — بطيء جداً، ~1-2 ثانية لكل
 * إطلاق) مُخزَّن عالمياً بنفس نمط `redisConnection`/`superAdminDb` الموجود أصلاً في هذا المشروع.
 */
declare global {
  // eslint-disable-next-line no-var
  var __pdfBrowser: Browser | undefined;
}

// متصفحات النظام المعروفة — تُجرَّب بعد Chromium المُدمَج مع Puppeteer (قد لا يكون مُحمَّلاً على استضافة مشتركة).
const SYSTEM_BROWSERS = [
  "/usr/bin/chromium", "/usr/bin/chromium-browser", "/usr/bin/google-chrome", "/usr/bin/google-chrome-stable",
  "C:/Program Files/Google/Chrome/Application/chrome.exe", "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe",
  "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
];

async function getBrowser(): Promise<Browser> {
  if (global.__pdfBrowser?.connected) return global.__pdfBrowser;
  // تحميل كسول: لو فشل تحميل Puppeteer نفسه على الخادم (استضافة مشتركة) يصبح خطأً قابلاً للالتقاط هنا
  // فتعمل نسخة HTML الاحتياطية — بدل انهيار مسار التنزيل كله عند الاستيراد (500 لكل الطلبات).
  const { default: puppeteer } = await import("puppeteer");
  // في صورة الإنتاج (Dockerfile) نستخدم Chromium النظامي عبر PUPPETEER_EXECUTABLE_PATH؛ بدونه نجرّب المُدمَج ثم متصفحات النظام.
  const candidates = [process.env.PUPPETEER_EXECUTABLE_PATH || undefined, undefined, ...SYSTEM_BROWSERS.filter((p) => existsSync(p))];
  let lastError: unknown;
  for (const executablePath of [...new Set(candidates)]) {
    try {
      global.__pdfBrowser = await puppeteer.launch({
        headless: true,
        args: ["--no-sandbox", "--disable-setuid-sandbox"], // ضروري في أغلب بيئات الحاويات/الخوادم الافتراضية
        executablePath,
      });
      return global.__pdfBrowser;
    } catch (err) {
      lastError = err;
    }
  }
  throw lastError instanceof Error ? lastError : new Error("لا يوجد متصفح لتوليد PDF");
}

/** يحوّل HTML/CSS كامل إلى ملف PDF حقيقي — صفحة واحدة (`page`) جديدة لكل تحويل ثم تُغلَق فوراً بعد
 * الاستخدام (المتصفح نفسه يبقى مفتوحاً ومُعاد استخدامه، الصفحة فقط تُغلَق لتفادي تسريب الذاكرة). */
export async function renderHtmlToPdfBuffer(html: string): Promise<Buffer> {
  const browser = await getBrowser();
  const page = await browser.newPage();
  try {
    // لا موارد خارجية إطلاقاً في هذا الـHTML (الخط ورمز QR كلاهما مضمَّن Base64 داخلياً) — "load" كافٍ
    // تماماً، ولا يقبل setContent قيمة "networkidle0" في هذا الإصدار من Puppeteer أصلاً.
    await page.setContent(html, { waitUntil: "load" });
    const pdf = await page.pdf({ format: "A4", printBackground: true, margin: { top: "0", bottom: "0", left: "0", right: "0" } });
    return Buffer.from(pdf);
  } finally {
    await page.close();
  }
}
