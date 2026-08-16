// اختبار دخان (smoke test) شامل يقود متصفح Chromium فعلي عبر كل وحدات المنصة.
// يتطلب: `npm run dev` و`npm run worker` يعملان في نافذتين منفصلتين، وقاعدة بيانات
// tenant-a/tenant-b مزروعة (`npm run db:seed`). التشغيل: `node scripts/smoke-test.js`
const { chromium } = require("playwright");
const path = require("path");

const BASE = process.env.SMOKE_BASE_URL ?? "http://localhost:3000";
const shotsDir = path.join(__dirname, "..", ".smoke-shots");

(async () => {
  const fs = require("fs");
  fs.mkdirSync(shotsDir, { recursive: true });

  const browser = await chromium.launch();
  const context = await browser.newContext({ locale: "ar-SA" });
  const page = await context.newPage();
  const consoleErrors = [];
  page.on("console", (msg) => {
    if (msg.type() === "error") consoleErrors.push(msg.text());
  });
  page.on("pageerror", (err) => consoleErrors.push("pageerror: " + err.message));

  async function shot(name) {
    await page.screenshot({ path: `${shotsDir}/${name}.png`, fullPage: true });
    console.log(`📸 ${name}`);
  }

  // 1. Login
  await page.goto(`${BASE}/login`);
  await page.waitForSelector('input[type="email"]');
  await page.fill('input[type="email"]', "owner@tenant-a.sa");
  await page.fill('input[type="password"]', "Demo@12345");
  await page.click('button[type="submit"]');
  await page.waitForURL(`${BASE}/dashboard`, { timeout: 15000 });
  await shot("01-dashboard-overview");

  // 2. Contacts: add a new contact
  await page.goto(`${BASE}/dashboard/contacts`);
  await page.waitForSelector('input[name="name"]');
  const beforeCount = await page.locator("table tbody tr").count();
  const uniqueSuffix = String(Date.now()).slice(-8);
  await page.fill('input[name="name"]', "عميل اختبار سموك");
  await page.fill('input[name="phoneE164"]', `+9665${uniqueSuffix}`);
  await page.click('button:has-text("إضافة")');
  await page.waitForTimeout(1200);
  await shot("02-contacts-after-add");
  const afterCount = await page.locator("table tbody tr").count();
  console.log(`CONTACTS before=${beforeCount} after=${afterCount}`);

  // 3. Inbox: open first conversation needing reply and send a message
  await page.goto(`${BASE}/dashboard/inbox`);
  await page.waitForSelector("text=صندوق المحادثات");
  await page.waitForTimeout(1500); // انتظار أول جلب فعلي لقائمة المحادثات (fetch من العميل، وليست مُصيَّرة على الخادم)
  // استثناء رابط "الردود السريعة" الذي يطابق نفس بادئة href (ظاهر أعلى قائمة المحادثات في الصفحة)
  const firstConvo = page.locator('a[href^="/dashboard/inbox/"]:not([href$="/quick-replies"])').first();
  if (await firstConvo.count()) {
    await firstConvo.click();
    await page.waitForSelector('input[name="body"]');
    await page.fill('input[name="body"]', "رسالة اختبار من سموك تست");
    await page.click('button:has-text("إرسال")');
    await page.waitForTimeout(1500);
    await shot("03-inbox-after-reply");
  } else {
    console.log("NO CONVERSATIONS FOUND IN NEEDS_REPLY TAB");
  }

  // 4. Campaigns: create + send عبر معالج الحملة متعدد الخطوات (wizard)
  await page.goto(`${BASE}/dashboard/campaigns/new`);
  await page.waitForSelector("text=حملة جديدة");
  await page.fill('input[placeholder="مثال: عرض نهاية الأسبوع"]', "حملة اختبار سموك " + Date.now());
  await page.click('button:has-text("لمرة واحدة")');
  await page.click('button:has-text("التالي ←")');
  await page.waitForSelector("text=كل جهات الاتصال");
  await page.click('button:has-text("كل جهات الاتصال")');
  await page.waitForTimeout(900);
  await page.click('button:has-text("التالي ←")');
  const templateCardCount = await page.locator('button:has-text("✓ معتمد")').count();
  console.log(`CAMPAIGN WIZARD: approved template cards available: ${templateCardCount}`);
  if (templateCardCount > 0) {
    await page.locator('button:has-text("✓ معتمد")').first().click();
    await page.click('button:has-text("التالي ←")');
    await page.waitForSelector("text=إرسال فوري");
    await page.click('button:has-text("التالي ←")');
    await page.waitForSelector("text=معاينة الرسالة");
    await shot("04-campaign-created");
    await page.click('button:has-text("🚀 إرسال الآن")');
    await page.waitForURL(/\/dashboard\/campaigns\/(?!new$)[a-z0-9]+$/, { timeout: 15000 });
    await page.waitForTimeout(3000);
    await page.reload();
    await page.waitForTimeout(500);
    const bodyText = await page.locator("body").innerText();
    const statusBadge = bodyText.match(/مسودة|مجدولة|قيد الإرسال|مكتملة|فشلت/);
    console.log(`CAMPAIGN status after send: ${statusBadge ? statusBadge[0] : "not found"}`);
    await shot("05-campaign-after-send");
  }

  // 5. Chatbot: open first flow, add a node, test live
  await page.goto(`${BASE}/dashboard/chatbot`);
  await page.waitForSelector("text=الأتمتة");
  const firstFlow = page.locator('a[href^="/dashboard/chatbot/"]:not([href="/dashboard/chatbot/new"])').first();
  if (await firstFlow.count()) {
    await firstFlow.click();
    // العرض الافتراضي هو "البسيط" (بناء تسلسلي، منذ إعادة تصميم المحرر) — "لوحة رسم التدفق" نص
    // خاص بالعرض المتقدم (?view=canvas) فقط، وليس ما يظهر افتراضياً عند فتح تدفق.
    await page.waitForSelector("text=خطوات المحادثة");
    await shot("06-chatbot-editor");
    await page.fill('input[placeholder="مثال: أين طلبي؟"]', "أين طلبي؟");
    await page.click('button:has-text("إرسال")');
    await page.waitForTimeout(500);
    await shot("07-chatbot-live-test");
  }

  // 6. Integrations: connect all three
  await page.goto(`${BASE}/dashboard/integrations`);
  await page.waitForSelector("text=التكاملات");
  const connectButtons = page.locator('button:has-text("ربط الآن")');
  const n = await connectButtons.count();
  console.log(`INTEGRATIONS pending connect buttons: ${n}`);
  for (let i = 0; i < n; i++) {
    await page.locator('button:has-text("ربط الآن")').first().click();
    await page.waitForTimeout(1000);
  }
  await shot("08-integrations-after-connect");

  // 7. Billing: upgrade plan
  await page.goto(`${BASE}/dashboard/billing`);
  await page.waitForSelector("text=الفوترة والاشتراك");
  const upgradeBtn = page.locator('button:has-text("الترقية لهذه الباقة")').first();
  if (await upgradeBtn.count()) {
    await upgradeBtn.click();
    await page.waitForTimeout(1500);
  }
  await shot("09-billing-after-upgrade");

  // 8. Settings: invite a team member + delete a contact (audit log paths)
  await page.goto(`${BASE}/dashboard/settings`);
  await page.waitForSelector('input[name="email"]');
  await page.fill('input[name="name"]', "موظف اختبار سموك");
  await page.fill('input[name="email"]', `smoke-${Date.now()}@tenant-a.sa`);
  await page.click('button:has-text("إرسال الدعوة")');
  await page.waitForTimeout(1200);
  await shot("10-settings-after-invite");

  await page.goto(`${BASE}/dashboard/contacts`);
  const deleteBtn = page.locator('button:has-text("حذف")').first();
  if (await deleteBtn.count()) {
    await deleteBtn.click();
    await page.waitForTimeout(1000);
  }
  await shot("11-contacts-after-delete");

  // 9. Super Admin: login as platform owner and check tenants list + suspend/activate
  await page.goto(`${BASE}/login`);
  await page.fill('input[type="email"]', "admin@platform.sa");
  await page.fill('input[type="password"]', "Demo@12345");
  await page.click('button[type="submit"]');
  await page.waitForURL(`${BASE}/admin`, { timeout: 15000 });
  await shot("12-admin-overview");
  await page.goto(`${BASE}/admin/tenants`);
  await page.waitForSelector("text=التجار المشتركون");
  await shot("13-admin-tenants");

  // 10. برنامج التسويق بالعمولة: تقديم طلب حقيقي → موافقة مالك المنصة (نفس جلسة admin@platform.sa
  // أعلاه) → تسجيل دخول مسوّق (جلسة مستقلة تماماً، كوكي مختلف) → الداشبورد يُصيَّر بلا خطأ.
  // بريد فريد بالطابع الزمني (نفس أسلوب دعوة الفريق في الخطوة 8) لتفادي تصادم قيد email الفريد.
  const affiliateEmail = `smoke-affiliate-${Date.now()}@example.com`;
  await page.goto(`${BASE}/affiliates/apply`);
  await page.waitForSelector('input[name="name"]');
  await page.fill('input[name="name"]', "مسوّق اختبار الدخان");
  await page.fill('input[name="email"]', affiliateEmail);
  await page.fill('input[name="phone"]', "+966500000000");
  await page.fill('input[name="password"]', "Smoke@12345");
  await page.fill('textarea[name="promotionPlan"]', "اختبار آلي دوري لبرنامج التسويق بالعمولة عبر smoke-test.js.");
  await page.check('input[name="termsAccepted"]');
  await page.waitForTimeout(3200); // تجاوز فحص "3 ثوانٍ من عرض النموذج" المضاد للبوتات في actions.ts
  await page.click('button[type="submit"]');
  await page.waitForSelector("text=تم إرسال طلبك بنجاح", { timeout: 15000 });
  await shot("14-affiliate-application-submitted");

  await page.goto(`${BASE}/admin/affiliates`);
  await page.waitForSelector("text=طلبات انضمام بانتظار المراجعة");
  const affiliateEmailPara = page.locator(`p[dir="ltr"]:has-text("${affiliateEmail}")`);
  const affiliateRow = affiliateEmailPara.locator("xpath=ancestor::div[contains(@class,'rounded-lg')][1]");
  await affiliateRow.locator('button:has-text("قبول")').click();
  await page.waitForTimeout(1000);
  await shot("15-admin-affiliates-after-approve");

  await page.goto(`${BASE}/affiliates/login`);
  await page.waitForSelector('input[name="email"]');
  await page.fill('input[name="email"]', affiliateEmail);
  await page.fill('input[name="password"]', "Smoke@12345");
  await page.click('button[type="submit"]');
  await page.waitForURL(`${BASE}/affiliates/dashboard`, { timeout: 15000 });
  await shot("16-affiliate-dashboard");
  console.log("AFFILIATE PROGRAM: application -> admin approval -> independent login -> dashboard OK");

  console.log("CONSOLE ERRORS:", JSON.stringify(consoleErrors, null, 2));

  await browser.close();
})().catch((e) => {
  console.error("SMOKE TEST FAILED:", e);
  process.exit(1);
});
