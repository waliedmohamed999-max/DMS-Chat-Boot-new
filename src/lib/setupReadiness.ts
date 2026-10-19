import { superAdminDb } from "@/lib/db";
import { getPlatformSettings } from "@/lib/platformSettings";

/**
 * جاهزية الحسابات الخارجية للإطلاق الحقيقي (صفحة /admin/setup): ما المضبوط في البيئة، وما الروابط التي
 * تُلصق في لوحات المزوّدين. لا تُعرض أي قيمة سرية — فقط هل هي موجودة. اختبار الاتصال الفعلي بزر منفصل.
 */

export type CheckLevel = "ok" | "warn" | "missing";
export type Check = { label: string; level: CheckLevel; detail?: string };
export type SetupSection = {
  key: "core" | "email" | "d360" | "moyasar" | "salla" | "pricing";
  title: string;
  description: string;
  checks: Check[];
  urls?: { label: string; value: string }[];
  testable: boolean;
  docs?: string;
};

function env(name: string): string {
  return process.env[name]?.trim() ?? "";
}

function present(name: string, label?: string, optional = false): Check {
  return env(name)
    ? { label: label ?? name, level: "ok" }
    : { label: label ?? name, level: optional ? "warn" : "missing", detail: optional ? "اختياري" : "غير مضبوط" };
}

export function appUrl(): string {
  return (process.env.NEXTAUTH_URL || "http://localhost:3000").replace(/\/$/, "");
}

