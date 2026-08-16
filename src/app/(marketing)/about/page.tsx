import type { Metadata } from "next";
import { getSiteContent } from "@/lib/siteContent";

export const metadata: Metadata = {
  title: "من نحن — DMS",
  description: "قصة منصة واصل، ولماذا بنيناها لمساعدة التجار وأصحاب الأنشطة على تنظيم تواصلهم مع عملائهم عبر واتساب.",
};

export default async function AboutPage() {
  const content = await getSiteContent();

  return (
    <div className="mx-auto max-w-3xl px-4 py-16">
      <h1 className="text-3xl font-extrabold text-slate-900 sm:text-4xl dark:text-white">{content.aboutHeading}</h1>

      <div className="mt-8 space-y-5 text-slate-600 dark:text-slate-300">
        {content.aboutParagraphs.map((p, i) => (
          <p key={i}>{p}</p>
        ))}
      </div>
    </div>
  );
}
