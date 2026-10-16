import { superAdminDb } from "@/lib/db";
import { saveMarketingPlan } from "./actions";

export async function MarketingPlans() {
  const plans = await superAdminDb.marketingPlan.findMany({ orderBy: [{ monthlySar: "asc" }, { key: "asc" }] });
  return (
    <section className="space-y-4">
      <div>
        <h2 className="text-lg font-bold text-white">باقات الموقع — واتساب للأعمال</h2>
        <p className="text-sm text-slate-400">تظهر في الرئيسية وصفحة الأسعار وردود المساعد. تعديلها يُحدّث الموقع مباشرة. اشتراكات العملاء الحالية تُدار في القسم التالي.</p>
      </div>
      <div className="grid gap-4 xl:grid-cols-3">
        {plans.map(plan => (
          <form key={plan.id} action={saveMarketingPlan.bind(null, plan.id)} className="card space-y-3 p-5">
            <div className="flex items-center justify-between gap-3"><h3 className="font-bold text-white">{plan.name}</h3><span className="text-xs text-slate-400" dir="ltr">{plan.key}</span></div>
            <label className="block text-sm text-slate-300">اسم الباقة<input name="name" defaultValue={plan.name} required className="input-field mt-1" /></label>
            <div className="grid grid-cols-2 gap-3">
              <label className="block text-sm text-slate-300">الشهري (ر.س)<input name="monthlySar" type="number" min={0} step={1} defaultValue={plan.monthlySar} required dir="ltr" className="input-field mt-1" /></label>
              <label className="block text-sm text-slate-300">السنوي (ر.س)<input name="annualSar" type="number" min={0} step={1} defaultValue={plan.annualSar} required dir="ltr" className="input-field mt-1" /></label>
            </div>
            <label className="block text-sm text-slate-300">وصف مختصر<input name="summary" defaultValue={plan.summary} required className="input-field mt-1" /></label>
            <label className="block text-sm text-slate-300">مناسبة لـ<input name="audience" defaultValue={plan.audience} required className="input-field mt-1" /></label>
            <label className="block text-sm text-slate-300">مدة التنفيذ<input name="delivery" defaultValue={plan.delivery} required className="input-field mt-1" /></label>
            <label className="block text-sm text-slate-300">المزايا — سطر لكل ميزة<textarea name="features" rows={7} defaultValue={lines(plan.features)} required className="input-field mt-1" /></label>
            <label className="block text-sm text-slate-300">غير مشمول — سطر لكل بند<textarea name="exclusions" rows={3} defaultValue={lines(plan.exclusions)} className="input-field mt-1" /></label>
            <div className="flex flex-wrap gap-4 text-xs text-slate-300">
              <label className="flex items-center gap-2"><input type="checkbox" name="isActive" defaultChecked={plan.isActive} />ظاهرة بالموقع</label>
              <label className="flex items-center gap-2"><input type="checkbox" name="popular" defaultChecked={plan.popular} />الباقة المقترحة</label>
              <label className="flex items-center gap-2"><input type="checkbox" name="startingFrom" defaultChecked={plan.startingFrom} />السعر يبدأ من</label>
            </div>
            <button type="submit" className="btn-primary w-full">حفظ وتحديث الموقع</button>
          </form>
        ))}
      </div>
    </section>
  );
}

function lines(value: unknown) {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string").join("\n") : "";
}
