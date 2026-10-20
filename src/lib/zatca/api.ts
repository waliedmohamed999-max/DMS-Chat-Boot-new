import { ZATCA_BASE_URLS, type ZatcaEnvironment } from "./csr";

/**
 * عميل واجهة "فاتورة" (ZATCA Fatoora API v2):
 *  - /compliance            ← شهادة امتثال (CSID) مقابل CSR وOTP من بوابة فاتورة.
 *  - /compliance/invoices   ← فحص امتثال لمستند نموذجي.
 *  - /production/csids      ← شهادة الإنتاج بعد اجتياز الفحوص.
 *  - /invoices/reporting/single  ← إبلاغ فاتورة مبسّطة (خلال 24 ساعة).
 *  - /invoices/clearance/single  ← اعتماد فاتورة قياسية قبل تسليمها للمشتري.
 * عنوان الأساس قابل للتغيير عبر ZATCA_BASE_URL للاختبار بخادم وهمي.
 */

export type ZatcaCredentials = { token: string; secret: string };
export type ValidationMessage = { type: string; code: string; category?: string; message: string; status?: string };
export type ZatcaResult = {
  httpStatus: number;
  ok: boolean;
  validationStatus: string | null; // PASS | WARNING | ERROR
  reportingStatus?: string | null;
  clearanceStatus?: string | null;
  clearedInvoice?: string | null; // Base64 (للقياسية)
  messages: ValidationMessage[];
  raw?: unknown;
};

function baseUrl(env: ZatcaEnvironment): string {
  return (process.env.ZATCA_BASE_URL || ZATCA_BASE_URLS[env]).replace(/\/$/, "");
}

function basicAuth(c: ZatcaCredentials): string {
  return "Basic " + Buffer.from(`${c.token}:${c.secret}`).toString("base64");
}

const COMMON = { "Accept-Version": "V2", "Accept-Language": "ar", "Content-Type": "application/json", Accept: "application/json" };

async function call(env: ZatcaEnvironment, path: string, init: { headers: Record<string, string>; body: unknown }): Promise<{ status: number; body: any }> {
  const res = await fetch(`${baseUrl(env)}${path}`, {
    method: "POST",
    headers: { ...COMMON, ...init.headers },
    body: JSON.stringify(init.body),
    signal: AbortSignal.timeout(60_000),
  });
  const text = await res.text();
  let body: any = null;
  try {
    body = text ? JSON.parse(text) : null;
  } catch {
    body = { message: text.slice(0, 500) };
  }
  return { status: res.status, body };
}

function toResult(status: number, body: any): ZatcaResult {
  const v = body?.validationResults ?? {};
  const messages: ValidationMessage[] = [
    ...(Array.isArray(v.errorMessages) ? v.errorMessages : []),
    ...(Array.isArray(v.warningMessages) ? v.warningMessages : []),
    ...(Array.isArray(body?.errors) ? body.errors.map((e: any) => ({ type: "ERROR", code: String(e.code ?? ""), message: String(e.message ?? e) })) : []),
  ];
  if (!messages.length && status >= 400 && (body?.message || body?.errorMessage)) {
    messages.push({ type: "ERROR", code: String(status), message: String(body.message ?? body.errorMessage) });
  }
  const accepted = body?.reportingStatus === "REPORTED" || body?.clearanceStatus === "CLEARED";
  return {
    httpStatus: status,
    ok: (status === 200 || status === 202) && (accepted || v.status === "PASS" || v.status === "WARNING"),
    validationStatus: v.status ?? null,
    reportingStatus: body?.reportingStatus ?? null,
    clearanceStatus: body?.clearanceStatus ?? null,
    clearedInvoice: body?.clearedInvoice ?? null,
    messages,
    raw: status >= 400 ? body : undefined,
  };
}

export async function requestComplianceCsid(env: ZatcaEnvironment, csrBase64: string, otp: string) {
  const { status, body } = await call(env, "/compliance", { headers: { OTP: otp }, body: { csr: csrBase64 } });
  if (status !== 200 || !body?.binarySecurityToken) {
    const msg = body?.errors?.[0]?.message ?? body?.message ?? body?.dispositionMessage ?? `HTTP ${status}`;
    throw new Error(`رفضت ZATCA طلب شهادة الامتثال: ${msg}`);
  }
  return { token: String(body.binarySecurityToken), secret: String(body.secret), requestId: String(body.requestID) };
}

export async function complianceCheck(env: ZatcaEnvironment, creds: ZatcaCredentials, payload: { invoiceHash: string; uuid: string; invoice: string }) {
  const { status, body } = await call(env, "/compliance/invoices", { headers: { Authorization: basicAuth(creds) }, body: payload });
  return toResult(status, body);
}

export async function requestProductionCsid(env: ZatcaEnvironment, compliance: ZatcaCredentials, requestId: string) {
  const { status, body } = await call(env, "/production/csids", { headers: { Authorization: basicAuth(compliance) }, body: { compliance_request_id: requestId } });
  if (status !== 200 || !body?.binarySecurityToken) {
    const msg = body?.errors?.[0]?.message ?? body?.message ?? body?.dispositionMessage ?? `HTTP ${status}`;
    throw new Error(`رفضت ZATCA إصدار شهادة الإنتاج: ${msg}`);
  }
  return { token: String(body.binarySecurityToken), secret: String(body.secret) };
}

export async function reportInvoice(env: ZatcaEnvironment, creds: ZatcaCredentials, payload: { invoiceHash: string; uuid: string; invoice: string }) {
  const { status, body } = await call(env, "/invoices/reporting/single", { headers: { Authorization: basicAuth(creds), "Clearance-Status": "0" }, body: payload });
  return toResult(status, body);
}

export async function clearInvoice(env: ZatcaEnvironment, creds: ZatcaCredentials, payload: { invoiceHash: string; uuid: string; invoice: string }) {
  const { status, body } = await call(env, "/invoices/clearance/single", { headers: { Authorization: basicAuth(creds), "Clearance-Status": "1" }, body: payload });
  return toResult(status, body);
}
