import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { TripBookingStatus, AgencySubscriptionTier } from '@prisma/client';
import { AppException } from '../../common/errors/app.exception';
import {
  encodeCursor,
  decodeCursor,
  CursorPage,
} from '../../common/utils/cursor-pagination.util';

@Injectable()
export class AgencyRevenueService {
  private readonly logger = new Logger(AgencyRevenueService.name);

  constructor(private readonly prisma: PrismaService) {}

  private getCommissionRate(tier: AgencySubscriptionTier): number {
    switch (tier) {
      case AgencySubscriptionTier.basic:
        return 0.15;
      case AgencySubscriptionTier.premium:
        return 0.1;
      case AgencySubscriptionTier.featured:
        return 0.08;
      default:
        return 0.15;
    }
  }

  private calculateCommission(
    amount: number,
    tier: AgencySubscriptionTier,
  ): number {
    const rate = this.getCommissionRate(tier);
    return Math.round(amount * rate * 100) / 100;
  }

  async getRevenueLedger(
    agencyId: string,
    cursor?: string,
    limit = 20,
  ): Promise<CursorPage<any>> {
    const agency = await this.prisma.agency.findUnique({
      where: { id: agencyId },
      select: { subscriptionTier: true },
    });

    if (!agency) {
      throw AppException.notFound('Agency not found');
    }

    const decodedCursor = decodeCursor(cursor);

    const whereClause: any = {
      agencyId,
      status: TripBookingStatus.completed,
    };

    if (decodedCursor) {
      whereClause.createdAt = { lt: decodedCursor.createdAt };
    }

    const bookings = await this.prisma.tripBooking.findMany({
      where: whereClause,
      take: limit + 1,
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        packageId: true,
        travelerId: true,
        amount: true,
        status: true,
        completedAt: true,
        createdAt: true,
        package: { select: { title: true } },
        traveler: { select: { email: true } },
      },
    });

    const page = toCursorPage(bookings, limit);

    const items = page.items.map((booking) => {
      const amount = Number(booking.amount || 0);
      const commission = this.calculateCommission(
        amount,
        agency.subscriptionTier,
      );
      return {
        bookingId: booking.id,
        packageId: booking.packageId,
        packageTitle: booking.package?.title || 'N/A',
        travelerId: booking.travelerId,
        travelerEmail: booking.traveler?.email || 'N/A',
        amount: Math.round(amount * 100) / 100,
        commission,
        netPayout: Math.round((amount - commission) * 100) / 100,
        status: booking.status,
        completedAt: booking.completedAt?.toISOString(),
      };
    });

    return { items, cursor: page.cursor, hasMore: page.hasMore };
  }

  async exportRevenueCsv(agencyId: string): Promise<string> {
    const agency = await this.prisma.agency.findUnique({
      where: { id: agencyId },
      select: { subscriptionTier: true, agencyName: true },
    });

    if (!agency) {
      throw AppException.notFound('Agency not found');
    }

    const bookings = await this.prisma.tripBooking.findMany({
      where: { agencyId, status: TripBookingStatus.completed },
      orderBy: { completedAt: 'desc' },
      select: {
        id: true,
        packageId: true,
        travelerId: true,
        amount: true,
        status: true,
        completedAt: true,
        createdAt: true,
        package: { select: { title: true } },
        traveler: { select: { email: true } },
      },
    });

    const headers = [
      'Booking ID',
      'Package ID',
      'Package Title',
      'Traveler ID',
      'Traveler Email',
      'Amount (USD)',
      'Commission (USD)',
      'Net Payout (USD)',
      'Status',
      'Completed At',
      'Created At',
    ];

    const rows = bookings.map((booking) => {
      const amount = Number(booking.amount || 0);
      const commission = this.calculateCommission(
        amount,
        agency.subscriptionTier,
      );
      return [
        booking.id,
        booking.packageId || '',
        booking.package?.title || 'N/A',
        booking.travelerId,
        booking.traveler?.email || 'N/A',
        amount.toFixed(2),
        commission.toFixed(2),
        (amount - commission).toFixed(2),
        booking.status,
        booking.completedAt?.toISOString() || '',
        booking.createdAt.toISOString(),
      ];
    });

    const csvContent = [
      headers.join(','),
      ...rows.map((row) => row.map((cell) => '').join(',')),
    ].join('\n');

    return csvContent;
  }
}

function toCursorPage<T extends { id: string; createdAt: Date }>(
  items: T[],
  limit: number,
): CursorPage<T> {
  const hasMore = items.length > limit;
  const page = hasMore ? items.slice(0, limit) : items;
  return {
    items: page,
    cursor: page.length > 0 ? encodeCursor(page[page.length - 1]) : null,
    hasMore,
  };
}
