import crypto from "crypto";
import { buildInvoiceXml, escText, invoiceTotals, ksaDateTime, money, type ZatcaInvoiceInput } from "./invoice";

/**
 * توقيع فاتورة ZATCA (XAdES-BES مضمّن في UBLExtensions) + رمز QR للمرحلة الثانية:
 *  1) بصمة الفاتورة = Base64(SHA-256(الشكل القياسي للفاتورة بلا UBLExtensions وcac:Signature ومرجع QR)).
 *  2) التوقيع = ECDSA-SHA256 بمفتاح وحدة الإصدار على بايتات البصمة.
 *  3) بصمة الشهادة = Base64(hex(SHA-256(نص الشهادة Base64))) — صيغة ZATCA.
 *  4) الخصائص الموقّعة (وقت التوقيع + بصمة الشهادة + المُصدِر والرقم التسلسلي) وبصمتها بنفس صيغة hex→Base64.
 *  5) QR (TLV): البائع، الرقم الضريبي، الوقت، الإجمالي، الضريبة، البصمة، التوقيع، المفتاح العام، وتوقيع
 *     الشهادة (الأخير للمبسّطة فقط).
 */

const DS = "http://www.w3.org/2000/09/xmldsig#";
const XADES = "http://uri.etsi.org/01903/v1.3.2#";

const sha256 = (data: string | Buffer) => crypto.createHash("sha256").update(data).digest();

/** نص الفاتورة الداخل في البصمة: بلا UBLExtensions ولا cac:Signature (بلا QR أصلاً عند البناء). */
export function hashableInvoice(input: ZatcaInvoiceInput): string {
  const xml = buildInvoiceXml(input).replace("<ext:UBLExtensions></ext:UBLExtensions>", "");
  const sigStart = xml.indexOf("<cac:Signature>");
  const sigEnd = xml.indexOf("</cac:Signature>") + "</cac:Signature>".length;
  return xml.slice(0, sigStart) + xml.slice(sigEnd);
}

export function invoiceHash(input: ZatcaInvoiceInput): string {
  return sha256(hashableInvoice(input)).toString("base64");
}

type CertInfo = { certBase64: string; hash: string; issuer: string; serialNumber: string; publicKeyDer: Buffer; certSignature: Buffer };

/** آخر BIT STRING في شهادة DER = توقيع الجهة المُصدِرة على الشهادة (حقل QR رقم 9). */
function certSignatureValue(der: Buffer): Buffer {
  // Certificate ::= SEQUENCE { tbsCertificate, signatureAlgorithm, signatureValue BIT STRING }
  const readLen = (buf: Buffer, pos: number): [number, number] => {
    const first = buf[pos]!;
    if (first < 0x80) return [first, pos + 1];
    const n = first & 0x7f;
    let len = 0;
    for (let i = 0; i < n; i++) len = (len << 8) | buf[pos + 1 + i]!;
    return [len, pos + 1 + n];
  };
  let [, pos] = readLen(der, 1); // داخل SEQUENCE الخارجي
  for (let i = 0; i < 2; i++) {
    const [len, start] = readLen(der, pos + 1);
    pos = start + len; // تخطي tbsCertificate ثم signatureAlgorithm
  }
  if (der[pos] !== 0x03) throw new Error("شهادة غير متوقعة: لا يوجد توقيع");
  const [len, start] = readLen(der, pos + 1);
  return der.subarray(start + 1, start + len); // تخطي بايت البتات غير المستخدمة
}

/** الشهادة القادمة من ZATCA (binarySecurityToken) = Base64 لنص الشهادة Base64. */
export function certificateInfo(binarySecurityToken: string): CertInfo {
  const certBase64 = Buffer.from(binarySecurityToken, "base64").toString("utf8").trim();
  const der = Buffer.from(certBase64, "base64");
  const x509 = new crypto.X509Certificate(der);
  return {
    certBase64,
    hash: Buffer.from(sha256(certBase64).toString("hex"), "utf8").toString("base64"),
    issuer: x509.issuer.split("\n").reverse().join(", "),
    serialNumber: BigInt(`0x${x509.serialNumber}`).toString(10),
    publicKeyDer: x509.publicKey.export({ type: "spki", format: "der" }) as Buffer,
    certSignature: certSignatureValue(der),
  };
}

function tlv(tag: number, value: Buffer): Buffer {
  if (value.length > 255) throw new Error(`حقل QR ${tag} أطول من 255 بايت`);
  return Buffer.concat([Buffer.from([tag, value.length]), value]);
}

/** الخصائص الموقّعة: نص المستند (بدون إعلانات النطاق الموروثة) ونص البصمة (بإعلانات Java namespace fixup). */
function signedProperties(signingTime: string, cert: CertInfo, forHash: boolean): string {
  const dsNs = forHash ? ` xmlns:ds="${DS}"` : "";
  const xadesNs = forHash ? ` xmlns:xades="${XADES}"` : "";
  return (
    `<xades:SignedProperties${xadesNs} Id="xadesSignedProperties"><xades:SignedSignatureProperties>` +
    `<xades:SigningTime>${signingTime}</xades:SigningTime><xades:SigningCertificate><xades:Cert><xades:CertDigest>` +
    `<ds:DigestMethod${dsNs} Algorithm="http://www.w3.org/2001/04/xmlenc#sha256"${forHash ? "/>" : "></ds:DigestMethod>"}` +
    `<ds:DigestValue${dsNs}>${cert.hash}</ds:DigestValue></xades:CertDigest><xades:IssuerSerial>` +
    `<ds:X509IssuerName${dsNs}>${escText(cert.issuer)}</ds:X509IssuerName><ds:X509SerialNumber${dsNs}>${cert.serialNumber}</ds:X509SerialNumber>` +
    `</xades:IssuerSerial></xades:Cert></xades:SigningCertificate></xades:SignedSignatureProperties></xades:SignedProperties>`
  );
}

