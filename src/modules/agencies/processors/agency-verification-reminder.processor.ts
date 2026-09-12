import { Injectable, Logger } from '@nestjs/common';
import { Processor, WorkerHost, OnWorkerEvent } from '@nestjs/bullmq';
import { Job } from 'bullmq';
import { PrismaService } from '../../prisma/prisma.service';
import { AgencyStatus } from '@prisma/client';

@Processor('moderation', { concurrency: 3 })
@Injectable()
export class AgencyVerificationReminderProcessor extends WorkerHost {
  private readonly logger = new Logger(
    AgencyVerificationReminderProcessor.name,
  );

  private readonly REMINDER_DAYS = 3;

  constructor(private readonly prisma: PrismaService) {
    super();
  }

  async process(job: Job<Record<string, never>>): Promise<void> {
    const startTime = Date.now();
    this.logger.log(
      `Agency verification reminder job started (jobId: ${job.id})`,
    );

    try {
      const cutoffDate = new Date();
      cutoffDate.setDate(cutoffDate.getDate() - this.REMINDER_DAYS);

      const pendingAgencies = await this.prisma.agency.findMany({
        where: {
          status: AgencyStatus.pending_verification,
          createdAt: { lt: cutoffDate },
        },
        include: {
          user: { select: { id: true, email: true, displayName: true } },
        },
      });

      this.logger.log(
        `Found ${pendingAgencies.length} agencies pending verification older than ${this.REMINDER_DAYS} days`,
      );

      if (pendingAgencies.length === 0) {
        this.logger.log('No agencies require verification reminders');
        return;
      }

      const adminUsers = await this.prisma.user.findMany({
        where: { platformRole: 'super_admin', isActive: true },
        select: { id: true },
      });

      if (adminUsers.length === 0) {
        this.logger.warn('No active super admins found to notify');
        return;
      }

      for (const admin of adminUsers) {
        await this.prisma.notification.create({
          data: {
            userId: admin.id,
            type: 'system_alert',
            title: 'Agency Verification Backlog',
            body: `${pendingAgencies.length} agency registration(s) awaiting review for more than ${this.REMINDER_DAYS} business days.`,
            channel: 'in_app',
            metadata: {
              agencyCount: pendingAgencies.length,
              reminderDays: this.REMINDER_DAYS,
            },
          },
        });
      }

      this.logger.log(
        `Notified ${adminUsers.length} admin(s) about ${pendingAgencies.length} pending agencies`,
      );
      this.logger.log(
        `Agency verification reminder job completed in ${Date.now() - startTime}ms`,
      );
    } catch (error) {
      this.logger.error(
        `Agency verification reminder job failed: ${(error as Error).message}`,
        error,
      );
      throw error;
    }
  }

  @OnWorkerEvent('failed')
  onFailed(error: Error, job: Job) {
    this.logger.error(
      `Agency verification reminder job ${job.id} failed: ${error.message}`,
      error,
    );
  }

  @OnWorkerEvent('error')
  onError(error: Error) {
    this.logger.error('Agency verification reminder worker error', error);
  }
}
