-- DropIndex
DROP INDEX "trip_requests_agency_id_status_idx";

-- DropIndex
DROP INDEX "trip_requests_traveler_id_status_idx";

-- AlterTable
ALTER TABLE "trip_requests" ALTER COLUMN "initial_message" DROP NOT NULL;

-- CreateIndex
CREATE UNIQUE INDEX "trip_requests_conversation_id_key" ON "trip_requests"("conversation_id");

-- CreateIndex
CREATE INDEX "trip_requests_traveler_id_idx" ON "trip_requests"("traveler_id");

-- CreateIndex
CREATE INDEX "trip_requests_agency_id_idx" ON "trip_requests"("agency_id");

