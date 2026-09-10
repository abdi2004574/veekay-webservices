import { Injectable, Logger } from '@nestjs/common';
import { AdminInvite, AdminInviteStatus, PlatformRole } from '@prisma/client';
import * as bcrypt from 'bcrypt';
import { AppException } from '../../common/errors/app.exception';
import { PrismaService } from '../prisma/prisma.service';
import { MailService } from '../mail/mail.service';
import { CreateAdminInviteDto } from './dto/create-admin-invite.dto';
import { AcceptAdminInviteDto } from './dto/accept-admin-invite.dto';

const TOKEN_SALT_ROUNDS = 10;
const INVITE_EXPIRY_DAYS = 7;

@Injectable()
export class AdminInvitesService {
  private readonly logger = new Logger(AdminInvitesService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly mailService: MailService,
  ) {}

  private generateRawToken(): string {
    return (
      Math.random().toString(36).slice(2) + Math.random().toString(36).slice(2)
    );
  }

  private async hashToken(raw: string): Promise<string> {
    return bcrypt.hash(raw, TOKEN_SALT_ROUNDS);
  }

  private async compareTokens(raw: string, hash: string): Promise<boolean> {
    return bcrypt.compare(raw, hash);
  }

  async create(
    actorUserId: string,
    dto: CreateAdminInviteDto,
  ): Promise<AdminInvite> {
    const rawToken = this.generateRawToken();
    const tokenHash = await this.hashToken(rawToken);
    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + INVITE_EXPIRY_DAYS);

    const invite = await this.prisma.adminInvite.create({
      data: {
        email: dto.email,
        token: tokenHash,

        invitedById: actorUserId,
        expiresAt,
      },
    });

    await this.mailService.send({
      to: dto.email,
      subject: "You'\''ve been invited to Veakay Admin",
      html: `You have been invited to join the Veakay admin panel. Click here to accept: ${dto.acceptUrl}. This link expires in ${INVITE_EXPIRY_DAYS} days.`,
    });

    this.logger.log(
      JSON.stringify({
        audit: 'admin_invite.created',
        actorUserId,
        inviteId: invite.id,
        email: dto.email,
      }),
    );

    return invite;
  }

  async findAll(): Promise<AdminInvite[]> {
    return this.prisma.adminInvite.findMany({
      orderBy: { createdAt: 'desc' },
    });
  }

  async findOne(id: string): Promise<AdminInvite> {
    const invite = await this.prisma.adminInvite.findUnique({
      where: { id },
    });

    if (!invite) {
      throw AppException.notFound('Admin invite not found.');
    }

    return invite;
  }

  async revoke(actorUserId: string, id: string): Promise<AdminInvite> {
    const invite = await this.findOne(id);

    if (invite.status !== AdminInviteStatus.pending) {
      throw AppException.badRequest(
        'Invite is not pending and cannot be revoked.',
      );
    }

    const revoked = await this.prisma.adminInvite.update({
      where: { id },
      data: { status: AdminInviteStatus.revoked },
    });

    this.logger.log(
      JSON.stringify({
        audit: 'admin_invite.revoked',
        actorUserId,
        inviteId: id,
      }),
    );

    return revoked;
  }

  async accept(
    userId: string,
    dto: AcceptAdminInviteDto,
  ): Promise<{ message: string }> {
    const now = new Date();
    const pendingInvites = await this.prisma.adminInvite.findMany({
      where: {
        status: AdminInviteStatus.pending,
        expiresAt: { gt: now },
      },
    });

    let matchedInvite: AdminInvite | undefined;

    for (const invite of pendingInvites) {
      const match = await this.compareTokens(dto.token, invite.token);
      if (match) {
        matchedInvite = invite;
        break;
      }
    }

    if (!matchedInvite) {
      throw AppException.notFound('No pending invite found for this token.');
    }

    await this.prisma.adminInvite.update({
      where: { id: matchedInvite.id },
      data: {
        status: AdminInviteStatus.accepted,
        acceptedAt: now,
      },
    });

    await this.prisma.user.update({
      where: { id: userId },
      data: { platformRole: PlatformRole.super_admin },
    });

    this.logger.log(
      JSON.stringify({
        audit: 'admin_invite.accepted',
        userId,
        inviteId: matchedInvite.id,
      }),
    );

    return { message: 'Admin invite accepted successfully.' };
  }
}
