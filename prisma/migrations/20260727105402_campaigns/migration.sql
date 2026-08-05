-- CreateEnum
CREATE TYPE "CampaignStatus" AS ENUM ('draft', 'active', 'completed');

-- CreateEnum
CREATE TYPE "CampaignPrivacy" AS ENUM ('public', 'private');

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "MediaPurpose" ADD VALUE 'campaign_photo';
ALTER TYPE "MediaPurpose" ADD VALUE 'campaign_document';

-- CreateTable
CREATE TABLE "campaigns" (
    "id" TEXT NOT NULL,
    "creator_id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "destination" TEXT NOT NULL,
    "goal_amount" DECIMAL(65,30) NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'USD',
    "story" TEXT,
    "trip_start_date" TIMESTAMP(3) NOT NULL,
    "trip_end_date" TIMESTAMP(3),
    "status" "CampaignStatus" NOT NULL DEFAULT 'active',
    "privacy" "CampaignPrivacy" NOT NULL DEFAULT 'public',
    "gift_mode" BOOLEAN NOT NULL DEFAULT false,
    "gift_occasion" TEXT,
    "itinerary_media_id" TEXT,
    "agency_quote_media_id" TEXT,
    "views_count" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "campaigns_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "campaign_photos" (
    "id" TEXT NOT NULL,
    "campaign_id" TEXT NOT NULL,
    "media_id" TEXT NOT NULL,
    "position" INTEGER NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "campaign_photos_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "campaigns_creator_id_idx" ON "campaigns"("creator_id");

-- CreateIndex
CREATE UNIQUE INDEX "campaign_photos_campaign_id_position_key" ON "campaign_photos"("campaign_id", "position");

-- AddForeignKey
ALTER TABLE "campaigns" ADD CONSTRAINT "campaigns_creator_id_fkey" FOREIGN KEY ("creator_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "campaign_photos" ADD CONSTRAINT "campaign_photos_campaign_id_fkey" FOREIGN KEY ("campaign_id") REFERENCES "campaigns"("id") ON DELETE CASCADE ON UPDATE CASCADE;
