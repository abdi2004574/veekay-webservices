import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';

export class KpiResponseDto {
  @ApiProperty({ example: 42 })
  totalRequests: number;

  @ApiProperty({ example: 12 })
  pendingRequests: number;

  @ApiProperty({ example: 8 })
  inDiscussionRequests: number;

  @ApiProperty({ example: 22 })
  confirmedRequests: number;

  @ApiProperty({ example: 15 })
  totalPackages: number;

  @ApiProperty({ example: 125000.5 })
  totalRevenue: number;

  @ApiProperty({ example: 2.5 })
  avgResponseTimeHours: number;
}

export class FundingTrendPointDto {
  @ApiProperty({ example: '2024-01-15' })
  date: string;

  @ApiProperty({ example: 5000.0 })
  amount: number;
}

export class FundingTrendsResponseDto {
  @ApiProperty({ type: [FundingTrendPointDto] })
  trends: FundingTrendPointDto[];
}

export class TopDestinationDto {
  @ApiProperty({ example: 'Bali, Indonesia' })
  destination: string;

  @ApiProperty({ example: 8 })
  bookingCount: number;

  @ApiProperty({ example: 45000.0 })
  totalRevenue: number;
}

export class TopDestinationsResponseDto {
  @ApiProperty({ type: [TopDestinationDto] })
  destinations: TopDestinationDto[];
}

export class TravelerPreferenceDto {
  @ApiProperty({ example: 'beach' })
  destinationType: string;

  @ApiProperty({ example: 45 })
  travelerCount: number;

  @ApiProperty({ example: 35.5 })
  percentage: number;
}

export class TravelerPreferencesResponseDto {
  @ApiProperty({ type: [TravelerPreferenceDto] })
  preferences: TravelerPreferenceDto[];
}

export class RevenueLedgerItemDto {
  @ApiProperty({ example: 'tbk_abc123' })
  bookingId: string;

  @ApiProperty({ example: 'pkg_xyz789' })
  packageId: string;

  @ApiProperty({ example: 'Bali Adventure Package' })
  packageTitle: string;

  @ApiProperty({ example: 'traveler_123' })
  travelerId: string;

  @ApiProperty({ example: 'john.doe@example.com' })
  travelerEmail: string;

  @ApiProperty({ example: 5000.0 })
  amount: number;

  @ApiProperty({ example: 750.0 })
  commission: number;

  @ApiProperty({ example: 4250.0 })
  netPayout: number;

  @ApiProperty({ example: 'completed' })
  status: string;

  @ApiProperty({ example: '2024-01-15T10:30:00Z' })
  completedAt: string;
}

export class RevenueLedgerResponseDto {
  @ApiProperty({ type: [RevenueLedgerItemDto] })
  items: RevenueLedgerItemDto[];

  @ApiProperty({ example: 'cursor_xyz' })
  nextCursor: string | null;

  @ApiProperty({ example: true })
  hasMore: boolean;
}
