import { Body, Controller, Get, Patch } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { RequirePlatformRole } from '../../common/decorators/require-platform-role.decorator';
import { PlatformRole } from '@prisma/client';
import { SettingsService } from './settings.service';
import {
  PlatformSetting,
  PlatformSettingsResponse,
} from './dto/platform-settings-response.dto';
import { UpdateSettingsRequest } from './dto/update-settings-request.dto';

@ApiTags('admin-settings')
@ApiBearerAuth()
@RequirePlatformRole(PlatformRole.super_admin)
@Controller('admin/settings')
export class SettingsController {
  constructor(private readonly settingsService: SettingsService) {}

  @Get('/')
  @ApiOperation({ summary: 'Get all platform settings.' })
  async getAll(): Promise<PlatformSettingsResponse> {
    const settings = await this.settingsService.getAll();
    return { settings: this.toResponse(settings) };
  }

  @Patch('/')
  @ApiOperation({ summary: 'Update platform settings.' })
  async update(
    @Body() body: UpdateSettingsRequest,
    @CurrentUser('userId') currentUserUserId: string,
  ): Promise<PlatformSettingsResponse> {
    const settings = await this.settingsService.update(currentUserUserId, body);
    return { settings: this.toResponse(settings) };
  }

  private toResponse(
    settings: {
      id: string;
      key: string;
      value: unknown;
      description: string | null;
      category: string;
      createdAt: Date;
      updatedAt: Date;
    }[],
  ): PlatformSetting[] {
    return settings.map((s) => ({
      id: s.id,
      key: s.key,
      value: s.value,
      description: s.description ?? undefined,
      category: s.category,
      createdAt: s.createdAt.toISOString(),
      updatedAt: s.updatedAt.toISOString(),
    }));
  }
}
