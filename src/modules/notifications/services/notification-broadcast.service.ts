import { Injectable, Logger } from '@nestjs/common';
import { UserRole } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { NotificationsService } from './notifications.service';
import { BroadcastNotificationDto } from '../dto/broadcast-notification.dto';
import { SegmentsPreviewDto } from '../dto/segments-preview.dto';

async function chunked<T>(
  items: string[],
  fn: (id: string) => Promise<T>,
  chunkSize = 100,
): Promise<T[]> {
  const results: T[] = [];
  for (let i = 0; i < items.length; i += chunkSize) {
    const chunk = items.slice(i, i + chunkSize);
    results.push(...(await Promise.all(chunk.map(fn))));
  }
  return results;
}

@Injectable()
export class NotificationBroadcastService {
  private readonly logger = new Logger(NotificationBroadcastService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly notificationsService: NotificationsService,
  ) {}

  async broadcast(
    adminUserId: string,
    dto: BroadcastNotificationDto,
  ): Promise<{ sentCount: number; failedCount: number }> {
    const targetUserIds = await this.resolveTargetUserIds(dto);

    const results = await chunked(
      targetUserIds,
      async (userId) => {
        try {
          await this.notificationsService.create(userId, {
            type: dto.type,
            title: dto.title,
            body: dto.body,
            deepLinkTarget: dto.metadata?.deepLinkTarget as string | undefined,
            deepLinkEntityId: dto.metadata?.deepLinkEntityId as string | undefined,
            metadata: dto.metadata,
            channel: undefined,
          });
          return true;
        } catch (error) {
          this.logger.warn(
            `Broadcast: failed to notify user ${userId}: ${(error as Error).message}`,
          );
          return false;
        }
      },
      100,
    );

    const sentCount = results.filter(Boolean).length;
    const failedCount = results.length - sentCount;

    this.logger.log(
      JSON.stringify({
        audit: 'admin.broadcast.sent',
        actorUserId: adminUserId,
        type: dto.type,
        target: dto.target,
        role: dto.role ?? null,
        userId: dto.userId ?? null,
        totalTargets: targetUserIds.length,
        sentCount,
        failedCount,
      }),
    );

    return { sentCount, failedCount };
  }

  async previewSegments(
    dto: SegmentsPreviewDto,
  ): Promise<{ estimatedReach: number; breakdown: { travelers: number; agencies: number; admins: number } }> {
    const [travelers, agencies, admins] = await Promise.all([
      this.prisma.user.count({ where: { role: UserRole.traveler, isActive: true } }),
      this.prisma.user.count({ where: { role: UserRole.agency, isActive: true } }),
      this.prisma.user.count({ where: { role: UserRole.admin, isActive: true } }),
    ]);

    const breakdown = { travelers, agencies, admins };
    let estimatedReach: number;
    switch (dto.target) {
      case 'role':
        estimatedReach = dto.role === 'traveler' ? travelers : agencies;
        break;
      case 'user':
        estimatedReach = 1;
        break;
      case 'all':
      default:
        estimatedReach = travelers + agencies + admins;
        break;
    }

    return { estimatedReach, breakdown };
  }

  private async resolveTargetUserIds(dto: BroadcastNotificationDto): Promise<string[]> {
    switch (dto.target) {
      case 'role': {
        const role = dto.role === 'traveler' ? UserRole.traveler : UserRole.agency;
        const users = await this.prisma.user.findMany({
          where: { role, isActive: true },
          select: { id: true },
        });
        return users.map((u) => u.id);
      }
      case 'user': {
        if (!dto.userId) {
          return [];
        }
        const user = await this.prisma.user.findUnique({
          where: { id: dto.userId },
          select: { id: true, isActive: true },
        });
        return user && user.isActive ? [user.id] : [];
      }
      case 'all':
      default: {
        const users = await this.prisma.user.findMany({
          where: { isActive: true },
          select: { id: true },
        });
        return users.map((u) => u.id);
      }
    }
  }
}
