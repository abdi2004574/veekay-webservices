import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsIn, IsOptional } from 'class-validator';

export const FUNDING_TREND_RANGES = ['7d', '30d', '90d'] as const;
export type FundingTrendRange = (typeof FUNDING_TREND_RANGES)[number];

export class FundingTrendsQueryDto {
  @ApiPropertyOptional({ enum: FUNDING_TREND_RANGES, default: '30d' })
  @IsOptional()
  @IsIn(FUNDING_TREND_RANGES)
  range?: FundingTrendRange;
}
