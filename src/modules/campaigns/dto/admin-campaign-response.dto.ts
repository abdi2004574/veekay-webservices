import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { CampaignPrivacy, CampaignStatus } from '@prisma/client';

export class AdminCampaignCreatorDto {
  @ApiProperty()
  id: string;

  @ApiProperty()
  displayName: string;

  @ApiProperty()
  email: string;
}

export class AdminCampaignDto {
  @ApiProperty()
  id: string;

  @ApiProperty()
  title: string;

  @ApiProperty()
  destination: string;

  @ApiProperty()
  goalAmount: number;

  @ApiProperty()
  raisedAmount: number;

  @ApiProperty()
  currency: string;

  @ApiProperty({ enum: CampaignStatus })
  status: CampaignStatus;

  @ApiProperty({ enum: CampaignPrivacy })
  privacy: CampaignPrivacy;

  @ApiProperty()
  isGiftMode: boolean;

  @ApiProperty({ type: AdminCampaignCreatorDto })
  creator: AdminCampaignCreatorDto;

  @ApiProperty()
  createdAt: Date;

  @ApiPropertyOptional()
  flaggedAt?: Date;

  @ApiPropertyOptional()
  flagReason?: string;
}
