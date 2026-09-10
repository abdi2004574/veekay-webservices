import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { PlatformRole, UserRole } from '@prisma/client';

export class AdminUserProfileDto {
  @ApiPropertyOptional()
  bio?: string;

  @ApiPropertyOptional()
  location?: string;

  @ApiPropertyOptional()
  badge?: string;

  @ApiProperty()
  walletConnected: boolean;
}

export class AdminUserStatsDto {
  @ApiProperty()
  campaignsCreated: number;

  @ApiProperty()
  campaignsFunded: number;

  @ApiProperty()
  donationsMade: number;
}

export class AdminUserDto {
  @ApiProperty()
  id: string;

  @ApiProperty()
  email: string;

  @ApiProperty()
  displayName: string;

  @ApiProperty({ enum: UserRole })
  role: UserRole | 'super_admin';

  @ApiProperty({ enum: PlatformRole })
  platformRole: PlatformRole;

  @ApiProperty()
  isActive: boolean;

  @ApiPropertyOptional()
  deactivatedAt?: Date;

  @ApiProperty()
  createdAt: Date;

  @ApiPropertyOptional()
  lastLoginAt?: Date;

  @ApiPropertyOptional({ type: AdminUserProfileDto })
  profile?: AdminUserProfileDto;

  @ApiPropertyOptional({ type: AdminUserStatsDto })
  stats?: AdminUserStatsDto;
}
