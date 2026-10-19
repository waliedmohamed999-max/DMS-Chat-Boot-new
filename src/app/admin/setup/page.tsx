import Link from "next/link";
import { requireSuperAdminSession } from "@/lib/session";
import { hasEffectivePermission } from "@/lib/rbac";
import { getSetupSections, type CheckLevel } from "@/lib/setupReadiness";
import { CopyField, TestConnectionButton } from "./SetupClient";

export const metadata = { title: "جاهزية الربط — DMS Tech" };
export const dynamic = "force-dynamic";

const ICON: Record<CheckLevel, string> = { ok: "✅", warn: "⚠️", missing: "❌" };
const COLOR: Record<CheckLevel, string> = { ok: "text-slate-300", warn: "text-warning-500", missing: "text-danger-500" };

export default async function SetupReadinessPage() {
  const session = await requireSuperAdminSession();
  if (!hasEffectivePermission(session.user.permissions, "platform.settings.manage")) {
    return <div className="card p-8 text-center text-slate-400">ليس لديك صلاحية عرض هذه الصفحة.</div>;
  }
  const sections = await getSetupSections();
  const all = sections.flatMap((s) => s.checks);
  const missing = all.filter((c) => c.level === "missing").length;
  const ready = sections.map((s) => ({ title: s.title, ok: s.checks.every((c) => c.level !== "missing") }));

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-bold text-white">جاهزية الربط</h1>
        <p className="text-sm text-slate-400">
          كل ما تحتاجه المنصة من حسابات خارجية للإطلاق الحقيقي. المتغيرات تُضاف في Hostinger ← Environment Variables ثم إعادة النشر؛
          الروابط أدناه تُلصق في لوحة كل مزوّد. الخطوات الكاملة في docs/GO_LIVE.md.
        </p>
      </div>

      <div className={`card p-4 ${missing ? "border border-warning-500/30" : "border border-success-500/30"}`}>
        <p className={`font-semibold ${missing ? "text-warning-500" : "text-success-500"}`}>
          {missing ? `ينقص ${missing} إعداد قبل الإطلاق` : "كل الإعدادات الأساسية مضبوطة ✓"}
        </p>
        <div className="mt-2 flex flex-wrap gap-2">
          {ready.map((r) => (
            <span key={r.title} className={`badge ${r.ok ? "bg-success-500/10 text-success-500" : "bg-danger-500/10 text-danger-500"}`}>
              {r.ok ? "✓" : "✗"} {r.title}
            </span>
          ))}
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        {sections.map((s) => (
          <section key={s.key} className="card space-y-3 p-5">
            <div>
              <h2 className="font-bold text-white">{s.title}</h2>
              <p className="text-xs text-slate-400">{s.description}</p>
            </div>
            <ul className="space-y-1 text-sm">
              {s.checks.map((c) => (
                <li key={c.label} className={`flex flex-wrap justify-between gap-2 ${COLOR[c.level]}`}>
                  <span>{ICON[c.level]} <span dir="ltr">{c.label}</span></span>
                  {c.detail && <span className="text-xs text-slate-500">{c.detail}</span>}
                </li>
              ))}
            </ul>
            {s.urls && (
              <div className="space-y-2 border-t border-white/5 pt-3">
                <p className="text-xs font-semibold text-slate-300">روابط تُلصق في لوحة المزوّد</p>
                {s.urls.map((u) => <CopyField key={u.label} label={u.label} value={u.value} />)}
              </div>
            )}
            <div className="flex flex-wrap items-center gap-3 border-t border-white/5 pt-3">
              {s.testable && (s.key === "core" || s.key === "d360" || s.key === "moyasar") && <TestConnectionButton kind={s.key} />}
              {s.key === "email" && <Link href="/admin/settings" className="text-xs text-accent-400 hover:underline">إرسال بريد تجريبي من إعدادات المنصة ←</Link>}
              {s.key === "salla" && <Link href="/admin/salla" className="text-xs text-accent-400 hover:underline">ضبط تطبيق سلة ←</Link>}
              {s.key === "zid" && <Link href="/admin/zid" className="text-xs text-accent-400 hover:underline">ضبط تطبيق زد ←</Link>}
              {s.key === "pricing" && <Link href="/admin/messaging" className="text-xs text-accent-400 hover:underline">ضبط الأسعار والهامش ←</Link>}
            </div>
          </section>
        ))}
      </div>
    </div>
  );
}
