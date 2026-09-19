import { Body, Controller, Get, Patch, Req } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { RequireRole } from '../../common/decorators/require-role.decorator';
import { RequireVerifiedEmail } from '../../common/decorators/require-verified-email.decorator';
import { UserRole } from '@prisma/client';
import type { Request } from 'express';
import { AgencySettingsService } from './agency-settings.service';
import { UpdateAgencySettingDto } from './dto/update-agency-setting.dto';

@ApiTags('agency-settings')
@ApiBearerAuth()
@Controller('agency/settings')
@RequireRole(UserRole.agency)
@RequireVerifiedEmail()
export class AgencySettingsController {
  constructor(private readonly agencySettingsService: AgencySettingsService) {}

  private getAgencyId(req: Request): string {
    const agencyId = (req as Request & { agencyId: string }).agencyId;
    if (!agencyId) throw new Error('Agency ID not found on request');
    return agencyId;
  }

  @Get()
  @ApiOperation({ summary: 'Get all agency settings' })
  async getAllSettings(@Req() req: Request) {
    const agencyId = this.getAgencyId(req);
    return this.agencySettingsService.getAllSettings(agencyId);
  }

  @Patch()
  @ApiOperation({ summary: 'Update agency settings (upsert by key)' })
  async updateSettings(@Req() req: Request, @Body() dto: UpdateAgencySettingDto) {
    const agencyId = this.getAgencyId(req);
    return this.agencySettingsService.updateSetting(agencyId, dto.key, dto.value);
  }
}
