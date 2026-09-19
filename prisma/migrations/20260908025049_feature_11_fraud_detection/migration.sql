-- CreateEnum
CREATE TYPE "FraudFlagType" AS ENUM ('frequent_profile_changes', 'payment_method_mismatch', 'withdrawal_anomaly', 'personal_info_mismatch');

-- CreateEnum
CREATE TYPE "FraudFlagSeverity" AS ENUM ('low', 'medium', 'high', 'critical');

-- CreateEnum
CREATE TYPE "FraudFlagStatus" AS ENUM ('open', 'reviewing', 'resolved', 'dismissed');

-- AlterTable
ALTER TABLE "content_reports" ALTER COLUMN "updated_at" SET NOT NULL;

-- AlterTable
ALTER TABLE "group_members" ADD COLUMN     "can_withdraw" BOOLEAN NOT NULL DEFAULT false;

-- CreateTable
CREATE TABLE "fraud_flags" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "type" "FraudFlagType" NOT NULL,
    "severity" "FraudFlagSeverity" NOT NULL DEFAULT 'low',
    "description" TEXT NOT NULL,
    "status" "FraudFlagStatus" NOT NULL DEFAULT 'open',
    "reviewed_by_id" TEXT,
    "reviewed_at" TIMESTAMP(3),
    "resolution_note" TEXT,
    "metadata" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "fraud_flags_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "fraud_flags_user_id_status_idx" ON "fraud_flags"("user_id", "status");

-- CreateIndex
CREATE INDEX "fraud_flags_created_at_idx" ON "fraud_flags"("created_at");

-- AddForeignKey
ALTER TABLE "fraud_flags" ADD CONSTRAINT "fraud_flags_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "fraud_flags" ADD CONSTRAINT "fraud_flags_reviewed_by_id_fkey" FOREIGN KEY ("reviewed_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

