/**
 * فاتورة ZATCA (المرحلة الثانية) بصيغة UBL 2.1. تُولَّد مضغوطة (بلا مسافات بين العناصر) وبالترتيب القياسي
 * للسمات، فيكون نص الفاتورة بعد حذف (UBLExtensions + cac:Signature + مرجع QR) هو نفسه شكلها القياسي
 * C14N 1.1 الذي تحسب منه الهيئة البصمة — بلا تطبيع إضافي.
 */

export type ZatcaParty = {
  name: string;
  vatNumber?: string | null; // البائع: إلزامي. المشتري: إلزامي في الفاتورة القياسية فقط.
  crn?: string | null; // السجل التجاري (البائع)
  street?: string | null;
  buildingNumber?: string | null; // 4 أرقام
  district?: string | null;
  city?: string | null;
  postalCode?: string | null; // 5 أرقام
  country?: string; // SA
};

export type ZatcaLine = { name: string; quantity: number; unitPriceExVat: number; vatPercent: number };

export type ZatcaInvoiceKind = "simplified" | "standard";
export type ZatcaDocType = "invoice" | "credit" | "debit";

export type ZatcaInvoiceInput = {
  kind: ZatcaInvoiceKind;
  docType: ZatcaDocType;
  number: string; // رقم الفاتورة لدى البائع
  uuid: string;
  issuedAt: Date;
  icv: number; // عدّاد الفواتير المتسلسل لوحدة الإصدار
  previousHash: string; // PIH — بصمة الفاتورة السابقة (Base64)
  seller: ZatcaParty;
  buyer?: ZatcaParty | null;
  lines: ZatcaLine[];
  currency?: string;
  /** للإشعار الدائن/المدين: رقم الفاتورة الأصلية وسبب الإصدار (إلزاميان). */
  billingReference?: string | null;
  reason?: string | null;
  paymentMeansCode?: string; // 10 نقد، 30 تحويل، 42 حساب بنكي، 48 بطاقة
};

export const INITIAL_PIH = "NWZlY2ViNjZmZmM4NmYzOGQ5NTI3ODZjNmQ2OTZjNzljMmRiYzIzOWRkNGU5MWI0NjcyOWQ3M2EyN2ZiNTdlOQ==";

const NS = {
  inv: "urn:oasis:names:specification:ubl:schema:xsd:Invoice-2",
  cac: "urn:oasis:names:specification:ubl:schema:xsd:CommonAggregateComponents-2",
  cbc: "urn:oasis:names:specification:ubl:schema:xsd:CommonBasicComponents-2",
  ext: "urn:oasis:names:specification:ubl:schema:xsd:CommonExtensionComponents-2",
};

/** تهريب نص عنصر حسب C14N (& < > و\r). */
export function escText(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/\r/g, "&#xD;");
}
/** تهريب قيمة سمة حسب C14N. */
function escAttr(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/"/g, "&quot;").replace(/\t/g, "&#x9;").replace(/\n/g, "&#xA;").replace(/\r/g, "&#xD;");
}

/** عنصر بسمات مرتبة أبجدياً (كلها بلا بادئة نطاق — ترتيب C14N = حسب الاسم). */
function el(name: string, content: string, attrs: Record<string, string> = {}): string {
  const a = Object.keys(attrs).sort().map((k) => ` ${k}="${escAttr(attrs[k]!)}"`).join("");
  return `<${name}${a}>${content}</${name}>`;
}
const t = (name: string, value: string, attrs: Record<string, string> = {}) => el(name, escText(value), attrs);

export const money = (n: number) => (Math.round(n * 100) / 100).toFixed(2);
const cur = (currency: string) => ({ currencyID: currency });

function pad(n: number, w = 2) {
  return String(n).padStart(w, "0");
}
/** التاريخ والوقت بتوقيت السعودية (UTC+3) — كما يظهر في الفاتورة. */
export function ksaDateTime(d: Date): { date: string; time: string } {
  const k = new Date(d.getTime() + 3 * 3600 * 1000);
  return {
    date: `${k.getUTCFullYear()}-${pad(k.getUTCMonth() + 1)}-${pad(k.getUTCDate())}`,
    time: `${pad(k.getUTCHours())}:${pad(k.getUTCMinutes())}:${pad(k.getUTCSeconds())}`,
  };
}

