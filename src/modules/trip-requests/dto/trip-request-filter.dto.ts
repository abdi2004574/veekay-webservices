import { ApiProperty } from '@nestjs/swagger';
import { TripRequestStatus } from '@prisma/client';
import { IsEnum, IsOptional } from 'class-validator';

export class TripRequestFilterDto {
  @ApiProperty({ required: false, enum: TripRequestStatus })
  @IsOptional()
  @IsEnum(TripRequestStatus)
  status?: TripRequestStatus;
}
