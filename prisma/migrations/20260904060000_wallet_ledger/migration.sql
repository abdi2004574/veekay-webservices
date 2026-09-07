-- CreateEnum
CREATE TYPE "WalletTransactionDirection" AS ENUM ('credit', 'debit');

-- CreateEnum
CREATE TYPE "WalletTransactionType" AS ENUM ('donation_received', 'withdrawal', 'refund', 'commission', 'booking_payment');

-- CreateEnum
CREATE TYPE "WithdrawalStatus_new" AS ENUM ('requested', 'approved', 'rejected', 'paid');

-- CreateTable
CREATE TABLE "wallet_accounts" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'USD',
    "cached_balance" DECIMAL(65,30) NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "wallet_accounts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "wallet_transactions" (
    "id" TEXT NOT NULL,
    "wallet_account_id" TEXT NOT NULL,
    "direction" "WalletTransactionDirection" NOT NULL,
    "amount" DECIMAL(65,30) NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'USD',
    "type" "WalletTransactionType" NOT NULL,
    "reference_type" TEXT,
    "reference_id" TEXT,
    "idempotency_key" TEXT,
    "description" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "wallet_transactions_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "wallet_accounts_user_id_key" ON "wallet_accounts"("user_id");

-- CreateIndex
CREATE UNIQUE INDEX "wallet_transactions_idempotency_key_key" ON "wallet_transactions"("idempotency_key");

-- CreateIndex
CREATE INDEX "wallet_transactions_wallet_account_id_created_at_idx" ON "wallet_transactions"("wallet_account_id", "created_at");

-- AddForeignKey
ALTER TABLE "wallet_accounts" ADD CONSTRAINT "wallet_accounts_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "wallet_transactions" ADD CONSTRAINT "wallet_transactions_wallet_account_id_fkey" FOREIGN KEY ("wallet_account_id") REFERENCES "wallet_accounts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AlterTable
ALTER TABLE "donations" DROP COLUMN "stripe_payment_intent_id";

-- AlterTable
ALTER TABLE "donations" DROP COLUMN "status";

-- AlterTable
ALTER TABLE "donations" ADD COLUMN     "donor_display_name" TEXT;

-- AlterTable
ALTER TABLE "donations" ADD COLUMN     "wallet_transaction_id" TEXT;

-- AlterTable
ALTER TABLE "donations" ADD CONSTRAINT "donations_wallet_transaction_id_key" UNIQUE ("wallet_transaction_id");

-- AlterTable
ALTER TABLE "withdrawal_requests" DROP COLUMN "stripe_payout_id";

-- AlterTable
ALTER TABLE "withdrawal_requests" ALTER COLUMN "payout_account_id" DROP NOT NULL;

-- AlterTable
ALTER TABLE "withdrawal_requests" ADD COLUMN     "currency" TEXT NOT NULL DEFAULT 'USD';

-- AlterTable
ALTER TABLE "withdrawal_requests" ADD COLUMN     "high_value_threshold" DECIMAL(65,30);

-- AlterTable
ALTER TABLE "withdrawal_requests" ADD COLUMN     "wallet_transaction_id" TEXT;

-- AlterTable
ALTER TABLE "withdrawal_requests" ADD COLUMN     "rejection_reason" TEXT;

-- AlterTable
ALTER TABLE "withdrawal_requests" ADD CONSTRAINT "withdrawal_requests_wallet_transaction_id_key" UNIQUE ("wallet_transaction_id");

-- AlterTable
ALTER TABLE "withdrawal_requests" ALTER COLUMN "status" DROP DEFAULT;

-- AlterTable
ALTER TABLE "withdrawal_requests" ALTER COLUMN "status" TYPE "WithdrawalStatus_new" USING (
    CASE "status"::text
        WHEN 'pending' THEN 'requested'
        WHEN 'processing' THEN 'approved'
        WHEN 'completed' THEN 'paid'
        WHEN 'failed' THEN 'rejected'
        ELSE "status"::text
    END
)::"WithdrawalStatus_new";

-- DropEnum
DROP TYPE "DonationStatus";

-- DropEnum
DROP TYPE "WithdrawalStatus";

-- AlterEnum
ALTER TYPE "WithdrawalStatus_new" RENAME TO "WithdrawalStatus";

-- AlterTable
ALTER TABLE "withdrawal_requests" ALTER COLUMN "status" SET DEFAULT 'requested'::"WithdrawalStatus";

-- AlterTable
ALTER TABLE "withdrawal_requests" DROP CONSTRAINT "withdrawal_requests_payout_account_id_fkey";

-- AlterTable
ALTER TABLE "withdrawal_requests" ADD CONSTRAINT "withdrawal_requests_payout_account_id_fkey" FOREIGN KEY ("payout_account_id") REFERENCES "payout_accounts"("id") ON DELETE SET NULL ON UPDATE CASCADE;