function partyXml(p: ZatcaParty, role: "seller" | "buyer", kind: ZatcaInvoiceKind): string {
  const ident = role === "seller" && p.crn ? el("cac:PartyIdentification", t("cbc:ID", p.crn, { schemeID: "CRN" })) : "";
  const address =
    p.street || p.city || role === "seller" || kind === "standard"
      ? el(
          "cac:PostalAddress",
          (p.street ? t("cbc:StreetName", p.street) : "") +
            (p.buildingNumber ? t("cbc:BuildingNumber", p.buildingNumber) : "") +
            (p.district ? t("cbc:CitySubdivisionName", p.district) : "") +
            (p.city ? t("cbc:CityName", p.city) : "") +
            (p.postalCode ? t("cbc:PostalZone", p.postalCode) : "") +
            el("cac:Country", t("cbc:IdentificationCode", p.country ?? "SA")),
        )
      : "";
  const tax = p.vatNumber ? el("cac:PartyTaxScheme", t("cbc:CompanyID", p.vatNumber) + el("cac:TaxScheme", t("cbc:ID", "VAT"))) : role === "buyer" ? el("cac:PartyTaxScheme", el("cac:TaxScheme", t("cbc:ID", "VAT"))) : "";
  const legal = el("cac:PartyLegalEntity", t("cbc:RegistrationName", p.name));
  return el("cac:Party", ident + address + tax + legal);
}

export type InvoiceTotals = { net: number; vat: number; total: number };

export function invoiceTotals(lines: ZatcaLine[]): InvoiceTotals & { perLine: Array<{ net: number; vat: number }> } {
  const perLine = lines.map((l) => {
    const net = Math.round(l.quantity * l.unitPriceExVat * 100) / 100;
    const vat = Math.round(net * l.vatPercent) / 100;
    return { net, vat };
  });
  const net = perLine.reduce((s, x) => s + x.net, 0);
  const vat = perLine.reduce((s, x) => s + x.vat, 0);
  return { net: Math.round(net * 100) / 100, vat: Math.round(vat * 100) / 100, total: Math.round((net + vat) * 100) / 100, perLine };
}

const TYPE_CODES: Record<ZatcaDocType, string> = { invoice: "388", credit: "381", debit: "383" };

/**
 * يبني XML الفاتورة. `signatureExtension` و`qrBase64` فارغان عند حساب البصمة (لا يدخلان فيها أصلاً)، ثم
 * يُعاد البناء بهما بعد التوقيع.
 */
