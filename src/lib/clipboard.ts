/** نسخ نص للحافظة — يُستخدَم من كل مكوّنات النسخ في لوحة المسوّق (ReferralLinkBox, MarketingToolkit,
 * EmbedCodeBox...) بدل تكرار نفس try/catch في كل مكوّن على حدة. */
export async function copyToClipboard(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    // بعض المتصفحات تمنع الوصول لحافظة النظام بلا HTTPS/سياق آمن — فشل صامت غير ضار، المستخدم يقدر ينسخ يدوياً
    return false;
  }
}
