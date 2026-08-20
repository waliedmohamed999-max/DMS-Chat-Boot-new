import type { Prisma } from "@prisma/client";
import type OpenAI from "openai";

/**
 * أدوات (Function Calling) لشات الموقع التسويقي العام — نفس فلسفة tools.ts (بند 3 في برومنت الموظف
 * الذكي التاجري: لا تخمين في بيانات حرجة، الأداة الحقيقية دائماً مصدر أي سعر). سياق عام بالكامل (بلا
 * tenantId/contactId، الزائر غير مسجَّل دخول)، فالأداة الوحيدة هنا تقرأ كتالوج الباقات العام فقط —
 * لا وصول لأي بيانات تاجر أو عميل مهما كان.
 */
export const AI_PLATFORM_TOOLS: OpenAI.Chat.Completions.ChatCompletionTool[] = [
  {
    type: "function",
    function: {
      name: "get_plan_price",
      description:
        "يبحث عن باقة اشتراك حقيقية في كتالوج المنصة العام بالاسم (أو جزء منه) ويعيد سعرها الفعلي وحدودها ومزاياها. يجب استدعاؤها دائماً قبل ذكر أي سعر أو حد لأي باقة — لا تخمين إطلاقاً. لو لم تُذكر باقة بعينها، استدعِها بدون اسم لعرض كل الباقات المتاحة.",
      parameters: {
        type: "object",
        properties: { planName: { type: "string", description: "اسم الباقة أو جزء منه كما ذكره الزائر (اختياري — اتركه فارغاً لعرض كل الباقات)" } },
        required: [],
      },
    },
  },
];

export type AiPlatformToolName = "get_plan_price";

/** ينفّذ أداة مطلوبة من النموذج ضد كتالوج الباقات العام الحقيقي — بلا أي عزل تاجر (سياق عام). */
export async function executeAiPlatformTool(tx: Prisma.TransactionClient, toolName: string, rawArgs: string): Promise<string> {
  let args: Record<string, unknown> = {};
  try {
    args = JSON.parse(rawArgs || "{}");
  } catch {
    // مدخلات غير صالحة من النموذج — تُعامَل كمعاملات فارغة بدل رمي خطأ يوقف المحادثة بأكملها
  }

  if (toolName === "get_plan_price") {
    const planName = String(args.planName ?? "").trim();
    const plans = await tx.plan.findMany({
      where: {
        isActive: true,
        isCustomForTenantId: null,
        ...(planName ? { name: { contains: planName, mode: "insensitive" } } : {}),
      },
      orderBy: { priceMonthlySar: "asc" },
      select: {
        key: true, name: true, priceMonthlySar: true, maxUsers: true, maxWhatsappNumbers: true,
        maxMessagesPerMonth: true, features: true, supportTier: true, annualDiscountBps: true, isPopular: true,
      },
    });
    if (plans.length === 0) return JSON.stringify({ found: false });
    return JSON.stringify({
      found: true,
      plans: plans.map((p) => ({
        name: p.name, priceMonthlySarPerMonth: p.priceMonthlySar, maxUsers: p.maxUsers,
        maxWhatsappNumbers: p.maxWhatsappNumbers, maxMessagesPerMonth: p.maxMessagesPerMonth,
        features: p.features, supportTier: p.supportTier, annualDiscountPercent: p.annualDiscountBps / 100, isPopular: p.isPopular,
      })),
    });
  }

  return JSON.stringify({ found: false, error: "أداة غير معروفة" });
}
