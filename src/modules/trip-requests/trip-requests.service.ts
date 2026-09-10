import { Injectable, Logger } from '@nestjs/common';
import {
  AgencyStatus,
  MessageType,
  TripRequestStatus,
  UserRole,
} from '@prisma/client';
import { AppException } from '../../common/errors/app.exception';
import { PrismaService } from '../prisma/prisma.service';
import { ConversationsService } from '../chat/conversations.service';
import { MessagesService } from '../chat/messages.service';
import { NotificationsService } from '../notifications/services/notifications.service';
import { CreateTripRequestDto } from './dto/create-trip-request.dto';
import { CreateSmartReplyTemplateDto } from './dto/create-smart-reply-template.dto';
import { UpdateSmartReplyTemplateDto } from './dto/update-smart-reply-template.dto';

const REQUEST_INCLUDE = {
  traveler: { select: { id: true, username: true, displayName: true } },
  agency: { select: { id: true, agencyName: true, status: true } },
  package: {
    select: { id: true, title: true, basePrice: true, currency: true },
  },
  campaign: { select: { id: true, title: true, destination: true } },
} as const;

const ALLOWED_TRANSITIONS: Record<TripRequestStatus, TripRequestStatus[]> = {
  [TripRequestStatus.pending]: [
    TripRequestStatus.in_discussion,
    TripRequestStatus.declined,
    TripRequestStatus.cancelled,
  ],
  [TripRequestStatus.in_discussion]: [
    TripRequestStatus.confirmed,
    TripRequestStatus.declined,
    TripRequestStatus.cancelled,
  ],
  [TripRequestStatus.confirmed]: [TripRequestStatus.completed],
  [TripRequestStatus.completed]: [],
  [TripRequestStatus.declined]: [],
  [TripRequestStatus.cancelled]: [],
};

@Injectable()
export class TripRequestsService {
  private readonly logger = new Logger(TripRequestsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly conversationsService: ConversationsService,
    private readonly messagesService: MessagesService,
    private readonly notificationsService: NotificationsService,
  ) {}

  async resolveAgencyIdOrThrow(userId: string): Promise<string> {
    const agency = await this.prisma.agency.findUnique({
      where: { userId },
      select: { id: true },
    });
    if (!agency) {
      throw AppException.forbidden('Agency account not found.');
    }
    return agency.id;
  }

  async create(travelerId: string, dto: CreateTripRequestDto) {
    const agency = await this.prisma.agency.findUnique({
      where: { id: dto.agencyId },
      select: { id: true, userId: true, status: true },
    });
    if (!agency || agency.status !== AgencyStatus.approved) {
      throw AppException.notFound('Agency not found.');
    }

    if (dto.packageId) {
      const pkg = await this.prisma.package.findUnique({
        where: { id: dto.packageId },
        select: { id: true, agencyId: true },
      });
      if (!pkg || pkg.agencyId !== agency.id) {
        throw AppException.notFound('Package not found.');
      }
    }

    if (dto.campaignId) {
      const campaign = await this.prisma.campaign.findUnique({
        where: { id: dto.campaignId },
        select: { id: true, creatorId: true },
      });
      if (!campaign || campaign.creatorId !== travelerId) {
        throw AppException.notFound('Campaign not found.');
      }
    }

    const conversation = await this.conversationsService.create(travelerId, {
      type: 'agency',
      agencyId: agency.id,
    });

    const createdRequest = await this.prisma.tripRequest.create({
      data: {
        travelerId,
        agencyId: agency.id,
        packageId: dto.packageId,
        campaignId: dto.campaignId,
        status: TripRequestStatus.pending,
        initialMessage: dto.message,
        conversationId: conversation.id,
      },
      include: REQUEST_INCLUDE,
    });

    await this.messagesService.send(conversation.id, travelerId, {
      type: MessageType.text,
      body: dto.message,
    });

    const traveler = await this.prisma.user.findUnique({
      where: { id: travelerId },
      select: { displayName: true, username: true },
    });
    const travelerName = traveler?.displayName ?? traveler?.username ?? 'A traveler';

    try {
      await this.notificationsService.create(agency.userId, {
        type: 'new_request' as any,
        title: 'New Trip Request',
        body: `You have a new trip request from ${travelerName}`,
        deepLinkTarget: 'trip-requests',
        deepLinkEntityId: createdRequest.id,
      });
    } catch (error) {
      this.logger.error(
        `Failed to send new_request notification to agency ${agency.id}: ${(error as Error).message}`,
      );
    }

    return createdRequest;
  }

