import { ApiProperty } from '@nestjs/swagger';
import {
  IsEnum,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  Min,
} from 'class-validator';
import { FraudFlagSeverity, FraudFlagType } from '@prisma/client';

export class CreateFraudFlagDto {
  @ApiProperty({ enum: FraudFlagType })
  @IsEnum(FraudFlagType)
  type: FraudFlagType;

  @ApiProperty({ enum: FraudFlagSeverity, required: false })
  @IsEnum(FraudFlagSeverity)
  @IsOptional()
  severity?: FraudFlagSeverity;

  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  description: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  metadata?: string;
}
