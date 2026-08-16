import type { Prisma } from "@prisma/client";
import type OpenAI from "openai";

/**
 * أدوات حقيقية (Function Calling) يستدعيها النموذج بدل التخمين في بيانات حرجة (بند 3 في القواعد
 * غير القابلة للتفاوض) — سعر/توفر منتج وحالة طلب تُقرآن دائماً من القاعدة الفعلية، لا من "معرفة"
 * النموذج العامة. البحث عن المنتج بجزء من الاسم (contains, غير حساس لحالة الأحرف) لأن العميل نادراً
 * ما يكتب اسم المنتج بالضبط كما في الكتالوج.
 */
export const AI_TOOLS: OpenAI.Chat.Completions.ChatCompletionTool[] = [
  {
    type: "function",
    function: {
      name: "get_product_price",
      description:
        "يبحث عن منتج حقيقي في كتالوج المتجر بالاسم (أو جزء منه) ويعيد سعره الفعلي ومدى توفره في المخزون. يجب استدعاؤها دائماً قبل ذكر أي سعر أو حالة توفر لأي منتج — لا تخمين إطلاقاً.",
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
      name: "get_order_status",
      description:
        "يبحث عن أحدث طلب حقيقي لهذا العميل بالذات (بحسب هويته في المحادثة) ويعيد حالته الفعلية. يجب استدعاؤها دائماً قبل الإجابة عن أي سؤال عن حالة طلب أو شحنة — لا تخمين إطلاقاً.",
      parameters: { type: "object", properties: {}, required: [] },
    },
  },
];

export type AiToolName = "get_product_price" | "get_order_status";

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

    const product = await tx.product.findFirst({
      where: { tenantId, name: { contains: productName, mode: "insensitive" } },
      orderBy: { updatedAt: "desc" },
    });
    if (!product) return JSON.stringify({ found: false });
    return JSON.stringify({
      found: true, name: product.name, priceSar: product.priceSar,
      inStock: product.stockQty > 0, stockQty: product.stockQty,
    });
  }

  if (toolName === "get_order_status") {
    const order = await tx.order.findFirst({ where: { tenantId, contactId }, orderBy: { createdAt: "desc" } });
    if (!order) return JSON.stringify({ found: false });
    return JSON.stringify({
      found: true, status: order.status, totalSar: order.totalSar,
      createdAt: order.createdAt.toISOString(),
    });
  }

  return JSON.stringify({ found: false, error: "أداة غير معروفة" });
}
