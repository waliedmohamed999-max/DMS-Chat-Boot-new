// اختبار دخان مخصص لوحدة الشات بوت: بوابات الباقة، بوابات الأدوار، وشرط "اختبار قبل النشر".
const { chromium } = require("playwright");
const path = require("path");

const BASE = process.env.SMOKE_BASE_URL ?? "http://localhost:3000";
const shotsDir = path.join(__dirname, "..", ".smoke-shots");

async function login(page, email, password) {
  await page.goto(`${BASE}/login`);
  await page.fill('input[type="email"]', email);
  await page.fill('input[type="password"]', password);
  await page.click('button[type="submit"]');
  await page.waitForURL(/\/dashboard|\/admin/, { timeout: 15000 });
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

  // ===== 1) Starter tenant (tenant-b): FAQ template must be locked =====
  const pageB2 = await newPage();
  await login(pageB2, "owner@tenant-b.sa", "Demo@12345");
  await pageB2.goto(`${BASE}/dashboard/chatbot/new`);
  await pageB2.waitForSelector("text=اختر قالباً جاهزاً");
  const faqCardLocked = await pageB2.locator("text=الرد على الأسئلة الشائعة").locator("..").locator("text=🔒 يتطلب ترقية").count();
  console.log("STARTER: FAQ template shows locked button:", faqCardLocked > 0);
  await pageB2.click("text=🔒 يتطلب ترقية");
  await pageB2.waitForSelector("text=ترقية الباقة الآن");
  await pageB2.screenshot({ path: `${shotsDir}/chatbot-01-starter-locked-template-modal.png` });
  await pageB2.click('button:has-text("لاحقاً")');

  // Create a blank flow (basic tier, always available) and check locked node types
  await pageB2.waitForSelector("text=تدفق فارغ");
  await pageB2.locator(".card").filter({ hasText: "تدفق فارغ (للمستخدمين المتقدمين)" }).locator('button:has-text("استخدام هذا القالب")').click();
  await pageB2.waitForURL(/\/dashboard\/chatbot\/(?!new)[a-z0-9]+$/, { timeout: 15000 });
  await pageB2.waitForSelector("text=لوحة رسم التدفق");
  const aiReplyLocked = await pageB2.locator('button:has-text("رد ذكي")').first().innerText();
  console.log("STARTER: ai_reply button label (should show 🔒):", aiReplyLocked);
  await pageB2.click('button:has-text("رد ذكي")');
  await pageB2.waitForSelector("text=ترقية الباقة الآن");
  await pageB2.screenshot({ path: `${shotsDir}/chatbot-02-starter-locked-node-modal.png` });
  await pageB2.click('button:has-text("لاحقاً")');

  // Try publish without testing first — should stay disabled
  const publishDisabled = await pageB2.locator('button:has-text("نشر التدفق")').isDisabled();
  console.log("STARTER: publish button disabled before any test run:", publishDisabled);

  // Run a live test, then publish should become enabled
  await pageB2.fill('input[placeholder="مثال: أين طلبي؟"]', "أين طلبي؟");
  await pageB2.click('button:has-text("إرسال")');
  await pageB2.waitForTimeout(1200);
  const publishEnabledAfterTest = await pageB2.locator('button:has-text("نشر التدفق")').isEnabled();
  console.log("STARTER: publish button enabled after live test:", publishEnabledAfterTest);
  await pageB2.click('button:has-text("نشر التدفق")');
  await pageB2.waitForTimeout(1000);
  await pageB2.screenshot({ path: `${shotsDir}/chatbot-03-starter-published-after-test.png` });
  const starterFlowUrl = pageB2.url();
  await pageB2.close();

  // ===== 2) Growth tenant (tenant-a): FAQ template unlocked, ai_reply/api_call unlocked =====
  const pageA = await newPage();
  await login(pageA, "owner@tenant-a.sa", "Demo@12345");
  await pageA.goto(`${BASE}/dashboard/chatbot/new`);
  await pageA.waitForSelector("text=اختر قالباً جاهزاً");
  const faqLockedForGrowth = await pageA.locator(".card").filter({ hasText: "الرد على الأسئلة الشائعة" }).locator("text=🔒").count();
  console.log("GROWTH: FAQ template locked (should be false/0):", faqLockedForGrowth);
  await pageA.screenshot({ path: `${shotsDir}/chatbot-04-growth-templates-unlocked.png` });

  // open the existing published flow from seed data to check ai_reply/api_call unlocked in editor
  await pageA.goto(`${BASE}/dashboard/chatbot`);
  await pageA.waitForSelector("text=الشات بوت");
  await pageA.locator('a:has-text("الترحيب وحالة الطلب")').click();
  await pageA.waitForSelector("text=لوحة رسم التدفق");
  const aiReplyUnlockedLabel = await pageA.locator('button:has-text("رد ذكي")').first().innerText();
  console.log("GROWTH: ai_reply button label (should NOT show 🔒):", aiReplyUnlockedLabel);
  await pageA.screenshot({ path: `${shotsDir}/chatbot-05-growth-editor-unlocked-nodes.png` });
  await pageA.close();

  // ===== 3) Agent role: view+test only, no editor access, direct URL blocked =====
  const pageAgent = await newPage();
  await login(pageAgent, "agent@tenant-a.sa", "Demo@12345");
  await pageAgent.goto(`${BASE}/dashboard/chatbot`);
  await pageAgent.waitForSelector("text=الشات بوت");
  const createButtonVisible = await pageAgent.locator('a:has-text("+ إنشاء تدفق جديد")').count();
  console.log("AGENT: create-flow button visible (should be 0):", createButtonVisible);
  await pageAgent.locator('a:has-text("الترحيب وحالة الطلب")').click();
  await pageAgent.waitForURL(/\/dashboard\/chatbot\/.+\/test$/, { timeout: 10000 });
  console.log("AGENT: clicking flow card routed to test-only view:", pageAgent.url());
  await pageAgent.screenshot({ path: `${shotsDir}/chatbot-06-agent-test-only-view.png` });

  // direct URL manipulation to the editor should redirect to no-access
  const flowIdMatch = pageAgent.url().match(/chatbot\/([a-z0-9]+)\/test/);
  const flowId = flowIdMatch ? flowIdMatch[1] : null;
  if (flowId) {
    await pageAgent.goto(`${BASE}/dashboard/chatbot/${flowId}`);
    await pageAgent.waitForURL(/\/dashboard\/no-access/, { timeout: 10000 });
    console.log("AGENT: direct editor URL redirected to no-access:", pageAgent.url());
    await pageAgent.screenshot({ path: `${shotsDir}/chatbot-07-agent-blocked-from-editor.png` });
  }
  await pageAgent.close();

  // ===== 4) Admin role: can edit but cannot delete a published flow =====
  const pageAdmin = await newPage();
  await login(pageAdmin, "admin@tenant-a.sa", "Demo@12345");
  await pageAdmin.goto(`${BASE}/dashboard/chatbot`);
  await pageAdmin.waitForSelector("text=الشات بوت");
  await pageAdmin.locator('a:has-text("الترحيب وحالة الطلب")').click();
  await pageAdmin.waitForSelector("text=لوحة رسم التدفق");
  // "حذف" يظهر أيضاً كزر داخل كل عقدة على لوحة الرسم؛ زر حذف التدفق الكامل في شريط الأدوات العلوي
  // هو الوحيد الذي يحمل الكلاس btn-danger، ما يميّزه عن أزرار حذف العقد الفردية.
  const topDeleteBtn = await pageAdmin.locator('button.btn-danger:has-text("حذف")').count();
  console.log("ADMIN on PUBLISHED flow: top-level delete button present (should be 0):", topDeleteBtn);
  await pageAdmin.screenshot({ path: `${shotsDir}/chatbot-08-admin-no-delete-on-published.png` });
  await pageAdmin.close();

  console.log("\nERRORS:", JSON.stringify(errors));
  await browser.close();
})().catch((e) => {
  console.error("CHATBOT SMOKE TEST FAILED:", e);
  process.exit(1);
});
