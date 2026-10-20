import type { Prisma } from "@prisma/client";
import type OpenAI from "openai";
import { normalizeArabic, tokenize } from "@/lib/ai/brain/text";

/**
 * أدوات حقيقية (Function Calling) يستدعيها النموذج بدل التخمين في بيانات حرجة (بند 3 في القواعد
 * غير القابلة للتفاوض) — سعر/توفر منتج وحالة طلب تُقرآن دائماً من القاعدة الفعلية، لا من "معرفة"
 * النموذج العامة. البحث عن المنتجات مرن (كلمات موحّدة عبر الاسم والوصف والتصنيف) لأن العميل نادراً ما
 * يكتب اسم المنتج بالضبط كما في الكتالوج.
 */
export const AI_TOOLS: OpenAI.Chat.Completions.ChatCompletionTool[] = [
  {
    type: "function",
    function: {
      name: "get_product_price",
      description:
        "يبحث عن منتج حقيقي بالاسم (أو جزء منه) ويعيد سعره الفعلي، توفره، وصفه، تصنيفه، ومنتجات أخرى ذات صلة من نفس التصنيف (لاقتراحها كبديل أو رفع قيمة السلة). استخدمها دائماً قبل ذكر أي سعر أو توفر، وكمصدر وحيد لأي اقتراح منتج بديل — لا تقترح منتجاً لم يعده هذا الاستدعاء إطلاقاً.",
      parameters: {
        type: "object",
        properties: { productName: { type: "string", description: "اسم المنتج أو جزء منه كما ذكره العميل" } },
        required: ["productName"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "search_products",
      description:
        "بحث ذكي في كتالوج المتجر عندما يصف العميل ما يريد بدل ذكر اسم محدد (مثال: 'عطر خشبي للهدايا تحت 300 ريال'، 'أحذية رياضية متوفرة'). يعيد حتى 5 منتجات حقيقية مرتّبة بالأقرب مع السعر والتوفر.",
      parameters: {
        type: "object",
        properties: {
          query: { type: "string", description: "وصف ما يبحث عنه العميل بكلماته" },
          maxPriceSar: { type: "number", description: "أعلى سعر يقبله العميل بالريال (اختياري)" },
          minPriceSar: { type: "number", description: "أقل سعر (اختياري)" },
          inStockOnly: { type: "boolean", description: "المتوفر فقط (افتراضياً true)" },
        },
        required: ["query"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "get_order_status",
      description:
        "يبحث عن طلب حقيقي لهذا العميل بالذات (بحسب هويته في المحادثة) ويعيد حالته الفعلية — أحدث طلب، أو طلب محدد برقمه إن ذكره العميل. يجب استدعاؤها دائماً قبل الإجابة عن أي سؤال عن حالة طلب أو شحنة — لا تخمين إطلاقاً.",
      parameters: {
        type: "object",
        properties: { orderNumber: { type: "string", description: "رقم الطلب إن ذكره العميل (اختياري)" } },
        required: [],
      },
    },
  },
];

/**
 * أداة ملف العميل: تُكمل بيانات جهة الاتصال الناقصة (الاسم، المدينة، البريد) وتسجّل اهتمامه كوسم — تحوّل
 * المحادثة لعميل محتمل مؤهَّل بلا إدخال يدوي. لا تستبدل بيانات أدخلها الفريق (تملأ الفارغ فقط).
 */
export const PROFILE_TOOL: OpenAI.Chat.Completions.ChatCompletionTool = {
  type: "function",
  function: {
    name: "update_customer_profile",
    description:
      "سجّل بيانات العميل الأساسية حين يذكرها صراحة (اسمه، مدينته، بريده) واهتمامه الشرائي (مثال: 'عطور رجالية'، 'أجهزة منزلية'). استدعها مرة عند ظهور المعلومة — لا تسأل العميل عنها خصيصاً.",
    parameters: {
      type: "object",
      properties: {
        name: { type: "string", description: "اسم العميل كما قاله" },
        city: { type: "string", description: "مدينة العميل" },
        email: { type: "string", description: "البريد الإلكتروني إن ذكره" },
        interest: { type: "string", description: "اهتمام شرائي مختصر (كلمتان أو ثلاث)" },
      },
      required: [],
    },
  },
};

export type AiToolName = "get_product_price" | "search_products" | "get_order_status" | "update_customer_profile";

const ORDER_STATUS_AR: Record<string, string> = {
  ABANDONED_CART: "سلة متروكة (لم يكتمل الدفع)",
  PENDING: "قيد المعالجة",
  PAID: "مدفوع وقيد التجهيز",
  SHIPPED: "تم الشحن",
  DELIVERED: "تم التسليم",
  CANCELLED: "ملغي",
};

type ProductRow = { id: string; name: string; priceSar: number; stockQty: number; description: string | null; categoryName: string | null };

/** ترتيب المنتجات بتغطية كلمات الوصف (الاسم أثقل وزناً من الوصف والتصنيف). */
function rankProducts(products: ProductRow[], query: string): Array<{ p: ProductRow; score: number }> {
  const terms = [...new Set(tokenize(query))];
  if (!terms.length) return [];
  const has = (hay: string, t: string) => hay.includes(t);
  return products
    .map((p) => {
      const name = normalizeArabic(p.name);
      const rest = normalizeArabic(`${p.categoryName ?? ""} ${p.description ?? ""}`);
      let score = 0;
      for (const t of terms) score += has(name, t) ? 2 : has(rest, t) ? 1 : 0;
      return { p, score: score / (terms.length * 2) };
    })
    .filter((x) => x.score > 0)
    .sort((a, b) => b.score - a.score || b.p.stockQty - a.p.stockQty);
}

const PRODUCT_SELECT = { id: true, name: true, priceSar: true, stockQty: true, description: true, categoryName: true } as const;

async function findProduct(tx: Prisma.TransactionClient, tenantId: string, productName: string): Promise<ProductRow | null> {
  const exact = await tx.product.findFirst({
    where: { tenantId, name: { contains: productName, mode: "insensitive" } },
    orderBy: { updatedAt: "desc" },
    select: PRODUCT_SELECT,
  });
  if (exact) return exact;
  // لا تطابق حرفي ("عطر العود الملكي" مقابل "عود ملكي — عطر") ⇒ بحث بالكلمات.
  const candidates = await tx.product.findMany({ where: { tenantId }, select: PRODUCT_SELECT, take: 2000 });
  const best = rankProducts(candidates, productName)[0];
  return best && best.score >= 0.5 ? best.p : null;
}

/** ينفّذ أداة مطلوبة من النموذج ضد بيانات حقيقية عبر نفس معاملة التاجر (tx) الجارية أصلاً. */
export async function executeAiTool(
  tx: Prisma.TransactionClient,
  tenantId: string,
  contactId: string,
  toolName: string,
  rawArgs: string
): Promise<string> {
  let args: Record<string, unknown> = {};
  try {
    args = JSON.parse(rawArgs || "{}");
  } catch {
    // مدخلات غير صالحة من النموذج — تُعامَل كمعاملات فارغة بدل رمي خطأ يوقف المحادثة بأكملها
  }

  if (toolName === "get_product_price") {
    const productName = String(args.productName ?? "").trim();
    if (!productName) return JSON.stringify({ found: false, reason: "اسم منتج فارغ" });

    const product = await findProduct(tx, tenantId, productName);
    if (!product) return JSON.stringify({ found: false });

    const related = product.categoryName
      ? await tx.product.findMany({
          where: { tenantId, categoryName: product.categoryName, id: { not: product.id }, stockQty: { gt: 0 } },
          orderBy: [{ stockQty: "desc" }, { priceSar: "asc" }],
          take: 3,
        })
      : [];

    return JSON.stringify({
      found: true, name: product.name, priceSar: product.priceSar,
      inStock: product.stockQty > 0, stockQty: product.stockQty,
      description: product.description, category: product.categoryName,
      relatedProducts: related.map((r) => ({ name: r.name, priceSar: r.priceSar, inStock: r.stockQty > 0 })),
    });
  }

  if (toolName === "search_products") {
    const query = String(args.query ?? "").trim().slice(0, 200);
    if (!query) return JSON.stringify({ found: false, reason: "وصف فارغ" });
    const max = Number(args.maxPriceSar);
    const min = Number(args.minPriceSar);
    const inStockOnly = args.inStockOnly !== false;
    const candidates = await tx.product.findMany({
      where: {
        tenantId,
        ...(inStockOnly ? { stockQty: { gt: 0 } } : {}),
        priceSar: { ...(Number.isFinite(max) && max > 0 ? { lte: Math.round(max) } : {}), ...(Number.isFinite(min) && min > 0 ? { gte: Math.round(min) } : {}) },
      },
      select: PRODUCT_SELECT,
      take: 2000,
    });
    const ranked = rankProducts(candidates, query).slice(0, 5);
    if (!ranked.length) return JSON.stringify({ found: false, totalInCatalog: candidates.length });
    return JSON.stringify({
      found: true,
      products: ranked.map(({ p }) => ({
        name: p.name, priceSar: p.priceSar, inStock: p.stockQty > 0, category: p.categoryName,
        description: p.description?.slice(0, 160) ?? null,
      })),
    });
  }

  if (toolName === "get_order_status") {
    if (!contactId) return JSON.stringify({ found: false, reason: "هوية العميل غير معروفة في هذه القناة" });
    const orderNumber = String(args.orderNumber ?? "").replace(/[^\p{L}\p{N}-]/gu, "").slice(0, 40);
    // دائماً مقيّد بطلبات هذا العميل نفسه — رقم طلب عميل آخر لا يكشف أي شيء.
    const order = await tx.order.findFirst({
      where: { tenantId, contactId, ...(orderNumber ? { externalId: { contains: orderNumber } } : {}) },
      orderBy: { createdAt: "desc" },
    });
    if (!order) return JSON.stringify({ found: false, ...(orderNumber ? { reason: "لا يوجد طلب بهذا الرقم لهذا العميل" } : {}) });
    return JSON.stringify({
      found: true, orderNumber: order.externalId, status: order.status, statusAr: ORDER_STATUS_AR[order.status] ?? order.status,
      totalSar: order.totalSar, createdAt: order.createdAt.toISOString(), lastUpdate: order.updatedAt.toISOString(),
    });
  }

  if (toolName === "update_customer_profile") {
    if (!contactId) return JSON.stringify({ saved: false });
    return updateCustomerProfile(tx, tenantId, contactId, args);
  }

  return JSON.stringify({ found: false, error: "أداة غير معروفة" });
}

const MAX_INTEREST_TAGS = 5;

async function updateCustomerProfile(tx: Prisma.TransactionClient, tenantId: string, contactId: string, args: Record<string, unknown>): Promise<string> {
  const contact = await tx.contact.findUnique({ where: { id: contactId }, select: { name: true, phoneE164: true, city: true, email: true } });
  if (!contact) return JSON.stringify({ saved: false });
  const clean = (v: unknown, max: number) => String(v ?? "").replace(/[<>\n\r]/g, " ").trim().slice(0, max);
  const name = clean(args.name, 80);
  const city = clean(args.city, 60);
  const email = clean(args.email, 120).toLowerCase();
  const interest = clean(args.interest, 40);
  const saved: string[] = [];

  const data: Prisma.ContactUpdateInput = {};
  // الاسم يُكمَل فقط إن كان الحالي مجرد رقم/افتراضي (لا يستبدل اسماً أدخله الفريق أو جاء من المتجر).
  const placeholderName = !contact.name.trim() || /^[+\d\s-]+$/.test(contact.name) || contact.name === contact.phoneE164;
  if (name.length >= 2 && placeholderName) { data.name = name; saved.push("name"); }
  if (city.length >= 2 && !contact.city) { data.city = city; saved.push("city"); }
  if (/^[^\s@]+@[^\s@]+\.[a-z]{2,}$/.test(email) && !contact.email) { data.email = email; saved.push("email"); }
  if (Object.keys(data).length) await tx.contact.update({ where: { id: contactId }, data });

  if (interest.length >= 2) {
    const tagName = `مهتم: ${interest}`;
    const existingInterest = await tx.contactTag.count({ where: { contactId, tag: { name: { startsWith: "مهتم: " } } } });
    if (existingInterest < MAX_INTEREST_TAGS) {
      const tag = await tx.tag.upsert({ where: { tenantId_name: { tenantId, name: tagName } }, update: {}, create: { tenantId, name: tagName, color: "#10B981" } });
      await tx.contactTag.upsert({ where: { contactId_tagId: { contactId, tagId: tag.id } }, update: {}, create: { contactId, tagId: tag.id } });
      saved.push("interest");
    }
  }
  return JSON.stringify({ saved: saved.length > 0, fields: saved });
}

/** الوقت الحالي في السعودية — ليجيب البوت عن "هل أنتم فاتحين الآن؟" بمقارنته بساعات العمل. */
export function nowInSaudi(date = new Date()): string {
  return new Intl.DateTimeFormat("ar-SA-u-nu-latn", {
    timeZone: "Asia/Riyadh", weekday: "long", year: "numeric", month: "long", day: "numeric", hour: "numeric", minute: "2-digit",
  }).format(date);
}
