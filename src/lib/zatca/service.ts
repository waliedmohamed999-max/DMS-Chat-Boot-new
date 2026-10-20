import crypto from "crypto";
import { Prisma } from "@prisma/client";
import { rawDb, superAdminDb } from "@/lib/db";
import { decryptSecret, encryptSecret } from "@/lib/crypto";
import { redisConnection } from "@/lib/queue/connection";
import { buildCsr, generateEgsKeyPair, type ZatcaEnvironment } from "./csr";
import { INITIAL_PIH, type ZatcaDocType, type ZatcaInvoiceInput, type ZatcaInvoiceKind, type ZatcaParty } from "./invoice";
import { signInvoice } from "./signing";
import { clearInvoice, complianceCheck, reportInvoice, requestComplianceCsid, requestProductionCsid, type ValidationMessage, type ZatcaCredentials } from "./api";

/**
 * الفوترة الإلكترونية ZATCA (المرحلة الثانية) لفواتير اشتراكات المنصة (DMS هي البائع):
 *  - تسجيل وحدة الإصدار مرة واحدة من لوحة الأدمن (OTP من بوابة فاتورة؛ بيئة المطورين تقبل 123345).
 *  - كل فاتورة مدفوعة بعد التفعيل ⇒ مستند موقّع يُبلَّغ (مبسّطة) أو يُعتمد (قياسية لمنشأة لها رقم ضريبي).
 *  - كل استرداد ⇒ إشعار دائن مرتبط بالفاتورة الأصلية.
 * الإرسال متسلسل بقفل Redis: العدّاد (ICV) وبصمة الفاتورة السابقة (PIH) يتقدمان فقط مع كل مستند قبلته الهيئة.
 */

const SOLUTION = { name: "DMS", version: "1.0" };

// ===== بيانات البائع =====

export type SellerProfile = ZatcaParty & { name: string };

export async function getSellerProfile(): Promise<SellerProfile> {
  const s = await rawDb.platformSettings.findUnique({ where: { id: "singleton" } });
  return {
    name: s?.sellerLegalName ?? "",
    vatNumber: s?.sellerVatNumber ?? null,
    crn: s?.sellerCrn ?? null,
    street: s?.sellerStreet ?? null,
    buildingNumber: s?.sellerBuildingNumber ?? null,
    district: s?.sellerDistrict ?? null,
    city: s?.sellerCity ?? null,
    postalCode: s?.sellerPostalCode ?? null,
    country: "SA",
  };
}

export const isValidVat = (v: string | null | undefined) => !!v && /^3\d{13}3$/.test(v);

/** نواقص بيانات البائع المطلوبة لفواتير المرحلة الثانية (فارغة = مكتملة). */
export function sellerProfileIssues(p: SellerProfile): string[] {
  const issues: string[] = [];
  if (!p.name.trim()) issues.push("الاسم القانوني للمنشأة");
  if (!isValidVat(p.vatNumber)) issues.push("الرقم الضريبي (15 رقماً يبدأ وينتهي بـ3)");
  if (!p.crn || !/^\d{10}$/.test(p.crn)) issues.push("السجل التجاري (10 أرقام)");
  if (!p.street) issues.push("الشارع");
  if (!p.buildingNumber || !/^\d{4}$/.test(p.buildingNumber)) issues.push("رقم المبنى (4 أرقام)");
  if (!p.district) issues.push("الحي");
  if (!p.city) issues.push("المدينة");
  if (!p.postalCode || !/^\d{5}$/.test(p.postalCode)) issues.push("الرمز البريدي (5 أرقام)");
  return issues;
}

// ===== وحدة الإصدار =====

export async function getEgs() {
  return rawDb.zatcaEgs.findUnique({ where: { id: "singleton" } });
}

function credsOf(token: string | null | undefined, secret: string | null | undefined): ZatcaCredentials | null {
  return token && secret ? { token: decryptSecret(token), secret: decryptSecret(secret) } : null;
}

