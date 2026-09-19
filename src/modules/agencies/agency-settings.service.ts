import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { AgencySetting } from '@prisma/client';
import { AppException } from '../../common/errors/app.exception';

@Injectable()
export class AgencySettingsService {
  private readonly logger = new Logger(AgencySettingsService.name);

  constructor(private readonly prisma: PrismaService) {}

  async getAllSettings(agencyId: string) {
    const agency = await this.prisma.agency.findUnique({ where: { id: agencyId } });
    if (!agency) throw AppException.notFound('Agency not found');

    return this.prisma.agencySetting.findMany({
      where: { agencyId },
      orderBy: { createdAt: 'desc' },
    });
  }

  async updateSetting(agencyId: string, key: string, value: any) {
    const agency = await this.prisma.agency.findUnique({ where: { id: agencyId } });
    if (!agency) throw AppException.notFound('Agency not found');

    return this.prisma.agencySetting.upsert({
      where: { agencyId_key: { agencyId, key } },
      create: { agencyId, key, value },
      update: { value, updatedAt: new Date() },
    });
  }
}
