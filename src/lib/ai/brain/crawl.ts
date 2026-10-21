import { fetchPageWithSsrfProtection } from "@/lib/chatbot/safeFetch";
import { redisConnection } from "@/lib/queue/connection";
import { htmlToText } from "./text";

/**
 * سحب بيانات رابط/موقع لعقل البوت:
 *  - صفحة واحدة، أو الموقع كاملاً (خريطة الموقع sitemap.xml ثم روابط الصفحات الداخلية) بحد أقصى للصفحات.
 *  - بيانات المتجر المنظّمة المخفية في الصفحة (JSON-LD: المنتجات وأسعارها وتوفرها، الأسئلة الشائعة، بيانات
 *    التواصل وساعات العمل) — كثير من المتاجر تعرض المنتجات بجافاسكربت لكنها تنشر هذه البيانات لمحركات البحث.
 *  - روابط Google Docs/Sheets العامة تُحوَّل لتصدير نصي.
 * يحترم robots.txt، ويبقى داخل نفس النطاق، وكل طلب يمر بحماية SSRF (HTTPS + عنوان عام مثبّت).
 */

export type FetchedPage = { ok: true; status: number; body: string; contentType: string; finalUrl: string } | { ok: false; error: string };
export type PageFetcher = (url: string) => Promise<FetchedPage>;

const MAX_PAGE_BYTES = 3 * 1024 * 1024;

export const safePageFetcher: PageFetcher = async (url) => {
  const r = await fetchPageWithSsrfProtection(url, MAX_PAGE_BYTES);
  if (!r.success) return { ok: false, error: r.error };
  return { ok: true, status: r.status, body: r.buffer.toString("utf8"), contentType: r.contentType, finalUrl: r.finalUrl };
};

/** Google Docs/Sheets العامة ⇐ رابط تصدير نصي/CSV (الرابط العادي صفحة تطبيق بجافاسكربت بلا محتوى). */
export function rewriteSpecialUrl(raw: string): string {
  let url: URL;
  try {
    url = new URL(raw.trim());
  } catch {
    return raw.trim();
  }
  const doc = /^\/document\/d\/([\w-]+)/.exec(url.pathname);
  if (url.hostname === "docs.google.com" && doc) return `https://docs.google.com/document/d/${doc[1]}/export?format=txt`;
  const sheet = /^\/spreadsheets\/d\/([\w-]+)/.exec(url.pathname);
  if (url.hostname === "docs.google.com" && sheet) {
    const gid = url.searchParams.get("gid") ?? /gid=(\d+)/.exec(url.hash)?.[1];
    return `https://docs.google.com/spreadsheets/d/${sheet[1]}/export?format=csv${gid ? `&gid=${gid}` : ""}`;
  }
  url.hash = "";
  return url.toString();
}

// ========================= البيانات المنظّمة (JSON-LD) =========================

type Json = Record<string, unknown>;
const asArray = (v: unknown): unknown[] => (Array.isArray(v) ? v : v == null ? [] : [v]);
const str = (v: unknown): string => (typeof v === "string" ? v.trim() : typeof v === "number" ? String(v) : "");
const typesOf = (o: Json): string[] => asArray(o["@type"]).map((t) => String(t).toLowerCase());
const stripTags = (s: string) => htmlToText(s).text.replace(/\s+/g, " ").trim();

const AVAILABILITY: Record<string, string> = { instock: "متوفر", outofstock: "غير متوفر", preorder: "طلب مسبق", limitedavailability: "كمية محدودة" };

function flattenGraph(node: unknown, out: Json[]) {
  for (const n of asArray(node)) {
    if (!n || typeof n !== "object") continue;
    const o = n as Json;
    out.push(o);
    if (o["@graph"]) flattenGraph(o["@graph"], out);
  }
}

