import { ApiProperty } from '@nestjs/swagger';
import { AgencyStatus, AgencySubscriptionTier } from '@prisma/client';

export class AdminAgencyDto {
  @ApiProperty({ example: 'agency_abc123' })
  id: string;

  @ApiProperty({ example: 'Dream Travel Co.' })
  agencyName: string;

  @ApiProperty({ example: 'business@example.com' })
  businessContact: string | null;

  @ApiProperty({ example: '123 Main St, City' })
  businessAddress: string | null;

  @ApiProperty({ enum: AgencyStatus, example: AgencyStatus.approved })
  status: AgencyStatus;

  @ApiProperty({ example: 'Documents incomplete', required: false })
  rejectionReason: string | null;

  @ApiProperty({ example: 4.8, required: false })
  reputationScore: number | null;

  @ApiProperty({
    enum: AgencySubscriptionTier,
    example: AgencySubscriptionTier.premium,
  })
  subscriptionTier: AgencySubscriptionTier;

  @ApiProperty({ example: '2024-01-15T10:30:00Z' })
  createdAt: Date;

  @ApiProperty({ example: 'user_xyz789' })
  userId: string;

  @ApiProperty({ example: 'owner@example.com' })
  userEmail: string;

  @ApiProperty({ example: 'John Owner' })
  userDisplayName: string | null;
}

export class AdminAgenciesMetaDto {
  @ApiProperty({ example: 'cursor_base64', nullable: true })
  cursor: string | null;

  @ApiProperty({ example: true })
  hasMore: boolean;
}

export class AdminAgenciesResponseDto {
  @ApiProperty({ type: [AdminAgencyDto] })
  data: AdminAgencyDto[];

  @ApiProperty({ type: AdminAgenciesMetaDto })
  meta: AdminAgenciesMetaDto;
}

