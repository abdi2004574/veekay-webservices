-- CreateEnum
CREATE TYPE "TripRequestStatus" AS ENUM ('pending', 'in_discussion', 'confirmed', 'completed', 'declined', 'cancelled');

-- CreateTable
CREATE TABLE "trip_requests" (
    "id" TEXT NOT NULL,
    "traveler_id" TEXT NOT NULL,
    "agency_id" TEXT NOT NULL,
    "package_id" TEXT,
    "campaign_id" TEXT,
    "status" "TripRequestStatus" NOT NULL DEFAULT 'pending',
    "initial_message" TEXT NOT NULL,
    "conversation_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "trip_requests_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "smart_reply_templates" (
    "id" TEXT NOT NULL,
    "agency_id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "smart_reply_templates_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "trip_requests_agency_id_status_idx" ON "trip_requests"("agency_id", "status");

-- CreateIndex
CREATE INDEX "trip_requests_traveler_id_status_idx" ON "trip_requests"("traveler_id", "status");

-- CreateIndex
CREATE INDEX "smart_reply_templates_agency_id_idx" ON "smart_reply_templates"("agency_id");

-- AddForeignKey
ALTER TABLE "trip_requests" ADD CONSTRAINT "trip_requests_traveler_id_fkey" FOREIGN KEY ("traveler_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "trip_requests" ADD CONSTRAINT "trip_requests_agency_id_fkey" FOREIGN KEY ("agency_id") REFERENCES "agencies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "trip_requests" ADD CONSTRAINT "trip_requests_package_id_fkey" FOREIGN KEY ("package_id") REFERENCES "packages"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "trip_requests" ADD CONSTRAINT "trip_requests_campaign_id_fkey" FOREIGN KEY ("campaign_id") REFERENCES "campaigns"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "trip_requests" ADD CONSTRAINT "trip_requests_conversation_id_fkey" FOREIGN KEY ("conversation_id") REFERENCES "conversations"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "smart_reply_templates" ADD CONSTRAINT "smart_reply_templates_agency_id_fkey" FOREIGN KEY ("agency_id") REFERENCES "agencies"("id") ON DELETE CASCADE ON UPDATE CASCADE;
