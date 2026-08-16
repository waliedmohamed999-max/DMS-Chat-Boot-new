"use client";

import { useRef, useState, useTransition } from "react";
import { previewContactImport, confirmContactImport, type ImportPreviewResult, type CommitImportResult } from "./actions";
import type { DuplicateStrategy } from "@/lib/contacts/bulkImport";

export function ImportContactsForm() {
  const [preview, setPreview] = useState<ImportPreviewResult | null>(null);
  const [commitResult, setCommitResult] = useState<CommitImportResult | null>(null);
  const [duplicateStrategy, setDuplicateStrategy] = useState<DuplicateStrategy>("update");
  const [isPending, startTransition] = useTransition();
  const formRef = useRef<HTMLFormElement>(null);

  function handleUpload(formData: FormData) {
    setPreview(null);
    setCommitResult(null);
    startTransition(async () => {
      const res = await previewContactImport(formData);
      setPreview(res);
    });
  }

  function handleConfirm() {
    if (!preview?.success) return;
    startTransition(async () => {
      const res = await confirmContactImport(preview.sessionId, duplicateStrategy);
      setCommitResult(res);
      if (res.success) {
        setPreview(null);
        formRef.current?.reset();
      }
    });
  }

  function handleCancelPreview() {
    setPreview(null);
    formRef.current?.reset();
  }

  return (
    <div>
      <div className="mb-3 flex items-center justify-between">
        <h3 className="font-semibold text-white">استيراد من Excel/CSV</h3>
        <a href="/templates/contacts-import-template.xlsx" download className="text-xs text-wa-500 hover:underline">
          تحميل نموذج فارغ
        </a>
      </div>

      {!preview?.success && (
        <>
          <p className="mb-3 text-xs text-slate-400">
            الأعمدة المطلوبة بالترتيب: الاسم | الجوال | البريد الإلكتروني (اختياري) | الوسوم (اختياري، مفصولة بفاصلة).
            الحد الأقصى 2000 صف و5 ميجابايت لكل ملف.
          </p>
          <form ref={formRef} action={handleUpload} className="space-y-3">
            <input type="file" name="file" accept=".xlsx,.xls,.csv" required className="input-field text-sm" />
            <button type="submit" disabled={isPending} className="btn-secondary w-full text-sm disabled:opacity-50">
              {isPending ? "جارٍ التحليل..." : "رفع ومعاينة"}
            </button>
          </form>
        </>
      )}

      {preview && !preview.success && (
        <div className="mt-3 rounded-lg border border-danger-500/30 bg-danger-500/10 px-3 py-2 text-sm text-danger-500">
          {preview.error}
        </div>
      )}

      {preview?.success && (
        <div className="space-y-3 rounded-lg border border-white/10 bg-navy-900 p-3">
          <p className="text-sm text-slate-200">
            <span className="font-medium text-white">{preview.validRowsCount}</span> صف صالح
            {preview.duplicateCount > 0 && (
              <span className="text-warning-500"> — {preview.duplicateCount} منها رقم موجود مسبقاً</span>
            )}
            {preview.errors.length > 0 && <span className="text-danger-500"> — {preview.errors.length} صف سيُتخطى (أخطاء)</span>}
          </p>

          <div className="max-h-40 overflow-y-auto rounded border border-white/5">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b border-white/5 text-right text-slate-500">
                  <th className="p-1.5">الاسم</th>
                  <th className="p-1.5">الجوال</th>
                  <th className="p-1.5"></th>
                </tr>
              </thead>
              <tbody>
                {preview.previewRows.map((r, i) => (
                  <tr key={i} className="border-b border-white/5 last:border-0">
                    <td className="p-1.5 text-slate-300">{r.name}</td>
                    <td className="p-1.5 text-slate-400" dir="ltr">{r.phoneE164}</td>
                    <td className="p-1.5">
                      {r.isDuplicate && <span className="badge bg-warning-500/10 text-[10px] text-warning-500">مكرَّر</span>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {preview.validRowsCount > preview.previewRows.length && (
            <p className="text-xs text-slate-500">
              معاينة أول {preview.previewRows.length} فقط من أصل {preview.validRowsCount}.
            </p>
          )}

          {preview.duplicateCount > 0 && (
            <div>
              <label className="label-field text-xs">عند تكرار رقم الجوال:</label>
              <select
                value={duplicateStrategy}
                onChange={(e) => setDuplicateStrategy(e.target.value as DuplicateStrategy)}
                className="input-field text-xs"
              >
                <option value="update">تحديث بيانات الجهة الموجودة</option>
                <option value="skip">تجاهل (تخطّي الصف)</option>
              </select>
            </div>
          )}

          <div className="flex gap-2">
            <button onClick={handleConfirm} disabled={isPending} className="btn-primary flex-1 text-xs disabled:opacity-50">
              {isPending ? "جارٍ الاستيراد..." : "تأكيد الاستيراد"}
            </button>
            <button onClick={handleCancelPreview} disabled={isPending} className="btn-secondary text-xs">إلغاء</button>
          </div>
        </div>
      )}

      {commitResult && !commitResult.success && (
        <div className="mt-3 rounded-lg border border-danger-500/30 bg-danger-500/10 px-3 py-2 text-sm text-danger-500">
          {commitResult.error}
        </div>
      )}

      {commitResult?.success && (
        <div className="mt-3 space-y-2 rounded-lg border border-success-500/30 bg-success-500/10 px-3 py-2 text-sm text-success-500">
          <p>
            تم الاستيراد: {commitResult.imported} جديدة، {commitResult.updated} محدَّثة
            {commitResult.skipped > 0 && `، ${commitResult.skipped} تم تخطيها`}.
          </p>
          {commitResult.errors.length > 0 && (
            <ul className="max-h-32 space-y-0.5 overflow-y-auto text-xs text-warning-500">
              {commitResult.errors.slice(0, 20).map((e) => (
                <li key={e.row}>صف {e.row}: {e.reason}</li>
              ))}
              {commitResult.errors.length > 20 && <li>...و{commitResult.errors.length - 20} خطأ إضافي</li>}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
