import Link from "next/link";
import { redirect } from "next/navigation";
import { requireTenantSession } from "@/lib/session";
import { withTenant, rawDb } from "@/lib/db";
import { hasEffectivePermission } from "@/lib/rbac";
import { TemplateBuilder } from "@/components/dashboard/TemplateBuilder";
import { createTemplate } from "../actions";

export default async function NewTemplatePage({ searchParams }: { searchParams: { editFrom?: string } }) {
  const session = await requireTenantSession();
  const tenantId = session.user.tenantId;

  if (!hasEffectivePermission(session.user.permissions, "campaigns.manage")) {
    redirect(`/dashboard/no-access?from=${encodeURIComponent("إنشاء قالب رسالة")}`);
  }

  const [tenant, editSource] = await Promise.all([
    rawDb.tenant.findUniqueOrThrow({ where: { id: tenantId } }),
    searchParams.editFrom
      ? withTenant(tenantId, (tx) => tx.messageTemplate.findUnique({ where: { id: searchParams.editFrom, tenantId } }))
      : Promise.resolve(null),
  ]);

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <Link href="/dashboard/templates" className="text-sm text-accent-400 hover:underline">
        ← رجوع لقوالب الرسائل
      </Link>
      <div>
        <h1 className="text-xl font-bold text-white">{editSource ? "تعديل وإعادة إرسال القالب" : "قالب جديد"}</h1>
        <p className="text-sm text-slate-400">
          {editSource
            ? "القوالب لا تُعدَّل مباشرة في واتساب — عدّل المحتوى أدناه لإرساله كقالب جديد لمراجعة Meta."
            : "يُرسَل القالب فعلياً لمراجعة Meta فور الإرسال، وتتحدث حالته تلقائياً دون أي تدخل يدوي."}
        </p>
      </div>

      <TemplateBuilder
        storeName={tenant.name}
        createTemplate={createTemplate}
        editFromId={editSource?.id}
        initialValues={
          editSource
            ? {
                name: editSource.name, category: editSource.category, language: editSource.language,
                headerType: editSource.headerType ?? "NONE", headerText: editSource.headerText ?? "",
                bodyText: editSource.bodyText, footerText: editSource.footerText ?? "",
              }
            : undefined
        }
      />
    </div>
  );
}
