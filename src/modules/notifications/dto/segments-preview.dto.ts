import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsEnum, IsOptional } from 'class-validator';

export class SegmentsPreviewDto {
  @ApiPropertyOptional({ enum: ['all', 'role', 'user'] as const, default: 'all' })
  @IsEnum(['all', 'role', 'user'] as const)
  @IsOptional()
  target?: 'all' | 'role' | 'user';

  @ApiPropertyOptional({ enum: ['traveler', 'agency'] as const })
  @IsEnum(['traveler', 'agency'] as const)
  @IsOptional()
  role?: 'traveler' | 'agency';
}
