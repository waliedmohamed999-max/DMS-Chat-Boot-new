"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  createCampaign,
  previewAudienceCount,
  previewTriggerMatchCount,
  importCampaignAudienceFromExcel,
  type ImportCampaignAudienceResult,
} from "@/app/dashboard/campaigns/actions";
import { WhatsAppPreview } from "@/components/dashboard/WhatsAppPreview";
import { UpsellModal } from "@/components/dashboard/UpsellModal";
import { createStartNode } from "@/lib/chatbot/types";
import type { SegmentFilter } from "@/lib/campaigns/audience";
import type { CampaignLimits } from "@/lib/campaigns/limits";
import type { ContactStage, OrderStatus, TriggerEvent } from "@prisma/client";
import { STAGE_LABELS_AR } from "@/lib/contacts/stages";

type TemplateSummary = { id: string; name: string; bodyText: string; status: string; category: string };
type TagSummary = { id: string; name: string; color: string };

const STAGE_LABELS: Record<ContactStage | "ALL", string> = { ALL: "الكل", ...STAGE_LABELS_AR };
const ORDER_STATUS_LABELS: Record<OrderStatus, string> = {
  ABANDONED_CART: "سلة متروكة", PENDING: "بانتظار الدفع", PAID: "مدفوع",
  SHIPPED: "تم الشحن", DELIVERED: "تم التسليم", CANCELLED: "ملغي",
};

export type CampaignWizardInitialValues = {
  name?: string;
  type?: "ONE_TIME" | "TRIGGERED";
  audienceType?: "ALL" | "SEGMENT";
  filter?: SegmentFilter;
  templateId?: string;
  triggerEvent?: TriggerEvent;
  inactiveDays?: number;
};

