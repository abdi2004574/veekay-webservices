import { Injectable, Logger } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { AdminAuditLogService } from '../admin-audit-log/admin-audit-log.service';

function deriveCategory(key: string): string {
  const prefix = key.split('.')[0];
  return prefix;
}

@Injectable()
export class SettingsService {
  private readonly logger = new Logger(SettingsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly adminAuditLogService: AdminAuditLogService,
  ) {}

  async getAll() {
    return this.prisma.platformSetting.findMany({
      orderBy: { createdAt: 'desc' },
    });
  }

  async update(
    adminUserId: string,
    dto: { settings: Record<string, Prisma.InputJsonValue> },
  ) {
    const updatedKeys = Object.keys(dto.settings);

    for (const key of Object.keys(dto.settings)) {
      const value = dto.settings[key];
      const category = deriveCategory(key);
      await this.prisma.platformSetting.upsert({
        where: { key },
        create: {
          key,
          value,
          category,
          createdAt: new Date(),
          updatedAt: new Date(),
        },
        update: {
          value,
          category,
          updatedAt: new Date(),
        },
      });
    }

    await this.adminAuditLogService.record(
      adminUserId,
      'settings.updated',
      'platform_setting',
      undefined,
      undefined,
      { updatedKeys },
    );

    this.logger.log(
      JSON.stringify({
        audit: 'settings.updated',
        actorUserId: adminUserId,
        updatedKeys,
      }),
    );

    return this.getAll();
  }
}
