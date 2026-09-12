import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import {
  TripRequestStatus,
  TripBookingStatus,
  AgencySubscriptionTier,
  DestinationType,
} from '@prisma/client';
import { AppException } from '../../common/errors/app.exception';
import { subDays, startOfDay, format } from 'date-fns';

@Injectable()
export class AgencyDashboardService {
  private readonly logger = new Logger(AgencyDashboardService.name);

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

  async getKpis(agencyId: string) {
    const agency = await this.prisma.agency.findUnique({
      where: { id: agencyId },
      select: { subscriptionTier: true },
    });

    if (!agency) {
      throw AppException.notFound('Agency not found');
    }

    const [
      pendingRequests,
      inDiscussionRequests,
      confirmedRequests,
      totalPackages,
      completedBookings,
    ] = await Promise.all([
      this.prisma.tripRequest.count({
        where: { agencyId, status: TripRequestStatus.pending },
      }),
      this.prisma.tripRequest.count({
        where: { agencyId, status: TripRequestStatus.in_discussion },
      }),
      this.prisma.tripRequest.count({
        where: { agencyId, status: TripRequestStatus.confirmed },
      }),
      this.prisma.package.count({
        where: { agencyId, status: { in: ['active', 'inactive'] } },
      }),
      this.prisma.tripBooking.findMany({
        where: { agencyId, status: TripBookingStatus.completed },
        select: { amount: true },
      }),
    ]);

    const totalRevenue = completedBookings.reduce(
      (sum, booking) => sum + Number(booking.amount || 0),
      0,
    );

    const totalRequests =
      pendingRequests + inDiscussionRequests + confirmedRequests;

    // Calculate average response time
    const confirmedRequestsWithTime = await this.prisma.tripRequest.findMany({
      where: {
        agencyId,
        status: {
          in: [TripRequestStatus.confirmed, TripRequestStatus.completed],
        },
        confirmedAt: { not: null },
      },
      select: { createdAt: true, confirmedAt: true },
    });

    let avgResponseTimeHours = 0;
    if (confirmedRequestsWithTime.length > 0) {
      const totalMs = confirmedRequestsWithTime.reduce((sum, req) => {
        const diff = req.confirmedAt!.getTime() - req.createdAt.getTime();
        return sum + diff;
      }, 0);
      avgResponseTimeHours =
        totalMs / confirmedRequestsWithTime.length / (1000 * 60 * 60);
    }

    return {
      totalRequests,
      pendingRequests,
      inDiscussionRequests,
      confirmedRequests,
      totalPackages,
      totalRevenue,
      avgResponseTimeHours: Math.round(avgResponseTimeHours * 10) / 10,
    };
  }

  async getFundingTrends(agencyId: string, range: '7d' | '30d' | '90d') {
    const days = range === '7d' ? 7 : range === '30d' ? 30 : 90;
    const startDate = startOfDay(subDays(new Date(), days - 1));

    const bookings = await this.prisma.tripBooking.findMany({
      where: {
        agencyId,
        status: TripBookingStatus.completed,
        completedAt: { gte: startDate },
      },
      select: { amount: true, completedAt: true },
      orderBy: { completedAt: 'asc' },
    });

    const dailyMap = new Map<string, number>();
    for (let i = 0; i < days; i++) {
      const date = format(subDays(new Date(), days - 1 - i), 'yyyy-MM-dd');
      dailyMap.set(date, 0);
    }

    for (const booking of bookings) {
      if (booking.completedAt) {
        const date = format(booking.completedAt, 'yyyy-MM-dd');
        dailyMap.set(
          date,
          (dailyMap.get(date) || 0) + Number(booking.amount || 0),
        );
      }
    }

    const trends = Array.from(dailyMap.entries()).map(([date, amount]) => ({
      date,
      amount: Math.round(amount * 100) / 100,
    }));

    return { trends };
  }

  async getTopDestinations(agencyId: string, limit = 10) {
    const bookings = await this.prisma.tripBooking.findMany({
      where: {
        agencyId,
        status: TripBookingStatus.completed,
        campaign: { isNot: null },
      },
      select: {
        amount: true,
        campaign: { select: { destination: true } },
      },
    });

    const destinationMap = new Map<
      string,
      { count: number; revenue: number }
    >();

    for (const booking of bookings) {
      if (booking.campaign?.destination) {
        const dest = booking.campaign.destination;
        const current = destinationMap.get(dest) || { count: 0, revenue: 0 };
        destinationMap.set(dest, {
          count: current.count + 1,
          revenue: current.revenue + Number(booking.amount || 0),
        });
      }
    }

    const destinations = Array.from(destinationMap.entries())
      .map(([destination, data]) => ({
        destination,
        bookingCount: data.count,
        totalRevenue: Math.round(data.revenue * 100) / 100,
      }))
      .sort((a, b) => b.bookingCount - a.bookingCount)
      .slice(0, limit);

    return { destinations };
  }

  async getTravelerPreferences(agencyId: string) {
    const linkedCampaigns = await this.prisma.packageCampaignLink.findMany({
      where: { package: { agencyId } },
      select: { campaignId: true },
    });

    const campaignIds = linkedCampaigns.map((link) => link.campaignId);

    if (campaignIds.length === 0) {
      return { preferences: [] };
    }

    const tripRequests = await this.prisma.tripRequest.findMany({
      where: { campaignId: { in: campaignIds } },
      select: { travelerId: true },
    });

    const travelerIds = [...new Set(tripRequests.map((r) => r.travelerId))];

    if (travelerIds.length === 0) {
      return { preferences: [] };
    }

    const preferences =
      await this.prisma.travelerDestinationPreference.findMany({
        where: { userId: { in: travelerIds } },
        select: { destinationType: true },
      });

    const typeCount = new Map<DestinationType, number>();
    for (const pref of preferences) {
      typeCount.set(
        pref.destinationType,
        (typeCount.get(pref.destinationType) || 0) + 1,
      );
    }

    const total = preferences.length;
    const prefs = Array.from(typeCount.entries())
      .map(([destinationType, count]) => ({
        destinationType,
        travelerCount: count,
        percentage: total > 0 ? Math.round((count / total) * 1000) / 10 : 0,
      }))
      .sort((a, b) => b.travelerCount - a.travelerCount);

    return { preferences: prefs };
  }
}
