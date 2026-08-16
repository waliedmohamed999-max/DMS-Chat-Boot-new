/** يحوّل اسماً حراً (عربي أو إنجليزي) لمعرّف مساحة عمل (slug) صالح — مشترك بين تسجيل التاجر الذاتي
 * ونظام موافقة طلبات الشركاء، كلاهما ينشئ Tenant جديداً بنفس القيد (slug فريد). */
export function slugify(input: string): string {
  return (
    input
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9؀-ۿ\s-]/g, "")
      .replace(/\s+/g, "-")
      .slice(0, 40) || `store-${Date.now()}`
  );
}