/** مستند نموذجي لفحص الامتثال (الأنواع الستة لوحدة "1100": قياسية ومبسّطة × فاتورة/دائن/مدين). */
function sampleInput(seller: SellerProfile, kind: ZatcaInvoiceKind, docType: ZatcaDocType, icv: number, pih: string): ZatcaInvoiceInput {
  return {
    kind, docType, number: `CMP-${icv}`, uuid: crypto.randomUUID(), issuedAt: new Date(Date.now() - 60_000), icv, previousHash: pih, seller,
    buyer: kind === "standard"
      ? { name: "منشأة اختبار الامتثال", vatNumber: "399999999800003", street: "شارع الاختبار", buildingNumber: "1111", district: "الحي", city: "الرياض", postalCode: "12222", country: "SA" }
      : { name: "عميل اختبار" },
    lines: [{ name: "اشتراك شهري — اختبار امتثال", quantity: 1, unitPriceExVat: 100, vatPercent: 15 }],
    billingReference: docType === "invoice" ? null : "CMP-ORIG", reason: docType === "invoice" ? null : "اختبار امتثال",
  };
}

export type OnboardInput = { environment: ZatcaEnvironment; otp: string; commonName: string; organizationUnit: string; businessCategory: string };

/**
 * تسجيل وحدة الإصدار: مفتاح + CSR ⇒ شهادة امتثال ⇒ فحص 6 مستندات نموذجية ⇒ شهادة الإنتاج ⇒ تفعيل.
 * أي رفض من الهيئة يُعاد برسالتها كما هي.
 */
export async function onboardEgs(input: OnboardInput): Promise<{ checks: Array<{ type: string; status: string }> }> {
  const seller = await getSellerProfile();
  const issues = sellerProfileIssues(seller);
  if (issues.length) throw new Error(`أكمل بيانات البائع أولاً: ${issues.join("، ")}`);
  if (!/^\d{6}$/.test(input.otp)) throw new Error("رمز OTP من بوابة فاتورة 6 أرقام");

  const { privateKeyPem } = generateEgsKeyPair();
  const { csrBase64 } = buildCsr(
    {
      environment: input.environment, commonName: input.commonName, organizationName: seller.name, organizationUnit: input.organizationUnit,
      vatNumber: seller.vatNumber!, serialNumber: `1-${SOLUTION.name}|2-${SOLUTION.version}|3-${crypto.randomUUID()}`, invoiceTypes: "1100",
      address: `${seller.buildingNumber} ${seller.street}, ${seller.city}`.slice(0, 120), businessCategory: input.businessCategory,
    },
    privateKeyPem,
  );
  const compliance = await requestComplianceCsid(input.environment, csrBase64, input.otp);

  const checks: Array<{ type: string; status: string }> = [];
  let pih = INITIAL_PIH;
  let icv = 0;
  for (const kind of ["standard", "simplified"] as const) {
    for (const docType of ["invoice", "credit", "debit"] as const) {
      icv++;
      const sample = sampleInput(seller, kind, docType, icv, pih);
      const signed = signInvoice(sample, compliance.token, privateKeyPem);
      const r = await complianceCheck(input.environment, compliance, { invoiceHash: signed.invoiceHash, uuid: sample.uuid, invoice: Buffer.from(signed.xml, "utf8").toString("base64") });
      checks.push({ type: `${kind}/${docType}`, status: r.validationStatus ?? `HTTP ${r.httpStatus}` });
      if (!r.ok) {
        const detail = r.messages.filter((m) => m.type === "ERROR").map((m) => `${m.code}: ${m.message}`).join(" | ") || `HTTP ${r.httpStatus}`;
        throw new Error(`فشل فحص الامتثال (${kind}/${docType}): ${detail}`);
      }
      pih = signed.invoiceHash;
    }
  }

  const production = await requestProductionCsid(input.environment, compliance, compliance.requestId);
  const data = {
    environment: input.environment, status: "ACTIVE", commonName: input.commonName,
    encryptedPrivateKey: encryptSecret(privateKeyPem),
    encryptedComplianceToken: encryptSecret(compliance.token), encryptedComplianceSecret: encryptSecret(compliance.secret), complianceRequestId: compliance.requestId,
    encryptedProductionToken: encryptSecret(production.token), encryptedProductionSecret: encryptSecret(production.secret),
    icv: 0, lastInvoiceHash: INITIAL_PIH, activatedAt: new Date(), lastError: null,
  };
  await rawDb.zatcaEgs.upsert({ where: { id: "singleton" }, update: data, create: { id: "singleton", ...data } });
  return { checks };
}

