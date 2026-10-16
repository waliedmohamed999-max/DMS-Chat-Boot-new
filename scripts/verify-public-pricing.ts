import assert from "node:assert/strict";
import { executeAiPlatformTool } from "../src/lib/ai/platformTools";
import { getDemoReply } from "../src/lib/ai/demoReplyEngine";
import { getMarketingPlans } from "../src/lib/marketingPlans";
import { rawDb, superAdminDb } from "../src/lib/db";

async function main() {
  const before = await getMarketingPlans();
  assert.ok(before.length > 0);
  const baseline = await superAdminDb.plan.findMany({ orderBy: { id: "asc" } });
  const rollback = new Error("verification rollback");
  try {
  await superAdminDb.$transaction(async tx => {
  const lookup = async (args: object) => JSON.parse(await executeAiPlatformTool(tx, "get_plan_price", JSON.stringify(args)));
  const all = await lookup({});
  assert.deepEqual(all.plans.map((p: { priceMonthlySarPerMonth: number }) => p.priceMonthlySarPerMonth), before.map(p => p.monthlySar));
  assert.deepEqual(all.plans.map((p: { priceAnnualSar: number }) => p.priceAnnualSar), before.map(p => p.annualSar));
  const selected = await lookup({ planName: "wa-pro" });
  assert.equal(selected.plans.length, 1);
  assert.equal(selected.plans[0].orderUrl, "https://dmstech.sa/offers/wa-pro");
  assert.equal((await lookup({ planName: "missing" })).found, false);
  assert.equal(all.vatIncluded, false);
  const key = before[0]!.key;
  await tx.marketingPlan.update({ where: { key }, data: { monthlySar: 713, annualSar: 7013 } });
  assert.equal((await getMarketingPlans(tx)).find(p => p.key === key)?.monthlySar, 713);
  const updated = await lookup({ planName: key });
  assert.equal(updated.plans[0].priceMonthlySarPerMonth, 713);
  assert.equal(updated.plans[0].priceAnnualSar, 7013);
  const reply = await getDemoReply(tx, "أسعار");
  assert.ok(reply.includes("713") && reply.includes("7013"));
  await tx.marketingPlan.update({ where: { key }, data: { isActive: false } });
  assert.ok(!(await getMarketingPlans(tx)).some(p => p.key === key));
  assert.equal((await lookup({ planName: key })).found, false);
  await tx.marketingPlan.updateMany({ data: { isActive: false } });
  assert.deepEqual(await getMarketingPlans(tx), []);
  assert.equal((await lookup({})).found, false);
  throw rollback;
  });
  } catch (error) { if (error !== rollback) throw error; }
  assert.deepEqual(await getMarketingPlans(), before);
  assert.deepEqual(await superAdminDb.plan.findMany({ orderBy: { id: "asc" } }), baseline);
  console.log("Passed: live monthly/annual prices, assistant replies, hidden/empty catalogue, rollback and existing tenant contracts.");
}
main().catch(error => { console.error(error); process.exitCode = 1; }).finally(async () => { await Promise.all([rawDb.$disconnect(), superAdminDb.$disconnect()]); });
