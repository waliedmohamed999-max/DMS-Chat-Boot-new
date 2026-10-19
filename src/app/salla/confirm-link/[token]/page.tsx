import { AuthShell } from "@/components/auth/AuthShell";
import { LogoFull } from "@/components/Logo";
import { findPendingLink } from "@/lib/integrations/salla/intent";
import { ConfirmLinkForm } from "./ConfirmLinkForm";

export const metadata = { title: "تأكيد ربط متجر سلة — DMS Tech" };

// التأكيد بزر (POST عبر Server Action) وليس بمجرد فتح الرابط — ماسحات الروابط في برامج البريد تفتح
// الروابط تلقائياً، ولا يجب أن يؤدي ذلك إلى ربط متجر بالحساب.
export default async function ConfirmSallaLinkPage(props: { params: Promise<{ token: string }> }) {
  const { token } = await props.params;
  const intent = await findPendingLink(token);

  if (!intent) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-navy-900 px-4">
        <div className="card max-w-md p-8 text-center">
          <div className="mb-3 text-4xl">⚠️</div>
          <h1 className="mb-2 text-lg font-bold text-white">رابط غير صالح أو منتهي الصلاحية</h1>
          <p className="text-sm text-slate-400">رابط تأكيد ربط متجر سلة صالح 7 أيام ولاستخدام واحد. أعد تثبيت التطبيق من متجرك على سلة لطلب رابط جديد.</p>
        </div>
      </div>
    );
  }

  return (
    <AuthShell>
      <div className="mx-auto w-full max-w-md">
        <div className="mb-8 text-center">
          <div className="mb-4 flex justify-center lg:hidden">
            <LogoFull size="md" light />
          </div>
          <h1 className="text-2xl font-bold text-white">تأكيد ربط متجر سلة</h1>
          <p className="mt-2 text-sm text-slate-400">
            طُلب ربط متجر <strong className="text-white">{intent.storeName ?? "على سلة"}</strong> بحسابك
            (<span dir="ltr">{intent.requestedEmail}</span>). بعد التأكيد ستصل طلبات المتجر وعملاؤه ومنتجاته إلى حسابك.
          </p>
        </div>
        <div className="card p-6">
          <ConfirmLinkForm token={token} />
        </div>
      </div>
    </AuthShell>
  );
}
