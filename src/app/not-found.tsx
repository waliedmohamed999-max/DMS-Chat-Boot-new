import Link from "next/link";

export default function NotFound() {
  return (
    <div className="mx-auto flex min-h-[70vh] max-w-lg flex-col items-center justify-center px-4 text-center">
      <p className="text-sm font-bold text-wa-600 dark:text-wa-400">404</p>
      <h1 className="mt-2 text-2xl font-extrabold text-slate-900 dark:text-white">هذه الصفحة غير موجودة</h1>
      <p className="mt-3 text-slate-600 dark:text-slate-300">
        الرابط الذي اتّبعته قد يكون قديماً أو غير صحيح. تحقّق من العنوان أو ارجع للصفحة الرئيسية.
      </p>
      <Link
        href="/"
        className="mt-8 rounded-lg bg-wa-500 px-6 py-3 text-center text-base font-bold text-white shadow-card transition hover:bg-wa-600"
      >
        الرجوع للصفحة الرئيسية
      </Link>
    </div>
  );
}
