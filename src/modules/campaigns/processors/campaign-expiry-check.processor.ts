import { Injectable, Logger } from '@nestjs/common';
import { Processor, WorkerHost, OnWorkerEvent } from '@nestjs/bullmq';
import { Job } from 'bullmq';
import { PrismaService } from '../../prisma/prisma.service';
import { CampaignStatus } from '@prisma/client';

@Processor('campaigns', { concurrency: 3 })
@Injectable()
export class CampaignExpiryCheckProcessor extends WorkerHost {
  private readonly logger = new Logger(CampaignExpiryCheckProcessor.name);

  constructor(private readonly prisma: PrismaService) {
    super();
  }

  async process(job: Job<Record<string, never>>): Promise<void> {
    const startTime = Date.now();
    this.logger.log(`Campaign expiry check job started (jobId: ${job.id})`);

    try {
      const now = new Date();
      const expiredCampaigns = await this.prisma.campaign.findMany({
        where: {
          tripEndDate: { lt: now },
          status: CampaignStatus.active,
          deletedAt: null,
        },
        select: { id: true, creatorId: true, title: true, tripEndDate: true },
      });

      this.logger.log(
        `Found ${expiredCampaigns.length} expired campaigns to process`,
      );

      for (const campaign of expiredCampaigns) {
        await this.handleExpiredCampaign(campaign);
      }

      this.logger.log(
        `Campaign expiry check job completed in ${Date.now() - startTime}ms`,
      );
    } catch (error) {
      this.logger.error(
        `Campaign expiry check job failed: ${(error as Error).message}`,
        error,
      );
      throw error;
    }
  }

  private async handleExpiredCampaign(campaign: {
    id: string;
    creatorId: string;
    title: string;
    tripEndDate: Date | null;
  }): Promise<void> {
    this.logger.log(
      `Processing expired campaign ${campaign.id} (creator: ${campaign.creatorId})`,
    );

    const newStatus = CampaignStatus.expired;

    await this.prisma.campaign.update({
      where: { id: campaign.id },
      data: { status: newStatus },
    });

    this.logger.log(
      `Campaign ${campaign.id} status transitioned to ${newStatus}`,
    );

    await this.prisma.notification.create({
      data: {
        userId: campaign.creatorId,
        type: 'campaign_flagged',
        title: 'Campaign expired',
        body: `Your campaign "${campaign.title}" has expired as its trip end date has passed.`,
        channel: 'in_app',
      },
    });
  }

  @OnWorkerEvent('failed')
  onFailed(error: Error, job: Job) {
    this.logger.error(
      `Campaign expiry check job ${job.id} failed: ${error.message}`,
      error,
    );
  }

  @OnWorkerEvent('error')
  onError(error: Error) {
    this.logger.error('Campaign expiry check worker error', error);
  }
}
