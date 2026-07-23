import { ApiProperty } from '@nestjs/swagger';
import {
  ArrayMinSize,
  IsArray,
  IsEnum,
  IsOptional,
  IsString,
} from 'class-validator';
import { DestinationType, TravelStyle } from '@prisma/client';

export class ProfileSetupDto {
  @ApiProperty({ description: 'Media asset id from a prior presigned upload.' })
  @IsString()
  photoMediaId: string;

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

  @ApiProperty({ required: false, type: [String] })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  previousTripPhotoIds?: string[];

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  walletPaymentMethodId?: string;
}
