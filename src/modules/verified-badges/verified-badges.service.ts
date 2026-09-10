import { Injectable, Logger } from '@nestjs/common';
import { VerifiedBadge, VerifiedBadgeSubjectType } from '@prisma/client';
import { AppException } from '../../common/errors/app.exception';
import { PrismaService } from '../prisma/prisma.service';
import { AdminAuditLogService } from '../admin-audit-log/admin-audit-log.service';

@Injectable()
export class VerifiedBadgesService {
  private readonly logger = new Logger(VerifiedBadgesService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly adminAuditLogService: AdminAuditLogService,
  ) {}

  async assign(actorId: string, dto: { subjectType: VerifiedBadgeSubjectType; subjectId: string }): Promise<VerifiedBadge> {
    const existing = await this.prisma.verifiedBadge.findFirst({
      where: {
        subjectType: dto.subjectType,
        subjectId: dto.subjectId,
        revokedAt: null,
      },
    });

    if (existing) {
      throw AppException.conflict('A verified badge already exists for this subject.');
    }

    const badge = await this.prisma.verifiedBadge.create({
      data: {
        subjectType: dto.subjectType,
        subjectId: dto.subjectId,
        assignedById: actorId,
      },
    });

    await this.adminAuditLogService.record(
      actorId,
      'verified_badge.assigned',
      dto.subjectType,
      dto.subjectId,
    );

    this.logger.log(
      JSON.stringify({
        audit: 'verified_badge.assigned',
        actorId,
        subjectType: dto.subjectType,
        subjectId: dto.subjectId,
        badgeId: badge.id,
      }),
    );

    return badge;
  }

  async revoke(actorId: string, id: string): Promise<VerifiedBadge> {
    const badge = await this.prisma.verifiedBadge.update({
      where: { id },
      data: { revokedAt: new Date() },
    });

    await this.adminAuditLogService.record(
      actorId,
      'verified_badge.revoked',
      badge.subjectType,
      badge.subjectId,
    );

    this.logger.log(
      JSON.stringify({
        audit: 'verified_badge.revoked',
        actorId,
        badgeId: id,
      }),
    );

    return badge;
  }

  async findAll(): Promise<VerifiedBadge[]> {
    return this.prisma.verifiedBadge.findMany({
      orderBy: { assignedAt: 'desc' },
    });
  }

  async findActiveBySubject(
    subjectType: VerifiedBadgeSubjectType,
    subjectId: string,
  ): Promise<VerifiedBadge | null> {
    return this.prisma.verifiedBadge.findFirst({
      where: {
        subjectType,
        subjectId,
        revokedAt: null,
      },
    });
  }
}
