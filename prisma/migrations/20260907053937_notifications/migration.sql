-- CreateEnum
CREATE TYPE "NotificationType" AS ENUM ('donation', 'milestone', 'agency_response', 'chat_message', 'like', 'comment', 'share', 'review_received', 'verification_status', 'account_status', 'campaign_flagged', 'admin_broadcast', 'new_request', 'booking_update', 'payment_received', 'withdrawal_status', 'friend_request', 'shared_file', 'new_call', 'system_alert');

-- CreateEnum
CREATE TYPE "NotificationChannel" AS ENUM ('in_app', 'push', 'email');

-- CreateEnum
CREATE TYPE "MilestoneType" AS ENUM ('p25', 'p50', 'p100');

-- AlterTable
ALTER TABLE "notification_preferences" DROP COLUMN "agency_messages",
DROP COLUMN "campaign_updates",
DROP COLUMN "donation_alerts",
ADD COLUMN     "email_enabled" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "in_app_enabled" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "push_enabled" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "type" "NotificationType" NOT NULL;

-- CreateTable
CREATE TABLE "notifications" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "type" "NotificationType" NOT NULL,
    "title" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "read" BOOLEAN NOT NULL DEFAULT false,
    "deep_link_target" TEXT,
    "deep_link_entity_id" TEXT,
    "metadata" JSONB,
    "channel" "NotificationChannel" NOT NULL DEFAULT 'in_app',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "notifications_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "push_devices" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "fcm_token" TEXT NOT NULL,
    "platform" TEXT NOT NULL,
    "last_seen_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "push_devices_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "milestone_notification_logs" (
    "campaign_id" TEXT NOT NULL,
    "milestone" "MilestoneType" NOT NULL,
    "notified_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "milestone_notification_logs_pkey" PRIMARY KEY ("campaign_id")
);

-- CreateIndex
CREATE INDEX "notifications_user_id_created_at_idx" ON "notifications"("user_id", "created_at");

-- CreateIndex
CREATE INDEX "notifications_user_id_read_idx" ON "notifications"("user_id", "read");

-- CreateIndex
CREATE UNIQUE INDEX "push_devices_fcm_token_key" ON "push_devices"("fcm_token");

-- CreateIndex
CREATE INDEX "push_devices_user_id_idx" ON "push_devices"("user_id");

-- CreateIndex
CREATE UNIQUE INDEX "notification_preferences_user_id_type_key" ON "notification_preferences"("user_id", "type");

-- AddForeignKey
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "push_devices" ADD CONSTRAINT "push_devices_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "milestone_notification_logs" ADD CONSTRAINT "milestone_notification_logs_campaign_id_fkey" FOREIGN KEY ("campaign_id") REFERENCES "campaigns"("id") ON DELETE CASCADE ON UPDATE CASCADE;

