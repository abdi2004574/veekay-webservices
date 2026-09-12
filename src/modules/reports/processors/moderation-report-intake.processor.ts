import { Injectable, Logger } from '@nestjs/common';
import { Processor, WorkerHost, OnWorkerEvent } from '@nestjs/bullmq';
import { Job } from 'bullmq';
import { PrismaService } from '../../prisma/prisma.service';
import { ReportTargetType, ReportStatus } from '@prisma/client';

interface ModerationReportIntakeJobData {
  targetType: ReportTargetType;
  targetId: string;
  reporterId: string;
  reason: string;
}

@Processor('moderation', { concurrency: 3 })
@Injectable()
export class ModerationReportIntakeProcessor extends WorkerHost {
  private readonly logger = new Logger(ModerationReportIntakeProcessor.name);

  constructor(private readonly prisma: PrismaService) {
    super();
  }

  async process(job: Job<ModerationReportIntakeJobData>): Promise<void> {
    const { targetType, targetId, reporterId, reason } = job.data;
    const startTime = Date.now();
    this.logger.log(
      `Moderation report intake job started for ${targetType}:${targetId} by user ${reporterId} (jobId: ${job.id})`,
    );

    try {
      const existingReport = await this.prisma.contentReport.findFirst({
        where: { targetType, targetId, reporterId },
      });

      if (existingReport) {
        this.logger.warn(
          `Report already exists for ${targetType}:${targetId} by user ${reporterId}; skipping`,
        );
        return;
      }

      const report = await this.prisma.contentReport.create({
        data: {
          targetType,
          targetId,
          reporterId,
          reason,
          status: ReportStatus.pending,
        },
      });

      this.logger.log(
        `Created report ${report.id} with status ${ReportStatus.pending}`,
      );

      const adminUsers = await this.prisma.user.findMany({
        where: { platformRole: 'super_admin', isActive: true },
        select: { id: true },
      });

      for (const admin of adminUsers) {
        await this.prisma.notification.create({
          data: {
            userId: admin.id,
            type: 'system_alert',
            title: 'New content report received',
            body: `A new report has been submitted for ${targetType} (${targetId}). Review required.`,
            channel: 'in_app',
            deepLinkTarget: 'moderation',
            deepLinkEntityId: report.id,
            metadata: { reportId: report.id, targetType, targetId, reporterId },
          },
        });
      }

      this.logger.log(
        `Notified ${adminUsers.length} admin(s) about new report ${report.id}`,
      );
      this.logger.log(
        `Moderation report intake job completed in ${Date.now() - startTime}ms`,
      );
    } catch (error) {
      this.logger.error(
        `Moderation report intake failed: ${(error as Error).message}`,
        error,
      );
      throw error;
    }
  }

  @OnWorkerEvent('failed')
  onFailed(error: Error, job: Job) {
    this.logger.error(
      `Moderation report intake job ${job.id} failed: ${error.message}`,
      error,
    );
  }

  @OnWorkerEvent('error')
  onError(error: Error) {
    this.logger.error('Moderation report intake worker error', error);
  }
}
