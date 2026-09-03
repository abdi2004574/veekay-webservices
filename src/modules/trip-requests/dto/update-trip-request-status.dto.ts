import { ApiProperty } from '@nestjs/swagger';
import { TripRequestStatus } from '@prisma/client';
import { IsEnum } from 'class-validator';

export class UpdateTripRequestStatusDto {
  @ApiProperty({ enum: TripRequestStatus })
  @IsEnum(TripRequestStatus)
  status: TripRequestStatus;
}
