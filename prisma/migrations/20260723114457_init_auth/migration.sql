-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateEnum
CREATE TYPE "UserRole" AS ENUM ('traveler', 'agency', 'admin');

-- CreateEnum
CREATE TYPE "PlatformRole" AS ENUM ('user', 'super_admin');

-- CreateEnum
CREATE TYPE "TravelerBadge" AS ENUM ('dreamer', 'explorer', 'jetsetter');

-- CreateEnum
CREATE TYPE "DestinationType" AS ENUM ('beach', 'mountain', 'city', 'adventure', 'cruise');

-- CreateEnum
CREATE TYPE "TravelStyle" AS ENUM ('luxury', 'budget', 'backpacking', 'family', 'solo', 'group');

-- CreateEnum
CREATE TYPE "SocialProvider" AS ENUM ('google', 'apple');

-- CreateEnum
CREATE TYPE "OtpType" AS ENUM ('email_verify', 'password_reset');

-- CreateEnum
CREATE TYPE "AgencyStatus" AS ENUM ('pending_verification', 'approved', 'rejected');

-- CreateEnum
CREATE TYPE "AgencyDocumentType" AS ENUM ('business_license', 'certification', 'legal_document');

-- CreateEnum
CREATE TYPE "AgencySubscriptionTier" AS ENUM ('basic', 'premium', 'featured');

-- CreateEnum
CREATE TYPE "AgencyStaffPermission" AS ENUM ('owner', 'staff');

-- CreateTable
CREATE TABLE "users" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "password_hash" TEXT,
    "role" "UserRole" NOT NULL,
    "platform_role" "PlatformRole" NOT NULL DEFAULT 'user',
    "is_email_verified" BOOLEAN NOT NULL DEFAULT false,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "onboarding_complete" BOOLEAN NOT NULL DEFAULT false,
    "deactivated_at" TIMESTAMP(3),
    "fcm_token" TEXT,
    "last_login_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "traveler_profiles" (
    "user_id" TEXT NOT NULL,
    "photo_media_id" TEXT,
    "badge" "TravelerBadge" NOT NULL DEFAULT 'dreamer',
    "wallet_connected" BOOLEAN NOT NULL DEFAULT false,
    "wallet_payment_method_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "traveler_profiles_pkey" PRIMARY KEY ("user_id")
);

-- CreateTable
CREATE TABLE "traveler_destination_preferences" (
    "user_id" TEXT NOT NULL,
    "destination_type" "DestinationType" NOT NULL,

    CONSTRAINT "traveler_destination_preferences_pkey" PRIMARY KEY ("user_id","destination_type")
);

-- CreateTable
CREATE TABLE "traveler_travel_style_preferences" (
    "user_id" TEXT NOT NULL,
    "travel_style" "TravelStyle" NOT NULL,

    CONSTRAINT "traveler_travel_style_preferences_pkey" PRIMARY KEY ("user_id","travel_style")
);

-- CreateTable
CREATE TABLE "social_identities" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "provider" "SocialProvider" NOT NULL,
    "provider_user_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "social_identities_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "refresh_tokens" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "token_hash" TEXT NOT NULL,
    "device_id" TEXT,
    "device_name" TEXT,
    "expires_at" TIMESTAMP(3) NOT NULL,
    "is_revoked" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "refresh_tokens_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "otp_codes" (
    "id" TEXT NOT NULL,
    "identifier" TEXT NOT NULL,
    "code_hash" TEXT NOT NULL,
    "type" "OtpType" NOT NULL,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "expires_at" TIMESTAMP(3) NOT NULL,
    "is_used" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "otp_codes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "admin_two_factor" (
    "user_id" TEXT NOT NULL,
    "secret" TEXT NOT NULL,
    "is_confirmed" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "admin_two_factor_pkey" PRIMARY KEY ("user_id")
);

-- CreateTable
CREATE TABLE "agencies" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "agency_name" TEXT NOT NULL,
    "business_contact" TEXT,
    "business_address" TEXT,
    "status" "AgencyStatus" NOT NULL DEFAULT 'pending_verification',
    "rejection_reason" TEXT,
    "reputation_score" DECIMAL(65,30),
    "subscription_tier" "AgencySubscriptionTier" NOT NULL DEFAULT 'basic',
    "logo_media_id" TEXT,
    "description" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "agencies_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "agency_documents" (
    "id" TEXT NOT NULL,
    "agency_id" TEXT NOT NULL,
    "type" "AgencyDocumentType" NOT NULL,
    "media_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "agency_documents_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "agency_staff" (
    "id" TEXT NOT NULL,
    "agency_id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "permission" "AgencyStaffPermission" NOT NULL DEFAULT 'owner',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "agency_staff_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");

-- CreateIndex
CREATE UNIQUE INDEX "social_identities_provider_provider_user_id_key" ON "social_identities"("provider", "provider_user_id");

-- CreateIndex
CREATE INDEX "otp_codes_identifier_type_idx" ON "otp_codes"("identifier", "type");

-- CreateIndex
CREATE UNIQUE INDEX "agencies_user_id_key" ON "agencies"("user_id");

-- CreateIndex
CREATE UNIQUE INDEX "agency_staff_agency_id_user_id_key" ON "agency_staff"("agency_id", "user_id");

-- AddForeignKey
ALTER TABLE "traveler_profiles" ADD CONSTRAINT "traveler_profiles_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "traveler_destination_preferences" ADD CONSTRAINT "traveler_destination_preferences_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "traveler_profiles"("user_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "traveler_travel_style_preferences" ADD CONSTRAINT "traveler_travel_style_preferences_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "traveler_profiles"("user_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "social_identities" ADD CONSTRAINT "social_identities_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "refresh_tokens" ADD CONSTRAINT "refresh_tokens_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "admin_two_factor" ADD CONSTRAINT "admin_two_factor_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "agencies" ADD CONSTRAINT "agencies_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "agency_documents" ADD CONSTRAINT "agency_documents_agency_id_fkey" FOREIGN KEY ("agency_id") REFERENCES "agencies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "agency_staff" ADD CONSTRAINT "agency_staff_agency_id_fkey" FOREIGN KEY ("agency_id") REFERENCES "agencies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

