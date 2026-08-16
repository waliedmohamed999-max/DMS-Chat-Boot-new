function toWaLink(phone: string): string {
  const digits = phone.replace(/[^\d]/g, "");
  return `https://wa.me/${digits}`;
}

/** ثابت في كل صفحات الموقع التسويقي — رقم واتساب حقيقي من إعدادات المنصة (وليس ثابتاً بالكود). */
export function FloatingWhatsAppButton({ phone }: { phone: string | null }) {
  if (!phone) return null;
  return (
    <a
      href={toWaLink(phone)}
      target="_blank"
      rel="noopener noreferrer"
      aria-label="تواصل معنا عبر واتساب"
      className="fixed bottom-5 left-5 z-50 flex h-14 w-14 items-center justify-center rounded-full bg-wa-500 text-2xl text-white shadow-lg transition hover:scale-105 hover:bg-wa-600"
    >
      💬
    </a>
  );
}
