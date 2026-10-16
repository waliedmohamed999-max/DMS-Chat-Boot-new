import Link from "next/link";
import { ArrowUpLeft, Plus } from "lucide-react";

export function MarketingFaq({ items, title = "كل ما تحتاج معرفته" }: { items: { q: string; a: string }[]; title?: string }) {
  return (
    <section className="public-faq">
      <div className="public-faq-intro">
        <span className="public-kicker">الأسئلة الشائعة</span>
        <h2>{title}</h2>
        <p>إجابات واضحة تساعدك على اتخاذ الخطوة المناسبة لنشاطك.</p>
        <Link href="/contact">عندك سؤال آخر؟ تواصل معنا <ArrowUpLeft size={18} aria-hidden="true" /></Link>
      </div>
      <div className="public-faq-list">
        {items.map(item => (
          <details key={item.q}>
            <summary>{item.q}<Plus size={18} aria-hidden="true" /></summary>
            <p>{item.a}</p>
          </details>
        ))}
      </div>
    </section>
  );
}
