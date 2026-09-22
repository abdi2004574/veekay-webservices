-- AlterEnum
ALTER TYPE "CampaignStatus" ADD VALUE 'funded';

-- AlterEnum
ALTER TYPE "CampaignStatus" ADD VALUE 'expired';

-- AlterEnum
ALTER TYPE "CampaignStatus" ADD VALUE 'canceled';

-- AlterEnum
ALTER TYPE "CampaignStatus" ADD VALUE 'flagged';

-- AlterEnum
ALTER TYPE "CampaignStatus" ADD VALUE 'under_review';

-- AlterEnum
ALTER TYPE "CampaignStatus" ADD VALUE 'booked';

-- CreateEnum
CREATE TYPE "TripBookingStatus" AS ENUM ('pending', 'confirmed', 'completed', 'canceled', 'expired');

-- CreateTable
CREATE TABLE "trip_bookings" (
    "id" TEXT NOT NULL,
    "agency_id" TEXT NOT NULL,
    "traveler_id" TEXT NOT NULL,
    "package_id" TEXT,
    "campaign_id" TEXT,
    "booking_reference" TEXT,
    "status" "TripBookingStatus" NOT NULL DEFAULT 'pending',
    "amount" DECIMAL(65,30),
    "currency" TEXT NOT NULL DEFAULT 'USD',
    "notes" TEXT,
    "confirmed_at" TIMESTAMP(3),
    "completed_at" TIMESTAMP(3),
    "canceled_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "trip_bookings_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "trip_bookings_agency_id_idx" ON "trip_bookings"("agency_id");

-- CreateIndex
CREATE INDEX "trip_bookings_traveler_id_idx" ON "trip_bookings"("traveler_id");

-- AlterTable
ALTER TABLE "trip_requests" ADD COLUMN "booking_id" TEXT;

-- AlterTable
ALTER TABLE "trip_requests" ADD COLUMN "confirmed_at" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "trip_requests" ADD COLUMN "completed_at" TIMESTAMP(3);

-- CreateIndex
CREATE UNIQUE INDEX "trip_requests_booking_id_key" ON "trip_requests"("booking_id");

-- AddForeignKey
ALTER TABLE "trip_bookings" ADD CONSTRAINT "trip_bookings_agency_id_fkey" FOREIGN KEY ("agency_id") REFERENCES "agencies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "trip_bookings" ADD CONSTRAINT "trip_bookings_traveler_id_fkey" FOREIGN KEY ("traveler_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "trip_bookings" ADD CONSTRAINT "trip_bookings_package_id_fkey" FOREIGN KEY ("package_id") REFERENCES "packages"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "trip_bookings" ADD CONSTRAINT "trip_bookings_campaign_id_fkey" FOREIGN KEY ("campaign_id") REFERENCES "campaigns"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "trip_requests" ADD CONSTRAINT "trip_requests_booking_id_fkey" FOREIGN KEY ("booking_id") REFERENCES "trip_bookings"("id") ON DELETE SET NULL ON UPDATE CASCADE;
