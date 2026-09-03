import { ApiProperty } from '@nestjs/swagger';
import { DestinationType } from '@prisma/client';
import { IsEnum, IsOptional, IsString } from 'class-validator';

export class PackageFilterDto {
  @ApiProperty({ required: false, enum: DestinationType })
  @IsOptional()
  @IsEnum(DestinationType)
  destinationType?: DestinationType;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  season?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  theme?: string;
}
