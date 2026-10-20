import crypto from "crypto";
import { bitString, context, integer, octetString, oid, printable, rdn, seq, set, utf8 } from "./asn1";

/**
 * طلب شهادة توقيع الفواتير (CSR) لوحدة إصدار فواتير (EGS) حسب مواصفات ZATCA للمرحلة الثانية:
 *  - مفتاح ECDSA على المنحنى secp256k1، والتوقيع ecdsa-with-SHA256.
 *  - الموضوع: C=SA, OU=الفرع, O=اسم المنشأة, CN=اسم الوحدة.
 *  - امتداد اسم قالب الشهادة (1.3.6.1.4.1.311.20.2) حسب البيئة، وsubjectAltName (dirName) يحمل:
 *    SN = "1-{الحل}|2-{الإصدار}|3-{معرّف فريد}"، UID = الرقم الضريبي، title = أنواع الفواتير ("1100" = قياسية
 *    ومبسّطة)، registeredAddress = العنوان، businessCategory = النشاط.
 * الواجهة تتوقع Base64 لنص PEM كاملاً.
 */

export type ZatcaEnvironment = "sandbox" | "simulation" | "production";

export const ZATCA_BASE_URLS: Record<ZatcaEnvironment, string> = {
  sandbox: "https://gw-fatoora.zatca.gov.sa/e-invoicing/developer-portal",
  simulation: "https://gw-fatoora.zatca.gov.sa/e-invoicing/simulation",
  production: "https://gw-fatoora.zatca.gov.sa/e-invoicing/core",
};

const TEMPLATE_NAMES: Record<ZatcaEnvironment, string> = {
  sandbox: "TSTZATCA-Code-Signing",
  simulation: "PREZATCA-Code-Signing",
  production: "ZATCA-Code-Signing",
};

export type CsrInput = {
  environment: ZatcaEnvironment;
  commonName: string; // اسم وحدة الإصدار (مثال: DMS-EGS-1)
  organizationName: string;
  organizationUnit: string; // الفرع أو أول 10 أرقام من الرقم الضريبي للمجموعات
  vatNumber: string; // 15 رقماً يبدأ وينتهي بـ3
  serialNumber: string; // 1-...|2-...|3-...
  invoiceTypes: string; // "1100" قياسية + مبسّطة
  address: string;
  businessCategory: string;
};

export function generateEgsKeyPair(): { privateKeyPem: string; publicKeyDer: Buffer } {
  const { privateKey, publicKey } = crypto.generateKeyPairSync("ec", { namedCurve: "secp256k1" });
  return {
    privateKeyPem: privateKey.export({ type: "sec1", format: "pem" }).toString(),
    publicKeyDer: publicKey.export({ type: "spki", format: "der" }) as Buffer,
  };
}

export function buildCsr(input: CsrInput, privateKeyPem: string): { csrPem: string; csrBase64: string } {
  const privateKey = crypto.createPrivateKey(privateKeyPem);
  const spki = crypto.createPublicKey(privateKey).export({ type: "spki", format: "der" }) as Buffer;

  const subject = seq(
    rdn("2.5.4.6", printable("SA")),
    rdn("2.5.4.11", utf8(input.organizationUnit)),
    rdn("2.5.4.10", utf8(input.organizationName)),
    rdn("2.5.4.3", utf8(input.commonName)),
  );
  const directoryName = seq(
    rdn("2.5.4.4", utf8(input.serialNumber)), // SN (surname)
    rdn("0.9.2342.19200300.100.1.1", utf8(input.vatNumber)), // UID
    rdn("2.5.4.12", utf8(input.invoiceTypes)), // title
    rdn("2.5.4.26", utf8(input.address)), // registeredAddress
    rdn("2.5.4.15", utf8(input.businessCategory)), // businessCategory
  );
  const extensions = seq(
    seq(oid("1.3.6.1.4.1.311.20.2"), octetString(printable(TEMPLATE_NAMES[input.environment]))),
    seq(oid("2.5.29.17"), octetString(seq(context(4, directoryName)))),
  );
  const attributes = context(0, seq(oid("1.2.840.113549.1.9.14"), set(extensions)));
  const certificationRequestInfo = seq(integer(0), subject, spki, attributes);
  const signature = crypto.sign("sha256", certificationRequestInfo, privateKey); // DER ECDSA
  const csrDer = seq(certificationRequestInfo, seq(oid("1.2.840.10045.4.3.2")), bitString(signature));

  const b64 = csrDer.toString("base64").replace(/(.{64})/g, "$1\n").trim();
  const csrPem = `-----BEGIN CERTIFICATE REQUEST-----\n${b64}\n-----END CERTIFICATE REQUEST-----\n`;
  return { csrPem, csrBase64: Buffer.from(csrPem, "utf8").toString("base64") };
}