// ===== مستندات الفواتير =====

const pad = (n: number, w: number) => String(n).padStart(w, "0");
export const invoiceLabel = (inv: { invoiceNumber: number; createdAt: Date }) => `INV-${inv.createdAt.getFullYear()}-${pad(inv.invoiceNumber, 5)}`;

/** صافي بخانتين يحقق: صافي + ضريبة (مقرّبة) = الإجمالي المدفوع بالضبط. */
export function splitInclusive(total: number, vatPercent: number): { net: number; vat: number } {
  const r2 = (n: number) => Math.round(n * 100) / 100;
  let net = r2(total / (1 + vatPercent / 100));
  for (let i = 0; i < 6; i++) {
    const vat = r2(net * vatPercent / 100);
    const diff = r2(total - (net + vat));
    if (diff === 0) return { net, vat };
    net = r2(net + (diff > 0 ? 0.01 : -0.01));
  }
  return { net, vat: r2(total - net) };
}

type InvoiceWithTenant = Prisma.InvoiceGetPayload<{ include: { tenant: true; creditNotes: true } }>;

function buyerOf(inv: InvoiceWithTenant): { kind: ZatcaInvoiceKind; buyer: ZatcaParty } {
  const t = inv.tenant;
  const standard = isValidVat(t.billingVatNumber) && !!(t.billingStreet && t.billingBuildingNumber && t.billingDistrict && t.billingCity && t.billingPostalCode);
  return standard
    ? {
        kind: "standard",
        buyer: {
          name: t.billingLegalName || t.name, vatNumber: t.billingVatNumber, street: t.billingStreet, buildingNumber: t.billingBuildingNumber,
          district: t.billingDistrict, city: t.billingCity, postalCode: t.billingPostalCode, country: "SA",
        },
      }
    : { kind: "simplified", buyer: { name: t.billingLegalName || t.name } };
}

function extractQr(xml: string): string | null {
  const m = /<cbc:ID>QR<\/cbc:ID>\s*<cac:Attachment>\s*<cbc:EmbeddedDocumentBinaryObject[^>]*>([^<]+)</.exec(xml);
  return m ? m[1]!.trim() : null;
}

