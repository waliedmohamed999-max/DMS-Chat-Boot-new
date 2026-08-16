import { superAdminDb } from "@/lib/db";
import { ensureChartOfAccounts, resolveRevenueAccountCode, ACCOUNT_CODES } from "@/lib/accounting/chartOfAccounts";

type JournalLineInput = { debitAccountCode?: string; creditAccountCode?: string; amountSar: number };

/**
 * ينشئ قيداً محاسبياً واحداً بعدة أسطر — **غير قابل للتعديل أو الحذف بعد الإنشاء** (لا mutation ولا
 * delete لأي JournalEntry/JournalLine في كل هذا المشروع). يرفض أي قيد غير متوازن (مجموع مدين ≠
 * مجموع دائن) قبل الكتابة — فحص تطبيقي وليس قيد قاعدة بيانات، لعدم وجود آلية عملية لفرض هذا عبر
 * قيود Postgres على مجموعة صفوف مرتبطة.
 */
export async function postJournalEntry(params: {
  description: string;
  sourceType: string;
  sourceId: string;
  lines: JournalLineInput[];
}): Promise<void> {
  const totalDebit = params.lines.reduce((sum, l) => sum + (l.debitAccountCode ? l.amountSar : 0), 0);
  const totalCredit = params.lines.reduce((sum, l) => sum + (l.creditAccountCode ? l.amountSar : 0), 0);
  if (totalDebit !== totalCredit) {
    throw new Error(`قيد محاسبي غير متوازن: مدين ${totalDebit} ≠ دائن ${totalCredit} (${params.description})`);
  }
  if (totalDebit === 0) return; // لا حركة فعلية (مثال: فاتورة بمبلغ صفري) — لا داعي لقيد فارغ

  const codes = [...new Set(params.lines.flatMap((l) => [l.debitAccountCode, l.creditAccountCode].filter(Boolean) as string[]))];
  const accounts = await superAdminDb.account.findMany({ where: { code: { in: codes } } });
  const codeToId = new Map(accounts.map((a) => [a.code, a.id]));
  for (const code of codes) {
    if (!codeToId.has(code)) throw new Error(`حساب غير موجود في دليل الحسابات: ${code}`);
  }

  await superAdminDb.journalEntry.create({
    data: {
      description: params.description,
      sourceType: params.sourceType,
      sourceId: params.sourceId,
      lines: {
        create: params.lines.map((l) => ({
          debitAccountId: l.debitAccountCode ? codeToId.get(l.debitAccountCode) : null,
          creditAccountId: l.creditAccountCode ? codeToId.get(l.creditAccountCode) : null,
          amountSar: l.amountSar,
        })),
      },
    },
  });
}

/** عند تحصيل فاتورة: مدين نقدية (كامل المبلغ) = دائن إيراد مؤجل (القيمة قبل الضريبة) + دائن ضريبة
 * مستحقة. الإيراد لا يُعترَف به فوراً بالكامل — يتحقق تدريجياً عبر lib/accounting/revenueRecognition.ts. */
export async function postInvoicePaymentEntry(invoice: { id: string; amountSar: number; vatAmountSar: number; planKey: string | null }): Promise<void> {
  await ensureChartOfAccounts();
  const subtotal = invoice.amountSar - invoice.vatAmountSar;

  await postJournalEntry({
    description: `تحصيل فاتورة #${invoice.id}`,
    sourceType: "invoice_payment",
    sourceId: invoice.id,
    lines: [
      { debitAccountCode: ACCOUNT_CODES.CASH, amountSar: invoice.amountSar },
      { creditAccountCode: ACCOUNT_CODES.DEFERRED_REVENUE, amountSar: subtotal },
      { creditAccountCode: ACCOUNT_CODES.VAT_PAYABLE, amountSar: invoice.vatAmountSar },
    ],
  });
}

/** الاعتراف التدريجي بجزء من الإيراد المؤجل كإيراد محقَّق فعلياً — مدين إيراد مؤجل، دائن حساب
 * الإيراد الفرعي الصحيح حسب الباقة. */
export async function postRevenueRecognitionEntry(invoiceId: string, amountSar: number, planKey: string | null): Promise<void> {
  if (amountSar <= 0) return;
  const revenueCode = planKey ? await resolveRevenueAccountCode(planKey) : ACCOUNT_CODES.REVENUE_ENTERPRISE;

  await postJournalEntry({
    description: `اعتراف بإيراد محقَّق — فاتورة #${invoiceId}`,
    sourceType: "revenue_recognition",
    sourceId: invoiceId,
    lines: [
      { debitAccountCode: ACCOUNT_CODES.DEFERRED_REVENUE, amountSar },
      { creditAccountCode: revenueCode, amountSar },
    ],
  });
}

/** استرداد فاتورة: يُسجَّل كمصروف "مبالغ مستردة" (وليس عكساً لقيود الإيراد السابقة — الإيراد التاريخي
 * يبقى كما هو، والاسترداد يُقيَّد في فترته الفعلية، ممارسة محاسبية قياسية وأبسط من إعادة حساب جداول
 * الاعتراف بالإيراد الجزئي). مدين مصروف مستردات + مدين ضريبة مستحقة (تُخفَّض) = دائن نقدية. */
export async function postRefundEntry(invoiceId: string, subtotalSar: number, vatAmountSar: number): Promise<void> {
  await ensureChartOfAccounts();
  await postJournalEntry({
    description: `استرداد فاتورة #${invoiceId}`,
    sourceType: "invoice_refund",
    sourceId: invoiceId,
    lines: [
      { debitAccountCode: ACCOUNT_CODES.EXPENSE_REFUNDS, amountSar: subtotalSar },
      { debitAccountCode: ACCOUNT_CODES.VAT_PAYABLE, amountSar: vatAmountSar },
      { creditAccountCode: ACCOUNT_CODES.CASH, amountSar: subtotalSar + vatAmountSar },
    ],
  });
}
