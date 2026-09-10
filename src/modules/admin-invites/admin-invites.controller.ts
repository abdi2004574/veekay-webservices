import { Body, Controller, Get, Param, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { RequirePlatformRole } from '../../common/decorators/require-platform-role.decorator';
import { PlatformRole } from '@prisma/client';
import { AdminInvitesService } from './admin-invites.service';
import { CreateAdminInviteDto } from './dto/create-admin-invite.dto';
import { RevokeAdminInviteDto } from './dto/revoke-admin-invite.dto';
import { AcceptAdminInviteDto } from './dto/accept-admin-invite.dto';

@ApiTags('admin-invites')
@ApiBearerAuth()
@RequirePlatformRole(PlatformRole.super_admin)
@Controller('admin/invites')
export class AdminInvitesController {
  constructor(private readonly adminInvitesService: AdminInvitesService) {}

  @Post('/')
  @ApiOperation({ summary: 'Create a new admin invite.' })
  async create(
    @Body() dto: CreateAdminInviteDto,
    @CurrentUser('userId') userId: string,
  ) {
    return this.adminInvitesService.create(userId, dto);
  }

  @Get('/')
  @ApiOperation({ summary: 'List all admin invites.' })
  async findAll() {
    return this.adminInvitesService.findAll();
  }

  @Post('/:id/revoke')
  @ApiOperation({ summary: 'Revoke an admin invite.' })
  async revoke(
    @Param('id') id: string,
    @CurrentUser('userId') userId: string,
  ) {
    return this.adminInvitesService.revoke(userId, id);
  }

  @Post('/accept')
  @ApiOperation({ summary: 'Accept an admin invite using the token from email.' })
  async accept(
    @Body() dto: AcceptAdminInviteDto,
    @CurrentUser('userId') userId: string,
  ) {
    return this.adminInvitesService.accept(userId, dto);
  }
}
