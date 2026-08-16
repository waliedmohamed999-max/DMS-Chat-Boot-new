import type { NextAuthOptions } from "next-auth";
import CredentialsProvider from "next-auth/providers/credentials";
import bcrypt from "bcryptjs";
import { superAdminDb } from "@/lib/db";
import { checkLoginRateLimit, resetLoginRateLimit } from "@/lib/rateLimit";

// تجزئة وهمية ثابتة (لا تطابق أي كلمة مرور حقيقية) — تُستخدم لتنفيذ bcrypt.compare حتى عند عدم
// وجود المستخدم أصلاً، بحيث يتقارب زمن الاستجابة بين "بريد غير موجود" و"كلمة مرور خاطئة" ويصعب
// على مهاجم استكشاف البريد الإلكتروني المسجَّل فعلاً عبر قياس فرق التوقيت (Timing Side-Channel).
const DUMMY_HASH = "$2a$10$CwTycUXWue0Thq9StjUM0uJ8kQwtG0h/0zXA8k4qKm0mCqQjWtqXO";

export const authOptions: NextAuthOptions = {
  // مدة جلسة صريحة (7 أيام) بدل الاعتماد على افتراضي NextAuth الضمني (30 يوماً) — أنسب لمنصة SaaS
  // تدير بيانات عملاء حساسة (محادثات واتساب حقيقية). updateAge يُجدِّد الجلسة تلقائياً عند أي نشاط
  // خلال يوم واحد، فلا يُطلَب من مستخدم نشط إعادة تسجيل الدخول كل أسبوع.
  session: { strategy: "jwt", maxAge: 7 * 24 * 3600, updateAge: 24 * 3600 },
  pages: {
    signIn: "/login",
  },
  providers: [
    CredentialsProvider({
      name: "credentials",
      credentials: {
        email: { label: "البريد الإلكتروني", type: "text" },
        password: { label: "كلمة المرور", type: "password" },
      },
      async authorize(credentials) {
        if (!credentials?.email || !credentials?.password) return null;

        const email = credentials.email.toLowerCase().trim();

        // يُحسَب قبل أي استعلام قاعدة بيانات، بحيث لا يُنفَق أي عمل (بما فيه bcrypt) على بريد
        // تجاوز الحد أصلاً — يوقف الغارات الآلية (Brute Force) على حساب بعينه.
        const rateLimit = await checkLoginRateLimit(email);
        if (!rateLimit.allowed) {
          throw new Error("too_many_attempts");
        }

        // تسجيل الدخول يبحث بالبريد عبر كل المستأجرين قبل أن نعرف tenantId، لذلك
        // يستخدم اتصال BYPASSRLS عمداً (نفس الاتصال المستخدم في لوحة Super Admin) —
        // الاستعلام مقيّد بمساواة على email الفريد عالمياً، وليس تصفحاً لبيانات مستأجر.
        const user = await superAdminDb.user.findUnique({
          where: { email },
          include: { tenant: true },
        });

        // مقارنة bcrypt تُنفَّذ دائماً (على تجزئة وهمية إن لم يوجد المستخدم) بدل الخروج المبكر،
        // لتقريب زمن الاستجابة بين "بريد غير موجود" و"كلمة مرور خاطئة" ومنع استكشاف البريد
        // المسجَّل فعلياً عبر فروق التوقيت.
        const valid = await bcrypt.compare(credentials.password, user?.passwordHash ?? DUMMY_HASH);
        if (!user || !user.isActive || !valid) return null;

        // تعليق/إلغاء/رفض حساب التاجر يمنع تسجيل الدخول فعلياً لكل مستخدميه فوراً — وليس فقط
        // إخفاء المحتوى بعد الدخول. "بانتظار المراجعة" يُسمح بالدخول لعرض شاشة الانتظار نفسها.
        if (user.tenant && (user.tenant.status === "SUSPENDED" || user.tenant.status === "CANCELLED" || user.tenant.status === "REJECTED")) {
          throw new Error(`tenant_${user.tenant.status.toLowerCase()}`);
        }

        await resetLoginRateLimit(email);
        await superAdminDb.user.update({ where: { id: user.id }, data: { lastLoginAt: new Date() } });

        return {
          id: user.id,
          name: user.name,
          email: user.email,
          role: user.role,
          tenantId: user.tenantId,
        };
      },
    }),
  ],
  callbacks: {
    async jwt({ token, user }) {
      if (user) {
        token.role = user.role;
        token.tenantId = user.tenantId;
        token.uid = user.id;
      }
      return token;
    },
    async session({ session, token }) {
      if (session.user) {
        session.user.id = token.uid as string;
        session.user.role = token.role as string;
        session.user.tenantId = token.tenantId as string | null;
      }
      return session;
    },
  },
  secret: process.env.NEXTAUTH_SECRET,
};
