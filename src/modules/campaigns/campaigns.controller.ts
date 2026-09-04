import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { UserRole } from '@prisma/client';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { RequireRole } from '../../common/decorators/require-role.decorator';
import { CampaignsService } from './campaigns.service';
import { CreateCampaignDto } from './dto/create-campaign.dto';
import { UpdateCampaignDto } from './dto/update-campaign.dto';

@ApiTags('campaigns')
@ApiBearerAuth()
@RequireRole(UserRole.traveler)
@Controller('campaigns')
export class CampaignsController {
  constructor(private readonly campaignsService: CampaignsService) {}

  @Post()
  @ApiOperation({ summary: 'Create a campaign.' })
  async create(
    @Body() dto: CreateCampaignDto,
    @CurrentUser('userId') userId: string,
  ) {
    return this.campaignsService.create(userId, dto);
  }

  @Get('mine')
  @ApiOperation({ summary: 'List your own campaigns.' })
  async listMine(@CurrentUser('userId') userId: string) {
    return this.campaignsService.listMine(userId);
  }

  @Get()
  @ApiOperation({
    summary:
      'Browse public campaigns (Explore), optionally filtered by creator.',
  })
  async listPublic(
    @Query('cursor') cursor: string | undefined,
    @Query('limit') limit: string | undefined,
    @Query('search') search: string | undefined,
    @Query('creatorId') creatorId: string | undefined,
  ) {
    return this.campaignsService.listPublic(
      cursor,
      limit ? Number(limit) : undefined,
      search,
      creatorId,
    );
  }

  @Get(':id')
  @ApiOperation({
    summary: 'Get a campaign (public, or private if you created it).',
  })
  async getDetail(
    @Param('id') id: string,
    @CurrentUser('userId') userId: string,
  ) {
    return this.campaignsService.getDetail(id, userId);
  }

  @Get(':id/top-contributors')
  @ApiOperation({
    summary: "List a campaign's top contributors (empty until Payments ships).",
  })
  async listTopContributors(
    @Param('id') id: string,
    @CurrentUser('userId') userId: string,
  ) {
    return this.campaignsService.listTopContributors(id, userId);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Edit your own campaign.' })
  async update(
    @Param('id') id: string,
    @Body() dto: UpdateCampaignDto,
    @CurrentUser('userId') userId: string,
  ) {
    return this.campaignsService.update(id, userId, dto);
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Delete your own campaign.' })
  async remove(@Param('id') id: string, @CurrentUser('userId') userId: string) {
    await this.campaignsService.remove(id, userId);
  }
}
