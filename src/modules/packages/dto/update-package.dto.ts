import { ApiProperty } from '@nestjs/swagger';
import { DestinationType, PackageStatus } from '@prisma/client';
import {
  IsArray,
  IsEnum,
  IsInt,
  IsOptional,
  IsPositive,
  IsString,
  MaxLength,
  MinLength,
} from 'class-validator';

export class UpdatePackageDto {
  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(120)
  title?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  description?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsInt()
  @IsPositive()
  basePrice?: number;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  @MaxLength(3)
  currency?: string;

  @ApiProperty({ required: false, enum: DestinationType })
  @IsOptional()
  @IsEnum(DestinationType)
  destinationType?: DestinationType;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  @MaxLength(50)
  season?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  @MaxLength(50)
  theme?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  @MaxLength(5000)
  itinerary?: string;

  @ApiProperty({ required: false, enum: PackageStatus })
  @IsOptional()
  @IsEnum(PackageStatus)
  status?: PackageStatus;

  @ApiProperty({
    type: [String],
    description: 'Replaces the full ordered media list.',
  })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  mediaMediaIds?: string[];
}
