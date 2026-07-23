import { Injectable } from '@nestjs/common';
import { AgencyStaffPermission, UserRole } from '@prisma/client';
import { AppException } from '../../common/errors/app.exception';
import { PrismaService } from '../prisma/prisma.service';
import { AgencyRegistrationDto } from './dto/agency-registration.dto';

@Injectable()
export class AgenciesService {
  constructor(private readonly prisma: PrismaService) {}

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
