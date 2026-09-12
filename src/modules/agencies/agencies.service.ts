import { Injectable, Logger } from '@nestjs/common';
import { AgencyStaffPermission, AgencyStatus, UserRole } from '@prisma/client';
import { AppException } from '../../common/errors/app.exception';
import { MailService } from '../mail/mail.service';
import { PrismaService } from '../prisma/prisma.service';
import { NotificationsService } from '../notifications/services/notifications.service';
import { AgencyRegistrationDto } from './dto/agency-registration.dto';

const DIRECTORY_SELECT = {
  id: true,
  agencyName: true,
  description: true,
  reputationScore: true,
  status: true,
  createdAt: true,
  _count: { select: { reviews: true } },
};

function toDirectoryEntry(agency: {
  id: string;
  agencyName: string;
  description: string | null;
  reputationScore: unknown;
  _count: { reviews: number };
}) {
  return {
    id: agency.id,
    agencyName: agency.agencyName,
    description: agency.description,
    reputationScore:
      agency.reputationScore === null ? null : Number(agency.reputationScore),
    reviewCount: agency._count.reviews,
  };
}

export interface TopPerformingAgency {
  id: string;
  agencyName: string;
  reputationScore: number | null;
  totalBookings: number;
  totalRevenue: number;
  status: AgencyStatus;
  subscriptionTier: string;
}

@Injectable()
export class AgenciesService {
  private readonly logger = new Logger(AgenciesService.name);
  constructor(
    private readonly prisma: PrismaService,
    private readonly mailService: MailService,
    private readonly notificationsService: NotificationsService,
  ) {}

  async listDirectory(cursor?: string, limit = 20, search?: string) {
    const agencies = await this.prisma.agency.findMany({
      where: {
        status: AgencyStatus.approved,
        ...(search
          ? { agencyName: { contains: search, mode: 'insensitive' } }
          : {}),
      },
      orderBy: [{ reputationScore: 'desc' }, { createdAt: 'desc' }],
      take: limit + 1,
      ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
      select: DIRECTORY_SELECT,
    });

    const hasMore = agencies.length > limit;
    const page = hasMore ? agencies.slice(0, limit) : agencies;

    return {
      items: page.map(toDirectoryEntry),
      nextCursor: hasMore ? page[page.length - 1].id : null,
    };
  }

  async getPublicDetail(agencyId: string) {
    const agency = await this.prisma.agency.findUnique({
      where: { id: agencyId },
      select: DIRECTORY_SELECT,
    });
    if (!agency || agency.status !== AgencyStatus.approved) {
      throw AppException.notFound('Agency not found.');
    }
    return toDirectoryEntry(agency);
  }

  async submitRegistration(userId: string, dto: AgencyRegistrationDto) {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user || user.role !== UserRole.agency) {
      throw AppException.forbidden(
        'Only agency accounts can register an agency.',
      );
    }

    const existing = await this.prisma.agency.findUnique({ where: { userId } });
    if (existing) {
      throw AppException.conflict(
        'Agency registration has already been submitted.',
      );
    }

