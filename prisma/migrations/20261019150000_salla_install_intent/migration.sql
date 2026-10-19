-- بيانات خطوات إعداد تطبيق سلة وطلبات ربط المتجر ببريد مختلف (بانتظار تأكيد صاحب البريد).
CREATE TABLE "SallaInstallIntent" (
    "id" TEXT NOT NULL,
    "merchantId" TEXT NOT NULL,
    "requestedEmail" TEXT,
    "whatsappNumber" TEXT,
    "wantsAbandonedCart" BOOLEAN,
    "wantsWelcome" BOOLEAN,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "storeName" TEXT,
    "encryptedAccessToken" TEXT,
    "encryptedRefreshToken" TEXT,
    "tokenExpiresAt" TIMESTAMP(3),
    "confirmTokenHash" TEXT,
    "confirmExpiresAt" TIMESTAMP(3),
    "tenantId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "SallaInstallIntent_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "SallaInstallIntent_merchantId_key" ON "SallaInstallIntent"("merchantId");
CREATE UNIQUE INDEX "SallaInstallIntent_confirmTokenHash_key" ON "SallaInstallIntent"("confirmTokenHash");

-- وصول superAdminDb فقط (الجدول ليس مستأجَراً). الصلاحيات الافتراضية تمنح app_runtime أيضاً، فتُسحب صراحة.
DO $$ BEGIN
 IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'app_superadmin') THEN GRANT SELECT, INSERT, UPDATE, DELETE ON "SallaInstallIntent" TO app_superadmin; END IF;
 IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'app_runtime') THEN REVOKE ALL ON "SallaInstallIntent" FROM app_runtime; END IF;
END $$;
