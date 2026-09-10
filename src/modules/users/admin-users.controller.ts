import { Body, Controller, Get, Param, Patch } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { RequirePlatformRole } from '../../common/decorators/require-platform-role.decorator';
import { PlatformRole } from '@prisma/client';
import { UsersService } from './users.service';
import { VerifyKycDto } from './dto/verify-kyc.dto';

@ApiTags('admin-users')
@ApiBearerAuth()
@RequirePlatformRole(PlatformRole.super_admin)
@Controller('admin/users')
export class AdminUsersController {
  constructor(private readonly usersService: UsersService) {}

  @Patch(':id/kyc')
  @ApiOperation({ summary: 'Verify or reject a traveler KYC submission.' })
  async verifyKyc(
    @Param('id') id: string,
    @Body() dto: VerifyKycDto,
    @CurrentUser('userId') userId: string,
  ) {
    return this.usersService.verifyKyc(id, dto.status, dto.note, userId);
  }

  @Get('top-performers')
  @ApiOperation({ summary: 'Get top performing travelers.' })
  async getTopPerformers() {
    return this.usersService.getTopPerformingTravelers();
  }
}
