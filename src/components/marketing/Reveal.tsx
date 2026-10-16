"use client";

import { useEffect, useRef } from "react";

/**
 * Fade-in/Slide-up خفيف عند وصول العنصر لنطاق الرؤية أثناء التمرير — بـIntersectionObserver خام
 * بدل مكتبة خارجية (framer-motion وغيرها)، حفاظاً على خفة الحزمة وسرعة التحميل الأولى للصفحة
 * التسويقية (أولوية صريحة في البرومنت). يُطبَّق مرة واحدة فقط (unobserve بعد الظهور الأول).
 */
export function Reveal({
  children,
  delay = 0,
  className = "",
}: {
  children: React.ReactNode;
  delay?: number;
  className?: string;
}) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el || !('IntersectionObserver' in window) || window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting) {
          el.animate(
            [{ opacity: 0.45, transform: 'translateY(16px)' }, { opacity: 1, transform: 'translateY(0)' }],
            { duration: 450, delay: Math.min(delay, 300), easing: 'ease-out' }
          );
          observer.unobserve(el);
        }
      },
      { threshold: 0.15 }
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, [delay]);

  return (
    <div
      ref={ref}
      className={className}
    >
      {children}
    </div>
  );
}
