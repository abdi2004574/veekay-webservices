import { Injectable, Logger } from '@nestjs/common';
import { MilestoneType, Prisma } from '@prisma/client';

import { PrismaService } from '../../prisma/prisma.service';

/**
 * Deduplicates milestone notifications per (campaignId, milestone) pair.
 *
 * The milestone check worker calls this before dispatching a milestone
 * notification so each milestone is only ever sent once per campaign.
 */
@Injectable()
export class MilestoneNotificationService {
  private readonly logger = new Logger(MilestoneNotificationService.name);

  constructor(private readonly prisma: PrismaService) {}

  /**
   * Returns true when no notification log exists for this campaign/milestone
   * pair, i.e. the milestone has not been notified yet.
   */
  async shouldNotify(campaignId: string, milestone: MilestoneType): Promise<boolean> {
    const log = await this.prisma.milestoneNotificationLog.findFirst({
      where: { campaignId, milestone },
      select: { campaignId: true },
    });
    return log === null;
  }

  /**
   * Creates the milestone notification log row.
   *
   * Idempotent: if a concurrent worker already inserted the same row (or the
   * row already exists), the unique-constraint violation is swallowed and the
   * existing row is re-fetched and returned instead of throwing.
   */
  async markNotified(campaignId: string, milestone: MilestoneType) {
    try {
      return await this.prisma.milestoneNotificationLog.create({
        data: { campaignId, milestone },
      });
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2002'
      ) {
        this.logger.debug(
          { campaignId, milestone },
          'MilestoneNotificationLog row already exists; returning existing row',
        );
        return this.prisma.milestoneNotificationLog.findFirstOrThrow({
          where: { campaignId, milestone },
        });
      }
      throw error;
    }
  }

  /**
   * Returns every milestone already notified for the given campaign.
   */
  async getNotifiedMilestones(campaignId: string): Promise<MilestoneType[]> {
    const rows = await this.prisma.milestoneNotificationLog.findMany({
      where: { campaignId },
      select: { milestone: true },
    });
    return rows.map((row) => row.milestone);
  }

  /**
   * Batch version: returns a Map from campaignId to the set of milestones
   * already notified for that campaign. Avoids N+1 queries in the worker.
   */
  async getNotifiedMilestonesForCampaigns(
    campaignIds: string[],
  ): Promise<Map<string, Set<MilestoneType>>> {
    const result = new Map<string, Set<MilestoneType>>();
    for (const id of campaignIds) {
      result.set(id, new Set());
    }

    if (campaignIds.length === 0) {
      return result;
    }

    const rows = await this.prisma.milestoneNotificationLog.findMany({
      where: { campaignId: { in: campaignIds } },
      select: { campaignId: true, milestone: true },
    });

    for (const row of rows) {
      result.get(row.campaignId)?.add(row.milestone);
    }

    return result;
  }
}