  async listMineForTraveler(
    travelerId: string,
    status: TripRequestStatus | undefined,
    cursor: string | undefined,
    limit: number,
  ) {
    const where = {
      travelerId,
      ...(status ? { status } : {}),
    };

    const requests = await this.prisma.tripRequest.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      take: limit + 1,
      ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
      include: REQUEST_INCLUDE,
    });

    const hasMore = requests.length > limit;
    const page = hasMore ? requests.slice(0, limit) : requests;

    return {
      items: page,
      nextCursor: hasMore ? page[page.length - 1].id : null,
    };
  }

  async listForAgency(
    agencyId: string,
    status: TripRequestStatus | undefined,
    cursor: string | undefined,
    limit: number,
  ) {
    const where = {
      agencyId,
      ...(status ? { status } : {}),
    };

    const requests = await this.prisma.tripRequest.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      take: limit + 1,
      ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
      include: REQUEST_INCLUDE,
    });

    const hasMore = requests.length > limit;
    const page = hasMore ? requests.slice(0, limit) : requests;

    return {
      items: page,
      nextCursor: hasMore ? page[page.length - 1].id : null,
    };
  }

  async getDetailForCaller(
    requestId: string,
    callerId: string,
    callerRole: UserRole,
  ) {
    const request = await this.prisma.tripRequest.findUnique({
      where: { id: requestId },
      include: REQUEST_INCLUDE,
    });
    if (!request) {
      throw AppException.notFound('Trip request not found.');
    }

    if (callerRole === UserRole.traveler) {
      if (request.travelerId !== callerId) {
        throw AppException.notFound('Trip request not found.');
      }
      return request;
    }

    if (callerRole === UserRole.agency) {
      const agency = await this.prisma.agency.findUnique({
        where: { userId: callerId },
        select: { id: true },
      });
      if (!agency || request.agencyId !== agency.id) {
        throw AppException.notFound('Trip request not found.');
      }
      return request;
    }

    throw AppException.forbidden('You do not have access to this request.');
  }

  async updateStatus(
    requestId: string,
    agencyUserId: string,
    nextStatus: TripRequestStatus,
  ) {
    const agency = await this.prisma.agency.findUnique({
      where: { userId: agencyUserId },
      select: { id: true, agencyName: true },
    });
    if (!agency) {
      throw AppException.forbidden('Agency account not found.');
    }

    const request = await this.prisma.tripRequest.findUnique({
      where: { id: requestId },
      select: { id: true, agencyId: true, status: true },
    });
    if (!request || request.agencyId !== agency.id) {
      throw AppException.notFound('Trip request not found.');
    }

    const allowed = ALLOWED_TRANSITIONS[request.status];
    if (!allowed.includes(nextStatus)) {
      throw AppException.businessRule(
        `Cannot transition request from "${request.status}" to "${nextStatus}".`,
      );
    }

    const updated = await this.prisma.tripRequest.update({
      where: { id: requestId },
      data: { status: nextStatus },
      include: REQUEST_INCLUDE,
    });

    if (nextStatus === TripRequestStatus.confirmed) {
      this.logger.log(
        JSON.stringify({
          msg: 'trip_request.confirmed.booking_invoice_pending',
          agencyId: agency.id,
          requestId: updated.id,
          travelerId: updated.travelerId,
          packageId: updated.packageId,
          campaignId: updated.campaignId,
        }),
      );
    }

    const agencyResponseStatuses: TripRequestStatus[] = [
      TripRequestStatus.in_discussion,
      TripRequestStatus.confirmed,
      TripRequestStatus.completed,
      TripRequestStatus.declined,
    ];

    if (agencyResponseStatuses.includes(nextStatus)) {
      const bodyMap: Record<string, string> = {
        [TripRequestStatus.in_discussion]: `${agency.agencyName} started discussing your trip request`,
        [TripRequestStatus.confirmed]: `${agency.agencyName} confirmed your trip request`,
        [TripRequestStatus.completed]: `${agency.agencyName} marked your trip request as completed`,
        [TripRequestStatus.declined]: `${agency.agencyName} declined your trip request`,
      };

      try {
        await this.notificationsService.create(updated.travelerId, {
          type: 'agency_response' as any,
          title: 'Agency Response',
          body: bodyMap[nextStatus],
          deepLinkTarget: 'trip-requests',
          deepLinkEntityId: requestId,
        });
      } catch (error) {
        this.logger.error(
          `Failed to send agency_response notification for request ${requestId}: ${(error as Error).message}`,
        );
      }
    }

    if (nextStatus === TripRequestStatus.confirmed) {
      try {
        await this.notificationsService.create(updated.travelerId, {
          type: 'booking_update' as any,
          title: 'Booking Update',
          body: 'Your booking has been confirmed!',
          deepLinkTarget: 'trip-requests',
          deepLinkEntityId: requestId,
        });
      } catch (error) {
        this.logger.error(
          `Failed to send booking_update notification for request ${requestId}: ${(error as Error).message}`,
        );
      }
    }

    this.logger.log(
      JSON.stringify({
        audit: 'trip_request.status_changed',
        actorUserId: agencyUserId,
        agencyId: agency.id,
        requestId: updated.id,
        from: request.status,
        to: nextStatus,
      }),
    );

    return updated;
  }

  async cancel(requestId: string, travelerId: string) {
    const request = await this.prisma.tripRequest.findUnique({
      where: { id: requestId },
      select: { id: true, travelerId: true, status: true },
    });
    if (!request || request.travelerId !== travelerId) {
      throw AppException.notFound('Trip request not found.');
    }

    if (
      request.status !== TripRequestStatus.pending &&
      request.status !== TripRequestStatus.in_discussion
    ) {
      throw AppException.businessRule(
        'You can only cancel a request that is still pending or in discussion.',
      );
    }

    return this.prisma.tripRequest.update({
      where: { id: requestId },
      data: { status: TripRequestStatus.cancelled },
      include: REQUEST_INCLUDE,
    });
  }

  async listTemplates(agencyId: string) {
    return this.prisma.smartReplyTemplate.findMany({
      where: { agencyId },
      orderBy: { createdAt: 'desc' },
    });
  }

  async createTemplate(agencyId: string, dto: CreateSmartReplyTemplateDto) {
    return this.prisma.smartReplyTemplate.create({
      data: { agencyId, title: dto.title, body: dto.body },
    });
  }

  async updateTemplate(
    templateId: string,
    agencyId: string,
    dto: UpdateSmartReplyTemplateDto,
  ) {
    const template = await this.prisma.smartReplyTemplate.findUnique({
      where: { id: templateId },
      select: { id: true, agencyId: true },
    });
    if (!template || template.agencyId !== agencyId) {
      throw AppException.notFound('Template not found.');
    }

    const updateData: { title?: string; body?: string } = {};
    if (dto.title !== undefined) updateData.title = dto.title;
    if (dto.body !== undefined) updateData.body = dto.body;

    return this.prisma.smartReplyTemplate.update({
      where: { id: templateId },
      data: updateData,
    });
  }

  async deleteTemplate(templateId: string, agencyId: string) {
    const template = await this.prisma.smartReplyTemplate.findUnique({
      where: { id: templateId },
      select: { id: true, agencyId: true },
    });
    if (!template || template.agencyId !== agencyId) {
      throw AppException.notFound('Template not found.');
    }
    await this.prisma.smartReplyTemplate.delete({ where: { id: templateId } });
  }
}
