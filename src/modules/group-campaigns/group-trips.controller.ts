import { Controller, Get } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { UserRole } from '@prisma/client';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { RequireRole } from '../../common/decorators/require-role.decorator';
import { GroupCampaignsService } from './group-campaigns.service';

@ApiTags('group-campaigns')
@ApiBearerAuth()
@RequireRole(UserRole.traveler)
@Controller('campaigns/group-trips')
export class GroupTripsController {
  constructor(private readonly groupCampaignsService: GroupCampaignsService) {}

  @Get('mine')
  @ApiOperation({ summary: 'List group trips you created or are a member of.' })
  async listMine(@CurrentUser('userId') userId: string) {
    return this.groupCampaignsService.listMyGroupTrips(userId);
  }
}
