import { ZidAppClient } from "./ZidAppClient";

export const metadata = { title: "DMS Tech — تطبيق زد", robots: { index: false, follow: false } };
export const dynamic = "force-dynamic";

/** صفحة تطبيق DMS لتاجر زد — تُفتح بعد التفويض من /api/zid/oauth/callback (الجلسة في جزء # من الرابط). */
export default async function ZidAppPage(props: { searchParams: Promise<{ error?: string; welcome?: string }> }) {
  const { error, welcome } = await props.searchParams;
  return <ZidAppClient initialError={error ?? null} welcome={welcome ?? null} />;
}
