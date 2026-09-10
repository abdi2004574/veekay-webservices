import { Body, Controller, Delete, Get, Param, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { RequirePlatformRole } from '../../common/decorators/require-platform-role.decorator';
import { PlatformRole } from '@prisma/client';
import { VerifiedBadgesService } from './verified-badges.service';
import { AssignBadgeDto } from './dto/assign-badge.dto';

@ApiTags('admin-verified-badges')
@ApiBearerAuth()
@RequirePlatformRole(PlatformRole.super_admin)
@Controller('admin/badges')
export class VerifiedBadgesController {
  constructor(private readonly verifiedBadgesService: VerifiedBadgesService) {}

  @Post('/')
  @ApiOperation({ summary: 'Assign a verified badge to a user or agency.' })
  async assign(
    @Body() dto: AssignBadgeDto,
    @CurrentUser('userId') userId: string,
  ) {
    return this.verifiedBadgesService.assign(userId, dto);
  }

  @Delete('/:id')
  @ApiOperation({ summary: 'Revoke a verified badge.' })
  async revoke(@Param('id') id: string, @CurrentUser('userId') userId: string) {
    return this.verifiedBadgesService.revoke(userId, id);
  }

  @Get('/')
  @ApiOperation({ summary: 'List all verified badges.' })
  async findAll() {
    return this.verifiedBadgesService.findAll();
  }
}
