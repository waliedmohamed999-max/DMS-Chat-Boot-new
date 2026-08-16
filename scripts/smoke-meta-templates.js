// اختبار دخان مخصص لمسار ربط Meta/واتساب ووحدة إدارة القوالب واعتمادها.
const { chromium } = require("playwright");
const path = require("path");
const { execSync } = require("child_process");

function psql(sql) {
  return execSync(`docker exec wa_crm_postgres psql -U wa_crm -d wa_crm -t -c "${sql.replace(/"/g, '\\"')}"`).toString().trim();
}

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

  // ===== 1) مسار الربط (تسجيل الدخول المضمّن محاكى) يفتح صندوق المحادثات فعلياً لرسالة واردة حقيقية =====
  const page = await newPage();
  await login(page, "owner@tenant-b.sa", "Demo@12345");
  await page.goto(`${BASE}/dashboard/integrations`);
  await page.waitForSelector("text=التكاملات");
  await page.click('button:has-text("🔗 ربط عبر Facebook")');
  await page.click('button:has-text("متابعة الربط عبر Facebook")');
  await page.waitForTimeout(1200);
  await page.reload();
  const bodyAfterConnect = await page.locator("body").innerText();
  console.log("CONNECTION: status shows 'متصل' after embedded signup:", bodyAfterConnect.includes("متصل"));
  console.log("CONNECTION: health panel shows quality rating:", bodyAfterConnect.includes("جودة الرقم"));
  console.log("CONNECTION: health panel shows webhook connected:", bodyAfterConnect.includes("✅ متصل"));
  await page.screenshot({ path: `${shotsDir}/meta-01-connected-health.png` });

  // جلب معرّف الرقم الفعلي المُولَّد فريداً لهذا التاجر عند الربط (وليس قيمة ثابتة مشتركة بين التجار)
  const tenantBPhoneNumberId = psql(
    `select i."externalAccountId" from "Integration" i join "Tenant" t on t.id=i."tenantId" where t.slug='tenant-b' and i.provider='META_WHATSAPP';`
  );
  console.log("CONNECTION: unique phone_number_id generated for tenant-b:", tenantBPhoneNumberId);

  // إرسال webhook حقيقي (نفس مسار الإنتاج تماماً) لرقم واتساب تينانت-b الذي رُبط للتو
  const webhookPayload = {
    object: "whatsapp_business_account",
    entry: [{
      id: "sandbox-waba-tenant-b",
      changes: [{
        field: "messages",
        value: {
          messaging_product: "whatsapp",
          metadata: { display_phone_number: "+966550001234", phone_number_id: tenantBPhoneNumberId },
          contacts: [{ profile: { name: "عميل اختبار الربط" }, wa_id: "966501112222" }],
          messages: [{
            from: "966501112222", id: `wamid.smoke.${Date.now()}`,
            timestamp: String(Math.floor(Date.now() / 1000)), type: "text",
            text: { body: "مرحباً، هذه رسالة اختبار بعد ربط الحساب فعلياً" },
          }],
        },
      }],
    }],
  };
  const webhookRes = await page.request.post(`${BASE}/api/webhooks/meta`, { data: webhookPayload });
  console.log("CONNECTION: real webhook endpoint accepted the message:", webhookRes.ok());

  await page.goto(`${BASE}/dashboard/inbox?status=NEW`);
  await page.waitForSelector("text=صندوق المحادثات");
  await page.waitForTimeout(1500);
  const inboxBody = await page.locator("body").innerText();
  console.log("CONNECTION: new conversation from real webhook appears in inbox:", inboxBody.includes("عميل اختبار الربط"));
  await page.screenshot({ path: `${shotsDir}/meta-02-inbox-after-connect.png` });
  await page.close();

  // ===== 2) إنشاء قالب وإرساله للمراجعة، وتحديث حالته تلقائياً =====
  const page2 = await newPage();
  await login(page2, "owner@tenant-a.sa", "Demo@12345");
  await page2.goto(`${BASE}/dashboard/templates/new`);
  await page2.waitForSelector("text=قالب جديد");
  const smokeTemplateName = "smoke_test_tpl_" + Date.now();
  await page2.fill('input[placeholder="order_status_update"]', smokeTemplateName);
  await page2.fill('textarea[placeholder*="مرحباً"]', "مرحباً {{1}}، هذا اختبار قالب فعلي للمراجعة من سكربت الدخان.");
  await page2.click('button:has-text("📤 إرسال لمراجعة Meta")');
  await page2.waitForURL(/\/dashboard\/templates$/, { timeout: 10000 });
  const listBodyBefore = await page2.locator("body").innerText();
  console.log("TEMPLATE: shows 'بانتظار موافقة Meta' immediately after submit:", listBodyBefore.includes("بانتظار موافقة Meta"));
  await page2.screenshot({ path: `${shotsDir}/meta-03-template-pending.png` });

  await page2.waitForTimeout(8000); // بانتظار قرار المراجعة المؤجَّل (6 ثوانٍ) عبر عامل BullMQ
  const decidedStatus = psql(`select status from "MessageTemplate" where name = '${smokeTemplateName}';`);
  console.log("TEMPLATE: status auto-updated away from PENDING without any manual refresh action:", decidedStatus !== "PENDING", `(${decidedStatus})`);
  await page2.reload();
  const listBodyAfter = await page2.locator("body").innerText();
  await page2.screenshot({ path: `${shotsDir}/meta-04-template-decided.png` });

  // ===== 3) قالب مرفوض فعلياً يعرض السبب الحقيقي + زر تعديل وإعادة إرسال =====
  console.log("REJECTED TEMPLATE: shows real rejection reason:", listBodyAfter.includes("يخالف سياسة واتساب"));
  console.log("REJECTED TEMPLATE: shows resubmit button:", listBodyAfter.includes("تعديل وإعادة إرسال"));
  await page2.click('button:has-text("تعديل وإعادة إرسال")');
  await page2.waitForURL(/\/dashboard\/templates\/new\?editFrom=/, { timeout: 10000 });
  const editBody = await page2.locator("body").innerText();
  console.log("REJECTED TEMPLATE: edit wizard shows prefilled content notice:", editBody.includes("تعديل وإعادة إرسال القالب"));
  await page2.screenshot({ path: `${shotsDir}/meta-05-edit-resubmit.png` });
  await page2.close();

  // ===== 4) موظف (Agent) لا يصل لمسار التكاملات أو القوالب إطلاقاً حتى بالرابط المباشر =====
  const pageAgent = await newPage();
  await login(pageAgent, "agent@tenant-a.sa", "Demo@12345");
  await pageAgent.goto(`${BASE}/dashboard/integrations`);
  await pageAgent.waitForSelector("text=ليس لديك صلاحية إدارة التكاملات");
  console.log("AGENT: blocked from integrations page with graceful message: true");
  await pageAgent.goto(`${BASE}/dashboard/templates`);
  await pageAgent.waitForSelector("text=ليس لديك صلاحية إدارة قوالب الرسائل");
  console.log("AGENT: blocked from templates page with graceful message: true");
  await pageAgent.goto(`${BASE}/dashboard/templates/new`);
  await pageAgent.waitForURL(/\/dashboard\/no-access/, { timeout: 10000 });
  console.log("AGENT: blocked from templates/new via server redirect:", pageAgent.url().includes("no-access"));
  await pageAgent.close();

  console.log("\nERRORS:", JSON.stringify(errors));
  await browser.close();
})().catch((e) => {
  console.error("META/TEMPLATES SMOKE TEST FAILED:", e);
  process.exit(1);
});
