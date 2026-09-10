import { IsEnum, IsOptional } from 'class-validator';
import { FraudFlagStatus, FraudFlagType } from '@prisma/client';

export class FraudFlagFilterDto {
  @IsEnum(FraudFlagType)
  @IsOptional()
  type?: FraudFlagType;

  @IsEnum(FraudFlagStatus)
  @IsOptional()
  status?: FraudFlagStatus;

  @IsOptional()
  userId?: string;
}