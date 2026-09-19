import { ApiProperty } from '@nestjs/swagger';
import { DestinationType, Gender, TravelStyle } from '@prisma/client';
import { PreviousTripInputDto } from './previous-trip-input.dto';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsEnum,
  IsOptional,
  IsString,
  MaxLength,
} from 'class-validator';

export class ProfileSetupDto {
  @ApiProperty({ required: false, maxLength: 300 })
  @IsOptional()
  @IsString()
  @MaxLength(300)
  bio?: string;

  @ApiProperty({ required: false, maxLength: 100 })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  location?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  photoMediaId?: string;

  @ApiProperty({ enum: DestinationType, isArray: true })
  @IsArray()
  @ArrayMinSize(1)
  @IsEnum(DestinationType, { each: true })
  destinationTypes!: DestinationType[];

  @ApiProperty({ enum: TravelStyle, isArray: true })
  @IsArray()
  @ArrayMinSize(1)
  @IsEnum(TravelStyle, { each: true })
  travelStyles!: TravelStyle[];

  @ApiProperty({ enum: Gender, required: false })
  @IsOptional()
  @IsEnum(Gender)
  gender?: Gender;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  dateOfBirth?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  walletPaymentMethodId?: string;

  @ApiProperty({ type: [PreviousTripInputDto], required: false })
  @IsOptional()
  @IsArray()
  @ArrayMinSize(1)
  previousTrips?: PreviousTripInputDto[];
}
