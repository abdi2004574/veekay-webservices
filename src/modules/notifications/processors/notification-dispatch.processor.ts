import { Injectable, Logger } from '@nestjs/common';
import { Inject } from '@nestjs/common';
import { Processor, WorkerHost, OnWorkerEvent } from '@nestjs/bullmq';
import { Job } from 'bullmq';
import { PrismaService } from '../../prisma/prisma.service';
import { NotificationPreferenceService } from '../services/notification-preference.service';
import { PushDeviceService } from '../services/push-device.service';
import type { IFirebasePushProvider } from '../interfaces/firebase-push.interface';
import { FIREBASE_PUSH_PROVIDER } from '../interfaces/firebase-push.interface';
import { MailService } from '../../mail/mail.service';
import { NotificationType } from '@prisma/client';

interface NotificationSendJobData {
  notificationId: string;
  userId: string;
  type: string;
  title: string;
  body: string;
  deepLinkTarget?: string;
  deepLinkEntityId?: string;
  metadata?: Record<string, unknown>;
  channel: string;
  idempotencyKey: string;
}

const FINANCIAL_EMAIL_TYPES: NotificationType[] = [
  NotificationType.donation,
  NotificationType.milestone,
  NotificationType.withdrawal_status,
  NotificationType.payment_received,
];

@Processor('notifications', { concurrency: 10 })
@Injectable()
export class NotificationDispatchProcessor extends WorkerHost {
  private readonly logger = new Logger(NotificationDispatchProcessor.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly notificationPreferenceService: NotificationPreferenceService,
    private readonly pushDeviceService: PushDeviceService,
    @Inject(FIREBASE_PUSH_PROVIDER)
    private readonly firebasePushProvider: IFirebasePushProvider,
    private readonly mailService: MailService,
  ) {
    super();
  }

  async process(job: Job<NotificationSendJobData>): Promise<void> {
    const {
      notificationId,
      userId,
      type,
      title,
      body,
      deepLinkTarget,
      deepLinkEntityId,
    } = job.data;

    const notification = await this.prisma.notification.findUnique({
      where: { id: notificationId },
    });

    if (!notification) {
      this.logger.warn(`Notification ${notificationId} not found; skipping dispatch`);
      return;
    }

    if (notification.pushSentAt) {
      this.logger.debug(`Push already sent for notification ${notificationId}; skipping`);
      return;
    }

    const pref = await this.notificationPreferenceService.getForUserAndType(
      userId,
      type as NotificationType,
    );

    if (pref.pushEnabled) {
      const tokens = await this.pushDeviceService.getActiveTokensForUser(userId);
      if (tokens.length > 0) {
        try {
          await this.firebasePushProvider.sendTokens(tokens, title, body, {
            type,
            entityId: deepLinkEntityId ?? '',
            deepLink: deepLinkTarget ?? '',
          });
        } catch (error) {
          this.logger.error(
            `Push failed for notification ${notificationId}: ${(error as Error).message}`,
          );
        }
      }
    }

    try {
      await this.prisma.notification.update({
        where: { id: notificationId },
        data: { pushSentAt: new Date() },
      });
    } catch (error) {
      this.logger.error(
        `Failed to update pushSentAt for notification ${notificationId}: ${(error as Error).message}`,
      );
    }

    if (pref.emailEnabled && FINANCIAL_EMAIL_TYPES.includes(type as NotificationType)) {
      try {
        const user = await this.prisma.user.findUnique({
          where: { id: userId },
          select: { email: true },
        });

        if (user?.email) {
          await this.mailService.send({
            to: user.email,
            subject: title,
            html: `<p>${body}</p>`,
          });
        }
      } catch (error) {
        this.logger.error(
          `Email failed for notification ${notificationId}: ${(error as Error).message}`,
        );
      }
    }

    this.logger.log(`Notification dispatch completed for ${notificationId}`);
  }

  @OnWorkerEvent('failed')
  onFailed(error: Error) {
    this.logger.error('Worker job failed', error);
  }

  @OnWorkerEvent('error')
  onError(error: Error) {
    this.logger.error('Worker error', error);
  }
}
