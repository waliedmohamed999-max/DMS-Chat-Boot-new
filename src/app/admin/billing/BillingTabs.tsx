import Link from "next/link";

const TABS = [
  { href: "/admin/billing", label: "نظرة عامة وفواتير" },
  { href: "/admin/billing/accounts", label: "دليل الحسابات" },
  { href: "/admin/billing/ledger", label: "دفتر القيود" },
];

export function BillingTabs({ active }: { active: "overview" | "accounts" | "ledger" }) {
  const activeHref = active === "overview" ? "/admin/billing" : active === "accounts" ? "/admin/billing/accounts" : "/admin/billing/ledger";
  return (
    <div className="flex gap-2 border-b border-white/5 pb-2">
      {TABS.map((t) => (
        <Link
          key={t.href}
          href={t.href}
          className={`rounded-md px-3 py-1.5 text-sm ${t.href === activeHref ? "bg-accent-500/10 text-accent-400" : "text-slate-400 hover:bg-white/5"}`}
        >
          {t.label}
        </Link>
      ))}
    </div>
  );
}
