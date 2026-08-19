-- CreateEnum
CREATE TYPE "GroupMemberRole" AS ENUM ('admin', 'member');

-- CreateEnum
CREATE TYPE "GroupContributionType" AS ENUM ('manual', 'donation');

-- CreateEnum
CREATE TYPE "GroupExpenseCategory" AS ENUM ('transportation', 'accommodation', 'activities', 'food', 'other');

-- AlterTable
ALTER TABLE "campaigns" ADD COLUMN     "group_conversation_id" TEXT,
ADD COLUMN     "is_group" BOOLEAN NOT NULL DEFAULT false;

-- CreateTable
CREATE TABLE "group_members" (
    "id" TEXT NOT NULL,
    "campaign_id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "role" "GroupMemberRole" NOT NULL DEFAULT 'member',
    "joined_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "group_members_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "group_contributions" (
    "id" TEXT NOT NULL,
    "campaign_id" TEXT NOT NULL,
    "member_user_id" TEXT NOT NULL,
    "amount" DECIMAL(65,30) NOT NULL,
    "type" "GroupContributionType" NOT NULL DEFAULT 'manual',
    "note" TEXT,
    "donation_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "group_contributions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "group_expenses" (
    "id" TEXT NOT NULL,
    "campaign_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "amount" DECIMAL(65,30) NOT NULL,
    "category" "GroupExpenseCategory" NOT NULL,
    "paid_by_user_id" TEXT NOT NULL,
    "spent_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "group_expenses_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "group_members_campaign_id_user_id_key" ON "group_members"("campaign_id", "user_id");

-- CreateIndex
CREATE UNIQUE INDEX "campaigns_group_conversation_id_key" ON "campaigns"("group_conversation_id");

-- AddForeignKey
ALTER TABLE "group_members" ADD CONSTRAINT "group_members_campaign_id_fkey" FOREIGN KEY ("campaign_id") REFERENCES "campaigns"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "group_members" ADD CONSTRAINT "group_members_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "group_contributions" ADD CONSTRAINT "group_contributions_campaign_id_fkey" FOREIGN KEY ("campaign_id") REFERENCES "campaigns"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "group_contributions" ADD CONSTRAINT "group_contributions_member_user_id_fkey" FOREIGN KEY ("member_user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "group_expenses" ADD CONSTRAINT "group_expenses_campaign_id_fkey" FOREIGN KEY ("campaign_id") REFERENCES "campaigns"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "group_expenses" ADD CONSTRAINT "group_expenses_paid_by_user_id_fkey" FOREIGN KEY ("paid_by_user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