export function buildInvoiceXml(input: ZatcaInvoiceInput, opts: { signatureExtension?: string; qrBase64?: string } = {}): string {
  const currency = input.currency ?? "SAR";
  const { date, time } = ksaDateTime(input.issuedAt);
  const totals = invoiceTotals(input.lines);
  const vatPercent = input.lines[0]?.vatPercent ?? 15;

  const parts: string[] = [];
  parts.push(el("ext:UBLExtensions", opts.signatureExtension ?? ""));
  parts.push(t("cbc:ProfileID", "reporting:1.0"));
  parts.push(t("cbc:ID", input.number));
  parts.push(t("cbc:UUID", input.uuid));
  parts.push(t("cbc:IssueDate", date));
  parts.push(t("cbc:IssueTime", time));
  parts.push(t("cbc:InvoiceTypeCode", TYPE_CODES[input.docType], { name: input.kind === "standard" ? "0100000" : "0200000" }));
  parts.push(t("cbc:DocumentCurrencyCode", currency));
  parts.push(t("cbc:TaxCurrencyCode", "SAR"));
  if (input.docType !== "invoice" && input.billingReference) {
    parts.push(el("cac:BillingReference", el("cac:InvoiceDocumentReference", t("cbc:ID", input.billingReference))));
  }
  parts.push(el("cac:AdditionalDocumentReference", t("cbc:ID", "ICV") + t("cbc:UUID", String(input.icv))));
  parts.push(el("cac:AdditionalDocumentReference", t("cbc:ID", "PIH") + el("cac:Attachment", t("cbc:EmbeddedDocumentBinaryObject", input.previousHash, { mimeCode: "text/plain" }))));
  if (opts.qrBase64 !== undefined) {
    parts.push(el("cac:AdditionalDocumentReference", t("cbc:ID", "QR") + el("cac:Attachment", t("cbc:EmbeddedDocumentBinaryObject", opts.qrBase64, { mimeCode: "text/plain" }))));
  }
  parts.push(el("cac:Signature", t("cbc:ID", "urn:oasis:names:specification:ubl:signature:Invoice") + t("cbc:SignatureMethod", "urn:oasis:names:specification:ubl:dsig:enveloped:xades")));
  parts.push(el("cac:AccountingSupplierParty", partyXml(input.seller, "seller", input.kind)));
  parts.push(el("cac:AccountingCustomerParty", input.buyer ? partyXml(input.buyer, "buyer", input.kind) : ""));
  parts.push(el("cac:Delivery", t("cbc:ActualDeliveryDate", date)));
  parts.push(
    el(
      "cac:PaymentMeans",
      t("cbc:PaymentMeansCode", input.paymentMeansCode ?? "48") + (input.docType !== "invoice" && input.reason ? t("cbc:InstructionNote", input.reason) : ""),
    ),
  );
  const taxCategory = el(
    "cac:TaxCategory",
    t("cbc:ID", "S", { schemeAgencyID: "6", schemeID: "UN/ECE 5305" }) + t("cbc:Percent", money(vatPercent)) + el("cac:TaxScheme", t("cbc:ID", "VAT", { schemeAgencyID: "6", schemeID: "UN/ECE 5153" })),
  );
  parts.push(
    el(
      "cac:TaxTotal",
      t("cbc:TaxAmount", money(totals.vat), cur(currency)) +
        el("cac:TaxSubtotal", t("cbc:TaxableAmount", money(totals.net), cur(currency)) + t("cbc:TaxAmount", money(totals.vat), cur(currency)) + taxCategory),
    ),
  );
  parts.push(el("cac:TaxTotal", t("cbc:TaxAmount", money(totals.vat), cur("SAR"))));
  parts.push(
    el(
      "cac:LegalMonetaryTotal",
      t("cbc:LineExtensionAmount", money(totals.net), cur(currency)) +
        t("cbc:TaxExclusiveAmount", money(totals.net), cur(currency)) +
        t("cbc:TaxInclusiveAmount", money(totals.total), cur(currency)) +
        t("cbc:AllowanceTotalAmount", "0.00", cur(currency)) +
        t("cbc:PrepaidAmount", "0.00", cur(currency)) +
        t("cbc:PayableAmount", money(totals.total), cur(currency)),
    ),
  );
  input.lines.forEach((line, i) => {
    const { net, vat } = totals.perLine[i]!;
    parts.push(
      el(
        "cac:InvoiceLine",
        t("cbc:ID", String(i + 1)) +
          t("cbc:InvoicedQuantity", line.quantity.toFixed(6), { unitCode: "PCE" }) +
          t("cbc:LineExtensionAmount", money(net), cur(currency)) +
          el("cac:TaxTotal", t("cbc:TaxAmount", money(vat), cur(currency)) + t("cbc:RoundingAmount", money(net + vat), cur(currency))) +
          el("cac:Item", t("cbc:Name", line.name) + el("cac:ClassifiedTaxCategory", t("cbc:ID", "S") + t("cbc:Percent", money(line.vatPercent)) + el("cac:TaxScheme", t("cbc:ID", "VAT")))) +
          el("cac:Price", t("cbc:PriceAmount", money(line.unitPriceExVat), cur(currency))),
      ),
    );
  });

  return `<Invoice xmlns="${NS.inv}" xmlns:cac="${NS.cac}" xmlns:cbc="${NS.cbc}" xmlns:ext="${NS.ext}">${parts.join("")}</Invoice>`;
}
