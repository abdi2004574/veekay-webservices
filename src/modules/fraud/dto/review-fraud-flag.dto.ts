import { ApiProperty } from '@nestjs/swagger';
import { IsEnum, IsOptional, IsString } from 'class-validator';
import { FraudFlagStatus } from '@prisma/client';

export class ReviewFraudFlagDto {
  @ApiProperty({ enum: FraudFlagStatus })
  @IsEnum(FraudFlagStatus)
  status: FraudFlagStatus;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  resolutionNote?: string;
}