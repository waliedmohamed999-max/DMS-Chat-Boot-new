import { superAdminDb } from "@/lib/db";
import { getPlatformSettings } from "@/lib/platformSettings";
import { getSallaConfig } from "@/lib/integrations/salla/config";
import { getZidConfig } from "@/lib/integrations/zid/config";
import { getPlatformSecrets, type SecretSource } from "@/lib/platformSecrets";

/**
 * جاهزية الحسابات الخارجية للإطلاق الحقيقي (صفحة /admin/setup): ما المضبوط في البيئة، وما الروابط التي
 * تُلصق في لوحات المزوّدين. لا تُعرض أي قيمة سرية — فقط هل هي موجودة. اختبار الاتصال الفعلي بزر منفصل.
 */

export type CheckLevel = "ok" | "warn" | "missing";
export type Check = { label: string; level: CheckLevel; detail?: string };
export type SetupSection = {
  key: "core" | "email" | "d360" | "moyasar" | "ai" | "salla" | "zid" | "pricing";
  title: string;
  description: string;
  checks: Check[];
  urls?: { label: string; value: string }[];
  testable: boolean;
  docs?: string;
};

function sallaCheck(label: string, source: "admin" | "env" | "none", optional = false): Check {
  if (source === "none") return { label, level: optional ? "warn" : "missing", detail: optional ? "اختياري — غير مضبوط" : "غير مضبوط" };
  return { label, level: "ok", detail: source === "admin" ? "من لوحة الأدمن" : "من متغيرات البيئة" };
}

