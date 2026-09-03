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

export class CreatePackageDto {
  @ApiProperty({ example: 'Bali Beach Getaway' })
  @IsString()
  @MinLength(1)
  @MaxLength(120)
  title: string;

  @ApiProperty({
    required: false,
    example: 'A relaxing 5-day beach escape with spa treatments.',
  })
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  description?: string;

  @ApiProperty({ example: 2500 })
  @IsInt()
  @IsPositive()
  basePrice: number;

  @ApiProperty({ default: 'USD' })
  @IsString()
  @MaxLength(3)
  currency: string;

  @ApiProperty({ required: false, enum: DestinationType })
  @IsOptional()
  @IsEnum(DestinationType)
  destinationType?: DestinationType;

  @ApiProperty({ required: false, example: 'summer' })
  @IsOptional()
  @IsString()
  @MaxLength(50)
  season?: string;

  @ApiProperty({ required: false, example: 'family' })
  @IsOptional()
  @IsString()
  @MaxLength(50)
  theme?: string;

  @ApiProperty({
    required: false,
    example: 'Day 1: Arrival... Day 5: Departure...',
  })
  @IsOptional()
  @IsString()
  @MaxLength(5000)
  itinerary?: string;

  @ApiProperty({
    required: false,
    default: PackageStatus.active,
    enum: PackageStatus,
  })
  @IsOptional()
  @IsEnum(PackageStatus)
  status?: PackageStatus;

  @ApiProperty({
    type: [String],
    description: 'Ordered media asset ids from prior presigned uploads.',
  })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  mediaMediaIds?: string[];
}
