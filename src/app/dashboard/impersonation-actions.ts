"use server";

import { redirect } from "next/navigation";
import { endImpersonation } from "@/lib/impersonation";

export async function endImpersonationAction() {
  await endImpersonation();
  redirect("/admin/tenants");
}