export function CampaignWizard({
  storeName,
  templates,
  tags,
  campaignLimits,
  remainingQuota,
  bestSendHour,
  initialValues,
}: {
  storeName: string;
  templates: TemplateSummary[];
  tags: TagSummary[];
  campaignLimits: CampaignLimits;
  remainingQuota: number;
  bestSendHour: number | null;
  initialValues?: CampaignWizardInitialValues;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [upsell, setUpsell] = useState<null | "audience" | "quota" | "campaigns">(null);

  const [type, setType] = useState<"ONE_TIME" | "TRIGGERED">(initialValues?.type ?? "ONE_TIME");
  const [name, setName] = useState(initialValues?.name ?? "");
  const [stepIndex, setStepIndex] = useState(0);

  const [audienceType, setAudienceType] = useState<"ALL" | "SEGMENT">(initialValues?.audienceType ?? "ALL");
  const [audienceSource, setAudienceSource] = useState<"ALL" | "FILTER" | "EXCEL">(
    initialValues?.audienceType === "SEGMENT" ? "FILTER" : "ALL"
  );
  const [importResult, setImportResult] = useState<ImportCampaignAudienceResult | null>(null);
  const [isImporting, setIsImporting] = useState(false);
  const [stage, setStage] = useState<ContactStage | "ALL">(initialValues?.filter?.stage ?? "ALL");
  const [tagIds, setTagIds] = useState<string[]>(initialValues?.filter?.tagIds ?? []);
  const [activityMode, setActivityMode] = useState<"none" | "active_within" | "inactive_since">(
    initialValues?.filter?.activity?.mode ?? "none"
  );
  const [activityDays, setActivityDays] = useState(initialValues?.filter?.activity?.days ?? 30);
  const [orderEnabled, setOrderEnabled] = useState(Boolean(initialValues?.filter?.order));
  const [orderStatus, setOrderStatus] = useState<OrderStatus>(initialValues?.filter?.order?.status ?? "PAID");
  const [orderWithinDays, setOrderWithinDays] = useState(initialValues?.filter?.order?.withinDays ?? 30);

  const [audienceCount, setAudienceCount] = useState<number | null>(null);
  const [countLoading, setCountLoading] = useState(false);

  const [triggerEvent, setTriggerEvent] = useState<TriggerEvent>(initialValues?.triggerEvent ?? "ABANDONED_CART");
  const [inactiveDays, setInactiveDays] = useState(initialValues?.inactiveDays ?? 14);
  const [triggerMatchCount, setTriggerMatchCount] = useState<number | null>(null);

  const [templateId, setTemplateId] = useState(initialValues?.templateId ?? "");
  const [scheduleMode, setScheduleMode] = useState<"now" | "later">("now");
  const [scheduledAt, setScheduledAt] = useState("");

  const filter: SegmentFilter = {
    stage,
    tagIds,
    activity: activityMode === "none" ? null : { mode: activityMode, days: activityDays },
    order: orderEnabled ? { status: orderStatus, withinDays: orderWithinDays } : null,
  };

  const steps = type === "ONE_TIME" ? (["type", "audience", "template", "schedule", "confirm"] as const) : (["type", "trigger", "template", "confirm"] as const);
  const stepKey = steps[stepIndex]!;

  useEffect(() => {
    if (type !== "ONE_TIME" || stepKey !== "audience") return;
    setCountLoading(true);
    const handle = setTimeout(() => {
      previewAudienceCount({ audienceType, filter }).then((c) => {
        setAudienceCount(c);
        setCountLoading(false);
      });
    }, 350);
    return () => clearTimeout(handle);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [type, stepKey, audienceType, stage, tagIds.join(","), activityMode, activityDays, orderEnabled, orderStatus, orderWithinDays]);

  useEffect(() => {
    if (type !== "TRIGGERED" || stepKey !== "trigger") return;
    previewTriggerMatchCount(triggerEvent, { inactiveDays }).then(setTriggerMatchCount);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [type, stepKey, triggerEvent, inactiveDays]);

  const selectedTemplate = templates.find((t) => t.id === templateId);
  const previewText = selectedTemplate?.bodyText.replace(/\{\{1\}\}/g, "عميلك") ?? "";

  const audienceExceedsPlanLimit =
    type === "ONE_TIME" && campaignLimits.maxAudiencePerCampaign >= 0 && (audienceCount ?? 0) > campaignLimits.maxAudiencePerCampaign;
  const audienceExceedsQuota = type === "ONE_TIME" && (audienceCount ?? 0) > remainingQuota;

  function goNext() {
    if (stepKey === "type" && !name.trim()) { setError("اكتب اسم الحملة أولاً"); return; }
    if (stepKey === "template" && !templateId) { setError("اختر قالب رسالة معتمد"); return; }
    setError(null);
    setStepIndex((i) => Math.min(steps.length - 1, i + 1));
  }
  function goBack() {
    setError(null);
    setStepIndex((i) => Math.max(0, i - 1));
  }

  function handleSubmit() {
    if (audienceExceedsPlanLimit) { setUpsell("audience"); return; }
    if (audienceExceedsQuota) { setUpsell("quota"); return; }
    setError(null);
    startTransition(async () => {
      try {
        const { campaignId } = await createCampaign({
          name, type, templateId,
          ...(type === "ONE_TIME"
            ? { audienceType, segmentFilter: filter, scheduleMode, scheduledAt: scheduleMode === "later" ? scheduledAt : undefined }
            : {}),
          ...(type === "TRIGGERED" ? { triggerEvent, triggerConfig: { inactiveDays } } : {}),
        });
        router.push(`/dashboard/campaigns/${campaignId}`);
      } catch (e) {
        const message = e instanceof Error ? e.message : "تعذّر إنشاء الحملة";
        if (message.includes("عدد الحملات")) setUpsell("campaigns");
        else if (message.includes("رصيدك المتبقي")) setUpsell("quota");
        else if (message.includes("يتجاوز الحد المسموح")) setUpsell("audience");
        else setError(message);
      }
    });
  }

  const stepLabels: Record<string, string> = { type: "نوع الحملة", audience: "الجمهور", trigger: "الحدث المُشغِّل", template: "القالب", schedule: "الجدولة", confirm: "المراجعة والتأكيد" };

  return (
    <div className="space-y-5">
      <div className="flex items-center gap-1.5">
        {steps.map((s, i) => (
          <div key={s} className="flex flex-1 items-center gap-1.5">
            <div
              className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-xs font-bold ${
                i < stepIndex ? "bg-success-500 text-white" : i === stepIndex ? "bg-accent-500 text-white" : "bg-navy-700 text-slate-500"
              }`}
            >
              {i < stepIndex ? "✓" : i + 1}
            </div>
            {i < steps.length - 1 && <div className={`h-0.5 flex-1 ${i < stepIndex ? "bg-success-500" : "bg-navy-700"}`} />}
          </div>
        ))}
      </div>
      <p className="text-center text-xs text-slate-500">
        خطوة {stepIndex + 1} من {steps.length} — {stepLabels[stepKey]}
      </p>

      {error && <div className="rounded-lg border border-danger-500/30 bg-danger-500/10 px-3 py-2 text-xs text-danger-500">{error}</div>}

      <div className="card p-5">
        {stepKey === "type" && (
          <div className="space-y-4">
            <div>
              <label className="label-field">اسم الحملة</label>
              <input value={name} onChange={(e) => setName(e.target.value)} className="input-field" placeholder="مثال: عرض نهاية الأسبوع" />
            </div>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <button
                onClick={() => setType("ONE_TIME")}
                className={`rounded-xl border p-4 text-right ${type === "ONE_TIME" ? "border-accent-500 bg-accent-500/10" : "border-white/10 hover:bg-white/5"}`}
              >
                <p className="font-semibold text-white">📤 لمرة واحدة</p>
                <p className="mt-1 text-xs text-slate-400">إرسال فوري أو مجدول لجمهور محدد الآن، ينتهي بعد اكتمال الإرسال.</p>
              </button>
              <button
                onClick={() => setType("TRIGGERED")}
                className={`rounded-xl border p-4 text-right ${type === "TRIGGERED" ? "border-accent-500 bg-accent-500/10" : "border-white/10 hover:bg-white/5"}`}
              >
                <p className="font-semibold text-white">⚡ آلية (مبنية على حدث)</p>
                <p className="mt-1 text-xs text-slate-400">تعمل باستمرار وترسل تلقائياً كلما تحقق حدث معيّن (مثل سلة متروكة).</p>
              </button>
            </div>
          </div>
        )}

        {stepKey === "audience" && (
          <div className="space-y-4">
            <div className="flex gap-2">
              <button
                onClick={() => { setAudienceSource("ALL"); setAudienceType("ALL"); }}
                className={`btn-secondary flex-1 text-sm ${audienceSource === "ALL" ? "!bg-accent-500 !text-white" : ""}`}
              >
                كل جهات الاتصال
              </button>
              <button
                onClick={() => { setAudienceSource("FILTER"); setAudienceType("SEGMENT"); }}
                className={`btn-secondary flex-1 text-sm ${audienceSource === "FILTER" ? "!bg-accent-500 !text-white" : ""}`}
              >
                شريحة مخصصة (فلاتر)
              </button>
              <button
                onClick={() => {
                  setAudienceSource("EXCEL");
                  setAudienceType("SEGMENT");
                  setStage("ALL");
                  setActivityMode("none");
                  setOrderEnabled(false);
                  if (!importResult?.success) setTagIds([]);
                }}
                className={`btn-secondary flex-1 text-sm ${audienceSource === "EXCEL" ? "!bg-accent-500 !text-white" : ""}`}
              >
                استيراد قائمة من Excel
              </button>
            </div>

            {audienceSource === "EXCEL" && (
              <div className="space-y-3 rounded-lg border border-white/5 bg-navy-900 p-3">
                {!importResult?.success && (
                  <>
                    <div className="flex items-center justify-between">
                      <p className="text-xs text-slate-400">
                        ارفع ملف Excel/CSV بأعمدة: الاسم | الجوال | البريد الإلكتروني (اختياري) | الوسوم (اختياري).
                      </p>
                      <a href="/templates/contacts-import-template.xlsx" download className="whitespace-nowrap text-xs text-wa-500 hover:underline">
                        تحميل نموذج
                      </a>
                    </div>
                    <input
                      type="file"
                      accept=".xlsx,.xls,.csv"
                      className="input-field text-sm"
                      onChange={(e) => {
                        const file = e.target.files?.[0];
                        if (!file) return;
                        setIsImporting(true);
                        setImportResult(null);
                        const fd = new FormData();
                        fd.append("file", file);
                        importCampaignAudienceFromExcel(fd).then((res) => {
                          setIsImporting(false);
                          setImportResult(res);
                          if (res.success) setTagIds([res.tagId]);
                        });
                      }}
                    />
                    {isImporting && <p className="text-xs text-slate-400">جارٍ الاستيراد...</p>}
                    {importResult && !importResult.success && (
                      <p className="text-xs text-danger-500">{importResult.error}</p>
                    )}
                  </>
                )}
                {importResult?.success && (
                  <div className="space-y-2">
                    <p className="text-sm text-success-500">
                      ✅ تم استيراد القائمة: {importResult.imported} جديدة، {importResult.updated} محدَّثة
                      {importResult.skipped > 0 && `، ${importResult.skipped} تم تخطيها`}.
                    </p>
                    <button
                      type="button"
                      onClick={() => { setImportResult(null); setTagIds([]); }}
                      className="text-xs text-slate-400 hover:underline"
                    >
                      رفع ملف آخر بدلاً منه
                    </button>
                  </div>
                )}
              </div>
            )}

            {audienceSource === "FILTER" && (
              <div className="space-y-3 rounded-lg border border-white/5 bg-navy-900 p-3">
                <div>
                  <label className="label-field">مرحلة العميل</label>
                  <select value={stage} onChange={(e) => setStage(e.target.value as ContactStage | "ALL")} className="input-field text-sm">
                    {(["ALL", "LEAD", "CONTACTED", "CUSTOMER", "REPEAT"] as const).map((s) => (
                      <option key={s} value={s}>{STAGE_LABELS[s]}</option>
                    ))}
                  </select>
                </div>

                {tags.length > 0 && (
                  <div>
                    <label className="label-field">الوسوم</label>
                    <div className="flex flex-wrap gap-2">
                      {tags.map((t) => (
                        <label key={t.id} className="flex items-center gap-1.5 rounded-full border border-white/10 px-2.5 py-1 text-xs">
                          <input
                            type="checkbox"
                            checked={tagIds.includes(t.id)}
                            onChange={(e) => setTagIds((prev) => (e.target.checked ? [...prev, t.id] : prev.filter((id) => id !== t.id)))}
                          />
                          <span style={{ color: t.color }}>{t.name}</span>
                        </label>
                      ))}
                    </div>
                  </div>
                )}

                <div>
                  <label className="label-field">آخر تفاعل</label>
                  <div className="flex gap-2">
                    <select value={activityMode} onChange={(e) => setActivityMode(e.target.value as typeof activityMode)} className="input-field flex-1 text-sm">
                      <option value="none">بدون فلتر</option>
                      <option value="active_within">نشط خلال</option>
                      <option value="inactive_since">غير نشط منذ</option>
                    </select>
                    {activityMode !== "none" && (
                      <input
                        type="number" min={1} value={activityDays}
                        onChange={(e) => setActivityDays(parseInt(e.target.value, 10) || 1)}
                        className="input-field w-20 text-sm" dir="ltr"
                      />
                    )}
                    {activityMode !== "none" && <span className="flex items-center text-xs text-slate-400">يوم</span>}
                  </div>
                </div>

                <div>
                  <label className="flex items-center gap-1.5 text-xs text-slate-300">
                    <input type="checkbox" checked={orderEnabled} onChange={(e) => setOrderEnabled(e.target.checked)} />
                    استهداف حسب حالة طلب (زد/سلة)
                  </label>
                  {orderEnabled && (
                    <div className="mt-2 flex gap-2">
                      <select value={orderStatus} onChange={(e) => setOrderStatus(e.target.value as OrderStatus)} className="input-field flex-1 text-sm">
                        {Object.entries(ORDER_STATUS_LABELS).map(([k, v]) => (
                          <option key={k} value={k}>{v}</option>
                        ))}
                      </select>
                      <input
                        type="number" min={1} value={orderWithinDays}
                        onChange={(e) => setOrderWithinDays(parseInt(e.target.value, 10) || 1)}
                        className="input-field w-20 text-sm" dir="ltr"
                      />
                      <span className="flex items-center whitespace-nowrap text-xs text-slate-400">آخر (يوم)</span>
                    </div>
                  )}
                </div>

                <p className="text-[11px] text-slate-500">
                  ✅ يُستبعد تلقائياً أي عميل ألغى موافقته على استقبال الرسائل التسويقية، بصرف النظر عن الفلاتر أعلاه.
                </p>
              </div>
            )}

            <div className="rounded-lg border border-accent-500/30 bg-accent-500/10 p-4 text-center">
              <p className="text-xs text-slate-400">عدد المستلمين المتوقع</p>
              <p className="mt-1 text-3xl font-bold text-accent-400" dir="ltr">
                {countLoading ? "…" : (audienceCount ?? 0).toLocaleString("en-US")}
              </p>
              {audienceExceedsPlanLimit && (
                <p className="mt-2 text-xs text-warning-500">⚠️ يتجاوز حد باقتك ({campaignLimits.maxAudiencePerCampaign} كحد أقصى للحملة الواحدة)</p>
              )}
              {!audienceExceedsPlanLimit && audienceExceedsQuota && (
                <p className="mt-2 text-xs text-warning-500">⚠️ يتجاوز رصيدك المتبقي من الرسائل هذا الشهر ({Math.max(0, remainingQuota)})</p>
              )}
            </div>
          </div>
        )}

        {stepKey === "trigger" && (
          <div className="space-y-4">
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <button
                onClick={() => setTriggerEvent("ABANDONED_CART")}
                className={`rounded-xl border p-4 text-right ${triggerEvent === "ABANDONED_CART" ? "border-accent-500 bg-accent-500/10" : "border-white/10 hover:bg-white/5"}`}
              >
                <p className="font-semibold text-white">🛒 سلة متروكة</p>
                <p className="mt-1 text-xs text-slate-400">ترسل تلقائياً عند وجود طلب متروك من زد/سلة لم تُرسل له رسالة استرداد بعد.</p>
              </button>
              <button
                onClick={() => setTriggerEvent("CUSTOMER_INACTIVE")}
                className={`rounded-xl border p-4 text-right ${triggerEvent === "CUSTOMER_INACTIVE" ? "border-accent-500 bg-accent-500/10" : "border-white/10 hover:bg-white/5"}`}
              >
                <p className="font-semibold text-white">😴 عميل غير نشط</p>
                <p className="mt-1 text-xs text-slate-400">ترسل تلقائياً لأي عميل بلا أي محادثة منذ عدد الأيام المحدد.</p>
              </button>
            </div>

            {triggerEvent === "CUSTOMER_INACTIVE" && (
              <div className="flex items-center gap-2">
                <label className="label-field !mb-0">غير نشط منذ</label>
                <input
                  type="number" min={1} value={inactiveDays}
                  onChange={(e) => setInactiveDays(parseInt(e.target.value, 10) || 1)}
                  className="input-field w-24 text-sm" dir="ltr"
                />
                <span className="text-xs text-slate-400">يوم</span>
              </div>
            )}

            <div className="rounded-lg border border-accent-500/30 bg-accent-500/10 p-4 text-center">
              <p className="text-xs text-slate-400">مرشّحون مطابقون حالياً (تقديري — الحملة مستمرة وتستهدف حالات جديدة أولاً بأول)</p>
              <p className="mt-1 text-3xl font-bold text-accent-400" dir="ltr">{(triggerMatchCount ?? 0).toLocaleString("en-US")}</p>
            </div>
          </div>
        )}

        {stepKey === "template" && (
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            {templates.map((t) => {
              const approved = t.status === "APPROVED";
              const statusLabel = t.status === "APPROVED" ? "معتمد" : t.status === "PENDING" ? "بانتظار موافقة Meta" : t.status === "REJECTED" ? "مرفوض" : "مسودة";
              return (
                <button
                  key={t.id}
                  disabled={!approved}
                  onClick={() => setTemplateId(t.id)}
                  className={`rounded-xl border p-4 text-right ${!approved ? "cursor-not-allowed opacity-50" : templateId === t.id ? "border-accent-500 bg-accent-500/10" : "border-white/10 hover:bg-white/5"}`}
                >
                  <div className="mb-1 flex items-center justify-between">
                    <p className="font-medium text-white" dir="ltr">{t.name}</p>
                    <span className={`badge ${approved ? "bg-success-500/10 text-success-500" : "bg-warning-500/10 text-warning-500"}`}>
                      {approved ? "✓" : "🔒"} {statusLabel}
                    </span>
                  </div>
                  <p className="text-xs text-slate-400">{t.bodyText}</p>
                </button>
              );
            })}
            {templates.length === 0 && <p className="col-span-2 text-center text-sm text-slate-500">لا توجد قوالب بعد — أضف قالباً من صفحة قوالب الرسائل أولاً.</p>}
          </div>
        )}

        {stepKey === "schedule" && (
          <div className="space-y-4">
            <div className="flex gap-2">
              <button onClick={() => setScheduleMode("now")} className={`btn-secondary flex-1 text-sm ${scheduleMode === "now" ? "!bg-accent-500 !text-white" : ""}`}>
                إرسال فوري
              </button>
              <button onClick={() => setScheduleMode("later")} className={`btn-secondary flex-1 text-sm ${scheduleMode === "later" ? "!bg-accent-500 !text-white" : ""}`}>
                جدولة لوقت لاحق
              </button>
            </div>
            {scheduleMode === "later" && (
              <div>
                <label className="label-field">موعد الإرسال</label>
                <input type="datetime-local" value={scheduledAt} onChange={(e) => setScheduledAt(e.target.value)} className="input-field" dir="ltr" />
                {bestSendHour !== null && (
                  <p className="mt-1 text-xs text-slate-500">
                    💡 بناءً على نشاط عملائك الفعلي، أفضل وقت مقترح تقريباً حوالي الساعة {bestSendHour}:00
                  </p>
                )}
              </div>
            )}
            {scheduleMode === "later" && bestSendHour === null && (
              <p className="text-xs text-slate-500">لا توجد بيانات كافية بعد لاقتراح أفضل وقت إرسال دقيق.</p>
            )}
          </div>
        )}

        {stepKey === "confirm" && (
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
            <div className="space-y-3">
              <div className="rounded-lg border border-white/5 bg-navy-900 p-3 text-sm">
                <p className="text-slate-400">اسم الحملة</p>
                <p className="font-medium text-white">{name}</p>
              </div>
              <div className="rounded-lg border border-white/5 bg-navy-900 p-3 text-sm">
                <p className="text-slate-400">النوع</p>
                <p className="font-medium text-white">{type === "ONE_TIME" ? "لمرة واحدة" : "آلية مستمرة"}</p>
              </div>
              {type === "ONE_TIME" ? (
                <div className="rounded-lg border border-white/5 bg-navy-900 p-3 text-sm">
                  <p className="text-slate-400">الجمهور</p>
                  <p className="font-medium text-white" dir="ltr">{(audienceCount ?? 0).toLocaleString("en-US")} مستلم</p>
                  <p className="mt-1 text-xs text-slate-500">سيُستهلك {audienceCount ?? 0} رسالة من رصيدك ({Math.max(0, remainingQuota)} متبقية حالياً)</p>
                </div>
              ) : (
                <div className="rounded-lg border border-white/5 bg-navy-900 p-3 text-sm">
                  <p className="text-slate-400">الحدث المُشغِّل</p>
                  <p className="font-medium text-white">{triggerEvent === "ABANDONED_CART" ? "سلة متروكة" : `عميل غير نشط منذ ${inactiveDays} يوم`}</p>
                </div>
              )}
              <div className="rounded-lg border border-white/5 bg-navy-900 p-3 text-sm">
                <p className="text-slate-400">الجدولة</p>
                <p className="font-medium text-white">
                  {type === "TRIGGERED" ? "تفعيل فوري ومستمر" : scheduleMode === "now" ? "فوري بعد التأكيد" : scheduledAt ? new Date(scheduledAt).toLocaleString("ar-SA") : "—"}
                </p>
              </div>

              <button onClick={handleSubmit} disabled={isPending} className="btn-primary w-full">
                {isPending ? "جارٍ التنفيذ..." : type === "TRIGGERED" ? "🚀 تفعيل الحملة الآلية" : scheduleMode === "now" ? "🚀 إرسال الآن" : "📅 جدولة الحملة"}
              </button>
            </div>

            <div>
              <p className="mb-2 text-center text-xs font-medium text-slate-400">معاينة الرسالة</p>
              <WhatsAppPreview
                storeName={storeName}
                graph={{
                  nodes: [createStartNode(), { id: "preview", type: "message", label: previewText || "اختر قالباً لمعاينته", position: { x: 0, y: 0 } }],
                  edges: [{ id: "e1", source: "start", target: "preview" }],
                }}
              />
            </div>
          </div>
        )}
      </div>

      <div className="flex justify-between">
        <button onClick={goBack} disabled={stepIndex === 0} className="btn-secondary text-sm disabled:opacity-40">
          ← رجوع
        </button>
        {stepKey !== "confirm" && (
          <button onClick={goNext} className="btn-primary text-sm">
            التالي ←
          </button>
        )}
      </div>

      {upsell && (
        <UpsellModal
          title={
            upsell === "campaigns" ? "وصلت للحد الأقصى لعدد الحملات هذا الشهر"
            : upsell === "audience" ? "حجم الجمهور يتجاوز حد باقتك"
            : "حجم الجمهور يتجاوز رصيدك المتبقي من الرسائل"
          }
          description={
            upsell === "campaigns" ? "رقّي باقتك لإنشاء المزيد من الحملات هذا الشهر."
            : upsell === "audience" ? `باقتك الحالية تسمح بحد أقصى ${campaignLimits.maxAudiencePerCampaign} مستلم للحملة الواحدة.`
            : "رقّي باقتك لزيادة رصيدك الشهري من الرسائل، أو قلّص حجم الجمهور المستهدف."
          }
          requiredTierLabel="ترقية الباقة"
          onClose={() => setUpsell(null)}
        />
      )}
    </div>
  );
}
