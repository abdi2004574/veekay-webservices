import { PlatformRole, UserRole } from '@prisma/client';

export interface AuthenticatedUser {
  userId: string;
  email: string;
  role: UserRole;
  platformRole: PlatformRole;
  jti: string;
  isEmailVerified: boolean;
  isActive: boolean;
  twoFactorConfirmed?: boolean;
  agencyId?: string;
}
