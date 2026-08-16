import { PrismaClient } from "@prisma/client";
import { withTenant, superAdminDb } from "../src/lib/db";

// db هنا يستخدم فقط لعمليات "الإعداد" التي تحتاج رؤية عابرة للمستأجرين (BYPASSRLS)
// لجلب بيانات ثابتة معروفة قبل تنفيذ الاختبار الفعلي عبر withTenant(). الاختبار نفسه
// لا يعتمد أبداً على db مباشرة.
const db = superAdminDb;

async function main() {
  const [tenantA, tenantB] = await Promise.all([
    db.tenant.findUniqueOrThrow({ where: { slug: "tenant-a" } }),
    db.tenant.findUniqueOrThrow({ where: { slug: "tenant-b" } }),
  ]);

  let failures = 0;

  console.log("🔒 اختبار عزل المستأجرين (Row Level Security فعلي على Postgres)\n");

  // اختبار 1: withTenant(A) يجب ألا يرى أي صف من Tenant B عبر contact.findMany بدون شرط tenantId إضافي
  await withTenant(tenantA.id, async (tx) => {
    const contacts = await tx.contact.findMany();
    const leaked = contacts.filter((c) => c.tenantId !== tenantA.id);
    console.log(`  Tenant A رأى ${contacts.length} جهة اتصال، منها ${leaked.length} مسربة من مستأجر آخر`);
    if (leaked.length > 0) failures++;
  });

  // اختبار 2: نفس الشيء لـ Tenant B
  await withTenant(tenantB.id, async (tx) => {
    const contacts = await tx.contact.findMany();
    const leaked = contacts.filter((c) => c.tenantId !== tenantB.id);
    console.log(`  Tenant B رأى ${contacts.length} جهة اتصال، منها ${leaked.length} مسربة من مستأجر آخر`);
    if (leaked.length > 0) failures++;
  });

  // اختبار 3: محاولة تجاوز متعمدة - Tenant A يحاول قراءة صف بعينه من Tenant B عبر findUnique بالمعرف مباشرة
  const tenantBContact = await db.contact.findFirst({ where: { tenantId: tenantB.id } });
  if (tenantBContact) {
    await withTenant(tenantA.id, async (tx) => {
      const attempt = await tx.contact.findUnique({ where: { id: tenantBContact.id } });
      console.log(
        `  محاولة Tenant A قراءة جهة اتصال تخص Tenant B بالمعرف المباشر: ${
          attempt ? "❌ نجحت (تسريب!)" : "✅ رُفضت (RLS يعمل)"
        }`
      );
      if (attempt) failures++;
    });
  }

  // اختبار 4: محاولة كتابة (INSERT) بـ tenantId مزوّر من داخل جلسة Tenant A
  await withTenant(tenantA.id, async (tx) => {
    try {
      await tx.tag.create({
        data: { tenantId: tenantB.id, name: `spoof-${Date.now()}`, color: "#000000" },
      });
      console.log("  محاولة إدخال صف بـ tenantId مزوّر (Tenant B) من جلسة Tenant A: ❌ نجحت (خطر أمني!)");
      failures++;
    } catch {
      console.log("  محاولة إدخال صف بـ tenantId مزوّر (Tenant B) من جلسة Tenant A: ✅ رُفضت (RLS WITH CHECK يعمل)");
    }
  });

  console.log(`\n${failures === 0 ? "✅ كل اختبارات العزل نجحت — لا يوجد أي تسريب بين المستأجرين." : `❌ فشل ${failures} اختبار/اختبارات — يجب المعالجة فوراً قبل الإطلاق.`}`);
  process.exit(failures === 0 ? 0 : 1);
}

main().finally(() => db.$disconnect());
