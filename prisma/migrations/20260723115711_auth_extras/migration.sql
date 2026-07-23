-- AlterEnum
ALTER TYPE "OtpType" ADD VALUE 'login';

-- AlterTable
ALTER TABLE "users" ADD COLUMN     "display_name" TEXT;

-- CreateTable
CREATE TABLE "traveler_previous_trip_photos" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "media_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "traveler_previous_trip_photos_pkey" PRIMARY KEY ("id")
);

-- AddForeignKey
ALTER TABLE "traveler_previous_trip_photos" ADD CONSTRAINT "traveler_previous_trip_photos_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "traveler_profiles"("user_id") ON DELETE CASCADE ON UPDATE CASCADE;

