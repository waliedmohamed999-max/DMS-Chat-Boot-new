-- CreateTable
CREATE TABLE "PlatformSettings" (
    "id" TEXT NOT NULL DEFAULT 'singleton',
    "integrationsMode" TEXT NOT NULL DEFAULT 'sandbox',
    "maintenanceMode" BOOLEAN NOT NULL DEFAULT false,
    "maintenanceMessage" TEXT,
    "supportEmail" TEXT NOT NULL DEFAULT 'support@platform.sa',
    "supportPhone" TEXT,
    "defaultTrialDays" INTEGER NOT NULL DEFAULT 14,
    "termsVersion" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PlatformSettings_pkey" PRIMARY KEY ("id")
);