async function submitDocument(egs: NonNullable<Awaited<ReturnType<typeof getEgs>>>, inv: InvoiceWithTenant, docType: "invoice" | "credit"): Promise<string> {
  const env = egs.environment as ZatcaEnvironment;
  const creds = credsOf(egs.encryptedProductionToken, egs.encryptedProductionSecret);
  if (!creds || !egs.encryptedPrivateKey) throw new Error("وحدة الإصدار غير مفعّلة");
  const seller = await getSellerProfile();
  let { kind, buyer } = buyerOf(inv);
  if (docType === "credit") {
    // الإشعار الدائن من نفس نوع فاتورته الأصلية دائماً — حتى لو أضاف التاجر رقمه الضريبي بعد إصدارها.
    const original = await superAdminDb.zatcaDocument.findUnique({ where: { invoiceId_docType: { invoiceId: inv.id, docType: "invoice" } }, select: { kind: true } });
    if (original?.kind === "simplified" && kind === "standard") {
      kind = "simplified";
      buyer = { name: buyer.name };
    } else if (original?.kind === "standard" && kind === "simplified") {
      const message = "الفاتورة الأصلية قياسية لكن بيانات التاجر الضريبية لم تعد مكتملة — أكملها ثم أعد الإرسال";
      const messagesJson = [{ type: "ERROR", code: "BUYER_INCOMPLETE", message }] as unknown as Prisma.InputJsonValue;
      await superAdminDb.zatcaDocument.upsert({
        where: { invoiceId_docType: { invoiceId: inv.id, docType } },
        update: { status: "FAILED", messagesJson, attempts: { increment: 1 } },
        create: { invoiceId: inv.id, docType, kind: "standard", uuid: crypto.randomUUID(), status: "FAILED", messagesJson, attempts: 1 },
      });
      return "FAILED";
    }
  }
  const existing = await superAdminDb.zatcaDocument.findUnique({ where: { invoiceId_docType: { invoiceId: inv.id, docType } } });
  if (existing && ["REPORTED", "CLEARED"].includes(existing.status)) return existing.status;

  const plan = inv.planKey ? await superAdminDb.plan.findUnique({ where: { key: inv.planKey }, select: { name: true } }) : null;
  const vatPercent = inv.vatRateBps / 100;
  const { net } = splitInclusive(inv.amountSar, vatPercent);
  const creditNote = docType === "credit" ? inv.creditNotes.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())[0] : null;
  const icv = egs.icv + 1;
  const uuid = existing?.uuid ?? crypto.randomUUID();
  const input: ZatcaInvoiceInput = {
    kind, docType,
    number: docType === "invoice" ? invoiceLabel(inv) : `CN-${creditNote ? pad(creditNote.creditNoteNumber, 5) : inv.invoiceNumber}`,
    uuid, issuedAt: new Date(), icv, previousHash: egs.lastInvoiceHash ?? INITIAL_PIH, seller, buyer,
    lines: [{ name: `اشتراك باقة ${plan?.name ?? inv.planKey ?? ""} — DMS Tech`.trim(), quantity: 1, unitPriceExVat: net, vatPercent }],
    billingReference: docType === "credit" ? invoiceLabel(inv) : null,
    reason: docType === "credit" ? creditNote?.reason ?? "استرداد" : null,
  };
  const privateKeyPem = decryptSecret(egs.encryptedPrivateKey);
  const signed = signInvoice(input, creds.token, privateKeyPem);
  const payload = { invoiceHash: signed.invoiceHash, uuid, invoice: Buffer.from(signed.xml, "utf8").toString("base64") };

  const doc = existing
    ? await superAdminDb.zatcaDocument.update({ where: { id: existing.id }, data: { kind, attempts: { increment: 1 } } })
    : await superAdminDb.zatcaDocument.create({ data: { invoiceId: inv.id, docType, kind, uuid, attempts: 1 } });

  let result;
  try {
    result = kind === "standard" ? await clearInvoice(env, creds, payload) : await reportInvoice(env, creds, payload);
  } catch (err) {
    await superAdminDb.zatcaDocument.update({
      where: { id: doc.id },
      data: { status: "FAILED", messagesJson: [{ type: "ERROR", code: "NETWORK", message: err instanceof Error ? err.message : String(err) }] as unknown as Prisma.InputJsonValue },
    });
    return "FAILED";
  }

  const messages = result.messages as ValidationMessage[];
  if (result.ok) {
    const status = kind === "standard" ? "CLEARED" : "REPORTED";
    const finalXml = result.clearedInvoice ? Buffer.from(result.clearedInvoice, "base64").toString("utf8") : signed.xml;
    await superAdminDb.$transaction([
      superAdminDb.zatcaDocument.update({
        where: { id: doc.id },
        data: { status, icv, invoiceHash: signed.invoiceHash, xml: finalXml, qrBase64: extractQr(finalXml) ?? signed.qrBase64, messagesJson: messages as unknown as Prisma.InputJsonValue, submittedAt: new Date() },
      }),
      superAdminDb.zatcaEgs.update({ where: { id: "singleton" }, data: { icv, lastInvoiceHash: signed.invoiceHash, lastError: null } }),
    ]);
    egs.icv = icv;
    egs.lastInvoiceHash = signed.invoiceHash;
    return status;
  }
  // رفض تحقق (4xx بأخطاء قواعد) ⇒ REJECTED بلا تقدم للسلسلة؛ أخطاء خادم/مصادقة ⇒ FAILED تُعاد لاحقاً.
  const rejected = result.httpStatus === 400 && messages.some((m) => m.type === "ERROR");
  await superAdminDb.zatcaDocument.update({
    where: { id: doc.id },
    data: { status: rejected ? "REJECTED" : "FAILED", messagesJson: (messages.length ? messages : [{ type: "ERROR", code: String(result.httpStatus), message: JSON.stringify(result.raw ?? {}).slice(0, 300) }]) as unknown as Prisma.InputJsonValue },
  });
  if (result.httpStatus === 401) await superAdminDb.zatcaEgs.update({ where: { id: "singleton" }, data: { lastError: "رفضت ZATCA شهادة الإنتاج (401) — أعد تسجيل وحدة الإصدار" } });
  return rejected ? "REJECTED" : "FAILED";
}

