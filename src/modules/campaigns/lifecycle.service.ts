import { Injectable, Logger } from '@nestjs/common';
import { CampaignStatus } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

export interface CampaignStatusFlags {
  isFunded: boolean;
  isExpired: boolean;
  isFlagged: boolean;
  canReceiveDonations: boolean;
  canWithdraw: boolean;
}

const VALID_TRANSITIONS: Record<CampaignStatus, CampaignStatus[]> = {
  [CampaignStatus.draft]: [CampaignStatus.active],
  [CampaignStatus.active]: [
    CampaignStatus.funded,
    CampaignStatus.expired,
    CampaignStatus.canceled,
    CampaignStatus.booked,
    CampaignStatus.flagged,
  ],
  [CampaignStatus.funded]: [CampaignStatus.booked, CampaignStatus.completed],
  [CampaignStatus.expired]: [CampaignStatus.completed],
  [CampaignStatus.canceled]: [],
  [CampaignStatus.flagged]: [],
  [CampaignStatus.under_review]: [
    CampaignStatus.active,
    CampaignStatus.flagged,
    CampaignStatus.canceled,
  ],
  [CampaignStatus.booked]: [CampaignStatus.completed],
  [CampaignStatus.completed]: [],
};

@Injectable()
export class CampaignLifecycleService {
  private readonly logger = new Logger(CampaignLifecycleService.name);

  constructor(private readonly prisma: PrismaService) {}

  private isTransitionValid(from: CampaignStatus, to: CampaignStatus): boolean {
    return VALID_TRANSITIONS[from]?.includes(to) ?? false;
  }

  private emitAuditLog(
    campaignId: string,
    action: string,
    actorId: string,
    oldStatus: CampaignStatus,
    newStatus: CampaignStatus,
    reason?: string,
  ) {
    this.logger.log(
      JSON.stringify({
        audit: 'campaign.status_changed',
        campaignId,
        action,
        actorId,
        oldStatus,
        newStatus,
        reason: reason ?? null,
      }),
    );
  }

  async checkAndTransitionCampaigns(actorId: string) {
    const now = new Date();
    const campaigns = await this.prisma.campaign.findMany({
      where: { status: CampaignStatus.active },
    });

    const transitions: {
      campaignId: string;
      from: CampaignStatus;
      to: CampaignStatus;
    }[] = [];

    for (const campaign of campaigns) {
      const raisedAmount = Number(campaign.raisedAmount);
      const goalAmount = Number(campaign.goalAmount);
      const tripEndDate = campaign.tripEndDate;

      if (raisedAmount >= goalAmount) {
        transitions.push({
          campaignId: campaign.id,
          from: CampaignStatus.active,
          to: CampaignStatus.funded,
        });
      } else if (tripEndDate && tripEndDate < now) {
        transitions.push({
          campaignId: campaign.id,
          from: CampaignStatus.active,
          to: CampaignStatus.expired,
        });
      }
    }

    for (const t of transitions) {
      await this.prisma.$transaction(async (tx) => {
        const updated = await tx.campaign.update({
          where: { id: t.campaignId },
          data: { status: t.to },
        });
        if (updated.status !== t.to) {
          return;
        }
        this.emitAuditLog(
          t.campaignId,
          `campaign.auto_transition.${t.to}`,
          actorId,
          t.from,
          t.to,
        );
      });
    }

    return transitions;
  }

  async transitionCampaign(
    campaignId: string,
    newStatus: CampaignStatus,
    actorId: string,
    reason?: string,
  ) {
    const campaign = await this.prisma.campaign.findUnique({
      where: { id: campaignId },
    });
    if (!campaign) {
      throw new Error('Campaign not found.');
    }

    const oldStatus = campaign.status;
    if (oldStatus === newStatus) {
      return campaign;
    }

    if (!this.isTransitionValid(oldStatus, newStatus)) {
      throw new Error(
        `Invalid campaign status transition from ${oldStatus} to ${newStatus}.`,
      );
    }

    const updated = await this.prisma.campaign.update({
      where: { id: campaignId },
      data: { status: newStatus },
    });

    this.emitAuditLog(
      campaignId,
      `campaign.manual_transition.${newStatus}`,
      actorId,
      oldStatus,
      newStatus,
      reason,
    );

    return updated;
  }

  async canWithdraw(campaignId: string): Promise<boolean> {
    const campaign = await this.prisma.campaign.findUnique({
      where: { id: campaignId },
      select: { status: true },
    });

    if (!campaign) {
      return false;
    }

    return (
      (campaign.status === CampaignStatus.funded ||
        campaign.status === CampaignStatus.completed) &&
      campaign.status !== CampaignStatus.flagged
    );
  }

  async canReceiveDonations(campaignId: string): Promise<boolean> {
    const campaign = await this.prisma.campaign.findUnique({
      where: { id: campaignId },
      select: { status: true },
    });

    if (!campaign) {
      return false;
    }

    return campaign.status === CampaignStatus.active;
  }

  async getCampaignStatus(campaignId: string): Promise<CampaignStatusFlags> {
    const campaign = await this.prisma.campaign.findUnique({
      where: { id: campaignId },
      select: {
        status: true,
        raisedAmount: true,
        goalAmount: true,
        tripEndDate: true,
      },
    });

    if (!campaign) {
      throw new Error('Campaign not found.');
    }

    const raisedAmount = Number(campaign.raisedAmount);
    const goalAmount = Number(campaign.goalAmount);
    const tripEndDate = campaign.tripEndDate;

    const isFunded =
      campaign.status === CampaignStatus.active && raisedAmount >= goalAmount;
    const isExpired =
      campaign.status === CampaignStatus.active &&
      !!tripEndDate &&
      tripEndDate < new Date() &&
      raisedAmount < goalAmount;
    const isFlagged = campaign.status === CampaignStatus.flagged;

    return {
      isFunded,
      isExpired,
      isFlagged,
      canReceiveDonations: campaign.status === CampaignStatus.active,
      canWithdraw:
        (campaign.status === CampaignStatus.funded ||
          campaign.status === CampaignStatus.completed) &&
        !isFlagged,
    };
  }
}
