import { Body, Controller, Param, Patch } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { RequirePlatformRole } from '../../common/decorators/require-platform-role.decorator';
import { PlatformRole } from '@prisma/client';
import { CampaignsService } from './campaigns.service';
import { UpdateCampaignVerificationDto } from './dto/update-campaign-verification.dto';

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
    return this.campaignsService.updateVerificationStatus(id, dto.status, dto.note, userId);
  }
}
