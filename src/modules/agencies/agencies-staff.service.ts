import { Injectable, Logger } from '@nestjs/common';
import { AgencyStaffPermission, UserRole } from '@prisma/client';
import { AppException } from '../../common/errors/app.exception';
import { MailService } from '../mail/mail.service';
import { PrismaService } from '../prisma/prisma.service';
import { NotificationsService } from '../notifications/services/notifications.service';
import { AdminAuditLogService } from '../admin-audit-log/admin-audit-log.service';
import { CreateStaffInviteDto } from './dto/create-staff-invite.dto';
import { UpdateStaffPermissionDto } from './dto/update-staff-permission.dto';

export interface StaffWithUser {
  id: string;
  agencyId: string;
  userId: string;
  permission: AgencyStaffPermission;
  createdAt: Date;
  user: {
    id: string;
    email: string;
    displayName: string | null;
    username: string;
  };
}

@Injectable()
export class AgenciesStaffService {
  private readonly logger = new Logger(AgenciesStaffService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly mailService: MailService,
    private readonly notificationsService: NotificationsService,
    private readonly adminAuditLogService: AdminAuditLogService,
  ) {}

  async listStaff(
    agencyId: string,
    requesterUserId: string,
  ): Promise<StaffWithUser[]> {
    const requesterStaff = await this.prisma.agencyStaff.findUnique({
      where: { agencyId_userId: { agencyId, userId: requesterUserId } },
    });

    if (!requesterStaff) {
      throw AppException.forbidden('You are not a member of this agency.');
    }

    const isOwner = requesterStaff.permission === AgencyStaffPermission.owner;

    const staff = await this.prisma.agencyStaff.findMany({
      where: { agencyId },
      include: {
        user: {
          select: { id: true, email: true, displayName: true, username: true },
        },
      },
      orderBy: { createdAt: 'asc' },
    });

    if (!isOwner) {
      return staff.filter((s) => s.userId === requesterUserId);
    }

    return staff;
  }

  async inviteStaff(
    agencyId: string,
    ownerUserId: string,
    dto: CreateStaffInviteDto,
  ): Promise<StaffWithUser> {
    const ownerStaff = await this.prisma.agencyStaff.findUnique({
      where: { agencyId_userId: { agencyId, userId: ownerUserId } },
    });

    if (!ownerStaff || ownerStaff.permission !== AgencyStaffPermission.owner) {
      throw AppException.forbidden('Only the agency owner can invite staff.');
    }

    const invitedUser = await this.prisma.user.findUnique({
      where: { email: dto.email },
    });

    if (!invitedUser) {
      throw AppException.notFound('User with this email does not exist.');
    }

    if (invitedUser.role !== UserRole.agency) {
      throw AppException.businessRule(
        'Only agency accounts can be invited as staff.',
      );
    }

    const existingStaff = await this.prisma.agencyStaff.findUnique({
      where: { agencyId_userId: { agencyId, userId: invitedUser.id } },
    });

    if (existingStaff) {
      throw AppException.conflict(
        'This user is already a staff member of this agency.',
      );
    }

    const permission = dto.permission
      ? dto.permission === 'admin'
        ? AgencyStaffPermission.admin
        : AgencyStaffPermission.support
      : AgencyStaffPermission.support;

    const staff = await this.prisma.agencyStaff.create({
      data: {
        agencyId,
        userId: invitedUser.id,
        permission,
      },
      include: {
        user: {
          select: { id: true, email: true, displayName: true, username: true },
        },
      },
    });

    await this.adminAuditLogService.record(
      ownerUserId,
      'agency.staff.invited',
      'AgencyStaff',
      staff.id,
      `Invited ${invitedUser.email} as ${permission}`,
      { email: invitedUser.email, permission },
    );

    try {
      const agency = await this.prisma.agency.findUnique({
        where: { id: agencyId },
        select: { agencyName: true },
      });
      await this.notificationsService.create(invitedUser.id, {
        type: 'account_status',
        title: 'Agency Staff Invitation',
        body: `You have been invited to join ${agency?.agencyName} as ${permission}.`,
        deepLinkTarget: 'agency',
        deepLinkEntityId: agencyId,
      });
    } catch (error) {
      this.logger.error(
        `Failed to send staff invitation notification: ${(error as Error).message}`,
      );
    }

    await this.sendStaffInviteEmail(
      invitedUser.email,
      staff.id,
      agencyId,
      permission,
    );

    return staff;
  }

