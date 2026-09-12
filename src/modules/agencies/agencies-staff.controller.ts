import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
  Req,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { RequireRole } from '../../common/decorators/require-role.decorator';
import { RequireVerifiedEmail } from '../../common/decorators/require-verified-email.decorator';
import { RequireAgencyStaffPermission } from '../../common/decorators/require-agency-staff-permission.decorator';
import { UserRole, AgencyStaffPermission } from '@prisma/client';
import { AgenciesStaffService } from './agencies-staff.service';
import { CreateStaffInviteDto } from './dto/create-staff-invite.dto';
import { UpdateStaffPermissionDto } from './dto/update-staff-permission.dto';
import type { Request } from 'express';

@ApiTags('agencies')
@ApiBearerAuth()
@Controller('agency/staff')
@RequireRole(UserRole.agency)
@RequireVerifiedEmail()
export class AgenciesStaffController {
  constructor(private readonly agenciesStaffService: AgenciesStaffService) {}

  private getAgencyId(req: Request): string {
    const agencyId = (req as any).agencyId;
    if (!agencyId) {
      throw new Error('Agency ID not found on request');
    }
    return agencyId;
  }

  @Get()
  @RequireAgencyStaffPermission(
    AgencyStaffPermission.owner,
    AgencyStaffPermission.admin,
    AgencyStaffPermission.support,
  )
  @ApiOperation({
    summary:
      'List all staff for the agency (owner sees all, staff sees only themselves)',
  })
  async listStaff(@Req() req: Request, @CurrentUser('userId') userId: string) {
    const agencyId = this.getAgencyId(req);
    return this.agenciesStaffService.listStaff(agencyId, userId);
  }

  @Post()
  @RequireAgencyStaffPermission(AgencyStaffPermission.owner)
  @ApiOperation({ summary: 'Invite new staff (owner only)' })
  async inviteStaff(
    @Req() req: Request,
    @CurrentUser('userId') userId: string,
    @Body() dto: CreateStaffInviteDto,
  ) {
    const agencyId = this.getAgencyId(req);
    return this.agenciesStaffService.inviteStaff(agencyId, userId, dto);
  }

  @Patch(':id/permission')
  @RequireAgencyStaffPermission(AgencyStaffPermission.owner)
  @ApiOperation({
    summary:
      'Update staff permission (owner only) - tiered: owner/admin/support',
  })
  async updateStaffPermission(
    @Req() req: Request,
    @CurrentUser('userId') userId: string,
    @Param('id') staffId: string,
    @Body() dto: UpdateStaffPermissionDto,
  ) {
    const agencyId = this.getAgencyId(req);
    return this.agenciesStaffService.updateStaffPermission(
      agencyId,
      userId,
      staffId,
      dto,
    );
  }

  @Delete(':id')
  @RequireAgencyStaffPermission(AgencyStaffPermission.owner)
  @ApiOperation({ summary: 'Remove staff (owner only, cannot remove self)' })
  async removeStaff(
    @Req() req: Request,
    @CurrentUser('userId') userId: string,
    @Param('id') staffId: string,
  ) {
    const agencyId = this.getAgencyId(req);
    await this.agenciesStaffService.removeStaff(agencyId, userId, staffId);
    return { success: true };
  }

  @Post(':id/resend-invite')
  @RequireAgencyStaffPermission(AgencyStaffPermission.owner)
  @ApiOperation({ summary: 'Resend invite email to staff' })
  async resendInvite(
    @Req() req: Request,
    @CurrentUser('userId') userId: string,
    @Param('id') staffId: string,
  ) {
    const agencyId = this.getAgencyId(req);
    await this.agenciesStaffService.resendInvite(agencyId, userId, staffId);
    return { success: true };
  }

  @Get(':id/audit')
  @RequireAgencyStaffPermission(
    AgencyStaffPermission.owner,
    AgencyStaffPermission.admin,
    AgencyStaffPermission.support,
  )
  @ApiOperation({ summary: 'Get audit log for specific staff member' })
  async getStaffAuditLog(
    @Req() req: Request,
    @CurrentUser('userId') userId: string,
    @Param('id') staffId: string,
    @Query('cursor') cursor?: string,
    @Query('limit') limit?: number,
  ) {
    const agencyId = this.getAgencyId(req);
    return this.agenciesStaffService.getStaffAuditLog(
      agencyId,
      userId,
      staffId,
      cursor,
      limit,
    );
  }
}
