const { chromium } = require("playwright");
const path = require("path");
const OUT = process.argv[2] || ".";

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
  await page.goto("http://localhost:3000/", { waitUntil: "networkidle" });

  // Stats section
  const statsSection = page.locator("section", { has: page.locator("text=تاجر نشط") });
  await statsSection.scrollIntoViewIfNeeded();
  await page.waitForTimeout(500);
  await statsSection.screenshot({ path: path.join(OUT, "mobile-stats-fixed.png") });
  console.log("saved mobile-stats-fixed.png");

  // Mobile menu open, full viewport
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.waitForTimeout(300);
  await page.locator('button[aria-label="القائمة"]').click();
  await page.waitForTimeout(400);
  await page.screenshot({ path: path.join(OUT, "mobile-menu-fixed.png") });
  console.log("saved mobile-menu-fixed.png");

  // measure header height for accuracy check
  const headerBox = await page.locator("header > div").first().boundingBox();
  console.log("header inner box:", headerBox);

  await browser.close();
})().catch((e) => { console.error(e); process.exit(1); });