export function extractStructuredData(html: string): { lines: string[]; faqs: Array<{ question: string; answer: string }> } {
  const nodes: Json[] = [];
  for (const m of html.matchAll(/<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi)) {
    try {
      flattenGraph(JSON.parse(m[1]!.trim()), nodes);
    } catch {
      // JSON-LD تالف في الصفحة — يُتخطى
    }
  }
  const lines: string[] = [];
  const faqs: Array<{ question: string; answer: string }> = [];
  for (const o of nodes.slice(0, 200)) {
    const types = typesOf(o);
    if (types.includes("product")) {
      const parts = [`منتج: ${str(o.name)}`];
      for (const offer of asArray(o.offers).slice(0, 3) as Json[]) {
        const price = str(offer?.price) || str(offer?.lowPrice);
        if (price) parts.push(`السعر: ${price} ${str(offer?.priceCurrency)}`.trim());
        const avail = str(offer?.availability).split("/").pop()?.toLowerCase() ?? "";
        if (AVAILABILITY[avail]) parts.push(AVAILABILITY[avail]!);
      }
      if (str(o.sku)) parts.push(`رمز: ${str(o.sku)}`);
      const desc = stripTags(str(o.description)).slice(0, 400);
      if (str(o.name)) lines.push(parts.join(" — ") + (desc ? `\n${desc}` : ""));
    } else if (types.includes("faqpage")) {
      for (const q of asArray(o.mainEntity) as Json[]) {
        const question = stripTags(str(q?.name));
        const answer = stripTags(str((q?.acceptedAnswer as Json | undefined)?.text));
        if (question && answer) faqs.push({ question: question.slice(0, 500), answer: answer.slice(0, 2000) });
      }
    } else if (types.some((t) => ["organization", "localbusiness", "store", "onlinestore"].includes(t) || t.endsWith("store"))) {
      const parts: string[] = [];
      if (str(o.name)) parts.push(`المتجر: ${str(o.name)}`);
      if (str(o.telephone)) parts.push(`الهاتف: ${str(o.telephone)}`);
      if (str(o.email)) parts.push(`البريد: ${str(o.email)}`);
      const addr = o.address as Json | string | undefined;
      const address = typeof addr === "string" ? addr : addr ? [addr.streetAddress, addr.addressLocality, addr.addressRegion, addr.addressCountry].map(str).filter(Boolean).join("، ") : "";
      if (address) parts.push(`العنوان: ${address}`);
      const hours = asArray(o.openingHours).map(str).filter(Boolean);
      if (hours.length) parts.push(`ساعات العمل: ${hours.join("، ")}`);
      if (parts.length > 1) lines.push(parts.join(" — "));
    }
  }
  return { lines, faqs };
}

