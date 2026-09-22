import { Controller, Get, Param, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Public } from '../../common/decorators/public.decorator';
import { RequireRole } from '../../common/decorators/require-role.decorator';
import { UserRole } from '@prisma/client';
import { AgenciesService } from './agencies.service';

@ApiTags('agencies')
@Controller('agencies')
export class AgencyDirectoryController {
  constructor(private readonly agenciesService: AgenciesService) {}

  @Public()
  @Get()
  @ApiOperation({ summary: 'Browse approved agencies, most reputable first.' })
  async list(
    @Query('cursor') cursor: string | undefined,
    @Query('limit') limit: string | undefined,
    @Query('search') search: string | undefined,
  ) {
    return this.agenciesService.listDirectory(
      cursor,
      limit ? Number(limit) : undefined,
      search,
    );
  }

  @Public()
  @Get(':id')
  @ApiOperation({ summary: 'Public agency profile.' })
  async getById(@Param('id') id: string) {
    return this.agenciesService.getPublicDetail(id);
  }

  @Get('me')
  @RequireRole(UserRole.agency)
  @ApiOperation({ summary: "Get the authenticated agency's own full profile." })
  async getMe(@CurrentUser('userId') userId: string) {
    return this.agenciesService.getMyAgencyDetail(userId);
  }
}
