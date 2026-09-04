import { Injectable } from '@nestjs/common';
import { AgencyStaffPermission, AgencyStatus, UserRole } from '@prisma/client';
import { AppException } from '../../common/errors/app.exception';
import { PrismaService } from '../prisma/prisma.service';
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

@Injectable()
export class AgenciesService {
  constructor(private readonly prisma: PrismaService) {}

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
}