function sourceCheck(label: string, source: SecretSource, optional = false): Check {
  return sallaCheck(label, source, optional);
}

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
  const salla = await getSallaConfig();
  const zid = await getZidConfig();
  const secrets = await getPlatformSecrets();
  const rates = await superAdminDb.messageRate.findMany({ where: { country: { in: ["SA", "*"] } } });
  const hasRate = (category: string) => rates.some((r) => r.category === category);

  const httpsOk = base.startsWith("https://") && !base.includes("localhost");
  const worker = env("RUN_WORKER_IN_PROCESS") !== "0";
  const moyasarKey = secrets.MOYASAR_SECRET_KEY ?? "";

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
        { label: "عامل الخلفية (الحملات والرسائل التلقائية)", level: worker ? "ok" : "warn", detail: worker ? "يعمل داخل التطبيق تلقائياً" : "معطّل (RUN_WORKER_IN_PROCESS=0) — يلزم تشغيل npm run worker منفصلاً" },
        { label: "وضع التكاملات", level: settings.integrationsMode === "live" ? "ok" : "warn", detail: settings.integrationsMode === "live" ? "Live" : "Sandbox — حوّله إلى Live من إعدادات المنصة عند الإطلاق" },
      ],
    },
    {
      key: "email",
      title: "البريد الإلكتروني (SMTP)",
      description: "دعوات الفريق، استعادة كلمة المرور، الإيصالات والتنبيهات — يُضبط من النموذج أدناه.",
      testable: true,
      checks: [
        { label: "مزوّد البريد", level: secrets.EMAIL_PROVIDER === "smtp" ? "ok" : "missing", detail: secrets.EMAIL_PROVIDER === "smtp" ? "SMTP" : "الرسائل تُطبع في السجل فقط — اختر SMTP" },
        sourceCheck("خادم SMTP", secrets.sources.SMTP_HOST),
        sourceCheck("اسم المستخدم", secrets.sources.SMTP_USER),
        sourceCheck("كلمة المرور", secrets.sources.SMTP_PASS),
        sourceCheck("المُرسِل (From)", secrets.sources.EMAIL_FROM, true),
      ],
    },
    {
      key: "d360",
      title: "360dialog — واتساب الرسمي",
      description: "حساب Partner على hub.360dialog.com — يُضبط من النموذج أدناه. بدونه زر ربط الرقم يعمل تجريبياً فقط.",
      testable: true,
      checks: [
        sourceCheck("Partner ID", secrets.sources.D360_PARTNER_ID),
        sourceCheck("مفتاح Partner API", secrets.sources.D360_API_KEY),
        sourceCheck("سر توقيع webhooks الشريك", secrets.sources.D360_WEBHOOK_SECRET),
      ],
      urls: [
        { label: "Redirect URL (Integrated Onboarding)", value: `${base}/api/integrations/d360/callback` },
        { label: "Partner Webhook URL", value: `${base}/api/webhooks/d360/partner` },
      ],
    },
    {
      key: "moyasar",
      title: "Moyasar — شحن المحافظ",
      description: "حساب تاجر على dashboard.moyasar.com — لشحن المحافظ ودفع اشتراكات الباقات. ابدأ بمفتاح sk_test_ ثم sk_live_.",
      testable: true,
      checks: [
        moyasarKey
          ? { label: "المفتاح السري", level: moyasarKey.startsWith("sk_live_") ? "ok" : "warn", detail: moyasarKey.startsWith("sk_live_") ? "مفتاح حقيقي" : "مفتاح اختبار — لا دفع حقيقي" }
          : { label: "المفتاح السري", level: "missing", detail: "غير مضبوط — الشحن والاشتراكات المدفوعة معطّلة" },
        sourceCheck("سر الإشعارات (طبقة تحقق إضافية)", secrets.sources.MOYASAR_WEBHOOK_SECRET, true),
      ],
      urls: [{ label: "Webhook URL (اختياري — يُرسل تلقائياً مع كل فاتورة)", value: `${base}/api/billing/wallet/moyasar/callback` }],
    },
    {
      key: "ai",
      title: "الذكاء الاصطناعي (OpenAI)",
      description: "الموظف الذكي، تفريغ الرسائل الصوتية، وشات الموقع — المفتاح يُضبط من إعدادات المنصة العامة.",
      testable: false,
      checks: [
        settings.openAiApiKey ? { label: "مفتاح OpenAI", level: "ok", detail: `النموذج: ${settings.aiModel}` } : { label: "مفتاح OpenAI", level: "missing", detail: "غير مضبوط — الردود الذكية والتفريغ الصوتي معطّلة" },
      ],
      docs: "/admin/settings",
    },
    {
      key: "salla",
      title: "سلة — تطبيق المتجر",
      description: "تطبيق Partner على salla.partners بالنمط السهل (Easy Mode) — المفاتيح تُضبط من صفحة \"تطبيق سلة\" في هذه اللوحة.",
      testable: false,
      checks: [
        sallaCheck("رقم التطبيق (App ID)", salla.sources.appId),
        sallaCheck("Client ID", salla.sources.clientId),
        sallaCheck("Client Secret", salla.sources.clientSecret),
        sallaCheck("Webhook Secret", salla.sources.webhookSecret),
        sallaCheck("سر دوال خطوات التثبيت", salla.sources.functionsSecret, true),
        sallaCheck("ربط باقات سلة بباقات DMS", salla.sources.planMap, true),
      ],
      urls: [
        { label: "Webhook URL", value: `${base}/api/webhooks/salla` },
        { label: "App Page (Embedded)", value: `${base}/salla/app` },
        { label: "Onboarding Functions", value: `${base}/api/salla/onboarding` },
        { label: "Communication (WhatsApp)", value: `${base}/api/salla/communication` },
      ],
      docs: "/admin/salla",
    },
    {
      key: "zid",
      title: "زد — تطبيق المتجر",
      description: "تطبيق Partner على partner.zid.sa (OAuth) — المفاتيح تُضبط من صفحة \"تطبيق زد\" في هذه اللوحة.",
      testable: false,
      checks: [
        sallaCheck("Client ID", zid.sources.clientId),
        sallaCheck("Client Secret", zid.sources.clientSecret),
        sallaCheck("سر أحداث متجر التطبيقات (X-DMS-Zid-Token)", zid.sources.marketSecret),
        sallaCheck("رقم التطبيق (App ID)", zid.sources.appId, true),
        sallaCheck("ربط باقات زد بباقات DMS", zid.sources.planMap, true),
      ],
      urls: [
        { label: "Application URL", value: `${base}/api/zid/install` },
        { label: "Redirect URL", value: `${base}/api/zid/oauth/callback` },
        { label: "App Market Webhooks", value: `${base}/api/webhooks/zid/market` },
      ],
      docs: "/admin/zid",
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

