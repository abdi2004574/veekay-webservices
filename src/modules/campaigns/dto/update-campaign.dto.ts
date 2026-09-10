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

export class UpdateCampaignDto {
  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(120)
  title?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(120)
  destination?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsNumber()
  @IsPositive()
  goalAmount?: number;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsDateString()
  tripStartDate?: string;

  @ApiProperty({ required: false, nullable: true })
  @IsOptional()
  @IsDateString()
  tripEndDate?: string | null;

  @ApiProperty({ required: false, maxLength: 500 })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  story?: string;

  @ApiProperty({ required: false, enum: CampaignPrivacy })
  @IsOptional()
  @IsEnum(CampaignPrivacy)
  privacy?: CampaignPrivacy;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsBoolean()
  giftMode?: boolean;

  @ApiProperty({ required: false, nullable: true })
  @IsOptional()
  @IsString()
  giftOccasion?: string | null;

  @ApiProperty({
    required: false,
    type: [String],
    description: 'Replaces the full ordered photo list (up to 5).',
  })
  @IsOptional()
  @IsArray()
  @ArrayMinSize(0)
  @ArrayMaxSize(5)
  @IsString({ each: true })
  photoMediaIds?: string[];

  @ApiProperty({ required: false, nullable: true })
  @IsOptional()
  @IsString()
  itineraryMediaId?: string | null;

  @ApiProperty({ required: false, nullable: true })
  @IsOptional()
  @IsString()
  agencyQuoteMediaId?: string | null;
}
