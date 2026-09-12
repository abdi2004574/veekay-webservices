-- AddForeignKey
ALTER TABLE "agency_staff" ADD CONSTRAINT "agency_staff_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
