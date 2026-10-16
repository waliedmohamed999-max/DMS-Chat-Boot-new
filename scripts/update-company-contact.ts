import { rawDb } from "../src/lib/db";
import { COMPANY_CONTACT } from "../src/lib/companyContact";
async function main() {
  const result = await rawDb.platformSettings.upsert({
    where: { id: "singleton" },
    update: { supportEmail: COMPANY_CONTACT.email, supportPhone: COMPANY_CONTACT.phone },
    create: { id: "singleton", supportEmail: COMPANY_CONTACT.email, supportPhone: COMPANY_CONTACT.phone },
    select: { supportEmail: true, supportPhone: true },
  });
  const content = await rawDb.siteContent.findUnique({ where: { id: "singleton" }, select: { contactBody: true } });
  if (content?.contactBody.includes("ساعتين")) await rawDb.siteContent.update({ where: { id: "singleton" }, data: { contactBody: "تواصل مع فريق DMS Tech عبر النموذج أو واتساب أو البريد الإلكتروني للاستفسار عن الأداة أو طلب الدعم." } });
  console.log("Company support settings updated:", result);
}
main().catch(error => { console.error(error.message); process.exitCode = 1; }).finally(() => rawDb.$disconnect());
