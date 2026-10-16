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
      <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" aria-hidden="true"><path d="M21 11.5a9 9 0 0 1-9.5 9A9.7 9.7 0 0 1 7 19.3L3 21l1.5-4.3A9 9 0 1 1 21 11.5Z" /><path d="M8 10h8M8 14h5" /></svg>
    </a>
  );
}
