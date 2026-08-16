-- CreateTable
CREATE TABLE "SiteContent" (
    "id" TEXT NOT NULL DEFAULT 'singleton',
    "heroHeadline" TEXT NOT NULL,
    "heroSubheadline" TEXT NOT NULL,
    "heroCtaPrimary" TEXT NOT NULL,
    "heroCtaSecondary" TEXT NOT NULL,
    "featuresHeading" TEXT NOT NULL,
    "features" JSONB NOT NULL,
    "stats" JSONB NOT NULL,
    "testimonialsHeading" TEXT NOT NULL,
    "testimonials" JSONB NOT NULL,
    "clientsHeading" TEXT NOT NULL,
    "clientsSubtext" TEXT NOT NULL,
    "clientLogos" JSONB NOT NULL,
    "contactHeading" TEXT NOT NULL,
    "contactBody" TEXT NOT NULL,
    "contactCtaLabel" TEXT NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SiteContent_pkey" PRIMARY KEY ("id")
);

