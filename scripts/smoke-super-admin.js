// اختبار دخان لغرفة تحكم مالك المنصة: الموافقات، التعليق، تأثير حدود الباقة فوراً،
// انتحال الهوية مع سجل تدقيق مزدوج، وRBAC داخلي (Support/Billing staff).
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

  // ===== 1) تسجيل تاجر جديد -> يظهر في مركز الموافقات كـ PENDING قبل أي تفعيل =====
  const p1 = await newPage();
  const uniqueEmail = `smoke-newtenant-${Date.now()}@example.com`;
  await p1.goto(`${BASE}/register`);
  await p1.waitForSelector('input[name="storeName"]');
  await p1.fill('input[name="storeName"]', "متجر اختبار الموافقات");
  await p1.fill('input[name="ownerName"]', "مالك تجريبي");
  await p1.fill('input[name="email"]', uniqueEmail);
  await p1.fill('input[name="password"]', "Passw0rd123");
  await p1.fill('input[name="businessActivity"]', "اختبار تلقائي");
  await p1.click('label:has-text("النمو")');
  await p1.click('button:has-text("إنشاء الحساب")');
  await p1.waitForURL(/\/login/, { timeout: 15000 });

  // تسجيل الدخول بالحساب الجديد يجب أن يعرض شاشة "بانتظار المراجعة" وليس لوحة التحكم
  await login(p1, uniqueEmail, "Passw0rd123");
  await p1.waitForURL(`${BASE}/dashboard`, { timeout: 15000 });
  const pendingScreenVisible = await p1.locator("text=حسابك بانتظار المراجعة").count();
  console.log("1) تاجر جديد يرى شاشة بانتظار المراجعة (وليس لوحة التحكم):", pendingScreenVisible > 0);
  await p1.screenshot({ path: `${shotsDir}/superadmin-01-pending-review-screen.png` });
  await p1.context().clearCookies();

  // مالك المنصة يفتح مركز الموافقات ويتأكد من ظهور الطلب
  await login(p1, "admin@platform.sa", "Demo@12345");
  await p1.waitForURL(`${BASE}/admin`, { timeout: 15000 });
  await p1.goto(`${BASE}/admin/approvals`);
  await p1.waitForSelector("text=مركز الموافقات");
  const requestVisible = await p1.locator(`text=${"متجر اختبار الموافقات"}`).count();
  console.log("1) الطلب الجديد ظاهر فعلياً في مركز الموافقات:", requestVisible > 0);
  await p1.screenshot({ path: `${shotsDir}/superadmin-02-approvals-center.png` });
  await p1.close();

  // ===== 2) تعليق تاجر نشط -> دخوله يُرفض فعلياً بعد التعليق مباشرة =====
  const p2 = await newPage();
  await login(p2, "admin@platform.sa", "Demo@12345");
  await p2.waitForURL(`${BASE}/admin`, { timeout: 15000 });
  await p2.goto(`${BASE}/admin/tenants?q=tenant-b`);
  await p2.waitForSelector("text=التجار المشتركون");
  await p2.click('a:has-text("بوتيك لمسة")');
  await p2.waitForSelector("text=تعليق الحساب");
  await p2.click('button:has-text("تعليق الحساب")');
  await p2.waitForTimeout(800);
  await p2.screenshot({ path: `${shotsDir}/superadmin-03-tenant-suspended.png` });
  await p2.context().clearCookies();

  await login(p2, "owner@tenant-b.sa", "Demo@12345");
  await p2.waitForTimeout(1500);
  const suspendedBlocked = await p2.locator("text=تم تعليق حساب متجرك مؤقتاً").count();
  const stillOnLogin = p2.url().includes("/login");
  console.log("2) دخول تاجر مُعلَّق مرفوض فعلياً (رسالة + بقاء على /login):", suspendedBlocked > 0, stillOnLogin);
  await p2.screenshot({ path: `${shotsDir}/superadmin-04-suspended-login-blocked.png` });

  // إعادة التفعيل لاستعادة حالة العرض التجريبي لبقية الاختبارات
  await p2.context().clearCookies();
  await login(p2, "admin@platform.sa", "Demo@12345");
  await p2.waitForURL(`${BASE}/admin`, { timeout: 15000 });
  await p2.goto(`${BASE}/admin/tenants?q=tenant-b`);
  await p2.click('a:has-text("بوتيك لمسة")');
  await p2.waitForSelector('button:has-text("إعادة تفعيل")');
  await p2.click('button:has-text("إعادة تفعيل")');
  await p2.waitForTimeout(500);
  console.log("2) تمت إعادة تفعيل tenant-b لاستعادة حالة العرض التجريبي");
  await p2.close();

  // ===== 3) تعديل حد باقة من لوحة الباقات -> يتأثر كل تاجر على هذه الباقة فوراً =====
  const p3 = await newPage();
  await login(p3, "admin@platform.sa", "Demo@12345");
  await p3.waitForURL(`${BASE}/admin`, { timeout: 15000 });
  await p3.goto(`${BASE}/admin/plans`);
  await p3.waitForSelector("text=إدارة الباقات");
  // بطاقة "الأساسية" (Starter) هي أول بطاقة (الأرخص) — نغيّر أقصى تدفقات من 2 إلى 7
  const starterCard = p3.locator(".card").filter({ has: p3.locator("h2", { hasText: "الأساسية" }) });
  await starterCard.locator('input[name="maxActiveFlows"]').fill("7");
  await starterCard.locator('button:has-text("حفظ حدود الشات بوت")').click();
  await p3.waitForTimeout(800);
  await p3.context().clearCookies();

  // owner@tenant-b.sa على باقة Starter — يجب أن يرى الحد الجديد (7) فوراً بدون أي تعديل كود
  await login(p3, "owner@tenant-b.sa", "Demo@12345");
  await p3.waitForURL(`${BASE}/dashboard`, { timeout: 15000 });
  await p3.goto(`${BASE}/dashboard/chatbot`);
  await p3.waitForSelector("text=الشات بوت");
  const limitText = await p3.locator("text=/تدفقات مستخدمة/").innerText();
  console.log("3) نص حد التدفقات في لوحة التاجر بعد التعديل من لوحة الباقات:", limitText.trim());
  const reflectsNewLimit = limitText.includes("7");
  console.log("3) الحد الجديد (7) انعكس فوراً بدون تعديل كود:", reflectsNewLimit);
  await p3.screenshot({ path: `${shotsDir}/superadmin-05-plan-limit-live-effect.png` });

  // إعادة الحد لقيمته الأصلية (2) لاستعادة حالة العرض التجريبي
  await p3.context().clearCookies();
  await login(p3, "admin@platform.sa", "Demo@12345");
  await p3.waitForURL(`${BASE}/admin`, { timeout: 15000 });
  await p3.goto(`${BASE}/admin/plans`);
  const starterCard2 = p3.locator(".card").filter({ has: p3.locator("h2", { hasText: "الأساسية" }) });
  await starterCard2.locator('input[name="maxActiveFlows"]').fill("2");
  await starterCard2.locator('button:has-text("حفظ حدود الشات بوت")').click();
  await p3.waitForTimeout(500);
  console.log("3) تمت استعادة حد الباقة الأساسية إلى 2");
  await p3.close();

  // ===== 4) Impersonate لتاجر -> يظهر في Audit Log لكلا الطرفين =====
  const p4 = await newPage();
  await login(p4, "admin@platform.sa", "Demo@12345");
  await p4.waitForURL(`${BASE}/admin`, { timeout: 15000 });
  await p4.goto(`${BASE}/admin/tenants?q=tenant-a`);
  await p4.click('a:has-text("متجر الأناقة للعطور")');
  await p4.waitForSelector('button:has-text("تسجيل دخول كالتاجر")');
  await p4.click('button:has-text("تسجيل دخول كالتاجر")');
  await p4.waitForURL(`${BASE}/dashboard`, { timeout: 15000 });
  const impersonationBannerVisible = await p4.locator("text=أنت الآن تتصفح كـ").count();
  console.log("4) شريط تحذير الانتحال ظاهر فعلياً بعد بدء الجلسة:", impersonationBannerVisible > 0);
  await p4.screenshot({ path: `${shotsDir}/superadmin-06-impersonation-banner.png` });

  // إنهاء الانتحال والتحقق من العودة للوحة Super Admin
  await p4.click('button:has-text("إنهاء الجلسة والعودة")');
  await p4.waitForURL(/\/admin/, { timeout: 15000 });
  console.log("4) إنهاء الانتحال أعاد مالك المنصة للوحته:", p4.url());

  // التحقق من السجل على الجانبين
  await p4.goto(`${BASE}/admin/audit-log`);
  await p4.waitForSelector("text=سجل التدقيق الشامل");
  const platformLogHasImpersonation = await p4.locator("text=platform.impersonation_start").count();
  console.log("4) سجل تدقيق المنصة يحتوي platform.impersonation_start:", platformLogHasImpersonation > 0);
  await p4.screenshot({ path: `${shotsDir}/superadmin-07-audit-log-platform-side.png` });
  await p4.close();

  // الجانب الثاني: سجل تدقيق التاجر نفسه (owner@tenant-a.sa) يجب أن يظهر support.impersonation_started
  const p4b = await newPage();
  await login(p4b, "owner@tenant-a.sa", "Demo@12345");
  await p4b.waitForURL(`${BASE}/dashboard`, { timeout: 15000 });
  await p4b.goto(`${BASE}/dashboard/settings`);
  await p4b.waitForSelector("text=سجل النشاط");
  const tenantLogHasImpersonation = await p4b.locator("text=support.impersonation_started").count();
  console.log("4) سجل تدقيق التاجر نفسه يحتوي support.impersonation_started (شفافية):", tenantLogHasImpersonation > 0);
  await p4b.screenshot({ path: `${shotsDir}/superadmin-08-audit-log-tenant-side.png` });
  await p4b.close();

  // ===== 5) حساب Support Staff لا يصل للفوترة أو حذف تاجر =====
  const p5 = await newPage();
  await login(p5, "support@platform.sa", "Demo@12345");
  await p5.waitForURL(`${BASE}/admin`, { timeout: 15000 });
  const billingNavVisible = await p5.locator('a:has-text("الإيرادات والفوترة")').count();
  console.log("5) رابط 'الإيرادات والفوترة' غير ظاهر لحساب الدعم الفني (يجب 0):", billingNavVisible);

  await p5.goto(`${BASE}/admin/billing`);
  await p5.waitForTimeout(500);
  const billingBlockedMessage = await p5.locator("text=ليس لديك صلاحية").count();
  console.log("5) الوصول المباشر لرابط الفوترة محظور خادمياً أيضاً (وليس فقط إخفاء الرابط):", billingBlockedMessage > 0);
  await p5.screenshot({ path: `${shotsDir}/superadmin-09-support-billing-blocked.png` });

  await p5.goto(`${BASE}/admin/tenants?q=tenant-a`);
  await p5.click('a:has-text("متجر الأناقة للعطور")');
  await p5.waitForSelector("h1");
  const deleteButtonVisibleForSupport = await p5.locator('button:has-text("حذف نهائي")').count();
  console.log("5) زر 'حذف نهائي' غير ظاهر لحساب الدعم الفني (يجب 0):", deleteButtonVisibleForSupport);
  await p5.screenshot({ path: `${shotsDir}/superadmin-10-support-no-delete-button.png` });
  await p5.close();

  // Billing staff: يرى الفوترة، لا يرى تفاصيل التاجر (محادثات/فريق)
  const p5b = await newPage();
  await login(p5b, "billing@platform.sa", "Demo@12345");
  await p5b.waitForURL(`${BASE}/admin`, { timeout: 15000 });
  await p5b.goto(`${BASE}/admin/billing`);
  const billingPageWorks = await p5b.locator("text=الإيرادات والفوترة").count();
  console.log("5) حساب الفريق المالي يصل لصفحة الفوترة فعلياً:", billingPageWorks > 0);

  await p5b.goto(`${BASE}/admin/tenants/does-not-matter`);
  await p5b.waitForTimeout(500);
  const merchantDetailBlockedForBilling = await p5b.locator("text=ليس لديك صلاحية").count();
  console.log("5) وصول الفريق المالي لتفاصيل تاجر محظور خادمياً:", merchantDetailBlockedForBilling > 0);
  await p5b.screenshot({ path: `${shotsDir}/superadmin-11-billing-role-scope.png` });
  await p5b.close();

  console.log("\nERRORS:", JSON.stringify(errors));
  await browser.close();
})().catch((e) => {
  console.error("SUPER ADMIN SMOKE TEST FAILED:", e);
  process.exit(1);
});
