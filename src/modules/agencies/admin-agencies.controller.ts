import { Body, Controller, Get, Param, Post, Query } from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiTags,
  ApiQuery,
} from '@nestjs/swagger';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { RequirePlatformRole } from '../../common/decorators/require-platform-role.decorator';
import { PlatformRole } from '@prisma/client';
import { AgenciesService } from './agencies.service';
import { RejectAgencyDto } from './dto/reject-agency.dto';
import { AdminAgenciesQueryDto } from './dto/admin-agencies-query.dto';

@ApiTags('admin-agencies')
@ApiBearerAuth()
@RequirePlatformRole(PlatformRole.super_admin)
@Controller('admin/agencies')
export class AdminAgenciesController {
  constructor(private readonly agenciesService: AgenciesService) {}

  @Get()
  @ApiOperation({
    summary: 'List all agencies with filters and cursor pagination.',
  })
  @ApiQuery({
    name: 'search',
    required: false,
    description: 'Search by agency name (case-insensitive)',
  })
  @ApiQuery({
    name: 'status',
    required: false,
    enum: ['pending_verification', 'approved', 'rejected'],
    description: 'Filter by agency status',
  })
  @ApiQuery({
    name: 'subscriptionTier',
    required: false,
    enum: ['basic', 'premium', 'featured'],
    description: 'Filter by subscription tier',
  })
  @ApiQuery({
    name: 'cursor',
    required: false,
    description: 'Cursor for pagination',
  })
  @ApiQuery({
    name: 'limit',
    required: false,
    description: 'Limit (1-50)',
    example: 20,
  })
  async listAll(@Query() query: AdminAgenciesQueryDto) {
    const result = await this.agenciesService.listAdmin(
      query.search,
      query.status,
      query.subscriptionTier,
      query.cursor,
      query.limit,
    );
    return {
      data: result.items,
      meta: {
        cursor: result.cursor,
        hasMore: result.hasMore,
      },
    };
  }

  @Get('pending')
  @ApiOperation({ summary: 'List agencies pending verification.' })
  async listPending() {
    return this.agenciesService.findPending();
  }

  @Get('top-performers')
  @ApiOperation({
    summary:
      'Get top performing agencies by reputation, bookings, and revenue.',
  })
  async getTopPerformers(@Query('limit') limit?: number) {
    return this.agenciesService.getTopPerformingAgencies(limit ?? 10);
  }

  @Post(':id/approve')
  @ApiOperation({ summary: 'Approve a pending agency.' })
  async approve(
    @Param('id') id: string,
    @CurrentUser('userId') userId: string,
  ) {
    return this.agenciesService.approve(id, userId);
  }

  @Post(':id/reject')
  @ApiOperation({ summary: 'Reject a pending agency with a reason.' })
  async reject(
    @Param('id') id: string,
    @Body() dto: RejectAgencyDto,
    @CurrentUser('userId') userId: string,
  ) {
    return this.agenciesService.reject(id, dto.reason, userId);
  }
}

