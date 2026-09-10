import { Controller, Get, Query } from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import { PlatformRole } from '@prisma/client';
import { RequirePlatformRole } from '../../common/decorators/require-platform-role.decorator';
import {
  DashboardMetricsDto,
  FundingTrendsResponseDto,
  TopDestinationDto,
  TravelerPreferenceDto,
} from './dto/dashboard-response.dto';
import { FundingTrendsQueryDto } from './dto/funding-trends-query.dto';
import { AdminDashboardService } from './admin-dashboard.service';

@ApiTags('admin-dashboard')
@ApiBearerAuth()
@RequirePlatformRole(PlatformRole.super_admin)
@Controller('admin/dashboard')
export class AdminDashboardController {
  constructor(private readonly dashboardService: AdminDashboardService) {}

  @Get('kpis')
  @ApiOperation({ summary: 'Get platform dashboard metrics.' })
  @ApiOkResponse({ type: DashboardMetricsDto })
  async getMetrics() {
    return this.dashboardService.getMetrics();
  }

  @Get('funding-trends')
  @ApiOperation({ summary: 'Get daily funding totals for a supported range.' })
  @ApiOkResponse({ type: FundingTrendsResponseDto })
  async getFundingTrends(@Query() query: FundingTrendsQueryDto) {
    return this.dashboardService.getFundingTrends(query.range);
  }

  @Get('top-destinations')
  @ApiOperation({ summary: 'Get the most common campaign destinations.' })
  @ApiOkResponse({ type: TopDestinationDto, isArray: true })
  async getTopDestinations() {
    return this.dashboardService.getTopDestinations();
  }

  @Get('traveler-distribution')
  @ApiOperation({ summary: 'Get traveler destination preferences.' })
  @ApiOkResponse({ type: TravelerPreferenceDto, isArray: true })
  async getTravelerPreferences() {
    return this.dashboardService.getTravelerPreferences();
  }
}
