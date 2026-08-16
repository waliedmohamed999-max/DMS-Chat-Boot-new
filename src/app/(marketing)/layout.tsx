import { Navbar } from "@/components/marketing/Navbar";
import { Footer } from "@/components/marketing/Footer";
import { FloatingWhatsAppButton } from "@/components/marketing/FloatingWhatsAppButton";
import { getPlatformSettings } from "@/lib/platformSettings";

export default async function MarketingLayout({ children }: { children: React.ReactNode }) {
  const settings = await getPlatformSettings();

  return (
    <div className="min-h-screen bg-white text-slate-900 dark:bg-slate-950 dark:text-slate-100">
      <Navbar />
      <main>{children}</main>
      <Footer />
      <FloatingWhatsAppButton phone={settings.supportPhone} />
    </div>
  );
}
