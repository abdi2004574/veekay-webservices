import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsEnum, IsInt, Min, Max, IsString } from 'class-validator';
import { Type } from 'class-transformer';
import { AgencyStatus, AgencySubscriptionTier } from '@prisma/client';

export class AdminAgenciesQueryDto {
  @ApiPropertyOptional({
    description: 'Search by agency name (case-insensitive)',
  })
  @IsOptional()
  @IsString()
  search?: string;

  @ApiPropertyOptional({
    enum: AgencyStatus,
    description: 'Filter by agency status',
  })
  @IsOptional()
  @IsEnum(AgencyStatus)
  status?: AgencyStatus;

  @ApiPropertyOptional({
    enum: AgencySubscriptionTier,
    description: 'Filter by subscription tier',
  })
  @IsOptional()
  @IsEnum(AgencySubscriptionTier)
  subscriptionTier?: AgencySubscriptionTier;

  @ApiPropertyOptional({
    description: 'Cursor for pagination',
    example: 'cursor_base64',
  })
  @IsOptional()
  @IsString()
  cursor?: string;

  @ApiPropertyOptional({ default: 20, minimum: 1, maximum: 50 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(50)
  limit?: number;
}
