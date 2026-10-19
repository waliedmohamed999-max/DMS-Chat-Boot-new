import type { DefaultSession } from "next-auth";

declare module "next-auth" {
  interface Session {
    user: {
      id: string;
      role: string;
      tenantId: string | null;
      /** وقت إصدار الجلسة (ثوانٍ) — يُقارن بـUser.sessionsValidFrom لإبطال الجلسات القديمة. */
      iat?: number;
    } & DefaultSession["user"];
  }

  interface User {
    id: string;
    role: string;
    tenantId: string | null;
  }
}

declare module "next-auth/jwt" {
  interface JWT {
    uid: string;
    role: string;
    tenantId: string | null;
  }
}
