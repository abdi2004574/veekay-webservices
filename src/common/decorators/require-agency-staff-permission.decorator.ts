import { SetMetadata } from '@nestjs/common';
import { AgencyStaffPermission } from '@prisma/client';

export const REQUIRE_AGENCY_STAFF_PERMISSION_KEY =
  'requireAgencyStaffPermission';
export const RequireAgencyStaffPermission = (
  ...permissions: AgencyStaffPermission[]
) => SetMetadata(REQUIRE_AGENCY_STAFF_PERMISSION_KEY, permissions);
