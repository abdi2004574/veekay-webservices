import { Controller, Get, Query, Res } from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiTags,
  ApiQuery,
} from '@nestjs/swagger';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { RequireRole } from '../../common/decorators/require-role.decorator';
import { RequireVerifiedEmail } from '../../common/decorators/require-verified-email.decorator';
import { UserRole } from '@prisma/client';
import type { Response } from 'express';
import { AgencyDashboardService } from './dashboard.service';
import { AgencyRevenueService } from './revenue.service';
import {
  DashboardQueryDto,
  RevenueLedgerQueryDto,
  FundingTrendRange,
} from './dto/dashboard-query.dto';

@ApiTags('agency-dashboard')
@ApiBearerAuth()
@Controller('agency')
export class AgencyDashboardController {
  constructor(
    private readonly dashboardService: AgencyDashboardService,
    private readonly revenueService: AgencyRevenueService,
  ) {}

  @Get('dashboard/kpis')
  @RequireRole(UserRole.agency)
  @RequireVerifiedEmail()
  @ApiOperation({ summary: 'Get agency dashboard KPIs' })
  async getKpis(@CurrentUser('agencyId') agencyId: string) {
    return this.dashboardService.getKpis(agencyId);
  }

  @Get('dashboard/funding-trends')
  @RequireRole(UserRole.agency)
  @RequireVerifiedEmail()
  @ApiOperation({ summary: 'Get funding trends for the last 7d, 30d, or 90d' })
  @ApiQuery({ name: 'range', enum: FundingTrendRange, required: false })
  async getFundingTrends(
    @CurrentUser('agencyId') agencyId: string,
    @Query() query: DashboardQueryDto,
  ) {
    return this.dashboardService.getFundingTrends(
      agencyId,
      query.range || FundingTrendRange.THIRTY_DAYS,
    );
  }

  @Get('dashboard/top-destinations')
  @RequireRole(UserRole.agency)
  @RequireVerifiedEmail()
  @ApiOperation({ summary: 'Get top destinations by booking count' })
  async getTopDestinations(@CurrentUser('agencyId') agencyId: string) {
    return this.dashboardService.getTopDestinations(agencyId);
  }

  @Get('dashboard/traveler-preferences')
  @RequireRole(UserRole.agency)
  @RequireVerifiedEmail()
  @ApiOperation({ summary: 'Get traveler destination preference distribution' })
  async getTravelerPreferences(@CurrentUser('agencyId') agencyId: string) {
    return this.dashboardService.getTravelerPreferences(agencyId);
  }

  @Get('revenue/ledger')
  @RequireRole(UserRole.agency)
  @RequireVerifiedEmail()
  @ApiOperation({ summary: 'Get revenue ledger with pagination' })
  async getRevenueLedger(
    @CurrentUser('agencyId') agencyId: string,
    @Query() query: RevenueLedgerQueryDto,
  ) {
    return this.revenueService.getRevenueLedger(
      agencyId,
      query.cursor,
      query.limit,
    );
  }

  @Get('revenue/export')
  @RequireRole(UserRole.agency)
  @RequireVerifiedEmail()
  @ApiOperation({ summary: 'Export revenue ledger as CSV' })
  async exportRevenueCsv(
    @CurrentUser('agencyId') agencyId: string,
    @Res() res: Response,
  ) {
    const csv = await this.revenueService.exportRevenueCsv(agencyId);
    const filename =
      'revenue-ledger-' + new Date().toISOString().split('T')[0] + '.csv';

    res.setHeader('Content-Type', 'text/csv');
    res.setHeader(
      'Content-Disposition',
      'attachment; filename=\"' + filename + '\"',
    );
    res.send(csv);
  }
}