export async function getSetupSections(): Promise<SetupSection[]> {
  const base = appUrl();
  const settings = await getPlatformSettings();
  const rates = await superAdminDb.messageRate.findMany({ where: { country: { in: ["SA", "*"] } } });
  const hasRate = (category: string) => rates.some((r) => r.category === category);

  const httpsOk = base.startsWith("https://") && !base.includes("localhost");
  const worker = env("RUN_WORKER_IN_PROCESS") === "1";

  return [
    {
      key: "core",
      title: "المنصة الأساسية",
      description: "متطلبات تشغيل الإنتاج قبل أي ربط خارجي.",
      testable: true,
      checks: [
        { label: "NEXTAUTH_URL (رابط الموقع العام)", level: httpsOk ? "ok" : "missing", detail: httpsOk ? base : `${base} — يجب أن يكون https بدومين حقيقي` },
        present("NEXTAUTH_SECRET"),
        present("ENCRYPTION_KEY", "ENCRYPTION_KEY (تشفير مفاتيح القنوات)"),
        present("REDIS_URL", "REDIS_URL (الطوابير)"),
        { label: "RUN_WORKER_IN_PROCESS", level: worker ? "ok" : "warn", detail: worker ? "العامل يعمل داخل التطبيق" : "اضبطه 1 على Hostinger (لا عامل منفصل) وإلا لن تُرسل الحملات" },
        { label: "وضع التكاملات", level: settings.integrationsMode === "live" ? "ok" : "warn", detail: settings.integrationsMode === "live" ? "Live" : "Sandbox — حوّله إلى Live من إعدادات المنصة عند الإطلاق" },
      ],
    },
    {
      key: "email",
      title: "البريد الإلكتروني (SMTP)",
      description: "دعوات الفريق، استعادة كلمة المرور، إيصالات الشحن، تنبيهات الرصيد ودعوات النقل.",
      testable: false,
      checks: [
        { label: "EMAIL_PROVIDER", level: env("EMAIL_PROVIDER") === "smtp" ? "ok" : "missing", detail: env("EMAIL_PROVIDER") === "smtp" ? "smtp" : "اضبطه smtp" },
        present("SMTP_HOST"),
        present("SMTP_USER"),
        present("SMTP_PASS"),
        present("EMAIL_FROM", undefined, true),
      ],
      docs: "/admin/settings",
    },
    {
      key: "d360",
      title: "360dialog — واتساب الرسمي",
      description: "حساب Partner على hub.360dialog.com. بدونه زر ربط الرقم يعمل تجريبياً فقط.",
      testable: true,
      checks: [
        present("D360_PARTNER_ID"),
        present("D360_API_KEY", "D360_API_KEY (مفتاح Partner API)"),
        present("D360_WEBHOOK_SECRET", "D360_WEBHOOK_SECRET (توقيع webhooks الشريك)"),
      ],
      urls: [
        { label: "Redirect URL (Integrated Onboarding)", value: `${base}/api/integrations/d360/callback` },
        { label: "Partner Webhook URL", value: `${base}/api/webhooks/d360/partner` },
      ],
    },
    {
      key: "moyasar",
      title: "Moyasar — شحن المحافظ",
      description: "حساب تاجر على dashboard.moyasar.com. ابدأ بمفتاح sk_test_ ثم استبدله بـ sk_live_ بعد التفعيل.",
      testable: true,
      checks: [
        env("MOYASAR_SECRET_KEY")
          ? { label: "MOYASAR_SECRET_KEY", level: env("MOYASAR_SECRET_KEY").startsWith("sk_live_") ? "ok" : "warn", detail: env("MOYASAR_SECRET_KEY").startsWith("sk_live_") ? "مفتاح حقيقي" : "مفتاح اختبار — لا دفع حقيقي" }
          : { label: "MOYASAR_SECRET_KEY", level: "missing", detail: "غير مضبوط — زر الشحن معطّل" },
        present("MOYASAR_WEBHOOK_SECRET", "MOYASAR_WEBHOOK_SECRET (طبقة تحقق إضافية)", true),
      ],
      urls: [{ label: "Webhook URL (اختياري — يُرسل تلقائياً مع كل فاتورة)", value: `${base}/api/billing/wallet/moyasar/callback` }],
    },
    {
      key: "salla",
      title: "سلة — تطبيق المتجر",
      description: "تطبيق Partner على portal.salla.partners بالنمط السهل (Easy Mode). التفاصيل في docs/SALLA_APP_SETUP.md.",
      testable: false,
      checks: [
        present("SALLA_CLIENT_ID"),
        present("SALLA_CLIENT_SECRET"),
        present("SALLA_WEBHOOK_SECRET"),
        present("SALLA_APP_ID", "SALLA_APP_ID (رابط تثبيت التطبيق)"),
        present("SALLA_FUNCTIONS_SECRET", "SALLA_FUNCTIONS_SECRET (خطوات التثبيت)", true),
        present("SALLA_PLAN_MAP", "SALLA_PLAN_MAP (ربط باقات سلة بباقاتنا)", true),
      ],
      urls: [
        { label: "Webhook URL", value: `${base}/api/webhooks/salla` },
        { label: "App Page (Embedded)", value: `${base}/salla/app` },
        { label: "Onboarding Functions", value: `${base}/api/salla/onboarding` },
        { label: "Communication (WhatsApp)", value: `${base}/api/salla/communication` },
      ],
    },
    {
      key: "pricing",
      title: "تسعير الرسائل والمحافظ",
      description: "أسعار Meta الرسمية للسعودية (أو سعر افتراضي *) لكل فئة — بدونها تُرفض رسائل القوالب على 360dialog.",
      testable: false,
      checks: [
        { label: "سعر رسائل MARKETING", level: hasRate("MARKETING") ? "ok" : "missing" },
        { label: "سعر رسائل UTILITY", level: hasRate("UTILITY") ? "ok" : "missing" },
        { label: "سعر رسائل AUTHENTICATION", level: hasRate("AUTHENTICATION") ? "ok" : "missing" },
        { label: "هامش الربح", level: "ok", detail: `${(settings.walletMarkupBps / 100).toFixed(1)}%` },
        { label: "أقل مبلغ شحن", level: "ok", detail: `${settings.walletMinRechargeSar} ر.س` },
      ],
      docs: "/admin/messaging",
    },
  ];
}

