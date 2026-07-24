-- CreateEnum
CREATE TYPE "MediaPurpose" AS ENUM ('profile_photo', 'previous_trip_photo', 'post_media', 'story_media', 'agency_document', 'agency_logo');

-- CreateEnum
CREATE TYPE "MediaStatus" AS ENUM ('pending', 'uploaded', 'deleted');

-- CreateTable
CREATE TABLE "media_assets" (
    "id" TEXT NOT NULL,
    "owner_id" TEXT NOT NULL,
    "purpose" "MediaPurpose" NOT NULL,
    "key" TEXT NOT NULL,
    "content_type" TEXT NOT NULL,
    "status" "MediaStatus" NOT NULL DEFAULT 'pending',
    "size_bytes" INTEGER,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "media_assets_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "media_assets_key_key" ON "media_assets"("key");

-- AddForeignKey
ALTER TABLE "media_assets" ADD CONSTRAINT "media_assets_owner_id_fkey" FOREIGN KEY ("owner_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

