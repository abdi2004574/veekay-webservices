-- CreateEnum
CREATE TYPE "PaymentMethodType" AS ENUM ('card');

-- CreateEnum
CREATE TYPE "PayoutAccountType" AS ENUM ('bank', 'paypal', 'mobile_money');

-- CreateEnum
CREATE TYPE "WithdrawalStatus" AS ENUM ('pending', 'processing', 'completed', 'failed');

-- CreateEnum
CREATE TYPE "DonationStatus" AS ENUM ('pending', 'succeeded', 'failed');

-- AlterTable
ALTER TABLE "campaigns" ADD COLUMN     "raised_amount" DECIMAL(65,30) NOT NULL DEFAULT 0;

-- CreateTable
CREATE TABLE "stripe_connect_accounts" (
    "id" TEXT NOT NULL,
    "user_id" TEXT,
    "agency_id" TEXT,
    "stripe_account_id" TEXT NOT NULL,
    "payouts_enabled" BOOLEAN NOT NULL DEFAULT false,
    "charges_enabled" BOOLEAN NOT NULL DEFAULT false,
    "details_submitted" BOOLEAN NOT NULL DEFAULT false,
    "onboarding_url" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "stripe_connect_accounts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "donations" (
    "id" TEXT NOT NULL,
    "campaign_id" TEXT NOT NULL,
    "donor_user_id" TEXT,
    "amount" DECIMAL(65,30) NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'USD',
    "is_anonymous" BOOLEAN NOT NULL DEFAULT false,
    "gift_message" TEXT,
    "is_gift" BOOLEAN NOT NULL DEFAULT false,
    "stripe_payment_intent_id" TEXT,
    "status" "DonationStatus" NOT NULL DEFAULT 'pending',
    "receipt_email_sent_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "donations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "payment_methods" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "stripe_payment_method_id" TEXT NOT NULL,
    "type" "PaymentMethodType" NOT NULL,
    "brand" TEXT,
    "last4" TEXT,
    "exp_month" INTEGER,
    "exp_year" INTEGER,
    "is_default" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "payment_methods_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "payout_accounts" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "type" "PayoutAccountType" NOT NULL,
    "label" TEXT NOT NULL,
    "masked_identifier" TEXT NOT NULL,
    "is_default" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "payout_accounts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "withdrawal_requests" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "campaign_id" TEXT,
    "payout_account_id" TEXT NOT NULL,
    "amount" DECIMAL(65,30) NOT NULL,
    "status" "WithdrawalStatus" NOT NULL DEFAULT 'pending',
    "stripe_payout_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "withdrawal_requests_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "stripe_webhook_events" (
    "id" TEXT NOT NULL,
    "event_id" TEXT NOT NULL,
    "event_type" TEXT NOT NULL,
    "raw_payload" TEXT NOT NULL,
    "processing_status" TEXT NOT NULL DEFAULT 'pending',
    "processed_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "stripe_webhook_events_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "stripe_connect_accounts_stripe_account_id_key" ON "stripe_connect_accounts"("stripe_account_id");

-- CreateIndex
CREATE UNIQUE INDEX "donations_stripe_payment_intent_id_key" ON "donations"("stripe_payment_intent_id");

-- CreateIndex
CREATE UNIQUE INDEX "payment_methods_stripe_payment_method_id_key" ON "payment_methods"("stripe_payment_method_id");

-- CreateIndex
CREATE UNIQUE INDEX "withdrawal_requests_stripe_payout_id_key" ON "withdrawal_requests"("stripe_payout_id");

-- CreateIndex
CREATE UNIQUE INDEX "stripe_webhook_events_event_id_key" ON "stripe_webhook_events"("event_id");

-- AddForeignKey
ALTER TABLE "stripe_connect_accounts" ADD CONSTRAINT "stripe_connect_accounts_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stripe_connect_accounts" ADD CONSTRAINT "stripe_connect_accounts_agency_id_fkey" FOREIGN KEY ("agency_id") REFERENCES "agencies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "donations" ADD CONSTRAINT "donations_campaign_id_fkey" FOREIGN KEY ("campaign_id") REFERENCES "campaigns"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "donations" ADD CONSTRAINT "donations_donor_user_id_fkey" FOREIGN KEY ("donor_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payment_methods" ADD CONSTRAINT "payment_methods_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payout_accounts" ADD CONSTRAINT "payout_accounts_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "withdrawal_requests" ADD CONSTRAINT "withdrawal_requests_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "withdrawal_requests" ADD CONSTRAINT "withdrawal_requests_campaign_id_fkey" FOREIGN KEY ("campaign_id") REFERENCES "campaigns"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "withdrawal_requests" ADD CONSTRAINT "withdrawal_requests_payout_account_id_fkey" FOREIGN KEY ("payout_account_id") REFERENCES "payout_accounts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;


