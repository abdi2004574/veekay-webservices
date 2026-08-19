import { ApiProperty } from '@nestjs/swagger';
import { CampaignPrivacy } from '@prisma/client';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsBoolean,
  IsDateString,
  IsEnum,
  IsNumber,
  IsOptional,
  IsPositive,
  IsString,
  MaxLength,
  MinLength,
} from 'class-validator';

export class CreateCampaignDto {
  @ApiProperty({ example: 'My Dream Trip to Greece' })
  @IsString()
  @MinLength(1)
  @MaxLength(120)
  title: string;

  @ApiProperty({ example: 'Santorini, Greece' })
  @IsString()
  @MinLength(1)
  @MaxLength(120)
  destination: string;

  @ApiProperty({ example: 5000 })
  @IsNumber()
  @IsPositive()
  goalAmount: number;

  @ApiProperty()
  @IsDateString()
  tripStartDate: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsDateString()
  tripEndDate?: string;

  @ApiProperty({ required: false, maxLength: 500 })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  story?: string;

  @ApiProperty({ enum: CampaignPrivacy, default: CampaignPrivacy.public })
  @IsEnum(CampaignPrivacy)
  privacy: CampaignPrivacy;

  @ApiProperty({ default: false })
  @IsBoolean()
  giftMode: boolean;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  @MaxLength(60)
  giftOccasion?: string;

  @ApiProperty({
    type: [String],
    description: 'Ordered media asset ids from prior presigned uploads (up to 5).',
  })
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(5)
  @IsString({ each: true })
  photoMediaIds: string[];

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  itineraryMediaId?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  agencyQuoteMediaId?: string;

  @ApiProperty({
    required: false,
    default: false,
    description: 'Group trip campaigns are always forced private, never in public discovery.',
  })
  @IsOptional()
  @IsBoolean()
  isGroup?: boolean;
}
