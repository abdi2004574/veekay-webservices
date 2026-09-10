-- CreateEnum
CREATE TYPE "AdminInviteStatus" AS ENUM ('pending', 'accepted', 'revoked', 'expired');

-- CreateEnum
CREATE TYPE "ReportTargetType" AS ENUM ('post', 'review', 'chat_message', 'campaign_media', 'agency_document');

-- CreateEnum
CREATE TYPE "ReportStatus" AS ENUM ('pending', 'reviewing', 'resolved', 'dismissed');

-- CreateEnum
CREATE TYPE "VerificationStatus" AS ENUM ('unverified', 'pending_review', 'verified', 'flagged', 'rejected');

-- CreateEnum
CREATE TYPE "VerifiedBadgeSubjectType" AS ENUM ('user', 'agency');

-- AlterEnum
ALTER TYPE "MediaPurpose" ADD VALUE 'government_id';

-- AlterEnum
ALTER TYPE "WalletTransactionType" ADD VALUE 'donation_fee';

-- AlterTable
ALTER TABLE "agencies" ADD COLUMN     "refund_note" TEXT;

-- AlterTable
ALTER TABLE "campaigns" ADD COLUMN     "verification_note" TEXT,
ADD COLUMN     "verification_status" "VerificationStatus" NOT NULL DEFAULT 'unverified',
ADD COLUMN     "verified_badge_assigned_at" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "traveler_profiles" ADD COLUMN     "government_id_media_id" TEXT,
ADD COLUMN     "identity_verified" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "is_adult" BOOLEAN,
ADD COLUMN     "requires_accompaniment" BOOLEAN,
ADD COLUMN     "verification_status" "VerificationStatus" NOT NULL DEFAULT 'unverified';

-- AlterTable
ALTER TABLE "withdrawal_requests" ADD COLUMN     "refund_note" TEXT;

-- CreateTable
CREATE TABLE "admin_invites" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "token" TEXT NOT NULL,
    "invited_by_id" TEXT NOT NULL,
    "status" "AdminInviteStatus" NOT NULL DEFAULT 'pending',
    "expires_at" TIMESTAMP(3) NOT NULL,
    "accepted_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "admin_invites_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "admin_audit_logs" (
    "id" TEXT NOT NULL,
    "actor_id" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "target_type" TEXT NOT NULL,
    "target_id" TEXT,
    "reason" TEXT,
    "metadata" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "admin_audit_logs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "content_reports" (
    "id" TEXT NOT NULL,
    "reporter_id" TEXT NOT NULL,
    "targetType" "ReportTargetType" NOT NULL,
    "target_id" TEXT NOT NULL,
    "reason" TEXT NOT NULL,
    "status" "ReportStatus" NOT NULL DEFAULT 'pending',
    "resolved_by_id" TEXT,
    "resolution_note" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3),

    CONSTRAINT "content_reports_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "verified_badges" (
    "id" TEXT NOT NULL,
    "subjectType" "VerifiedBadgeSubjectType" NOT NULL,
    "subject_id" TEXT NOT NULL,
    "assigned_by_id" TEXT NOT NULL,
    "assigned_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "revoked_at" TIMESTAMP(3),

    CONSTRAINT "verified_badges_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "admin_invites_email_idx" ON "admin_invites"("email");

-- CreateIndex
CREATE INDEX "admin_invites_status_idx" ON "admin_invites"("status");

-- CreateIndex
CREATE INDEX "admin_audit_logs_actor_id_idx" ON "admin_audit_logs"("actor_id");

-- CreateIndex
CREATE INDEX "admin_audit_logs_target_type_target_id_idx" ON "admin_audit_logs"("target_type", "target_id");

-- CreateIndex
CREATE INDEX "admin_audit_logs_created_at_idx" ON "admin_audit_logs"("created_at");

-- CreateIndex
CREATE INDEX "content_reports_targetType_target_id_idx" ON "content_reports"("targetType", "target_id");

-- CreateIndex
CREATE INDEX "content_reports_status_idx" ON "content_reports"("status");

-- CreateIndex
CREATE UNIQUE INDEX "verified_badges_subjectType_subject_id_key" ON "verified_badges"("subjectType", "subject_id");