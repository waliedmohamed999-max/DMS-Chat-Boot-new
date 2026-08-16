import Link from "next/link";

/**
 * مكوّن ترقيم صفحات مشترك — كان منسوخاً بنفس الشكل 3 مرات منفصلة (tenants list, contacts tab,
 * audit-log) قبل هذه الجولة. `basePath` + `params` تبني رابط كل رقم صفحة مع الحفاظ على أي فلاتر
 * حالية (بحث/حالة/باقة/ترتيب) في نفس الرابط.
 */
export function Pagination({ currentPage, totalPages, basePath, params = {} }: { currentPage: number; totalPages: number; basePath: string; params?: Record<string, string | undefined> }) {
  if (totalPages <= 1) return null;

  function hrefFor(page: number) {
    const search = new URLSearchParams();
    for (const [key, value] of Object.entries(params)) {
      if (value) search.set(key, value);
    }
    search.set("page", String(page));
    return `${basePath}?${search.toString()}`;
  }

  return (
    <div className="flex items-center justify-center gap-2 text-sm">
      {Array.from({ length: totalPages }, (_, i) => i + 1).map((p) => (
        <Link
          key={p}
          href={hrefFor(p)}
          className={`rounded-md px-3 py-1 ${p === currentPage ? "bg-accent-500 text-white" : "text-slate-400 hover:bg-white/5"}`}
        >
          {p}
        </Link>
      ))}
    </div>
  );
}
