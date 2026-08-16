"use client";

import { useEffect, useRef, useState } from "react";

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
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting) {
          setVisible(true);
          observer.unobserve(el);
        }
      },
      { threshold: 0.15 }
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  return (
    <div
      ref={ref}
      style={{ transitionDelay: `${delay}ms` }}
      className={`transition-all duration-700 ease-out ${visible ? "translate-y-0 opacity-100" : "translate-y-6 opacity-0"} ${className}`}
    >
      {children}
    </div>
  );
}
