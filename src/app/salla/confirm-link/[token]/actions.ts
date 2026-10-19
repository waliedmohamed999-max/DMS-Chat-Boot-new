"use server";

import { confirmSallaLink, type ConfirmLinkResult } from "@/lib/integrations/salla/intent";

export async function confirmSallaLinkAction(token: string): Promise<ConfirmLinkResult> {
  return confirmSallaLink(token);
}
