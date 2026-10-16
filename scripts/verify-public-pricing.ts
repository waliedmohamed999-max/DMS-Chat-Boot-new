import assert from "node:assert/strict";
import { executeAiPlatformTool } from "../src/lib/ai/platformTools";

async function main() {
  // Public catalogue lookup must work without accessing tenant subscription records.
  const tx = new Proxy({}, { get() { throw new Error("Unexpected database access"); } }) as never;
  const lookup = async (args: object) => JSON.parse(await executeAiPlatformTool(tx, "get_plan_price", JSON.stringify(args)));
  const all = await lookup({});
  assert.deepEqual(all.plans.map((p: { priceMonthlySarPerMonth: number }) => p.priceMonthlySarPerMonth), [599, 1299, 2999]);
  assert.deepEqual(all.plans.map((p: { priceAnnualSar: number }) => p.priceAnnualSar), [5990, 12990, 29990]);
  const selected = await lookup({ planName: "wa-pro" });
  assert.equal(selected.plans.length, 1);
  assert.equal(selected.plans[0].orderUrl, "https://dmstech.sa/offers/wa-pro");
  assert.equal((await lookup({ planName: "missing" })).found, false);
  assert.equal(all.vatIncluded, false);
  assert.equal(all.plans[2].startingFrom, true);
  console.log("Public catalogue: monthly/annual prices, plan lookup, canonical ordering and database isolation passed.");
}
main().catch(error => { console.error(error); process.exitCode = 1; });
