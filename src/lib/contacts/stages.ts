import type { ContactStage } from "@prisma/client";

/** مصدر واحد لتسميات مرحلة العميل — كانت مكررة سابقاً بنسخ منفصلة في 4 ملفات (انظر DECISIONS.md). */
export const CONTACT_STAGES_ORDERED: ContactStage[] = ["LEAD", "CONTACTED", "CUSTOMER", "REPEAT"];

export const STAGE_LABELS_AR: Record<ContactStage, string> = {
  LEAD: "عميل محتمل",
  CONTACTED: "تم التواصل",
  CUSTOMER: "عميل",
  REPEAT: "عميل متكرر",
};

export const STAGE_BADGE_CLASSNAMES: Record<ContactStage, string> = {
  LEAD: "bg-slate-500/10 text-slate-300",
  CONTACTED: "bg-warning-500/10 text-warning-500",
  CUSTOMER: "bg-accent-500/10 text-accent-400",
  REPEAT: "bg-success-500/10 text-success-500",
};

export const CONTACT_SOURCE_LABELS_AR: Record<string, string> = {
  MANUAL: "إضافة يدوية",
  IMPORT: "استيراد ملف",
  CAMPAIGN_IMPORT: "استيراد جمهور حملة",
  ZID_SYNC: "مزامنة زد",
  SALLA_SYNC: "مزامنة سلة",
};
