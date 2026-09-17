import {
  CampaignStatus,
  DestinationType,
  WithdrawalStatus,
} from '@prisma/client';
import { Decimal } from '@prisma/client/runtime/library';
import { AdminDashboardService } from './admin-dashboard.service';

describe('AdminDashboardService', () => {
  let prisma: any;
  let service: AdminDashboardService;

  beforeEach(() => {
    prisma = {
      user: { count: jest.fn() },
      agency: { count: jest.fn() },
      campaign: { count: jest.fn(), groupBy: jest.fn() },
      donation: { count: jest.fn(), findMany: jest.fn() },
      travelerProfile: { findMany: jest.fn() },
      withdrawalRequest: { groupBy: jest.fn() },
    };
    service = new AdminDashboardService(prisma);
  });

  it('returns all dashboard KPIs from active records', async () => {
    prisma.user.count.mockResolvedValue(12);
    prisma.agency.count.mockResolvedValueOnce(3).mockResolvedValueOnce(2);
    prisma.campaign.count.mockResolvedValueOnce(8).mockResolvedValueOnce(5);
    prisma.donation.count.mockResolvedValue(21);

    await expect(service.getMetrics()).resolves.toEqual({
      totalUsers: 12,
      totalAgencies: 3,
      totalCampaigns: 8,
      totalDonations: 21,
      activeCampaigns: 5,
      pendingAgencies: 2,
    });
    expect(prisma.campaign.count).toHaveBeenCalledWith({
      where: { deletedAt: null },
    });
    expect(prisma.campaign.count).toHaveBeenCalledWith({
      where: { status: CampaignStatus.active, deletedAt: null },
    });
  });

  describe('getPaymentStats', () => {
    it('maps paid amounts and requested, approved, and rejected counts', async () => {
      prisma.withdrawalRequest.groupBy.mockResolvedValue([
        {
          status: WithdrawalStatus.requested,
          _count: { _all: 3 },
          _sum: { amount: new Decimal('30.25') },
        },
        {
          status: WithdrawalStatus.approved,
          _count: { _all: 2 },
          _sum: { amount: new Decimal('20') },
        },
        {
          status: WithdrawalStatus.rejected,
          _count: { _all: 1 },
          _sum: { amount: new Decimal('10') },
        },
        {
          status: WithdrawalStatus.paid,
          _count: { _all: 4 },
          _sum: { amount: new Decimal('125.50') },
        },
      ]);

      await expect(service.getPaymentStats()).resolves.toEqual({
        totalWithdrawn: 125.5,
        pendingReview: 3,
        approved: 2,
        rejected: 1,
      });
      expect(prisma.withdrawalRequest.groupBy).toHaveBeenCalledWith({
        by: ['status'],
        _count: { _all: true },
        _sum: { amount: true },
      });
    });

    it('returns zero payment stats when no withdrawals exist', async () => {
      prisma.withdrawalRequest.groupBy.mockResolvedValue([]);

      await expect(service.getPaymentStats()).resolves.toEqual({
        totalWithdrawn: 0,
        pendingReview: 0,
        approved: 0,
        rejected: 0,
      });
    });

    it('fills missing withdrawal statuses with zero values', async () => {
      prisma.withdrawalRequest.groupBy.mockResolvedValue([
        {
          status: WithdrawalStatus.paid,
          _count: { _all: 1 },
          _sum: { amount: new Decimal('7.25') },
        },
      ]);

      await expect(service.getPaymentStats()).resolves.toEqual({
        totalWithdrawn: 7.25,
        pendingReview: 0,
        approved: 0,
        rejected: 0,
      });
    });
  });

  it('fills every day in a funding trend and aggregates donations', async () => {
    jest.useFakeTimers().setSystemTime(new Date('2026-09-10T12:00:00.000Z'));
    prisma.donation.findMany.mockResolvedValue([
      { amount: 10, createdAt: new Date('2026-09-09T10:00:00.000Z') },
      { amount: 5, createdAt: new Date('2026-09-09T11:00:00.000Z') },
      { amount: 3, createdAt: new Date('2026-09-10T01:00:00.000Z') },
    ]);

    const result = await service.getFundingTrends('7d');

    expect(result.trends).toHaveLength(7);
    expect(result.trends.find((point) => point.date === '2026-09-09')).toEqual({
      date: '2026-09-09',
      amount: 15,
    });
    expect(result.trends.find((point) => point.date === '2026-09-10')).toEqual({
      date: '2026-09-10',
      amount: 3,
    });
    jest.useRealTimers();
  });

  it('returns destinations in descending campaign count', async () => {
    prisma.campaign.groupBy.mockResolvedValue([
      { destination: 'Paris', _count: { _all: 2 } },
      { destination: 'Tokyo', _count: { _all: 5 } },
    ]);

    await expect(service.getTopDestinations()).resolves.toEqual([
      { name: 'Tokyo', count: 5 },
      { name: 'Paris', count: 2 },
    ]);
  });

  it('returns all destination preferences, including zero counts', async () => {
    prisma.travelerProfile.findMany.mockResolvedValue([
      { destinationTypes: [{ destinationType: DestinationType.beach }] },
      {
        destinationTypes: [
          { destinationType: DestinationType.beach },
          { destinationType: DestinationType.city },
        ],
      },
    ]);

    const result = await service.getTravelerPreferences();
    const beach = result.find((item) => item.label === DestinationType.beach);
    const mountain = result.find(
      (item) => item.label === DestinationType.mountain,
    );

    expect(beach).toEqual({ label: DestinationType.beach, count: 2 });
    expect(mountain).toEqual({ label: DestinationType.mountain, count: 0 });
  });
});
