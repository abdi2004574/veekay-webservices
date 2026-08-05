import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  ArrayMinSize,
  IsArray,
  IsDateString,
  IsEnum,
  IsOptional,
  IsString,
  MaxLength,
  ValidateNested,
} from 'class-validator';
import { DestinationType, Gender, TravelStyle } from '@prisma/client';
import { PreviousTripInputDto } from './previous-trip-input.dto';

export class ProfileSetupDto {
  @ApiProperty({
    required: false,
    description: 'Media asset id from a prior presigned upload.',
  })
  @IsOptional()
  @IsString()
  photoMediaId?: string;

  @ApiProperty({ enum: DestinationType, isArray: true })
  @IsArray()
  @ArrayMinSize(1)
  @IsEnum(DestinationType, { each: true })
  destinationTypes: DestinationType[];

  @ApiProperty({ enum: TravelStyle, isArray: true })
  @IsArray()
  @ArrayMinSize(1)
  @IsEnum(TravelStyle, { each: true })
  travelStyles: TravelStyle[];

  @ApiProperty({ enum: Gender, required: false })
  @IsOptional()
  @IsEnum(Gender)
  gender?: Gender;

  @ApiProperty({ required: false, description: 'ISO date string.' })
  @IsOptional()
  @IsDateString()
  dateOfBirth?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  @MaxLength(200)
  bio?: string;

  @ApiProperty({ required: false, type: [PreviousTripInputDto] })
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => PreviousTripInputDto)
  previousTrips?: PreviousTripInputDto[];

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  walletPaymentMethodId?: string;
}
