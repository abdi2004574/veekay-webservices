import { Injectable, Logger } from '@nestjs/common';
import { Processor, WorkerHost, OnWorkerEvent } from '@nestjs/bullmq';
import { Job } from 'bullmq';
import { PrismaService } from '../../prisma/prisma.service';
import { MilestoneType } from '@prisma/client';

interface CampaignMilestoneCheckJobData {
  campaignId: string;
}

@Processor('campaigns', { concurrency: 3 })
@Injectable()
export class CampaignMilestoneCheckProcessor extends WorkerHost {
  private readonly logger = new Logger(CampaignMilestoneCheckProcessor.name);

  private readonly milestones = [
    { type: MilestoneType.p25, threshold: 25 },
    { type: MilestoneType.p50, threshold: 50 },
    { type: MilestoneType.p100, threshold: 100 },
  ];

  constructor(private readonly prisma: PrismaService) {
    super();
  }

  async process(job: Job<CampaignMilestoneCheckJobData>): Promise<void> {
    const { campaignId } = job.data;
    const startTime = Date.now();
    this.logger.log(
      `Campaign milestone check job started for campaign ${campaignId} (jobId: ${job.id})`,
    );

    try {
      const campaign = await this.prisma.campaign.findUnique({
        where: { id: campaignId },
        select: {
          id: true,
          creatorId: true,
          title: true,
          goalAmount: true,
          raisedAmount: true,
        },
      });

      if (!campaign) {
        this.logger.warn(
          `Campaign ${campaignId} not found; skipping milestone check`,
        );
        return;
      }

      const fundingPercent =
        (Number(campaign.raisedAmount) / Number(campaign.goalAmount)) * 100;

      for (const milestone of this.milestones) {
        const alreadyNotified =
          await this.prisma.milestoneNotificationLog.findFirst({
            where: {
              campaignId,
              milestone: milestone.type,
            },
          });

        if (!alreadyNotified && fundingPercent >= milestone.threshold) {
          await this.enqueueMilestoneNotification(campaign, milestone.type);
        }
      }

      this.logger.log(
        `Campaign milestone check completed for ${campaignId} in ${Date.now() - startTime}ms (funding: ${fundingPercent.toFixed(2)}%)`,
      );
    } catch (error) {
      this.logger.error(
        `Campaign milestone check failed for ${campaignId}: ${(error as Error).message}`,
        error,
      );
      throw error;
    }
  }

  private async enqueueMilestoneNotification(
    campaign: { id: string; creatorId: string; title: string },
    milestone: MilestoneType,
  ): Promise<void> {
    await this.prisma.$transaction(async (tx) => {
      await tx.milestoneNotificationLog.create({
        data: { campaignId: campaign.id, milestone },
      });

      await tx.notification.create({
        data: {
          userId: campaign.creatorId,
          type: 'milestone',
          title: `Campaign ${milestone.toUpperCase()}% funded!`,
          body: `Congratulations! Your campaign "${campaign.title}" has reached ${milestone}% of its funding goal.`,
          channel: 'in_app',
          deepLinkTarget: 'campaign',
          deepLinkEntityId: campaign.id,
          metadata: { milestone, campaignId: campaign.id },
        },
      });
    });

    this.logger.log(
      `Enqueued milestone notification for campaign ${campaign.id}: ${milestone}`,
    );
  }

  @OnWorkerEvent('failed')
  onFailed(error: Error, job: Job) {
    this.logger.error(
      `Campaign milestone check job ${job.id} failed: ${error.message}`,
      error,
    );
  }

  @OnWorkerEvent('error')
  onError(error: Error) {
    this.logger.error('Campaign milestone check worker error', error);
  }
}
