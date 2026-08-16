const { chromium } = require("playwright");
const path = require("path");

const BASE = process.env.SMOKE_BASE_URL ?? "http://localhost:3000";
const shotsDir = path.join(__dirname, "..", ".smoke-shots");

(async () => {
  require("fs").mkdirSync(shotsDir, { recursive: true });
  const browser = await chromium.launch();
  const page = await browser.newPage();
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  page.on("console", (m) => m.type() === "error" && errors.push(m.text()));

  await page.goto(`${BASE}/register`);
  await page.waitForSelector('input[name="storeName"]');
  const email = `smoke-owner-${Date.now()}@example.com`;
  await page.fill('input[name="storeName"]', "متجر التسجيل التجريبي");
  await page.fill('input[name="ownerName"]', "مالك تجريبي");
  await page.fill('input[name="email"]', email);
  await page.fill('input[name="password"]', "Passw0rd123");
  await page.click('label:has-text("النمو")');
  await page.click('button:has-text("إنشاء الحساب")');
  await page.waitForURL(/\/login/, { timeout: 15000 });
  await page.screenshot({ path: `${shotsDir}/register-01-after-submit.png`, fullPage: true });
  console.log("REGISTERED:", email, "-> redirected to", page.url());

  // فوراً بعد ذلك، سجّل الدخول بالحساب الجديد للتأكد أن التسجيل أنشأ حساباً صالحاً فعلياً
  await page.fill('input[type="email"]', email);
  await page.fill('input[type="password"]', "Passw0rd123");
  await page.click('button[type="submit"]');
  await page.waitForURL(`${BASE}/dashboard`, { timeout: 15000 });
  await page.screenshot({ path: `${shotsDir}/register-02-new-tenant-dashboard.png`, fullPage: true });
  console.log("LOGIN AFTER REGISTER: OK, landed on", page.url());

  console.log("ERRORS:", JSON.stringify(errors));
  await browser.close();
})().catch((e) => {
  console.error("FAILED:", e);
  process.exit(1);
});
