import { Body, Controller, Get, Param, Patch, Query } from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { RequirePlatformRole } from '../../common/decorators/require-platform-role.decorator';
import { PlatformRole } from '@prisma/client';
import { CampaignsService } from './campaigns.service';
import { UpdateCampaignVerificationDto } from './dto/update-campaign-verification.dto';
import { AdminCampaignFilterDto } from './dto/admin-campaign-filter.dto';
import { UpdateCampaignFlagDto } from './dto/update-campaign-flag.dto';
import { AdminCampaignDto } from './dto/admin-campaign-response.dto';

@ApiTags('admin-campaigns')
@ApiBearerAuth()
@RequirePlatformRole(PlatformRole.super_admin)
@Controller('admin/campaigns')
export class AdminCampaignsController {
  constructor(private readonly campaignsService: CampaignsService) {}

  @Patch(':id/verification')
  @ApiOperation({ summary: 'Update a campaign verification status.' })
  async updateVerification(
    @Param('id') id: string,
    @Body() dto: UpdateCampaignVerificationDto,
    @CurrentUser('userId') userId: string,
  ) {
    return this.campaignsService.updateVerificationStatus(
      id,
      dto.status,
      dto.note,
      userId,
    );
  }

  @Get()
  @ApiOperation({
    summary: 'List campaigns with admin filters and cursor pagination.',
  })
  @ApiOkResponse({
    schema: {
      type: 'object',
      properties: {
        data: {
          type: 'array',
          items: { $ref: '#/components/schemas/AdminCampaignDto' },
        },
        meta: {
          type: 'object',
          properties: {
            cursor: { type: 'string', nullable: true },
            hasMore: { type: 'boolean' },
          },
        },
      },
    },
  })
  async list(@Query() filter: AdminCampaignFilterDto) {
    return this.campaignsService.listAdminCampaigns(
      filter,
      filter.cursor,
      filter.limit ?? 20,
    );
  }

  @Patch(':id/flag')
  @ApiOperation({ summary: 'Flag or unflag a campaign.' })
  @ApiOkResponse({ type: AdminCampaignDto })
  async updateFlag(
    @Param('id') id: string,
    @Body() dto: UpdateCampaignFlagDto,
    @CurrentUser('userId') userId: string,
  ) {
    if (dto.reason?.trim()) {
      return this.campaignsService.flagCampaign(id, dto, userId);
    }
    return this.campaignsService.unflagCampaign(id, userId);
  }
}