    return this.prisma.agency.create({
      data: {
        userId,
        agencyName: user.displayName ?? 'Unnamed Agency',
        businessContact: dto.businessContactDetails,
        businessAddress: dto.businessAddress,
        documents: {
          create: dto.documents.map((doc) => ({
            type: doc.type,
            mediaId: doc.mediaId,
          })),
        },
        staff: {
          create: { userId, permission: AgencyStaffPermission.owner },
        },
      },
      include: { documents: true },
    });
  }

  async findPending() {
    return this.prisma.agency.findMany({
      where: { status: AgencyStatus.pending_verification },
      select: {
        id: true,
        agencyName: true,
        businessContact: true,
        businessAddress: true,
        status: true,
        createdAt: true,
        user: {
          select: { id: true, email: true, displayName: true, username: true },
        },
        documents: true,
      },
      orderBy: { createdAt: 'asc' },
    });
  }

  async approve(agencyId: string, actorUserId: string) {
    const agency = await this.prisma.agency.findUnique({
      where: { id: agencyId },
      include: { user: true },
    });
    if (!agency) {
      throw AppException.notFound('Agency not found.');
    }
    if (agency.status !== AgencyStatus.pending_verification) {
      throw AppException.businessRule(
        'Agency is already ' +
          agency.status +
          '. Only pending agencies can be approved.',
      );
    }

    const updated = await this.prisma.agency.update({
      where: { id: agencyId },
      data: { status: AgencyStatus.approved },
      include: { user: true },
    });

    this.logger.log(
      JSON.stringify({
        audit: 'agency.verification.approved',
        actorUserId,
        agencyId: updated.id,
        agencyName: updated.agencyName,
        userId: updated.userId,
      }),
    );

    try {
      await this.notificationsService.create(updated.userId, {
        type: 'verification_status',
        title: 'Agency Verified',
        body: 'Congratulations! Your agency has been verified and approved.',
        deepLinkTarget: 'agency',
        deepLinkEntityId: agencyId,
      });
    } catch (error) {
      this.logger.error(
        'Failed to send verification_status notification for agency ' +
          agencyId +
          ': ' +
          (error as Error).message,
      );
    }

    await this.mailService.sendAgencyApprovedEmail(
      updated.user.email,
      updated.agencyName,
    );

    return updated;
  }

  async reject(agencyId: string, reason: string, actorUserId: string) {
    const agency = await this.prisma.agency.findUnique({
      where: { id: agencyId },
      include: { user: true },
    });
    if (!agency) {
      throw AppException.notFound('Agency not found.');
    }
    if (agency.status !== AgencyStatus.pending_verification) {
      throw AppException.businessRule(
        'Agency is already ' +
          agency.status +
          '. Only pending agencies can be rejected.',
      );
    }

    const updated = await this.prisma.agency.update({
      where: { id: agencyId },
      data: { status: AgencyStatus.rejected, rejectionReason: reason },
      include: { user: true },
    });

    this.logger.log(
      JSON.stringify({
        audit: 'agency.verification.rejected',
        actorUserId,
        agencyId: updated.id,
        agencyName: updated.agencyName,
        userId: updated.userId,
        reason,
      }),
    );

    try {
      await this.notificationsService.create(updated.userId, {
        type: 'verification_status',
        title: 'Agency Verification Update',
        body: 'Your agency registration was not approved. Reason: ' + reason,
        deepLinkTarget: 'agency',
        deepLinkEntityId: agencyId,
      });
    } catch (error) {
      this.logger.error(
        'Failed to send verification_status notification for agency ' +
          agencyId +
          ': ' +
          (error as Error).message,
      );
    }

    await this.mailService.sendAgencyRejectedEmail(updated.user.email, reason);

    return updated;
  }

  async getTopPerformingAgencies(limit = 10): Promise<TopPerformingAgency[]> {
    const agencies = await this.prisma.agency.findMany({
      where: { status: AgencyStatus.approved },
      select: {
        id: true,
        agencyName: true,
        reputationScore: true,
        status: true,
        subscriptionTier: true,
        _count: {
          select: {
            tripBookings: true,
            reviews: true,
          },
        },
        tripBookings: {
          where: { status: 'completed' },
          select: { amount: true, currency: true },
        },
      },
    });

    const results = agencies.map((agency) => {
      const totalRevenue = agency.tripBookings.reduce(
        (sum, booking) => sum + Number(booking.amount ?? 0),
        0,
      );
      return {
        id: agency.id,
        agencyName: agency.agencyName,
        reputationScore:
          agency.reputationScore === null
            ? null
            : Number(agency.reputationScore),
        totalBookings: agency._count.tripBookings,
        totalRevenue,
        status: agency.status,
        subscriptionTier: agency.subscriptionTier,
      };
    });

    return results
      .sort((a, b) => {
        if (b.reputationScore !== a.reputationScore) {
          return (b.reputationScore ?? 0) - (a.reputationScore ?? 0);
        }
        if (b.totalBookings !== a.totalBookings) {
          return b.totalBookings - a.totalBookings;
        }
        return b.totalRevenue - a.totalRevenue;
      })
      .slice(0, limit);
  }
}
