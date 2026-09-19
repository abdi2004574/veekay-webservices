import {
  TripRequestStatus,
  TripBookingStatus,
  DestinationType,
} from '@prisma/client';
import { format, subDays } from 'date-fns';
import { AgencyDashboardService } from './dashboard.service';

describe('AgencyDashboardService', () => {
  let prisma: any;
  let service: AgencyDashboardService;

  beforeEach(() => {
    prisma = {
      tripRequest: { count: jest.fn(), findMany: jest.fn() },
      tripBooking: { findMany: jest.fn() },
      package: { count: jest.fn() },
      packageCampaignLink: { findMany: jest.fn() },
      travelerDestinationPreference: { findMany: jest.fn() },
      agency: { findUnique: jest.fn() },
    };
    service = new AgencyDashboardService(prisma);
  });

  describe('getKpis', () => {
    it('returns the correct KPI structure with all seven fields', async () => {
      prisma.agency.findUnique.mockResolvedValue({ subscriptionTier: 'basic' });
      prisma.tripRequest.count.mockImplementation((args: any) => {
        const status = args.where.status;
        if (status === TripRequestStatus.pending) return Promise.resolve(2);
        if (status === TripRequestStatus.in_discussion)
          return Promise.resolve(3);
        if (status === TripRequestStatus.confirmed) return Promise.resolve(1);
        return Promise.resolve(0);
      });
      prisma.package.count.mockResolvedValue(5);
      prisma.tripBooking.findMany.mockResolvedValue([
        { amount: '100' },
        { amount: '200' },
        { amount: '50' },
      ]);
      prisma.tripRequest.findMany.mockResolvedValue([
        {
          createdAt: new Date('2024-01-01T00:00:00.000Z'),
          confirmedAt: new Date('2024-01-01T02:00:00.000Z'),
        },
      ]);

      const result = await service.getKpis('agency-1');

      expect(result).toEqual({
        totalRequests: 6,
        pendingRequests: 2,
        inDiscussionRequests: 3,
        confirmedRequests: 1,
        totalPackages: 5,
        totalRevenue: 350,
        avgResponseTimeHours: 2,
      });

      expect(prisma.agency.findUnique).toHaveBeenCalledWith(
        expect.objectContaining({ where: { id: 'agency-1' } }),
      );
      expect(prisma.tripRequest.count).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ status: TripRequestStatus.pending }),
        }),
      );
    });

    it('sums totalRevenue from completed booking amounts', async () => {
      prisma.agency.findUnique.mockResolvedValue({ subscriptionTier: 'basic' });
      prisma.tripRequest.count.mockResolvedValue(0);
      prisma.tripRequest.findMany.mockResolvedValue([]);
      prisma.package.count.mockResolvedValue(0);
      prisma.tripBooking.findMany.mockResolvedValue([
        { amount: '100.50' },
        { amount: '200' },
        { amount: null },
        { amount: undefined },
      ]);

      const result = await service.getKpis('agency-1');

      // 100.50 + 200 + 0 (null) + 0 (undefined) = 300.50
      expect(result.totalRevenue).toBe(300.5);
    });

    it('calculates avgResponseTimeHours from confirmed request timestamps', async () => {
      prisma.agency.findUnique.mockResolvedValue({ subscriptionTier: 'basic' });
      prisma.tripRequest.count.mockResolvedValue(0);
      prisma.tripRequest.findMany.mockResolvedValue([
        {
          createdAt: new Date('2024-01-01T00:00:00.000Z'),
          confirmedAt: new Date('2024-01-01T04:00:00.000Z'),
        },
        {
          createdAt: new Date('2024-01-02T00:00:00.000Z'),
          confirmedAt: new Date('2024-01-02T06:00:00.000Z'),
        },
      ]);
      prisma.package.count.mockResolvedValue(0);
      prisma.tripBooking.findMany.mockResolvedValue([]);

      const result = await service.getKpis('agency-1');

      // (4h + 6h) / 2 = 5h
      expect(result.avgResponseTimeHours).toBe(5);
    });

    it('returns zeros when no data exists', async () => {
      prisma.agency.findUnique.mockResolvedValue({ subscriptionTier: 'basic' });
      prisma.tripRequest.count.mockResolvedValue(0);
      prisma.tripRequest.findMany.mockResolvedValue([]);
      prisma.package.count.mockResolvedValue(0);
      prisma.tripBooking.findMany.mockResolvedValue([]);

      const result = await service.getKpis('agency-1');

      expect(result).toEqual({
        totalRequests: 0,
        pendingRequests: 0,
        inDiscussionRequests: 0,
        confirmedRequests: 0,
        totalPackages: 0,
        totalRevenue: 0,
        avgResponseTimeHours: 0,
      });
    });

    it('throws notFound when the agency does not exist', async () => {
      prisma.agency.findUnique.mockResolvedValue(null);

      await expect(service.getKpis('missing-agency')).rejects.toMatchObject({
        getStatus: expect.any(Function),
      });
    });
  });

  describe('getFundingTrends', () => {
    it('returns seven daily entries for the 7d range', async () => {
      prisma.tripBooking.findMany.mockResolvedValue([]);

      const result = await service.getFundingTrends('agency-1', '7d');

      expect(result.trends).toHaveLength(7);
      expect(result.trends.every((t: any) => t.amount === 0)).toBe(true);
    });

    it('returns thirty daily entries for the 30d range', async () => {
      prisma.tripBooking.findMany.mockResolvedValue([]);

      const result = await service.getFundingTrends('agency-1', '30d');

      expect(result.trends).toHaveLength(30);
    });

    it('returns ninety daily entries for the 90d range', async () => {
      prisma.tripBooking.findMany.mockResolvedValue([]);

      const result = await service.getFundingTrends('agency-1', '90d');

      expect(result.trends).toHaveLength(90);
    });

    it('correctly sums amounts per day', async () => {
      const todayStr = format(new Date(), 'yyyy-MM-dd');
      const twoDaysAgoStr = format(subDays(new Date(), 2), 'yyyy-MM-dd');
      prisma.tripBooking.findMany.mockResolvedValue([
        { amount: '100', completedAt: new Date() },
        { amount: '150', completedAt: new Date() },
        { amount: '200', completedAt: subDays(new Date(), 2) },
      ]);

      const result = await service.getFundingTrends('agency-1', '7d');

      expect(prisma.tripBooking.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            agencyId: 'agency-1',
            status: TripBookingStatus.completed,
          }),
        }),
      );

      const today = result.trends.find((t: any) => t.date === todayStr);
      const twoDaysAgo = result.trends.find(
        (t: any) => t.date === twoDaysAgoStr,
      );
      expect(today).toBeDefined();
      expect(twoDaysAgo).toBeDefined();
      if (today) expect(today.amount).toBe(250);
      if (twoDaysAgo) expect(twoDaysAgo.amount).toBe(200);
    });

    it('returns zero for days without bookings', async () => {
      const todayStr = format(new Date(), 'yyyy-MM-dd');
      prisma.tripBooking.findMany.mockResolvedValue([
        { amount: '100', completedAt: new Date() },
      ]);

      const result = await service.getFundingTrends('agency-1', '7d');

      const today = result.trends.find((t: any) => t.date === todayStr);
      expect(today).toBeDefined();
      if (today) expect(today.amount).toBe(100);
      const emptyDays = result.trends.filter((t: any) => t.amount === 0);
      expect(emptyDays).toHaveLength(6);
    });
  });

  describe('getTopDestinations', () => {
    it('sorts destinations by booking count descending', async () => {
      prisma.tripBooking.findMany.mockResolvedValue([
        { amount: '100', campaign: { destination: 'Paris' } },
        { amount: '50', campaign: { destination: 'Paris' } },
        { amount: '200', campaign: { destination: 'Tokyo' } },
      ]);

      const result = await service.getTopDestinations('agency-1', 10);

      expect(result.destinations[0]).toEqual(
        expect.objectContaining({
          destination: 'Paris',
          bookingCount: 2,
          totalRevenue: 150,
        }),
      );
      expect(result.destinations[1]).toEqual(
        expect.objectContaining({
          destination: 'Tokyo',
          bookingCount: 1,
          totalRevenue: 200,
        }),
      );
    });

    it('respects the limit parameter', async () => {
      prisma.tripBooking.findMany.mockResolvedValue([
        { amount: '10', campaign: { destination: 'A' } },
        { amount: '10', campaign: { destination: 'B' } },
        { amount: '10', campaign: { destination: 'C' } },
      ]);

      const result = await service.getTopDestinations('agency-1', 2);

      expect(result.destinations).toHaveLength(2);
    });

    it('returns empty when no bookings exist', async () => {
      prisma.tripBooking.findMany.mockResolvedValue([]);

      const result = await service.getTopDestinations('agency-1', 10);

      expect(result).toEqual({ destinations: [] });
    });

    it('only counts bookings with a non-null campaign destination', async () => {
      prisma.tripBooking.findMany.mockResolvedValue([
        { amount: '100', campaign: null },
        { amount: '50', campaign: { destination: null } },
        { amount: '200', campaign: { destination: 'Berlin' } },
      ]);

      const result = await service.getTopDestinations('agency-1', 10);

      expect(prisma.tripBooking.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            campaign: { isNot: null },
          }),
        }),
      );
      expect(result.destinations).toHaveLength(1);
      expect(result.destinations[0]).toEqual(
        expect.objectContaining({
          destination: 'Berlin',
          bookingCount: 1,
          totalRevenue: 200,
        }),
      );
    });
  });

  describe('getTravelerPreferences', () => {
    it('returns the destination preference distribution', async () => {
      prisma.packageCampaignLink.findMany.mockResolvedValue([
        { campaignId: 'campaign-1' },
      ]);
      prisma.tripRequest.findMany.mockResolvedValue([
        { travelerId: 'traveler-1' },
        { travelerId: 'traveler-1' },
        { travelerId: 'traveler-2' },
      ]);
      prisma.travelerDestinationPreference.findMany.mockResolvedValue([
        { destinationType: DestinationType.beach },
        { destinationType: DestinationType.beach },
        { destinationType: DestinationType.mountain },
      ]);

      const result = await service.getTravelerPreferences('agency-1');

      expect(result.preferences).toEqual([
        expect.objectContaining({
          destinationType: DestinationType.beach,
          travelerCount: 2,
        }),
        expect.objectContaining({
          destinationType: DestinationType.mountain,
          travelerCount: 1,
        }),
      ]);
    });

    it('returns empty when there are no linked campaigns', async () => {
      prisma.packageCampaignLink.findMany.mockResolvedValue([]);

      const result = await service.getTravelerPreferences('agency-1');

      expect(result).toEqual({ preferences: [] });
      expect(prisma.tripRequest.findMany).not.toHaveBeenCalled();
      expect(
        prisma.travelerDestinationPreference.findMany,
      ).not.toHaveBeenCalled();
    });

    it('calculates percentages rounded to one decimal place', async () => {
      prisma.packageCampaignLink.findMany.mockResolvedValue([
        { campaignId: 'campaign-1' },
      ]);
      prisma.tripRequest.findMany.mockResolvedValue([
        { travelerId: 't1' },
        { travelerId: 't1' },
        { travelerId: 't2' },
      ]);
      prisma.travelerDestinationPreference.findMany.mockResolvedValue([
        { destinationType: DestinationType.beach },
        { destinationType: DestinationType.beach },
        { destinationType: DestinationType.mountain },
      ]);

      const result = await service.getTravelerPreferences('agency-1');

      const beach = result.preferences.find(
        (p: any) => p.destinationType === DestinationType.beach,
      );
      const mountain = result.preferences.find(
        (p: any) => p.destinationType === DestinationType.mountain,
      );
      // 2/3 -> 66.7, 1/3 -> 33.3
      expect(beach).toBeDefined();
      expect(mountain).toBeDefined();
      if (beach) expect(beach.percentage).toBe(66.7);
      if (mountain) expect(mountain.percentage).toBe(33.3);
    });

    it('returns empty when linked campaigns have no travelers', async () => {
      prisma.packageCampaignLink.findMany.mockResolvedValue([
        { campaignId: 'campaign-1' },
      ]);
      prisma.tripRequest.findMany.mockResolvedValue([]);

      const result = await service.getTravelerPreferences('agency-1');

      expect(result).toEqual({ preferences: [] });
      expect(
        prisma.travelerDestinationPreference.findMany,
      ).not.toHaveBeenCalled();
    });
  });

  describe('getPopularPackages', () => {
    it('sorts packages by booking count descending', async () => {
      prisma.tripBooking.findMany.mockResolvedValue([
        {
          packageId: 'pkg-1',
          amount: '100',
          package: {
            id: 'pkg-1',
            title: 'Alpine Retreat',
            basePrice: 500,
            currency: 'USD',
          },
        },
        {
          packageId: 'pkg-2',
          amount: '200',
          package: {
            id: 'pkg-2',
            title: 'Beach Escape',
            basePrice: 800,
            currency: 'USD',
          },
        },
        {
          packageId: 'pkg-1',
          amount: '50',
          package: {
            id: 'pkg-1',
            title: 'Alpine Retreat',
            basePrice: 500,
            currency: 'USD',
          },
        },
      ]);

      const result = await service.getPopularPackages('agency-1', 10);

      expect(prisma.tripBooking.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            status: TripBookingStatus.completed,
          }),
        }),
      );
      expect(result.packages[0]).toEqual(
        expect.objectContaining({
          packageId: 'pkg-1',
          title: 'Alpine Retreat',
          bookingCount: 2,
          totalRevenue: 150,
        }),
      );
      expect(result.packages[1]).toEqual(
        expect.objectContaining({
          packageId: 'pkg-2',
          title: 'Beach Escape',
          bookingCount: 1,
          totalRevenue: 200,
        }),
      );
    });

    it('respects the limit parameter', async () => {
      prisma.tripBooking.findMany.mockResolvedValue([
        {
          packageId: 'p1',
          amount: '10',
          package: { id: 'p1', title: 'A', basePrice: 1, currency: 'USD' },
        },
        {
          packageId: 'p2',
          amount: '10',
          package: { id: 'p2', title: 'B', basePrice: 1, currency: 'USD' },
        },
        {
          packageId: 'p3',
          amount: '10',
          package: { id: 'p3', title: 'C', basePrice: 1, currency: 'USD' },
        },
      ]);

      const result = await service.getPopularPackages('agency-1', 2);

      expect(result.packages).toHaveLength(2);
    });

    it('returns empty when no bookings exist', async () => {
      prisma.tripBooking.findMany.mockResolvedValue([]);

      const result = await service.getPopularPackages('agency-1', 10);

      expect(result).toEqual({ packages: [] });
    });

    it('returns packages with the expected shape (packageId, title, basePrice, currency, bookingCount, totalRevenue)', async () => {
      prisma.tripBooking.findMany.mockResolvedValue([
        {
          packageId: 'pkg-1',
          amount: '123.45',
          package: {
            id: 'pkg-1',
            title: 'Sahara Tour',
            basePrice: 999,
            currency: 'USD',
          },
        },
      ]);

      const result = await service.getPopularPackages('agency-1', 10);

      expect(result.packages[0]).toEqual({
        packageId: 'pkg-1',
        title: 'Sahara Tour',
        basePrice: 999,
        currency: 'USD',
        bookingCount: 1,
        totalRevenue: 123.45,
      });
    });
  });
});
