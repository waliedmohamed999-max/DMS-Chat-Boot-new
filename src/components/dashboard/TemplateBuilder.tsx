"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { WhatsAppPreview } from "@/components/dashboard/WhatsAppPreview";
import { createStartNode } from "@/lib/chatbot/types";

type ButtonInput = { type: "QUICK_REPLY" | "URL" | "PHONE_NUMBER"; text: string; value: string };

const CATEGORY_INFO: Record<string, { label: string; description: string }> = {
  UTILITY: { label: "خدمي (Utility)", description: "لتحديثات ضرورية للعميل (حالة طلب، فاتورة، تذكير موعد) — عادة أسرع اعتماداً وأقل تكلفة." },
  MARKETING: { label: "ترويجي (Marketing)", description: "لعروض وخصومات وحملات تسويقية — مراجعة أدق من Meta وتكلفة أعلى، ويتطلب موافقة العميل الصريحة على الرسائل التسويقية." },
  AUTHENTICATION: { label: "توثيق (Authentication)", description: "لرموز التحقق (OTP) فقط — الأسرع اعتماداً، بصياغة مقيَّدة من Meta لا تسمح بأي محتوى تسويقي." },
};

export function TemplateBuilder({
  storeName,
  createTemplate,
  editFromId,
  initialValues,
}: {
  storeName: string;
  createTemplate: (formData: FormData) => Promise<void>;
  editFromId?: string;
  initialValues?: { name?: string; category?: string; language?: string; headerType?: string; headerText?: string; bodyText?: string; footerText?: string };
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const [category, setCategory] = useState(initialValues?.category ?? "UTILITY");
  const [language, setLanguage] = useState(initialValues?.language ?? "ar");
  const [headerType, setHeaderType] = useState(initialValues?.headerType ?? "NONE");
  const [headerText, setHeaderText] = useState(initialValues?.headerText ?? "");
  const [bodyText, setBodyText] = useState(initialValues?.bodyText ?? "");
  const [footerText, setFooterText] = useState(initialValues?.footerText ?? "");
  const [buttons, setButtons] = useState<ButtonInput[]>([]);

  function addButton() {
    if (buttons.length >= 3) return;
    setButtons((prev) => [...prev, { type: "QUICK_REPLY", text: "", value: "" }]);
  }
  function updateButton(i: number, patch: Partial<ButtonInput>) {
    setButtons((prev) => prev.map((b, idx) => (idx === i ? { ...b, ...patch } : b)));
  }
  function removeButton(i: number) {
    setButtons((prev) => prev.filter((_, idx) => idx !== i));
  }

  const previewBody = useMemo(() => {
    const parts = [];
    if (headerType === "TEXT" && headerText) parts.push(`*${headerText}*`);
    if (headerType !== "NONE" && headerType !== "TEXT") parts.push(`📎 [${headerType === "IMAGE" ? "صورة" : headerType === "VIDEO" ? "فيديو" : "مستند"}]`);
    parts.push(bodyText.replace(/\{\{1\}\}/g, "عميلك"));
    if (footerText) parts.push(`_${footerText}_`);
    return parts.join("\n\n");
  }, [headerType, headerText, bodyText, footerText]);

  function handleSubmit(formData: FormData) {
    setError(null);
    formData.set("headerType", headerType);
    formData.set("headerText", headerText);
    formData.set("footerText", footerText);
    formData.set("buttonsJson", JSON.stringify(buttons.filter((b) => b.text.trim())));
    if (editFromId) formData.set("editFrom", editFromId);
    startTransition(async () => {
      try {
        await createTemplate(formData);
        router.push("/dashboard/templates");
      } catch (e) {
        setError(e instanceof Error ? e.message : "تعذّر إرسال القالب");
      }
    });
  }

  return (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-[1fr_280px]">
      <form action={handleSubmit} className="card space-y-4 p-5">
        {error && <p className="rounded-lg bg-danger-500/10 px-3 py-2 text-xs text-danger-500">{error}</p>}

        <div>
          <label className="label-field">الفئة</label>
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
            {Object.entries(CATEGORY_INFO).map(([key, info]) => (
              <button
                type="button"
                key={key}
                onClick={() => setCategory(key)}
                className={`rounded-lg border p-2.5 text-right text-xs ${category === key ? "border-accent-500 bg-accent-500/10" : "border-white/10 hover:bg-white/5"}`}
              >
                <p className="font-medium text-white">{info.label}</p>
                <p className="mt-1 text-[11px] text-slate-500">{info.description}</p>
              </button>
            ))}
          </div>
          <input type="hidden" name="category" value={category} />
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="label-field">الاسم (إنجليزي، بدون مسافات)</label>
            <input name="name" defaultValue={initialValues?.name} required className="input-field" placeholder="order_status_update" dir="ltr" />
          </div>
          <div>
            <label className="label-field">اللغة</label>
            <select name="language" value={language} onChange={(e) => setLanguage(e.target.value)} className="input-field">
              <option value="ar">العربية</option>
              <option value="en">English</option>
            </select>
          </div>
        </div>

        <div>
          <label className="label-field">الترويسة (Header) — اختياري</label>
          <select value={headerType} onChange={(e) => setHeaderType(e.target.value)} className="input-field mb-2">
            <option value="NONE">بدون ترويسة</option>
            <option value="TEXT">نص</option>
            <option value="IMAGE">صورة</option>
            <option value="VIDEO">فيديو</option>
            <option value="DOCUMENT">مستند</option>
          </select>
          {headerType === "TEXT" && (
            <input value={headerText} onChange={(e) => setHeaderText(e.target.value)} className="input-field" placeholder="نص الترويسة" />
          )}
        </div>

        <div>
          <div className="mb-1 flex items-center justify-between">
            <label className="label-field !mb-0">نص الرسالة (Body)</label>
            <button type="button" onClick={() => setBodyText((b) => `${b}{{1}}`)} className="text-[11px] text-accent-400 hover:underline">
              + إدراج متغير (اسم العميل)
            </button>
          </div>
          <textarea name="bodyText" value={bodyText} onChange={(e) => setBodyText(e.target.value)} required rows={4} className="input-field" placeholder="مرحباً {{1}}، ..." />
          <p className="mt-1 text-[11px] text-slate-500">{"{{1}}"} = اسم العميل تلقائياً عند الإرسال الفعلي.</p>
        </div>

        <div>
          <label className="label-field">التذييل (Footer) — اختياري</label>
          <input value={footerText} onChange={(e) => setFooterText(e.target.value)} className="input-field" placeholder="مثال: يمكنك الرد بـ إيقاف لإلغاء الاشتراك" />
        </div>

        <div>
          <div className="mb-2 flex items-center justify-between">
            <label className="label-field !mb-0">الأزرار — اختياري (حتى 3)</label>
            {buttons.length < 3 && (
              <button type="button" onClick={addButton} className="text-[11px] text-accent-400 hover:underline">+ إضافة زر</button>
            )}
          </div>
          <div className="space-y-2">
            {buttons.map((b, i) => (
              <div key={i} className="flex gap-2">
                <select value={b.type} onChange={(e) => updateButton(i, { type: e.target.value as ButtonInput["type"] })} className="input-field !py-1.5 text-xs">
                  <option value="QUICK_REPLY">رد سريع</option>
                  <option value="URL">رابط</option>
                  <option value="PHONE_NUMBER">اتصال</option>
                </select>
                <input value={b.text} onChange={(e) => updateButton(i, { text: e.target.value })} className="input-field flex-1 !py-1.5 text-xs" placeholder="نص الزر" />
                {b.type !== "QUICK_REPLY" && (
                  <input value={b.value} onChange={(e) => updateButton(i, { value: e.target.value })} className="input-field flex-1 !py-1.5 text-xs" placeholder={b.type === "URL" ? "الرابط" : "رقم الهاتف"} dir="ltr" />
                )}
                <button type="button" onClick={() => removeButton(i)} className="text-xs text-danger-500">✕</button>
              </div>
            ))}
          </div>
        </div>

        <button type="submit" disabled={isPending} className="btn-primary w-full">
          {isPending ? "جارٍ الإرسال..." : "📤 إرسال لمراجعة Meta"}
        </button>
      </form>

      <div>
        <p className="mb-2 text-center text-xs font-medium text-slate-400">معاينة حية</p>
        <WhatsAppPreview
          storeName={storeName}
          graph={{
            nodes: [createStartNode(), { id: "preview", type: "message", label: previewBody || "اكتب محتوى القالب لمعاينته", position: { x: 0, y: 0 } }],
            edges: [{ id: "e1", source: "start", target: "preview" }],
          }}
        />
      </div>
    </div>
  );
}
