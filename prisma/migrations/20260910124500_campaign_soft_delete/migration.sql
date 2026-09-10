-- Add soft-delete fields to campaigns table
ALTER TABLE "campaigns" ADD COLUMN "deleted_at" TIMESTAMP(3);
ALTER TABLE "campaigns" ADD COLUMN "deleted_by_id" TEXT;

-- Add foreign key for deleted_by_id
ALTER TABLE "campaigns" ADD CONSTRAINT "campaigns_deleted_by_id_fkey" FOREIGN KEY ("deleted_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Add index for deleted_at
CREATE INDEX "campaigns_deleted_at_idx" ON "campaigns"("deleted_at");
