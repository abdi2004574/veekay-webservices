import { ApiProperty } from '@nestjs/swagger';

export class DashboardMetricsDto {
  @ApiProperty()
  totalUsers!: number;

  @ApiProperty()
  totalAgencies!: number;

  @ApiProperty()
  totalCampaigns!: number;

  @ApiProperty()
  totalDonations!: number;

  @ApiProperty()
  activeCampaigns!: number;

  @ApiProperty()
  pendingAgencies!: number;
}

export class PaymentStatsDto {
  @ApiProperty({ description: 'Total amount of paid withdrawals.' })
  totalWithdrawn!: number;

  @ApiProperty({ description: 'Number of withdrawals awaiting review.' })
  pendingReview!: number;

  @ApiProperty({ description: 'Number of approved withdrawals.' })
  approved!: number;

  @ApiProperty({ description: 'Number of rejected withdrawals.' })
  rejected!: number;
}

export class FundingTrendPointDto {
  @ApiProperty()
  date!: string;

  @ApiProperty()
  amount!: number;
}

export class FundingTrendsResponseDto {
  @ApiProperty({ type: FundingTrendPointDto, isArray: true })
  trends!: FundingTrendPointDto[];
}

export class TopDestinationDto {
  @ApiProperty()
  name!: string;

  @ApiProperty()
  count!: number;
}

export class TravelerPreferenceDto {
  @ApiProperty()
  label!: string;

  @ApiProperty()
  count!: number;
}
