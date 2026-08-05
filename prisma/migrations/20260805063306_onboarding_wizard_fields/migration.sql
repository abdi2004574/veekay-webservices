/*
  Warnings:

  - Added the required column `end_date` to the `traveler_previous_trip_photos` table without a default value. This is not possible if the table is not empty.
  - Added the required column `location` to the `traveler_previous_trip_photos` table without a default value. This is not possible if the table is not empty.
  - Added the required column `name` to the `traveler_previous_trip_photos` table without a default value. This is not possible if the table is not empty.
  - Added the required column `start_date` to the `traveler_previous_trip_photos` table without a default value. This is not possible if the table is not empty.

*/
-- CreateEnum
CREATE TYPE "Gender" AS ENUM ('male', 'female', 'other');

-- AlterTable
ALTER TABLE "traveler_previous_trip_photos" ADD COLUMN     "description" TEXT,
ADD COLUMN     "end_date" TIMESTAMP(3) NOT NULL,
ADD COLUMN     "location" TEXT NOT NULL,
ADD COLUMN     "name" TEXT NOT NULL,
ADD COLUMN     "start_date" TIMESTAMP(3) NOT NULL,
ADD COLUMN     "traveler_count" INTEGER NOT NULL DEFAULT 1;

-- AlterTable
ALTER TABLE "traveler_profiles" ADD COLUMN     "date_of_birth" TIMESTAMP(3),
ADD COLUMN     "gender" "Gender";
