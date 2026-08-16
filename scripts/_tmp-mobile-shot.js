const { chromium } = require("playwright");
const path = require("path");
const OUT = process.argv[2] || ".";

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
  await page.goto("http://localhost:3000/", { waitUntil: "networkidle" });

  const sections = await page.locator("section").all();
  console.log("Total sections:", sections.length);
  for (let i = 0; i < sections.length; i++) {
    await sections[i].scrollIntoViewIfNeeded();
    await page.waitForTimeout(400);
    await sections[i].screenshot({ path: path.join(OUT, `mobile-section-${i}.png`) });
    console.log(`saved mobile-section-${i}.png`);
  }

  // Navbar separately
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.waitForTimeout(300);
  const header = page.locator("header").first();
  if (await header.count()) {
    await header.screenshot({ path: path.join(OUT, "mobile-header.png") });
    console.log("saved mobile-header.png");
    // open mobile menu
    await page.locator('button[aria-label="القائمة"]').click();
    await page.waitForTimeout(300);
    await page.screenshot({ path: path.join(OUT, "mobile-menu-open.png") });
    console.log("saved mobile-menu-open.png");
  }

  await browser.close();
})().catch((e) => { console.error(e); process.exit(1); });
