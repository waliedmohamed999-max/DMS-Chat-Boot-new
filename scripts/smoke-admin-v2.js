// اختبار دخان للميزات الجديدة: إدارة الباقات الكاملة (CRUD)، تبويبات بيانات التاجر الشاملة،
// موافقة قوالب الرسائل، وإعدادات المنصة العامة (وضع الصيانة).
const { chromium } = require("playwright");
const path = require("path");

const BASE = process.env.SMOKE_BASE_URL ?? "http://localhost:3000";
const shotsDir = path.join(__dirname, "..", ".smoke-shots");

async function login(page, email, password) {
  await page.goto(`${BASE}/login`);
  await page.waitForSelector('input[type="email"]');
  await page.fill('input[type="email"]', email);
  await page.fill('input[type="password"]', password);
  await page.click('button[type="submit"]');
}

(async () => {
  require("fs").mkdirSync(shotsDir, { recursive: true });
  const browser = await chromium.launch();
  const errors = [];

  async function newPage() {
    const page = await browser.newPage();
    page.on("pageerror", (e) => errors.push(e.message));
    page.on("console", (m) => m.type() === "error" && errors.push(m.text()));
    return page;
  }

  // ===== 1) إنشاء باقة جديدة بالكامل (CRUD) =====
  const p1 = await newPage();
  await login(p1, "admin@platform.sa", "Demo@12345");
  await p1.waitForURL(`${BASE}/admin`, { timeout: 15000 });
  await p1.goto(`${BASE}/admin/plans`);
  await p1.waitForSelector("text=إنشاء باقة جديدة");
  const planName = `باقة اختبار ${Date.now()}`;
  await p1.fill('input[name="name"]', planName);
  await p1.fill('input[name="priceMonthlySar"]', "777");
  await p1.fill('input[name="maxUsers"]', "5");
  await p1.fill('input[name="maxWhatsappNumbers"]', "2");
  await p1.fill('input[name="maxMessagesPerMonth"]', "5000");
  await p1.fill('textarea[name="features"]', "ميزة تجريبية أولى\nميزة تجريبية ثانية");
  await p1.click('button:has-text("إنشاء الباقة")');
  await p1.waitForTimeout(1000);
  const newPlanVisible = await p1.locator(`h2:has-text("${planName}")`).count();
  console.log("1) الباقة الجديدة ظاهرة فعلياً بعد الإنشاء:", newPlanVisible > 0);
  await p1.screenshot({ path: `${shotsDir}/adminv2-01-plan-created.png` });

  // تعطيل الباقة الجديدة والتأكد أن الشارة تتغير
  const newPlanCard = p1.locator(".card").filter({ has: p1.locator("h2", { hasText: planName }) });
  await newPlanCard.locator('button:has-text("نشطة")').click();
  await p1.waitForTimeout(600);
  const deactivatedBadge = await newPlanCard.locator('button:has-text("معطّلة")').count();
  console.log("1) تعطيل الباقة يعكس الحالة فعلياً:", deactivatedBadge > 0);
  await p1.close();

  // ===== 2) تبويبات بيانات التاجر الشاملة =====
  const p2 = await newPage();
  await login(p2, "admin@platform.sa", "Demo@12345");
  await p2.waitForURL(`${BASE}/admin`, { timeout: 15000 });
  await p2.goto(`${BASE}/admin/tenants?q=tenant-a`);
  await p2.waitForSelector("text=التجار المشتركون");
  await p2.click('a:has-text("متجر الأناقة للعطور")');
  await p2.waitForURL(/\/admin\/tenants\/[a-z0-9]+$/, { timeout: 15000 });
  const tenantUrl = new URL(p2.url());
  const tenantDetailBase = tenantUrl.pathname; // /admin/tenants/{id}

  const tabs = [
    { path: "/team", expect: "فريق" },
    { path: "/contacts", expect: "الجوال" },
    { path: "/campaigns", expect: "اسم الحملة" },
    { path: "/chatbot", expect: "خطوة" },
    { path: "/templates", expect: "ملاحظات" },
    { path: "/orders", expect: "الطلبات" },
  ];
  for (const tab of tabs) {
    await p2.goto(`${BASE}${tenantDetailBase}${tab.path}`, { waitUntil: "networkidle" });
    let ok = true;
    if (tab.expect) {
      try {
        await p2.waitForSelector(`text=${tab.expect}`, { timeout: 5000 });
      } catch {
        ok = false;
      }
    }
    console.log(`2) تبويب ${tab.path} يعرض محتوى حقيقياً:`, ok);
  }
  await p2.screenshot({ path: `${shotsDir}/adminv2-02-tenant-orders-tab.png` });
  await p2.close();

  // ===== 3) موافقة قوالب الرسائل (Meta Templates) =====
  const p3 = await newPage();
  await login(p3, "owner@tenant-a.sa", "Demo@12345");
  await p3.waitForURL(`${BASE}/dashboard`, { timeout: 15000 });
  await p3.goto(`${BASE}/dashboard/templates`);
  await p3.waitForSelector("text=قوالب الرسائل");
  const templateName = `smoke_template_${Date.now()}`;
  await p3.fill('input[name="name"]', templateName);
  await p3.fill('textarea[name="bodyText"]', "مرحباً {{1}}، هذا اختبار قالب رسالة جديد للمراجعة.");
  await p3.click('button:has-text("تقديم للمراجعة")');
  await p3.waitForTimeout(800);
  const pendingBadge = await p3.locator(`tr:has-text("${templateName}")`).locator("text=بانتظار موافقة Meta").count();
  console.log("3) القالب الجديد يظهر بحالة 'بانتظار موافقة Meta' فور التقديم:", pendingBadge > 0);
  await p3.screenshot({ path: `${shotsDir}/adminv2-03-template-pending.png` });
  await p3.close();

  const p3b = await newPage();
  await login(p3b, "admin@platform.sa", "Demo@12345");
  await p3b.waitForURL(`${BASE}/admin`, { timeout: 15000 });
  await p3b.goto(`${BASE}/admin/approvals`);
  await p3b.waitForSelector("text=مركز الموافقات");
  const templateRequestVisible = await p3b.locator(`text=${templateName}`).count();
  console.log("3) طلب القالب ظاهر في مركز الموافقات:", templateRequestVisible > 0);
  const templateCard = p3b.locator(".card").filter({ hasText: templateName });
  await templateCard.locator('button:has-text("قبول وتفعيل")').click();
  await p3b.waitForTimeout(800);
  await p3b.screenshot({ path: `${shotsDir}/adminv2-04-template-approved-in-center.png` });
  await p3b.close();

  const p3c = await newPage();
  await login(p3c, "owner@tenant-a.sa", "Demo@12345");
  await p3c.waitForURL(`${BASE}/dashboard`, { timeout: 15000 });
  await p3c.goto(`${BASE}/dashboard/templates`);
  await p3c.waitForTimeout(500);
  const approvedBadge = await p3c.locator(`tr:has-text("${templateName}")`).locator("text=معتمد").count();
  console.log("3) القالب أصبح 'معتمد' فعلياً في لوحة التاجر بعد موافقة مالك المنصة:", approvedBadge > 0);
  await p3c.screenshot({ path: `${shotsDir}/adminv2-05-template-approved-tenant-side.png` });
  await p3c.close();

  // ===== 4) إعدادات المنصة العامة: وضع الصيانة =====
  const p4 = await newPage();
  await login(p4, "admin@platform.sa", "Demo@12345");
  await p4.waitForURL(`${BASE}/admin`, { timeout: 15000 });
  await p4.goto(`${BASE}/admin/settings`);
  await p4.waitForSelector("text=إعدادات المنصة العامة");
  await p4.check('input[name="maintenanceMode"]');
  await p4.fill('textarea[name="maintenanceMessage"]', "صيانة اختبارية فورية");
  await p4.click('button:has-text("حفظ الإعدادات")');
  await p4.waitForTimeout(600);
  await p4.close();

  const p4b = await newPage();
  await login(p4b, "owner@tenant-a.sa", "Demo@12345");
  await p4b.waitForTimeout(1000);
  const maintenanceScreenVisible = await p4b.locator("text=المنصة تحت الصيانة حالياً").count();
  console.log("4) وضع الصيانة يمنع التاجر فعلياً فور تفعيله:", maintenanceScreenVisible > 0);
  await p4b.screenshot({ path: `${shotsDir}/adminv2-06-maintenance-mode-blocks-tenant.png` });
  await p4b.close();

  // إيقاف وضع الصيانة لاستعادة حالة العرض التجريبي
  const p4c = await newPage();
  await login(p4c, "admin@platform.sa", "Demo@12345");
  await p4c.waitForURL(`${BASE}/admin`, { timeout: 15000 });
  await p4c.goto(`${BASE}/admin/settings`);
  await p4c.uncheck('input[name="maintenanceMode"]');
  await p4c.click('button:has-text("حفظ الإعدادات")');
  await p4c.waitForTimeout(500);
  console.log("4) تم إيقاف وضع الصيانة لاستعادة حالة العرض التجريبي");
  await p4c.close();

  const p4d = await newPage();
  await login(p4d, "owner@tenant-a.sa", "Demo@12345");
  await p4d.waitForURL(`${BASE}/dashboard`, { timeout: 15000 });
  const dashboardRestored = await p4d.locator("text=نظرة عامة").count();
  console.log("4) الوصول الطبيعي عاد فعلياً بعد إيقاف الصيانة:", dashboardRestored > 0);
  await p4d.close();

  console.log("\nERRORS:", JSON.stringify(errors));
  await browser.close();
})().catch((e) => {
  console.error("ADMIN V2 SMOKE TEST FAILED:", e);
  process.exit(1);
});
