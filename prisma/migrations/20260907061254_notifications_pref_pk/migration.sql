-- DropIndex
DROP INDEX "notification_preferences_user_id_type_key";

-- AlterTable
ALTER TABLE "notification_preferences" DROP CONSTRAINT "notification_preferences_pkey",
ADD CONSTRAINT "notification_preferences_pkey" PRIMARY KEY ("user_id", "type");

