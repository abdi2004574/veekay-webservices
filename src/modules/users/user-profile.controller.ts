import { Controller, Get, Param, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { UserRole } from '@prisma/client';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { RequireRole } from '../../common/decorators/require-role.decorator';
import { UsersService } from './users.service';

@ApiTags('users')
@ApiBearerAuth()
@Controller('users')
export class UserProfileController {
  constructor(private readonly usersService: UsersService) {}

  @Get('search')
  @RequireRole(UserRole.traveler)
  @ApiOperation({ summary: 'Search travelers by username or display name.' })
  async search(
    @Query('q') query: string | undefined,
    @CurrentUser('userId') viewerId: string,
  ) {
    return this.usersService.searchTravelers(viewerId, query ?? '');
  }

  @Get(':id/profile')
  @ApiOperation({ summary: "Get another traveler's public profile." })
  async getProfile(
    @Param('id') id: string,
    @CurrentUser('userId') viewerId: string,
  ) {
    return this.usersService.getPublicProfile(viewerId, id);
  }
}
