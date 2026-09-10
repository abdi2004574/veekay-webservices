import { Injectable, Inject, Logger } from '@nestjs/common';
import { NotificationChannel, NotificationType, Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { NotificationPreferenceService } from './notification-preference.service';
import { PushDeviceService } from './push-device.service';
import type { IFirebasePushProvider } from '../interfaces/firebase-push.interface';
import { FIREBASE_PUSH_PROVIDER } from '../interfaces/firebase-push.interface';
import { MailService } from '../../mail/mail.service';
import { AppException } from '../../../common/errors/app.exception';
import { CreateNotificationDto } from '../dto/create-notification.dto';

const FINANCIAL_EMAIL_TYPES: NotificationType[] = [
  NotificationType.donation,
  NotificationType.milestone,
  NotificationType.withdrawal_status,
  NotificationType.payment_received,
];

interface NotificationListItem {
  id: string;
  type: NotificationType;
  title: string;
  body: string;
  read: boolean;
  deepLinkTarget: string | null;
  deepLinkEntityId: string | null;
  metadata: Record<string, unknown> | null;
  channel: NotificationChannel;
  createdAt: Date;
  pushSentAt: Date | null;
}

interface ListForUserResult {
  items: NotificationListItem[];
  nextCursor: string | null;
}

@Injectable()
export class NotificationsService {
  private readonly logger = new Logger(NotificationsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly notificationPreferenceService: NotificationPreferenceService,
    private readonly pushDeviceService: PushDeviceService,
    @Inject(FIREBASE_PUSH_PROVIDER)
    private readonly firebasePushProvider: IFirebasePushProvider,
    private readonly mailService: MailService,
  ) {}

  async create(userId: string, dto: CreateNotificationDto) {
    const pref = await this.notificationPreferenceService.getForUserAndType(
      userId,
      dto.type,
    );

    const notification = await this.prisma.notification.create({
      data: {
        userId,
        type: dto.type,
        title: dto.title,
        body: dto.body,
        deepLinkTarget: dto.deepLinkTarget,
        deepLinkEntityId: dto.deepLinkEntityId,
        metadata: dto.metadata as Prisma.InputJsonValue,
        channel: dto.channel ?? 'in_app',
      },
    });

    if (pref.pushEnabled) {
      const tokens = await this.pushDeviceService.getActiveTokensForUser(userId);
      if (tokens.length > 0) {
        this.dispatchPush(notification, tokens).catch((error) => {
          this.logger.error(
            `Push dispatch failed for notification ${notification.id}: ${(error as Error).message}`,
          );
        });
      }
      await this.prisma.notification.update({
        where: { id: notification.id },
        data: { pushSentAt: new Date() },
      });
    }

    if (pref.emailEnabled && FINANCIAL_EMAIL_TYPES.includes(dto.type)) {
      this.dispatchEmail(userId, notification).catch((error) => {
        this.logger.error(
          `Email dispatch failed for notification ${notification.id}: ${(error as Error).message}`,
        );
      });
    }

    return notification;
  }

  async listForUser(
    userId: string,
    type?: NotificationType,
    cursor?: string,
    limit = 20,
  ): Promise<ListForUserResult> {
    const notifications = await this.prisma.notification.findMany({
      where: {
        userId,
        ...(type ? { type } : {}),
      },
      orderBy: { createdAt: 'desc' },
      take: limit + 1,
      ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
    });

    const hasMore = notifications.length > limit;
    const page = hasMore ? notifications.slice(0, limit) : notifications;

    const items: NotificationListItem[] = page.map((n) => ({
      id: n.id,
      type: n.type,
      title: n.title,
      body: n.body,
      read: n.read,
      deepLinkTarget: n.deepLinkTarget,
      deepLinkEntityId: n.deepLinkEntityId,
      metadata: (n.metadata as Record<string, unknown> | null) ?? null,
      channel: n.channel,
      createdAt: n.createdAt,
      pushSentAt: n.pushSentAt,
    }));

    return {
      items,
      nextCursor: hasMore ? page[page.length - 1].id : null,
    };
  }

  async getUnreadCount(userId: string) {
    const count = await this.prisma.notification.count({
      where: {
        userId,
        read: false,
      },
    });

    return { count };
  }

  async markRead(notificationId: string, userId: string) {
    const notification = await this.prisma.notification.findUnique({
      where: { id: notificationId },
    });

    if (!notification || notification.userId !== userId) {
      throw AppException.notFound('Notification not found.');
    }

    return this.prisma.notification.update({
      where: { id: notificationId },
      data: { read: true },
    });
  }

  async markAllRead(userId: string) {
    const result = await this.prisma.notification.updateMany({
      where: {
        userId,
        read: false,
      },
      data: { read: true },
    });

    return { count: result.count };
  }

  async delete(notificationId: string, userId: string) {
    const notification = await this.prisma.notification.findUnique({
      where: { id: notificationId },
    });

    if (!notification || notification.userId !== userId) {
      throw AppException.notFound('Notification not found.');
    }

    await this.prisma.notification.delete({
      where: { id: notificationId },
    });
  }

  private async dispatchPush(
    notification: Prisma.NotificationGetPayload<{}>,
    tokens: string[],
  ) {
    const result = await this.firebasePushProvider.sendTokens(
      tokens,
      notification.title,
      notification.body,
      {
        notificationId: notification.id,
        type: notification.type,
        deepLinkTarget: notification.deepLinkTarget ?? '',
        deepLinkEntityId: notification.deepLinkEntityId ?? '',
      },
    );

    if (result.failureCount > 0) {
      this.logger.warn(
        `Push dispatch partial failure for notification ${notification.id}: ${result.failureCount} failed tokens`,
      );
      await this.pushDeviceService.removeStaleTokens(result.failedTokens);
    }
  }

  private async dispatchEmail(
    userId: string,
    notification: Prisma.NotificationGetPayload<{}>,
  ) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { email: true },
    });

    if (!user?.email) {
      return;
    }

    await this.mailService.send({
      to: user.email,
      subject: notification.title,
      html: `<p>${notification.body}</p>`,
    });
  }
}
