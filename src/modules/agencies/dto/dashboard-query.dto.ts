import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsEnum, IsInt, Min, Max, IsString } from 'class-validator';
import { Type } from 'class-transformer';

export enum FundingTrendRange {
  SEVEN_DAYS = '7d',
  THIRTY_DAYS = '30d',
  NINETY_DAYS = '90d',
}

export class DashboardQueryDto {
  @ApiPropertyOptional({
    enum: FundingTrendRange,
    default: FundingTrendRange.THIRTY_DAYS,
    description: 'Time range for funding trends',
  })
  @IsOptional()
  @IsEnum(FundingTrendRange)
  range?: FundingTrendRange = FundingTrendRange.THIRTY_DAYS;
}

export class RevenueLedgerQueryDto {
  @ApiPropertyOptional({ default: 20, minimum: 1, maximum: 100 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number = 20;

  @ApiPropertyOptional({ description: 'Cursor for pagination' })
  @IsOptional()
  @IsString()
  cursor?: string;
}
