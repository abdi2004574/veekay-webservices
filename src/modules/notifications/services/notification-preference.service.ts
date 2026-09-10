import { Injectable, Logger } from '@nestjs/common';
import { NotificationType } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { UpdateNotificationPreferenceDto } from '../dto/update-notification-preferences.dto';

const DEFAULT_PREFS = {
  inAppEnabled: true,
  pushEnabled: true,
  emailEnabled: false,
};

@Injectable()
export class NotificationPreferenceService {
  private readonly logger = new Logger(NotificationPreferenceService.name);

  constructor(private readonly prisma: PrismaService) {}

  async listForUser(userId: string) {
    const prefs = await this.prisma.notificationPreference.findMany({
      where: { userId },
    });

    const prefMap = new Map(prefs.map((p) => [p.type, p]));

    return (Object.values(NotificationType) as NotificationType[])
      .sort((a, b) => a.localeCompare(b))
      .map((type) => {
        const existing = prefMap.get(type);
        return {
          type,
          inAppEnabled: existing?.inAppEnabled ?? DEFAULT_PREFS.inAppEnabled,
          pushEnabled: existing?.pushEnabled ?? DEFAULT_PREFS.pushEnabled,
          emailEnabled: existing?.emailEnabled ?? DEFAULT_PREFS.emailEnabled,
        };
      });
  }

  async getForUserAndType(userId: string, type: NotificationType) {
    const pref = await this.prisma.notificationPreference.findUnique({
      where: { userId_type: { userId, type } },
    });

    if (!pref) {
      return { type, ...DEFAULT_PREFS };
    }

    return {
      type: pref.type,
      inAppEnabled: pref.inAppEnabled,
      pushEnabled: pref.pushEnabled,
      emailEnabled: pref.emailEnabled,
    };
  }

  async set(userId: string, dto: UpdateNotificationPreferenceDto) {
    const updateData: Record<string, boolean> = {};
    if (dto.inAppEnabled !== undefined) updateData.inAppEnabled = dto.inAppEnabled;
    if (dto.pushEnabled !== undefined) updateData.pushEnabled = dto.pushEnabled;
    if (dto.emailEnabled !== undefined) updateData.emailEnabled = dto.emailEnabled;

    const pref = await this.prisma.notificationPreference.upsert({
      where: { userId_type: { userId, type: dto.type } },
      create: {
        userId,
        type: dto.type,
        inAppEnabled: dto.inAppEnabled ?? DEFAULT_PREFS.inAppEnabled,
        pushEnabled: dto.pushEnabled ?? DEFAULT_PREFS.pushEnabled,
        emailEnabled: dto.emailEnabled ?? DEFAULT_PREFS.emailEnabled,
      },
      update: updateData,
    });

    return {
      type: pref.type,
      inAppEnabled: pref.inAppEnabled,
      pushEnabled: pref.pushEnabled,
      emailEnabled: pref.emailEnabled,
    };
  }

  async setBulk(userId: string, dtos: UpdateNotificationPreferenceDto[]) {
    if (dtos.length === 0) return;

    await this.prisma.$transaction(async (tx) => {
      for (const dto of dtos) {
        const updateData: Record<string, boolean> = {};
        if (dto.inAppEnabled !== undefined) updateData.inAppEnabled = dto.inAppEnabled;
        if (dto.pushEnabled !== undefined) updateData.pushEnabled = dto.pushEnabled;
        if (dto.emailEnabled !== undefined) updateData.emailEnabled = dto.emailEnabled;

        await tx.notificationPreference.upsert({
          where: { userId_type: { userId, type: dto.type } },
          create: {
            userId,
            type: dto.type,
            inAppEnabled: dto.inAppEnabled ?? DEFAULT_PREFS.inAppEnabled,
            pushEnabled: dto.pushEnabled ?? DEFAULT_PREFS.pushEnabled,
            emailEnabled: dto.emailEnabled ?? DEFAULT_PREFS.emailEnabled,
          },
          update: updateData,
        });
      }
    });
  }

  async resetDefaults(userId: string, type: NotificationType) {
    await this.prisma.notificationPreference.delete({
      where: { userId_type: { userId, type } },
    });
  }
}
