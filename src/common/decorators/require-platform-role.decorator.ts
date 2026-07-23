import { SetMetadata } from '@nestjs/common';
import { PlatformRole } from '@prisma/client';

export const REQUIRE_PLATFORM_ROLE_KEY = 'requirePlatformRole';
export const RequirePlatformRole = (...roles: PlatformRole[]) =>
  SetMetadata(REQUIRE_PLATFORM_ROLE_KEY, roles);