export type SignedInvoice = { xml: string; invoiceHash: string; qrBase64: string; signature: string };

export function signInvoice(input: ZatcaInvoiceInput, binarySecurityToken: string, privateKeyPem: string, signingTime = new Date()): SignedInvoice {
  const cert = certificateInfo(binarySecurityToken);
  const hash = invoiceHash(input);
  const signature = crypto.sign("sha256", Buffer.from(hash, "base64"), crypto.createPrivateKey(privateKeyPem)).toString("base64");

  const { date, time } = ksaDateTime(signingTime);
  const signingTimeStr = `${date}T${time}`;
  const propsHash = Buffer.from(sha256(signedProperties(signingTimeStr, cert, true)).toString("hex"), "utf8").toString("base64");

  const totals = invoiceTotals(input.lines);
  const issued = ksaDateTime(input.issuedAt);
  const qr = Buffer.concat([
    tlv(1, Buffer.from(input.seller.name, "utf8")),
    tlv(2, Buffer.from(input.seller.vatNumber ?? "", "utf8")),
    tlv(3, Buffer.from(`${issued.date}T${issued.time}`, "utf8")),
    tlv(4, Buffer.from(money(totals.total), "utf8")),
    tlv(5, Buffer.from(money(totals.vat), "utf8")),
    tlv(6, Buffer.from(hash, "utf8")),
    tlv(7, Buffer.from(signature, "utf8")),
    tlv(8, cert.publicKeyDer),
    ...(input.kind === "simplified" ? [tlv(9, cert.certSignature)] : []),
  ]).toString("base64");

  const extension =
    `<ext:UBLExtension><ext:ExtensionURI>urn:oasis:names:specification:ubl:dsig:enveloped:xades</ext:ExtensionURI><ext:ExtensionContent>` +
    `<sig:UBLDocumentSignatures xmlns:sac="urn:oasis:names:specification:ubl:schema:xsd:SignatureAggregateComponents-2" xmlns:sbc="urn:oasis:names:specification:ubl:schema:xsd:SignatureBasicComponents-2" xmlns:sig="urn:oasis:names:specification:ubl:schema:xsd:CommonSignatureComponents-2">` +
    `<sac:SignatureInformation><cbc:ID>urn:oasis:names:specification:ubl:signature:1</cbc:ID>` +
    `<sbc:ReferencedSignatureID>urn:oasis:names:specification:ubl:signature:Invoice</sbc:ReferencedSignatureID>` +
    `<ds:Signature xmlns:ds="${DS}" Id="signature"><ds:SignedInfo>` +
    `<ds:CanonicalizationMethod Algorithm="http://www.w3.org/2006/12/xml-c14n11"></ds:CanonicalizationMethod>` +
    `<ds:SignatureMethod Algorithm="http://www.w3.org/2001/04/xmldsig-more#ecdsa-sha256"></ds:SignatureMethod>` +
    `<ds:Reference Id="invoiceSignedData" URI=""><ds:Transforms>` +
    `<ds:Transform Algorithm="http://www.w3.org/TR/1999/REC-xpath-19991116"><ds:XPath>not(//ancestor-or-self::ext:UBLExtensions)</ds:XPath></ds:Transform>` +
    `<ds:Transform Algorithm="http://www.w3.org/TR/1999/REC-xpath-19991116"><ds:XPath>not(//ancestor-or-self::cac:Signature)</ds:XPath></ds:Transform>` +
    `<ds:Transform Algorithm="http://www.w3.org/TR/1999/REC-xpath-19991116"><ds:XPath>not(//ancestor-or-self::cac:AdditionalDocumentReference[cbc:ID='QR'])</ds:XPath></ds:Transform>` +
    `<ds:Transform Algorithm="http://www.w3.org/2006/12/xml-c14n11"></ds:Transform></ds:Transforms>` +
    `<ds:DigestMethod Algorithm="http://www.w3.org/2001/04/xmlenc#sha256"></ds:DigestMethod><ds:DigestValue>${hash}</ds:DigestValue></ds:Reference>` +
    `<ds:Reference Type="http://www.w3.org/2000/09/xmldsig#SignatureProperties" URI="#xadesSignedProperties">` +
    `<ds:DigestMethod Algorithm="http://www.w3.org/2001/04/xmlenc#sha256"></ds:DigestMethod><ds:DigestValue>${propsHash}</ds:DigestValue></ds:Reference>` +
    `</ds:SignedInfo><ds:SignatureValue>${signature}</ds:SignatureValue>` +
    `<ds:KeyInfo><ds:X509Data><ds:X509Certificate>${cert.certBase64}</ds:X509Certificate></ds:X509Data></ds:KeyInfo>` +
    `<ds:Object><xades:QualifyingProperties xmlns:xades="${XADES}" Target="signature">${signedProperties(signingTimeStr, cert, false)}</xades:QualifyingProperties></ds:Object>` +
    `</ds:Signature></sac:SignatureInformation></sig:UBLDocumentSignatures></ext:ExtensionContent></ext:UBLExtension>`;

  const xml = `<?xml version="1.0" encoding="UTF-8"?>\n` + buildInvoiceXml(input, { signatureExtension: extension, qrBase64: qr });
  return { xml, invoiceHash: hash, qrBase64: qr, signature };
}
