import Link from "next/link";

export default function NoAccessPage({ searchParams }: { searchParams: { from?: string } }) {
  return (
    <div className="flex h-full flex-col items-center justify-center text-center">
      <div className="mb-4 text-5xl">🔒</div>
      <h1 className="mb-2 text-lg font-bold text-white">ليس لديك صلاحية للوصول لهذه الصفحة</h1>
      <p className="mb-6 max-w-sm text-sm text-slate-400">
        دورك الحالي في الفريق لا يسمح بالوصول لـ{searchParams.from ? ` "${searchParams.from}"` : " هذا الجزء"}.
        تواصل مع صاحب الحساب أو المدير إذا كنت تحتاج صلاحية إضافية.
      </p>
      <Link href="/dashboard" className="btn-primary">
        العودة للوحة التحكم
      </Link>
    </div>
  );
}
