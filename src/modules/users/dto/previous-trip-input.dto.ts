import { ApiProperty } from '@nestjs/swagger';
import {
  IsDateString,
  IsInt,
  IsOptional,
  IsString,
  Min,
  MaxLength,
} from 'class-validator';

export class PreviousTripInputDto {
  @ApiProperty({ description: 'Media asset id from a prior presigned upload.' })
  @IsString()
  mediaId: string;

  @ApiProperty()
  @IsString()
  name: string;

  @ApiProperty()
  @IsString()
  location: string;

  @ApiProperty({ description: 'ISO date string.' })
  @IsDateString()
  startDate: string;

  @ApiProperty({ description: 'ISO date string.' })
  @IsDateString()
  endDate: string;

  @ApiProperty({ default: 1 })
  @IsInt()
  @Min(1)
  travelerCount: number;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  @MaxLength(150)
  description?: string;
}