/** صفحة ⇐ نص المعرفة: العنوان + الوصف + البيانات المنظّمة + نص الصفحة المقروء. */
export function pageToKnowledge(body: string, contentType: string): { title: string | null; text: string; faqs: Array<{ question: string; answer: string }> } {
  if (!/html|xhtml/.test(contentType)) return { title: null, text: body, faqs: [] };
  const { lines, faqs } = extractStructuredData(body);
  const meta = /<meta[^>]+name=["']description["'][^>]+content=["']([^"']+)["']/i.exec(body)?.[1]
    ?? /<meta[^>]+property=["']og:description["'][^>]+content=["']([^"']+)["']/i.exec(body)?.[1];
  const { title, text } = htmlToText(body);
  const header = [meta ? stripTags(meta) : "", ...lines].filter(Boolean).join("\n\n");
  return { title, text: header ? `${header}\n\n${text}` : text, faqs };
}

// ========================= اكتشاف صفحات الموقع =========================

const SKIP_PATH = /\/cdn-cgi\/|\/(cart|checkout|login|signin|sign-in|register|signup|account|my-account|wishlist|compare|search|wp-admin|wp-login|admin|feed|tag|author)(\/|$)|add-to-cart|[?&](sort|filter|page)=/i;
const SKIP_EXT = /\.(jpe?g|png|gif|webp|svg|ico|css|js|json|xml|pdf|zip|rar|mp4|mp3|webm|woff2?|ttf|eot|txt)$/i;
// صفحات أهم للعقل أولاً (سياسات، أسئلة، تواصل) — تبقى ضمن الحد الأقصى حتى في المواقع الكبيرة.
const IMPORTANT = /(faq|question|shipping|delivery|return|refund|policy|polic|privacy|terms|about|contact|warranty|payment|اسئله|شحن|توصيل|استرجاع|سياس|ضمان|تواصل|من-نحن)/i;

const sameSite = (a: URL, b: URL) => a.hostname.replace(/^www\./, "") === b.hostname.replace(/^www\./, "");

function canonical(raw: string, base: URL): URL | null {
  try {
    const u = new URL(raw, base);
    if (u.protocol !== "https:") return null;
    u.hash = "";
    for (const k of [...u.searchParams.keys()]) if (/^utm_|^(fbclid|gclid|ref)$/i.test(k)) u.searchParams.delete(k);
    return u;
  } catch {
    return null;
  }
}

type Robots = { disallow: string[]; allow: string[]; sitemaps: string[] };

export function parseRobots(txt: string): Robots {
  const r: Robots = { disallow: [], allow: [], sitemaps: [] };
  // كل مجموعة = أسطر User-agent متتالية ثم قواعدها؛ تنطبق علينا مجموعة "*" أو ما يذكر DMS.
  let agents: string[] = [];
  let inRules = false;
  for (const raw of txt.split(/\r?\n/)) {
    const line = raw.replace(/#.*/, "").trim();
    const m = /^([\w-]+)\s*:\s*(.*)$/.exec(line);
    if (!m) continue;
    const key = m[1]!.toLowerCase();
    const value = m[2]!.trim();
    if (key === "sitemap") {
      r.sitemaps.push(value);
      continue;
    }
    if (key === "user-agent") {
      if (inRules) {
        agents = [];
        inRules = false;
      }
      agents.push(value);
      continue;
    }
    if (key !== "allow" && key !== "disallow") continue;
    inRules = true;
    const applies = agents.some((a) => a === "*" || /dms/i.test(a));
    if (applies && value) (key === "allow" ? r.allow : r.disallow).push(value);
  }
  return r;
}

/** قاعدة robots ⇐ تعبير منتظم: `*` أي أحرف، و`$` نهاية المسار (كان `/*?` يُقرأ `/` فيمنع الموقع كله). */
const ruleRegex = (rule: string) =>
  new RegExp("^" + rule.replace(/[.+?^{}()|[\]\\]/g, "\\$&").replace(/\*/g, ".*").replace(/\\\$$|\$$/, "$"));

export const allowedByRobots = (robots: Robots, u: URL) => {
  let path = u.pathname + u.search;
  try {
    path = decodeURIComponent(u.pathname) + u.search;
  } catch {
    // ترميز مكسور في الرابط — يُطابَق بالصيغة الخام فقط
  }
  const rawPath = u.pathname + u.search;
  const longest = (rules: string[]) =>
    Math.max(-1, ...rules.filter((r) => ruleRegex(r).test(rawPath) || ruleRegex(r).test(path)).map((r) => r.length));
  return longest(robots.allow) >= longest(robots.disallow);
};

const linksOf = (html: string, base: URL) =>
  [...html.matchAll(/<a\s[^>]*href=["']([^"'#][^"']*)["']/gi)].map((m) => canonical(m[1]!.replace(/&amp;/g, "&"), base)).filter((u): u is URL => !!u);

async function sitemapUrls(fetcher: PageFetcher, sitemaps: string[], root: URL, limit: number): Promise<URL[]> {
  const out: URL[] = [];
  const queue = [...sitemaps];
  let fetched = 0;
  while (queue.length && fetched < 6 && out.length < limit * 3) {
    const sm = queue.shift()!;
    fetched++;
    const res = await fetcher(sm).catch(() => null);
    if (!res?.ok || res.status !== 200) continue;
    const locs = [...res.body.matchAll(/<loc>\s*([^<\s]+)\s*<\/loc>/gi)].map((m) => m[1]!.replace(/&amp;/g, "&"));
    if (/<sitemapindex/i.test(res.body)) queue.push(...locs.slice(0, 10));
    else for (const l of locs) {
      const u = canonical(l, root);
      if (u && sameSite(u, root)) out.push(u);
    }
  }
  return out;
}

export type CrawlPage = { url: string; title: string | null; text: string; faqs: Array<{ question: string; answer: string }>; html?: string };

/**
 * يكتشف ويجلب صفحات الموقع (حتى maxPages): الصفحة المدخلة أولاً، ثم خريطة الموقع، ثم الروابط الداخلية
 * (عمق 2). `onPage` تُستدعى لكل صفحة نصية — توقفها بإرجاع false (مثلاً امتلاء سعة المعرفة).
 */
export type CrawlSkipReason = "robots" | "filtered" | "http_error" | "not_html" | "offsite" | "thin";
export type CrawlResult = { visited: number; skipped: number; stopped: boolean; root: string; reasons: Partial<Record<CrawlSkipReason, number>>; firstError?: string };

export async function crawlSite(
  rootUrl: string,
  opts: { maxPages: number; fetcher?: PageFetcher; onPage: (page: CrawlPage) => Promise<boolean>; onDiscovered?: (n: number) => Promise<void> }
): Promise<CrawlResult> {
  const fetcher = opts.fetcher ?? safePageFetcher;
  const entry = canonical(rootUrl, new URL(rootUrl));
  if (!entry) throw new Error("الرابط يجب أن يبدأ بـ https://");

  const reasons: Partial<Record<CrawlSkipReason, number>> = {};
  let firstError: string | undefined;
  const skip = (r: CrawlSkipReason, detail?: string) => {
    reasons[r] = (reasons[r] ?? 0) + 1;
    if (detail && !firstError) firstError = detail;
  };

  // الصفحة المدخلة أولاً: إعادة توجيهها تحدد جذر الموقع الحقيقي (salla.sa ⇐ salla.com، النطاق ⇐ www، لغة ⇐ /ar)
  // — قبلها كانت الصفحة الأولى تُعدّ "موقعاً آخر" فلا يُحفظ شيء ويتوقف السحب.
  const first = await fetcher(entry.toString()).catch((err) => ({ ok: false as const, error: String(err) }));
  if (!first.ok) throw new Error(`تعذّر فتح الرابط: ${first.error}`);
  if (first.status !== 200) throw new Error(first.status === 403 || first.status === 429 ? "الموقع يمنع القراءة الآلية (حماية ضد الروبوتات) — جرّب صفحات بعينها أو الصق المحتوى" : `الموقع ردّ بالحالة ${first.status}`);
  const root = canonical(first.finalUrl, entry) ?? entry;

  const robotsRes = await fetcher(`${root.origin}/robots.txt`).catch(() => null);
  const robots = robotsRes?.ok && robotsRes.status === 200 && !/html/.test(robotsRes.contentType) ? parseRobots(robotsRes.body) : parseRobots("");
  const fromSitemap = await sitemapUrls(fetcher, robots.sitemaps.length ? robots.sitemaps : [`${root.origin}/sitemap.xml`], root, opts.maxPages);

  const seen = new Set<string>([entry.toString()]);
  const queue: Array<{ url: URL; depth: number; prefetched?: FetchedPage }> = [{ url: root, depth: 0, prefetched: first }];
  const sorted = [...fromSitemap].sort((a, b) => Number(IMPORTANT.test(decodeURIComponent(b.pathname))) - Number(IMPORTANT.test(decodeURIComponent(a.pathname))));
  for (const u of sorted) queue.push({ url: u, depth: 1 });
  await opts.onDiscovered?.(Math.min(opts.maxPages, new Set(queue.map((q) => q.url.toString())).size));

  let visited = 0;
  // حد للمحاولات الفاشلة المتتالية — موقع يحجب الزواحف لا يستهلك مئات الطلبات بلا فائدة.
  let consecutiveFailures = 0;
  while (queue.length && visited < opts.maxPages && consecutiveFailures < 15) {
    const { url, depth, prefetched } = queue.shift()!;
    const key = url.toString();
    if (seen.has(key) && !prefetched) continue;
    seen.add(key);
    if (!prefetched) {
      if (SKIP_PATH.test(url.pathname + url.search) || SKIP_EXT.test(url.pathname)) {
        skip("filtered");
        continue;
      }
      if (!allowedByRobots(robots, url)) {
        skip("robots");
        continue;
      }
    }
    const res = prefetched ?? (await fetcher(key).catch((err) => ({ ok: false as const, error: String(err) })));
    if (!res.ok || res.status !== 200) {
      skip("http_error", res.ok ? `HTTP ${res.status} — ${key}` : res.error);
      consecutiveFailures++;
      continue;
    }
    if (!/text\/html|xhtml/.test(res.contentType)) {
      skip("not_html");
      continue;
    }
    consecutiveFailures = 0;
    visited++;
    const finalUrl = canonical(res.finalUrl, url) ?? url;
    if (!sameSite(finalUrl, root)) {
      skip("offsite");
      continue;
    }
    const page = pageToKnowledge(res.body, res.contentType);
    if (depth < 2) {
      const links = linksOf(res.body, finalUrl).filter((l) => sameSite(l, root) && !seen.has(l.toString()));
      links.sort((a, b) => Number(IMPORTANT.test(decodeURIComponent(b.pathname))) - Number(IMPORTANT.test(decodeURIComponent(a.pathname))));
      for (const l of links.slice(0, 200)) queue.push({ url: l, depth: depth + 1 });
    }
    if (page.text.trim().length < 80 && !page.faqs.length) {
      skip("thin");
      continue;
    }
    const keepGoing = await opts.onPage({ url: finalUrl.toString(), title: page.title, text: page.text, faqs: page.faqs, html: depth === 0 ? res.body : undefined });
    if (!keepGoing) return { visited, skipped: total(reasons), stopped: true, root: root.toString(), reasons, firstError };
  }
  return { visited, skipped: total(reasons), stopped: false, root: root.toString(), reasons, firstError };
}

const total = (r: Partial<Record<CrawlSkipReason, number>>) => Object.values(r).reduce((n, v) => n + (v ?? 0), 0);

// ========================= حالة السحب بالخلفية =========================

export type SiteCrawlState = {
  status: "running" | "done" | "failed";
  rootUrl: string;
  startedAt: string;
  finishedAt?: string;
  discovered: number;
  processed: number;
  added: number;
  updated: number;
  unchanged: number;
  faqs: number;
  failed?: number;
  saveError?: string;
  chars?: number;
  skipped?: Partial<Record<CrawlSkipReason, number>>;
  firstError?: string;
  /** متجر سلة/زد بمحتوى قليل (منتجاته تُحمَّل بجافاسكربت) ⇐ تلميح لربط المتجر بدل السحب. */
  storePlatform?: "salla" | "zid";
  stoppedReason?: string;
  error?: string;
};

/** متاجر سلة/زد تُحمّل منتجاتها في المتصفح — الربط الرسمي يزامنها كاملة بأسعارها ومخزونها. */
export function detectStorePlatform(url: string, html = ""): "salla" | "zid" | undefined {
  const host = (() => {
    try {
      return new URL(url).hostname;
    } catch {
      return "";
    }
  })();
  if (/\.zid\.store$/.test(host) || /__vitrinStoreSettings|static\.zid\.store/.test(html)) return "zid";
  if (/\.salla\.sa$/.test(host) || /cdn\.salla\.(sa|network)|salla\.sa\/s\//.test(html)) return "salla";
  return undefined;
}

const STATE_TTL = 7 * 24 * 3600;
const LOCK_TTL = 20 * 60;
const stateKey = (tenantId: string) => `brain-crawl:state:${tenantId}`;
const lockKey = (tenantId: string) => `brain-crawl:lock:${tenantId}`;

export async function getSiteCrawlState(tenantId: string): Promise<SiteCrawlState | null> {
  const raw = await redisConnection.get(stateKey(tenantId)).catch(() => null);
  try {
    return raw ? (JSON.parse(raw) as SiteCrawlState) : null;
  } catch {
    return null;
  }
}

export async function writeSiteCrawlState(tenantId: string, state: SiteCrawlState) {
  await redisConnection.set(stateKey(tenantId), JSON.stringify(state), "EX", STATE_TTL).catch(() => {});
}

/** قفل سحب واحد لكل تاجر — يعيد false إن كان هناك سحب جارٍ. */
export async function acquireCrawlLock(tenantId: string): Promise<boolean> {
  return (await redisConnection.set(lockKey(tenantId), "1", "EX", LOCK_TTL, "NX").catch(() => "OK")) === "OK";
}

export async function releaseCrawlLock(tenantId: string) {
  await redisConnection.del(lockKey(tenantId)).catch(() => {});
}
