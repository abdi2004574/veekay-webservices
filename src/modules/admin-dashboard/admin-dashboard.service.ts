import { Injectable, InternalServerErrorException } from '@nestjs/common';
import { Decimal } from '@prisma/client/runtime/library';
import {
  AgencyStatus,
  CampaignStatus,
  DestinationType,
  WithdrawalStatus,
} from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { PaymentStatsDto } from './dto/dashboard-response.dto';
import { FundingTrendRange } from './dto/funding-trends-query.dto';

@Injectable()
export class AdminDashboardService {
  constructor(private readonly prisma: PrismaService) {}

  async getMetrics(): Promise<{ totalUsers: number; totalAgencies: number; totalCampaigns: number; totalDonations: number; activeCampaigns: number; pendingAgencies: number }> {
    const [
      totalUsers,
      totalAgencies,
      totalCampaigns,
      totalDonations,
      activeCampaigns,
      pendingAgencies,
    ] = await Promise.all([
      this.prisma.user.count(),
      this.prisma.agency.count(),
      this.prisma.campaign.count({ where: { deletedAt: null } }),
      this.prisma.donation.count(),
      this.prisma.campaign.count({
        where: { status: CampaignStatus.active, deletedAt: null },
      }),
      this.prisma.agency.count({
        where: { status: AgencyStatus.pending_verification },
      }),
    ]);

    return {
      totalUsers,
      totalAgencies,
      totalCampaigns,
      totalDonations,
      activeCampaigns,
      pendingAgencies,
    };
  }

  async getPaymentStats(): Promise<PaymentStatsDto> {
    const rows = await this.prisma.withdrawalRequest.groupBy({
      by: ['status'],
      _count: { _all: true },
      _sum: { amount: true },
    });
    const stats: PaymentStatsDto = {
      totalWithdrawn: 0,
      pendingReview: 0,
      approved: 0,
      rejected: 0,
    };

    for (const row of rows) {
      switch (row.status) {
        case WithdrawalStatus.paid:
          stats.totalWithdrawn = this.toSafeNumber(row._sum.amount);
          break;
        case WithdrawalStatus.requested:
          stats.pendingReview = row._count._all;
          break;
        case WithdrawalStatus.approved:
          stats.approved = row._count._all;
          break;
        case WithdrawalStatus.rejected:
          stats.rejected = row._count._all;
          break;
      }
    }

    return stats;
  }

  async getFundingTrends(range: FundingTrendRange = '30d'): Promise<{ trends: { date: string; amount: number }[] }> {
    const days = Number(range.slice(0, -1));
    const end = new Date();
    end.setUTCHours(23, 59, 59, 999);
    const start = new Date(end);
    start.setUTCDate(start.getUTCDate() - (days - 1));
    start.setUTCHours(0, 0, 0, 0);

    const donations = await this.prisma.donation.findMany({
      where: { createdAt: { gte: start, lte: end } },
      select: { amount: true, createdAt: true },
    });
    const totalsByDate = new Map<string, number>();

    for (const donation of donations) {
      const date = donation.createdAt.toISOString().slice(0, 10);
      totalsByDate.set(
        date,
        (totalsByDate.get(date) ?? 0) + Number(donation.amount),
      );
    }

    const trends = Array.from({ length: days }, (_, offset) => {
      const date = new Date(start);
      date.setUTCDate(start.getUTCDate() + offset);
      const key = date.toISOString().slice(0, 10);
      return { date: key, amount: totalsByDate.get(key) ?? 0 };
    });

    return { trends };
  }

  async getTopDestinations(): Promise<{ name: string; count: number }[]> {
    const rows = (await this.prisma.campaign.groupBy({
      by: ['destination'],
      where: { deletedAt: null },
      _count: { _all: true },
      orderBy: { destination: 'asc' },
      take: 10,
    }))

    return rows
      .map((row) => ({
        name: row.destination,
        count: row._count._all,
      }))
      .sort((a, b) => b.count - a.count);
  }

  async getTravelerPreferences(): Promise<{ label: DestinationType; count: number }[]> {
    const profiles = await this.prisma.travelerProfile.findMany({
      select: {
        destinationTypes: { select: { destinationType: true } },
      },
    });
    const counts = new Map<DestinationType, number>();

    for (const profile of profiles) {
      for (const preference of profile.destinationTypes) {
        counts.set(
          preference.destinationType,
          (counts.get(preference.destinationType) ?? 0) + 1,
        );
      }
    }

    return (Object.values(DestinationType) as DestinationType[]).map(
      (destinationType) => ({
        label: destinationType,
        count: counts.get(destinationType) ?? 0,
      }),
    );
  }

  private toSafeNumber(amount: Decimal | null): number {
    const value = Number(amount?.toString() ?? 0);

    if (!Number.isFinite(value)) {
      throw new InternalServerErrorException(
        'Withdrawal total exceeds the supported numeric range.',
      );
    }

    return value;
  }
}