  async updateStaffPermission(
    agencyId: string,
    ownerUserId: string,
    staffId: string,
    dto: UpdateStaffPermissionDto,
  ): Promise<StaffWithUser> {
    const ownerStaff = await this.prisma.agencyStaff.findUnique({
      where: { agencyId_userId: { agencyId, userId: ownerUserId } },
    });

    if (!ownerStaff || ownerStaff.permission !== AgencyStaffPermission.owner) {
      throw AppException.forbidden(
        'Only the agency owner can update staff permissions.',
      );
    }

    const targetStaff = await this.prisma.agencyStaff.findUnique({
      where: { id: staffId },
      include: {
        user: {
          select: { id: true, email: true, displayName: true, username: true },
        },
      },
    });

    if (!targetStaff || targetStaff.agencyId !== agencyId) {
      throw AppException.notFound('Staff member not found.');
    }

    if (targetStaff.userId === ownerUserId) {
      throw AppException.businessRule('Cannot change your own permission.');
    }

    const newPermission = dto.permission as AgencyStaffPermission;
    const oldPermission = targetStaff.permission;

    if (oldPermission === newPermission) {
      return targetStaff;
    }

    const updated = await this.prisma.agencyStaff.update({
      where: { id: staffId },
      data: { permission: newPermission },
      include: {
        user: {
          select: { id: true, email: true, displayName: true, username: true },
        },
      },
    });

    await this.adminAuditLogService.record(
      ownerUserId,
      'agency.staff.permission_changed',
      'AgencyStaff',
      staffId,
      `Changed permission from ${oldPermission} to ${newPermission}`,
      { oldPermission, newPermission, targetUserId: targetStaff.userId },
    );

    try {
      const agency = await this.prisma.agency.findUnique({
        where: { id: agencyId },
        select: { agencyName: true },
      });
      await this.notificationsService.create(targetStaff.userId, {
        type: 'account_status',
        title: 'Permission Updated',
        body: `Your permission in ${agency?.agencyName} has been changed to ${newPermission}.`,
        deepLinkTarget: 'agency',
        deepLinkEntityId: agencyId,
      });
    } catch (error) {
      this.logger.error(
        `Failed to send permission change notification: ${(error as Error).message}`,
      );
    }

    return updated;
  }

  async removeStaff(
    agencyId: string,
    ownerUserId: string,
    staffId: string,
  ): Promise<void> {
    const ownerStaff = await this.prisma.agencyStaff.findUnique({
      where: { agencyId_userId: { agencyId, userId: ownerUserId } },
    });

    if (!ownerStaff || ownerStaff.permission !== AgencyStaffPermission.owner) {
      throw AppException.forbidden('Only the agency owner can remove staff.');
    }

    const targetStaff = await this.prisma.agencyStaff.findUnique({
      where: { id: staffId },
      include: {
        user: {
          select: { id: true, email: true, displayName: true, username: true },
        },
      },
    });

    if (!targetStaff || targetStaff.agencyId !== agencyId) {
      throw AppException.notFound('Staff member not found.');
    }

    if (targetStaff.userId === ownerUserId) {
      throw AppException.businessRule('Cannot remove yourself.');
    }

    await this.prisma.agencyStaff.delete({ where: { id: staffId } });

    await this.adminAuditLogService.record(
      ownerUserId,
      'agency.staff.removed',
      'AgencyStaff',
      staffId,
      `Removed ${targetStaff.user.email} (${targetStaff.permission})`,
      {
        removedUserId: targetStaff.userId,
        removedPermission: targetStaff.permission,
      },
    );

    try {
      const agency = await this.prisma.agency.findUnique({
        where: { id: agencyId },
        select: { agencyName: true },
      });
      await this.notificationsService.create(targetStaff.userId, {
        type: 'account_status',
        title: 'Removed from Agency',
        body: `You have been removed from ${agency?.agencyName}.`,
        deepLinkTarget: 'agency',
        deepLinkEntityId: agencyId,
      });
    } catch (error) {
      this.logger.error(
        `Failed to send removal notification: ${(error as Error).message}`,
      );
    }
  }

