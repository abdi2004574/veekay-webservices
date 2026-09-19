-- CreateEnum
CREATE TYPE "InvoiceStatus" AS ENUM ('pending', 'paid', 'overdue');

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "ReportStatus" ADD VALUE 'flagged';
ALTER TYPE "ReportStatus" ADD VALUE 'rejected';

-- CreateTable
CREATE TABLE "agency_invoices" (
    "id" TEXT NOT NULL,
    "agency_id" TEXT NOT NULL,
    "trip_request_id" TEXT,
    "amount" DECIMAL(65,30) NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'USD',
    "commission_amount" DECIMAL(65,30) NOT NULL DEFAULT 0,
    "net_amount" DECIMAL(65,30) NOT NULL DEFAULT 0,
    "status" "InvoiceStatus" NOT NULL DEFAULT 'pending',
    "due_date" TIMESTAMP(3) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "agency_invoices_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "agency_settings" (
    "id" TEXT NOT NULL,
    "agency_id" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "value" JSONB NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "agency_settings_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "agency_invoices_trip_request_id_key" ON "agency_invoices"("trip_request_id");

-- CreateIndex
CREATE INDEX "agency_invoices_agency_id_idx" ON "agency_invoices"("agency_id");

-- CreateIndex
CREATE INDEX "agency_invoices_status_idx" ON "agency_invoices"("status");

-- CreateIndex
CREATE INDEX "agency_settings_agency_id_idx" ON "agency_settings"("agency_id");

-- CreateIndex
CREATE UNIQUE INDEX "agency_settings_agency_id_key_key" ON "agency_settings"("agency_id", "key");

-- AddForeignKey
ALTER TABLE "agency_invoices" ADD CONSTRAINT "agency_invoices_trip_request_id_fkey" FOREIGN KEY ("trip_request_id") REFERENCES "trip_requests"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "agency_invoices" ADD CONSTRAINT "agency_invoices_agency_id_fkey" FOREIGN KEY ("agency_id") REFERENCES "agencies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "agency_settings" ADD CONSTRAINT "agency_settings_agency_id_fkey" FOREIGN KEY ("agency_id") REFERENCES "agencies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

