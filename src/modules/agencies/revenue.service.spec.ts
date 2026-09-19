import { TripBookingStatus } from '@prisma/client';
import { AgencyRevenueService } from './revenue.service';

describe('AgencyRevenueService', () => {
  let prisma: any;
  let service: AgencyRevenueService;

  beforeEach(() => {
    prisma = {
      agency: { findUnique: jest.fn() },
      tripBooking: { findMany: jest.fn() },
    };
    service = new AgencyRevenueService(prisma);
  });

  describe('getRevenueLedger', () => {
    it('throws notFound when agency does not exist', async () => {
      prisma.agency.findUnique.mockResolvedValue(null);

      await expect(service.getRevenueLedger('missing-agency')).rejects.toMatchObject({
        getStatus: expect.any(Function),
      });
    });

    it('returns paginated revenue ledger with commission calculations', async () => {
      prisma.agency.findUnique.mockResolvedValue({ subscriptionTier: 'basic' });
      process.env.WALLET_DONATION_FEE_PERCENTAGE = '0.1';

      prisma.tripBooking.findMany.mockResolvedValue([
        {
          id: 'booking-1',
          packageId: 'pkg-1',
          travelerId: 'traveler-1',
          amount: '100',
          status: TripBookingStatus.completed,
          completedAt: new Date('2024-01-15'),
          createdAt: new Date('2024-01-10'),
          package: { title: 'Package 1' },
          traveler: { email: 'traveler1@example.com' },
        },
        {
          id: 'booking-2',
          packageId: 'pkg-2',
          travelerId: 'traveler-2',
          amount: '200',
          status: TripBookingStatus.completed,
          completedAt: new Date('2024-01-14'),
          createdAt: new Date('2024-01-09'),
          package: { title: 'Package 2' },
          traveler: { email: 'traveler2@example.com' },
        },
      ]);

      const result = await service.getRevenueLedger('agency-1');

      expect(result.items).toHaveLength(2);
      expect(result.items[0]).toEqual({
        bookingId: 'booking-1',
        packageId: 'pkg-1',
        packageTitle: 'Package 1',
        travelerId: 'traveler-1',
        travelerEmail: 'traveler1@example.com',
        amount: 100,
        commission: 10,
        netPayout: 90,
        status: TripBookingStatus.completed,
        completedAt: '2024-01-15T00:00:00.000Z',
      });
      expect(result.items[1]).toEqual({
        bookingId: 'booking-2',
        packageId: 'pkg-2',
        packageTitle: 'Package 2',
        travelerId: 'traveler-2',
        travelerEmail: 'traveler2@example.com',
        amount: 200,
        commission: 20,
        netPayout: 180,
        status: TripBookingStatus.completed,
        completedAt: '2024-01-14T00:00:00.000Z',
      });
      expect(result.hasMore).toBe(false);
    });

    it('supports cursor-based pagination', async () => {
      const bookings = Array.from({ length: 25 }, (_, i) => ({
        id: `booking-${i}`,
        packageId: `pkg-${i}`,
        travelerId: `traveler-${i}`,
        amount: '100',
        status: TripBookingStatus.completed,
        completedAt: new Date(2024, 0, 20 - i),
        createdAt: new Date(2024, 0, 10 - i),
        package: { title: `Package ${i}` },
        traveler: { email: `traveler${i}@example.com` },
      }));
      prisma.agency.findUnique.mockResolvedValue({ subscriptionTier: 'basic' });
      process.env.WALLET_DONATION_FEE_PERCENTAGE = '0.1';

      prisma.tripBooking.findMany.mockResolvedValueOnce(bookings);

      const firstPage = await service.getRevenueLedger('agency-1', undefined, 20);

      expect(firstPage.items).toHaveLength(20);
      expect(firstPage.hasMore).toBe(true);
      expect(firstPage.cursor).toBeDefined();

      // Second page should return remaining 5 items
      prisma.tripBooking.findMany.mockResolvedValue(bookings.slice(20));

      const secondPage = await service.getRevenueLedger('agency-1', firstPage.cursor ?? undefined, 20);

      expect(secondPage.items).toHaveLength(5);
      expect(secondPage.hasMore).toBe(false);
    });

    it('handles null amount as zero', async () => {
      prisma.agency.findUnique.mockResolvedValue({ subscriptionTier: 'basic' });
      process.env.WALLET_DONATION_FEE_PERCENTAGE = '0.1';

      prisma.tripBooking.findMany.mockResolvedValue([
        {
          id: 'booking-1',
          packageId: 'pkg-1',
          travelerId: 'traveler-1',
          amount: null,
          status: TripBookingStatus.completed,
          completedAt: new Date('2024-01-15'),
          createdAt: new Date('2024-01-10'),
          package: { title: 'Package 1' },
          traveler: { email: 'traveler1@example.com' },
        },
      ]);

      const result = await service.getRevenueLedger('agency-1');

      expect(result.items[0].amount).toBe(0);
      expect(result.items[0].commission).toBe(0);
      expect(result.items[0].netPayout).toBe(0);
    });
  });

  describe('exportRevenueCsv', () => {
    it('throws notFound when agency does not exist', async () => {
      prisma.agency.findUnique.mockResolvedValue(null);

      await expect(service.exportRevenueCsv('missing-agency')).rejects.toMatchObject({
        getStatus: expect.any(Function),
      });
    });

    it('exports CSV with correct headers and rows', async () => {
      prisma.agency.findUnique.mockResolvedValue({ subscriptionTier: 'basic', agencyName: 'Test Agency' });
      process.env.WALLET_DONATION_FEE_PERCENTAGE = '0.1';

      prisma.tripBooking.findMany.mockResolvedValue([
        {
          id: 'booking-1',
          packageId: 'pkg-1',
          travelerId: 'traveler-1',
          amount: '100',
          status: TripBookingStatus.completed,
          completedAt: new Date('2024-01-15'),
          createdAt: new Date('2024-01-10'),
          package: { title: 'Package 1' },
          traveler: { email: 'traveler1@example.com' },
        },
      ]);

      const csv = await service.exportRevenueCsv('agency-1');
      const lines = csv.trim().split('\n');

      expect(lines[0]).toBe('Booking ID,Package ID,Package Title,Traveler ID,Traveler Email,Amount (USD),Commission (USD),Net Payout (USD),Status,Completed At,Created At');
      expect(lines[1]).toContain('booking-1');
      expect(lines[1]).toContain('pkg-1');
      expect(lines[1]).toContain('Package 1');
      expect(lines[1]).toContain('traveler-1');
      expect(lines[1]).toContain('traveler1@example.com');
      expect(lines[1]).toContain('100.00');
      expect(lines[1]).toContain('10.00');
      expect(lines[1]).toContain('90.00');
      expect(lines[1]).toContain(TripBookingStatus.completed);
      expect(lines[1]).toContain('2024-01-15T00:00:00.000Z');
    });
  });
});