  async resendInvite(
    agencyId: string,
    ownerUserId: string,
    staffId: string,
  ): Promise<void> {
    const ownerStaff = await this.prisma.agencyStaff.findUnique({
      where: { agencyId_userId: { agencyId, userId: ownerUserId } },
    });

    if (!ownerStaff || ownerStaff.permission !== AgencyStaffPermission.owner) {
      throw AppException.forbidden('Only the agency owner can resend invites.');
    }

    const targetStaff = await this.prisma.agencyStaff.findUnique({
      where: { id: staffId },
      include: {
        user: {
          select: { id: true, email: true, displayName: true, username: true },
        },
      },
    });

    if (!targetStaff || targetStaff.agencyId !== agencyId) {
      throw AppException.notFound('Staff member not found.');
    }

    await this.sendStaffInviteEmail(
      targetStaff.user.email,
      staffId,
      agencyId,
      targetStaff.permission,
    );

    await this.adminAuditLogService.record(
      ownerUserId,
      'agency.staff.invite_resent',
      'AgencyStaff',
      staffId,
      `Resent invite to ${targetStaff.user.email}`,
      { email: targetStaff.user.email },
    );
  }

  async getStaffAuditLog(
    agencyId: string,
    requesterUserId: string,
    staffId: string,
    cursor?: string,
    limit = 20,
  ) {
    const requesterStaff = await this.prisma.agencyStaff.findUnique({
      where: { agencyId_userId: { agencyId, userId: requesterUserId } },
    });

    if (!requesterStaff) {
      throw AppException.forbidden('You are not a member of this agency.');
    }

    const targetStaff = await this.prisma.agencyStaff.findUnique({
      where: { id: staffId },
    });

    if (!targetStaff || targetStaff.agencyId !== agencyId) {
      throw AppException.notFound('Staff member not found.');
    }

    const isOwner = requesterStaff.permission === AgencyStaffPermission.owner;
    if (!isOwner && requesterUserId !== targetStaff.userId) {
      throw AppException.forbidden('You can only view your own audit log.');
    }

    return this.adminAuditLogService.findAll(
      { targetType: 'AgencyStaff', targetId: staffId },
      cursor,
      limit,
    );
  }

  async getAgencyIdForUser(userId: string): Promise<string | null> {
    const agency = await this.prisma.agency.findFirst({
      where: { user: { id: userId } },
      select: { id: true },
    });
    return agency?.id ?? null;
  }

  private async sendStaffInviteEmail(
    email: string,
    staffId: string,
    agencyId: string,
    permission: AgencyStaffPermission,
  ): Promise<void> {
    const agency = await this.prisma.agency.findUnique({
      where: { id: agencyId },
      select: { agencyName: true },
    });

    const acceptUrl = `${process.env.FRONTEND_URL || 'http://localhost:3000'}/agency/staff/${staffId}/accept`;

    await this.mailService.send({
      to: email,
      subject: `Invitation to join ${agency?.agencyName} on Veakay`,
      html: `
        <p>You have been invited to join <strong>${agency?.agencyName}</strong> as <strong>${permission}</strong> on Veakay.</p>
        <p><a href="${acceptUrl}">Accept Invitation</a></p>
        <p>This invitation will expire in 7 days.</p>
      `,
    });
  }
}
