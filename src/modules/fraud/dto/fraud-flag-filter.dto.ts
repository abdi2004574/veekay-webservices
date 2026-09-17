import { IsEnum, IsOptional, IsString } from 'class-validator';
import {
  FraudFlagSeverity,
  FraudFlagStatus,
  FraudFlagType,
} from '@prisma/client';

export class FraudFlagFilterDto {
  @IsEnum(FraudFlagType)
  @IsOptional()
  type?: FraudFlagType;

  @IsEnum(FraudFlagStatus)
  @IsOptional()
  status?: FraudFlagStatus;

  @IsEnum(FraudFlagSeverity)
  @IsOptional()
  severity?: FraudFlagSeverity;

  @IsString()
  @IsOptional()
  search?: string;

  @IsOptional()
  userId?: string;
}
