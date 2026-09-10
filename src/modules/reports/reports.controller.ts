import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { PlatformRole, UserRole } from '@prisma/client';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { RequirePlatformRole } from '../../common/decorators/require-platform-role.decorator';
import { RequireRole } from '../../common/decorators/require-role.decorator';
import { ReportsService } from './reports.service';
import { CreateReportDto } from './dto/create-report.dto';
import { ReviewReportDto } from './dto/review-report.dto';
import { ReportFilterDto } from './dto/report-filter.dto';

@ApiTags('reports')
@ApiBearerAuth()
@Controller('reports')
export class ReportsController {
  constructor(private readonly reportsService: ReportsService) {}

  @Post()
  @RequireRole(UserRole.traveler, UserRole.agency, UserRole.admin)
  @ApiOperation({ summary: 'Create a content report.' })
  async create(
    @Body() dto: CreateReportDto,
    @CurrentUser('userId') reporterId: string,
  ) {
    return this.reportsService.create(reporterId, dto);
  }

  @Get('admin/reports')
  @RequirePlatformRole(PlatformRole.super_admin)
  @ApiOperation({ summary: 'List all content reports (super_admin only).' })
  async findAll(
    @Query() filter: ReportFilterDto,
    @Query('cursor') cursor: string | undefined,
    @Query('limit') limit: string | undefined,
  ) {
    return this.reportsService.findAll(filter, cursor, limit ? Number(limit) : undefined);
  }

  @Get('admin/reports/:id')
  @RequirePlatformRole(PlatformRole.super_admin)
  @ApiOperation({ summary: 'Get a single content report (super_admin only).' })
  async findOne(@Param('id') id: string) {
    return this.reportsService.findOne(id);
  }

  @Patch('admin/reports/:id')
  @RequirePlatformRole(PlatformRole.super_admin)
  @ApiOperation({ summary: 'Review/update a content report (super_admin only).' })
  async review(
    @Param('id') id: string,
    @Body() dto: ReviewReportDto,
    @CurrentUser('userId') actorId: string,
  ) {
    return this.reportsService.review(actorId, id, dto);
  }
}
