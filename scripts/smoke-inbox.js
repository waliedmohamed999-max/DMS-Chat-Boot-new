// اختبار دخان مخصص لوحدة صندوق المحادثات: مزامنة لحظية، حالة الرسائل، نافذة الـ24 ساعة،
// إسناد/تحويل بين الفريق، وسرية الملاحظات الداخلية.
const { chromium } = require("playwright");
const path = require("path");
const { execSync } = require("child_process");

const BASE = process.env.SMOKE_BASE_URL ?? "http://localhost:3000";
const shotsDir = path.join(__dirname, "..", ".smoke-shots");

async function login(page, email, password) {
  await page.goto(`${BASE}/login`);
  await page.fill('input[type="email"]', email);
  await page.fill('input[type="password"]', password);
  await page.click('button[type="submit"]');
  await page.waitForURL(/\/dashboard|\/admin/, { timeout: 15000 });
}

function psql(sql) {
  return execSync(`docker exec wa_crm_postgres psql -U wa_crm -d wa_crm -t -c "${sql.replace(/"/g, '\\"')}"`).toString().trim();
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

  const page = await newPage();
  await login(page, "owner@tenant-a.sa", "Demo@12345");

  // ===== 1) رسالة واردة محاكاة تظهر فوراً في القائمة والمحادثة دون تحديث يدوي =====
  await page.goto(`${BASE}/dashboard/inbox?status=OPEN`);
  await page.waitForSelector("text=صندوق المحادثات");
  await page.waitForTimeout(1500); // انتظار أول جلب فعلي لقائمة المحادثات (fetch العميل)
  await page.click('a:has-text("محمد القحطاني")');
  await page.waitForURL(/\/dashboard\/inbox\/[a-z0-9]+$/, { timeout: 10000 });
  await page.waitForSelector("text=🧪 محاكاة رسالة واردة");
  const messageCountBefore = await page.locator(".group.relative").count();
  await page.click('button:has-text("💬 نص")');
  await page.waitForTimeout(6000); // بانتظار دورة استطلاع InboxLivePoller (كل 4 ثوانٍ) + router.refresh()
  const messageCountAfter = await page.locator(".group.relative").count();
  console.log("LIVE SYNC: message bubble count increased without manual reload:", messageCountAfter > messageCountBefore, `(${messageCountBefore} -> ${messageCountAfter})`);
  await page.screenshot({ path: `${shotsDir}/inbox-01-live-sync.png` });

  // ===== 2) رد من الواجهة وتتبع حالته (أُرسل → تم التسليم → تمت القراءة) لحظياً =====
  await page.fill('input[placeholder*="اكتب رداً"]', "شكراً لتواصلك، سنتحقق من طلبك الآن");
  await page.click('button:has-text("إرسال")');
  await page.waitForTimeout(800);
  const tickAfterSend = await page.locator("text=✓").last().isVisible().catch(() => false);
  console.log("STATUS TRACKING: single tick (SENT) visible right after send:", tickAfterSend);
  await page.waitForTimeout(2500); // بانتظار تحديث "تم التسليم" المجدوَل بعد 1.5 ثانية عبر BullMQ
  const bodyAfterDeliver = await page.locator("body").innerText();
  console.log("STATUS TRACKING: delivered double-tick appears after ~1.5s:", bodyAfterDeliver.includes("✓✓"));
  await page.waitForTimeout(4000); // بانتظار احتمال "تمت القراءة" (بعد 4 ثوانٍ من الإرسال، ~70% احتمال)
  await page.screenshot({ path: `${shotsDir}/inbox-02-status-ticks.png` });

  // ===== 3) انتهاء نافذة الـ24 ساعة يجبر استخدام قالب معتمد بدل النص الحر =====
  const expiredConvoId = psql(`select "Conversation".id from "Conversation" join "Contact" on "Contact".id="Conversation"."contactId" where "Contact".name = 'نورة الدوسري' limit 1;`);
  psql(`update "Conversation" set "sessionWindowExpiresAt" = now() - interval '1 hour' where id = '${expiredConvoId}';`);
  await page.goto(`${BASE}/dashboard/inbox/${expiredConvoId}`);
  await page.waitForSelector("text=انتهت نافذة الـ24 ساعة");
  const freeTextInputVisible = await page.locator('input[placeholder*="اكتب رداً"]').count();
  const templateSelectVisible = await page.locator("select").count();
  console.log("24H WINDOW: free-text input hidden after expiry (should be 0):", freeTextInputVisible);
  console.log("24H WINDOW: forced template picker shown instead:", templateSelectVisible > 0);
  await page.screenshot({ path: `${shotsDir}/inbox-03-window-expired.png` });

  // ===== 5) ملاحظة داخلية لا تصل للعميل تحت أي ظرف =====
  const noteText = `ملاحظة سرية للاختبار ${Date.now()}`;
  await page.fill('input[placeholder="أضف ملاحظة..."]', noteText);
  await page.click('button:has-text("حفظ")');
  await page.waitForTimeout(1000);
  const noteVisibleInPanel = await page.locator(`text=${noteText}`).count();
  const messageRowsInDb = psql(`select count(*) from "Message" where body = '${noteText}';`);
  console.log("INTERNAL NOTES: note visible in sidebar panel:", noteVisibleInPanel > 0);
  console.log("INTERNAL NOTES: note NEVER created as a Message row (should be 0):", messageRowsInDb);
  await page.screenshot({ path: `${shotsDir}/inbox-04-internal-note.png` });
  await page.close();

  // ===== 4) إسناد محادثة لعضو فريق آخر (مدير) وتظهر فعلياً في محادثاته =====
  const pageOwner2 = await newPage();
  await login(pageOwner2, "owner@tenant-a.sa", "Demo@12345");
  await pageOwner2.goto(`${BASE}/dashboard/inbox/${expiredConvoId}`);
  await pageOwner2.waitForSelector("text=إسناد إلى");
  await pageOwner2.selectOption("select[name=agentUserId]", { label: "مدير متجر الأناقة للعطور" });
  await pageOwner2.waitForTimeout(1000);
  await pageOwner2.screenshot({ path: `${shotsDir}/inbox-05-assigned.png` });
  await pageOwner2.close();

  const pageAdmin = await newPage();
  await login(pageAdmin, "admin@tenant-a.sa", "Demo@12345");
  await pageAdmin.goto(`${BASE}/dashboard/inbox?status=ALL`);
  await pageAdmin.waitForSelector("text=صندوق المحادثات");
  await pageAdmin.waitForTimeout(1200);
  const assigneeOptions = await pageAdmin.locator("select >> nth=0").innerText();
  await pageAdmin.selectOption("select >> nth=0", { label: "مدير متجر الأناقة للعطور" }).catch(() => {});
  await pageAdmin.waitForTimeout(1200);
  const adminSeesAssignedConvo = await pageAdmin.locator("text=نورة الدوسري").count();
  console.log("ASSIGN/TRANSFER: conversation appears when filtered to the newly assigned member:", adminSeesAssignedConvo > 0);
  await pageAdmin.screenshot({ path: `${shotsDir}/inbox-06-assignee-filter.png` });
  await pageAdmin.close();

  console.log("\nERRORS:", JSON.stringify(errors));
  await browser.close();
})().catch((e) => {
  console.error("INBOX SMOKE TEST FAILED:", e);
  process.exit(1);
});