const LOCK = "zatca:queue-lock";
const MAX_ATTEMPTS = 10;

/**
 * يعالج المستندات المستحقة بالترتيب (تحت قفل — سلسلة ICV/PIH لا تحتمل التوازي): فواتير مدفوعة بعد التفعيل
 * بلا مستند مقبول، ثم إشعارات دائنة للفواتير المستردّة التي قُبلت فاتورتها. فواتير غير الريال تُتخطى.
 */
export async function processZatcaQueue(): Promise<{ processed: number; accepted: number; skipped?: string }> {
  const egs = await getEgs();
  if (!egs || egs.status !== "ACTIVE" || !egs.activatedAt) return { processed: 0, accepted: 0, skipped: "وحدة الإصدار غير مفعّلة" };
  const owner = crypto.randomUUID();
  if ((await redisConnection.set(LOCK, owner, "EX", 600, "NX")) !== "OK") return { processed: 0, accepted: 0, skipped: "معالجة جارية" };
  let processed = 0;
  let accepted = 0;
  try {
    const pendingInvoices = await superAdminDb.invoice.findMany({
      where: {
        status: { in: ["PAID", "REFUNDED"] }, currency: "SAR", paidAt: { gte: egs.activatedAt }, amountSar: { gt: 0 },
        NOT: { zatcaDocuments: { some: { docType: "invoice", OR: [{ status: { in: ["REPORTED", "CLEARED", "REJECTED"] } }, { attempts: { gte: MAX_ATTEMPTS } }] } } },
      },
      include: { tenant: true, creditNotes: true },
      orderBy: { paidAt: "asc" },
      take: 50,
    });
    for (const inv of pendingInvoices) {
      const s = await submitDocument(egs, inv, "invoice");
      processed++;
      if (s === "REPORTED" || s === "CLEARED") accepted++;
    }
    const refunds = await superAdminDb.invoice.findMany({
      where: {
        status: "REFUNDED", currency: "SAR",
        zatcaDocuments: { some: { docType: "invoice", status: { in: ["REPORTED", "CLEARED"] } } },
        NOT: { zatcaDocuments: { some: { docType: "credit", OR: [{ status: { in: ["REPORTED", "CLEARED", "REJECTED"] } }, { attempts: { gte: MAX_ATTEMPTS } }] } } },
      },
      include: { tenant: true, creditNotes: true },
      take: 50,
    });
    for (const inv of refunds) {
      const s = await submitDocument(egs, inv, "credit");
      processed++;
      if (s === "REPORTED" || s === "CLEARED") accepted++;
    }
  } finally {
    if ((await redisConnection.get(LOCK)) === owner) await redisConnection.del(LOCK);
  }
  return { processed, accepted };
}

/** يعيد مستنداً مرفوضاً/فاشلاً للطابور (بعد تصحيح بيانات البائع أو المشتري). */
export async function retryZatcaDocument(documentId: string) {
  await superAdminDb.zatcaDocument.update({ where: { id: documentId }, data: { status: "PENDING", attempts: 0 } });
}

/** رمز QR الصادر للمرحلة الثانية لفاتورة (إن قُبلت لدى الهيئة) — للـPDF. */
export async function acceptedZatcaQr(invoiceId: string): Promise<string | null> {
  const doc = await superAdminDb.zatcaDocument.findUnique({ where: { invoiceId_docType: { invoiceId, docType: "invoice" } }, select: { status: true, qrBase64: true } });
  return doc && ["REPORTED", "CLEARED"].includes(doc.status) ? doc.qrBase64 : null;
}
