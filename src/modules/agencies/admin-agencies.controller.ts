import { Body, Controller, Get, Param, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { RequirePlatformRole } from '../../common/decorators/require-platform-role.decorator';
import { PlatformRole } from '@prisma/client';
import { AgenciesService } from './agencies.service';
import { RejectAgencyDto } from './dto/reject-agency.dto';

@ApiTags('admin-agencies')
@ApiBearerAuth()
@RequirePlatformRole(PlatformRole.super_admin)
@Controller('admin/agencies')
export class AdminAgenciesController {
  constructor(private readonly agenciesService: AgenciesService) {}

  @Get('pending')
  @ApiOperation({ summary: 'List agencies pending verification.' })
  async listPending() {
    return this.agenciesService.findPending();
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
