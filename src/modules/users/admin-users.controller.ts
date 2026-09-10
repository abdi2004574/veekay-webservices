import { Body, Controller, Get, Param, Patch, Query } from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { RequirePlatformRole } from '../../common/decorators/require-platform-role.decorator';
import { PlatformRole } from '@prisma/client';
import { UsersService } from './users.service';
import { VerifyKycDto } from './dto/verify-kyc.dto';
import { AdminUserFilterDto } from './dto/admin-user-filter.dto';
import { UpdateUserStatusDto } from './dto/update-user-status.dto';
import { AdminUserDto } from './dto/admin-user-response.dto';

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

  @Get()
  @ApiOperation({
    summary: 'List users with admin filters and cursor pagination.',
  })
  @ApiOkResponse({
    schema: {
      type: 'object',
      properties: {
        data: {
          type: 'array',
          items: { $ref: '#/components/schemas/AdminUserDto' },
        },
        meta: {
          type: 'object',
          properties: {
            cursor: { type: 'string', nullable: true },
            hasMore: { type: 'boolean' },
          },
        },
      },
    },
  })
  async list(@Query() filter: AdminUserFilterDto) {
    return this.usersService.listAdminUsers(
      filter,
      filter.cursor,
      filter.limit ?? 20,
    );
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get a user and their platform statistics.' })
  @ApiOkResponse({ type: AdminUserDto })
  async getDetail(@Param('id') id: string) {
    return this.usersService.getAdminUserDetail(id);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Activate or deactivate a user account.' })
  @ApiOkResponse({ type: AdminUserDto })
  async updateStatus(
    @Param('id') id: string,
    @Body() dto: UpdateUserStatusDto,
    @CurrentUser('userId') userId: string,
  ) {
    return this.usersService.updateAdminUserStatus(id, dto, userId);
  }
}
