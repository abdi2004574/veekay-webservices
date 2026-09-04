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

// Legal status transitions per docs/features/user-requests-communication.md.
// No back-transitions; declined/cancelled/completed are terminal.
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
  ) {}

  // ──────────────────────── Agency resolution helpers ────────────────────────

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

  // ──────────────────────── Traveler: create + list ─────────────────────────

  async create(travelerId: string, dto: CreateTripRequestDto) {
    const agency = await this.prisma.agency.findUnique({
      where: { id: dto.agencyId },
      select: { id: true, status: true },
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

    // Reuse-or-create the agency conversation (lazy fan-out, same pattern as
    // group-campaigns' groupConversationId). create() returns the existing
    // Conversation if one already exists between this traveler and agency.
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

    // Auto-post the initial inquiry as a text message in the conversation
    // so the chat thread already has context when the agency opens it.
    await this.messagesService.send(conversation.id, travelerId, {
      type: MessageType.text,
      body: dto.message,
    });

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

  // ──────────────────────── Agency: list incoming ───────────────────────────

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

  // ──────────────────────── Shared: get detail ──────────────────────────────

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

  // ──────────────────────── Agency: status transitions ─────────────────────

  async updateStatus(
    requestId: string,
    agencyUserId: string,
    nextStatus: TripRequestStatus,
  ) {
    const agency = await this.prisma.agency.findUnique({
      where: { userId: agencyUserId },
      select: { id: true },
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

    // TODO: invoicing/commission deduction pending Feature #6. When a request
    // transitions to `confirmed`, this is where the booking-invoice trigger
    // would normally fire — creating a Stripe PaymentIntent or commission split
    // per docs/14-payments-and-stripe.md. Feature #6 (Payments, Wallet &
    // Withdrawal) is the most blocked feature in PROGRESS_TRACKER.md; do not
    // silently wire a stub here.
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

    // NOTE: AuditService is not yet implemented (Feature #11). For now we
    // emit a structured Pino log entry on every status transition. Once
    // AuditService exists, replace this with auditService.record(...)
    // targeting audit_logs (action='trip_request.status_changed', before/
    // after = { status: previousStatus } / { status: nextStatus }).
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

  // ──────────────────────── Traveler: cancel ─────────────────────────────────

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

  // ──────────────────────── Smart-reply templates ───────────────────────────

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
