import { SallaEmbeddedApp } from "./SallaEmbeddedApp";

export const metadata = { title: "DMS Tech — داخل سلة", robots: { index: false, follow: false } };

// تُحمَّل داخل iframe في لوحة تحكم سلة (رابط "الصفحات المضمنة" في بوابة الشركاء). سلة تضيف ?token و?theme و?lang.
// رؤوس الأمان الخاصة بهذا المسار (السماح بالتضمين من نطاقات سلة فقط) في next.config.js.
export default async function SallaEmbeddedPage(props: { searchParams: Promise<{ theme?: string }> }) {
  const { theme } = await props.searchParams;
  return <SallaEmbeddedApp theme={theme === "dark" ? "dark" : "light"} />;
}
