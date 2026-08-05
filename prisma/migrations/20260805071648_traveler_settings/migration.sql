-- CreateEnum
CREATE TYPE "ProfileVisibility" AS ENUM ('public', 'friends', 'private');

-- AlterTable
ALTER TABLE "traveler_profiles" ADD COLUMN     "phone" TEXT;

-- CreateTable
CREATE TABLE "notification_preferences" (
    "user_id" TEXT NOT NULL,
    "donation_alerts" BOOLEAN NOT NULL DEFAULT true,
    "campaign_updates" BOOLEAN NOT NULL DEFAULT true,
    "agency_messages" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "notification_preferences_pkey" PRIMARY KEY ("user_id")
);

-- CreateTable
CREATE TABLE "privacy_settings" (
    "user_id" TEXT NOT NULL,
    "profile_visibility" "ProfileVisibility" NOT NULL DEFAULT 'public',
    "activity_status_visible" BOOLEAN NOT NULL DEFAULT true,
    "read_receipts_enabled" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "privacy_settings_pkey" PRIMARY KEY ("user_id")
);

-- AddForeignKey
ALTER TABLE "notification_preferences" ADD CONSTRAINT "notification_preferences_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "privacy_settings" ADD CONSTRAINT "privacy_settings_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
