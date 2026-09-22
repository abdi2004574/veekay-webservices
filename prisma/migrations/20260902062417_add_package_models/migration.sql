-- CreateEnum
CREATE TYPE "PackageStatus" AS ENUM ('active', 'inactive', 'archived');

-- AlterEnum
ALTER TYPE "MediaPurpose" ADD VALUE 'package_visual';

-- CreateTable
CREATE TABLE "packages" (
    "id" TEXT NOT NULL,
    "agency_id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "base_price" DECIMAL(65,30) NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'USD',
    "destination_type" "DestinationType",
    "season" TEXT,
    "theme" TEXT,
    "itinerary" TEXT,
    "status" "PackageStatus" NOT NULL DEFAULT 'active',
    "is_dynamic_pricing" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "packages_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "package_media" (
    "id" TEXT NOT NULL,
    "package_id" TEXT NOT NULL,
    "media_id" TEXT NOT NULL,
    "display_order" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "package_media_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "package_campaign_links" (
    "id" TEXT NOT NULL,
    "package_id" TEXT NOT NULL,
    "campaign_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "package_campaign_links_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "packages_agency_id_idx" ON "packages"("agency_id");

-- CreateIndex
CREATE UNIQUE INDEX "package_media_package_id_display_order_key" ON "package_media"("package_id", "display_order");

-- CreateIndex
CREATE UNIQUE INDEX "package_campaign_links_package_id_campaign_id_key" ON "package_campaign_links"("package_id", "campaign_id");

-- AddForeignKey
ALTER TABLE "packages" ADD CONSTRAINT "packages_agency_id_fkey" FOREIGN KEY ("agency_id") REFERENCES "agencies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "package_media" ADD CONSTRAINT "package_media_package_id_fkey" FOREIGN KEY ("package_id") REFERENCES "packages"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "package_campaign_links" ADD CONSTRAINT "package_campaign_links_package_id_fkey" FOREIGN KEY ("package_id") REFERENCES "packages"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "package_campaign_links" ADD CONSTRAINT "package_campaign_links_campaign_id_fkey" FOREIGN KEY ("campaign_id") REFERENCES "campaigns"("id") ON DELETE CASCADE ON UPDATE CASCADE;
