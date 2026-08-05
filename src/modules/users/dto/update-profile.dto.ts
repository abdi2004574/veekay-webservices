import { ApiProperty } from '@nestjs/swagger';
import {
  IsArray,
  IsDateString,
  IsEnum,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
} from 'class-validator';
import { DestinationType, Gender, TravelStyle } from '@prisma/client';

export class UpdateProfileDto {
  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  @MaxLength(60)
  displayName?: string;

  @ApiProperty({ required: false, description: 'Lowercase letters and numbers only.' })
  @IsOptional()
  @IsString()
  @Matches(/^[a-z0-9]+$/)
  username?: string;

  @ApiProperty({ required: false, description: 'Media asset id from a prior presigned upload.' })
  @IsOptional()
  @IsString()
  photoMediaId?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  @MaxLength(200)
  bio?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  location?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  phone?: string;

  @ApiProperty({ enum: Gender, required: false })
  @IsOptional()
  @IsEnum(Gender)
  gender?: Gender;

  @ApiProperty({ required: false, description: 'ISO date string.' })
  @IsOptional()
  @IsDateString()
  dateOfBirth?: string;

  @ApiProperty({ enum: DestinationType, isArray: true, required: false })
  @IsOptional()
  @IsArray()
  @IsEnum(DestinationType, { each: true })
  destinationTypes?: DestinationType[];

  @ApiProperty({ enum: TravelStyle, isArray: true, required: false })
  @IsOptional()
  @IsArray()
  @IsEnum(TravelStyle, { each: true })
  travelStyles?: TravelStyle[];
}
