import { Injectable, Inject, Logger } from '@nestjs/common';
import { ConversationType } from '@prisma/client';
import { AppException } from '../../../common/errors/app.exception';
import { PrismaService } from '../../prisma/prisma.service';
import { ConversationsService } from '../conversations.service';
import { NotificationsService } from '../../notifications/services/notifications.service';
import {
  CALL_PROVIDER,
  CreateCallSessionPayload,
} from '../../../common/interfaces/call-provider.interface';
import type { ICallProvider } from '../../../common/interfaces/call-provider.interface';
import { CreateCallDto } from './dto/create-call.dto';
import { NotificationType } from '@prisma/client';

@Injectable()
export class CallsService {
  private readonly logger = new Logger(CallsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly conversationsService: ConversationsService,
    private readonly notificationsService: NotificationsService,
    @Inject(CALL_PROVIDER) private readonly callProvider: ICallProvider,
  ) {}

  async create(conversationId: string, callerId: string, dto: CreateCallDto) {
    const { conversation, participant, isAgencyStaff } =
      await this.conversationsService.assertAccess(conversationId, callerId);

    if (conversation.type !== ConversationType.agency) {
      throw AppException.businessRule(
        'Calls are only available in agency conversations.',
      );
    }

    const agencyId = conversation.agencyId!;
    let agencyUserId: string;
    let travelerId: string;

    if (isAgencyStaff) {
      agencyUserId = callerId;
      const travelerParticipant =
        await this.prisma.conversationParticipant.findFirst({
          where: { conversationId, leftAt: null, userId: { not: callerId } },
          select: { userId: true },
        });
      if (!travelerParticipant) {
        throw AppException.notFound('No traveler found in this conversation.');
      }
      travelerId = travelerParticipant.userId;
    } else {
      travelerId = callerId;
      const agency = await this.prisma.agency.findUnique({
        where: { id: agencyId },
        select: { userId: true },
      });
      if (!agency) {
        throw AppException.notFound('Agency not found.');
      }
      agencyUserId = agency.userId;
    }

    const payload: CreateCallSessionPayload = {
      conversationId,
      initiatedBy: callerId,
      agencyId,
      travelerId,
      type: dto.type,
    };

    const session = await this.callProvider.createSession(payload);

    const recipientId = isAgencyStaff ? travelerId : agencyUserId;
    const callerLabel = isAgencyStaff ? 'Agency' : 'Traveler';

    await this.notificationsService.create(recipientId, {
      type: NotificationType.new_call,
      title: `${callerLabel} is calling`,
      body: `${callerLabel} started a ${dto.type} consultation call.`,
      deepLinkTarget: 'chat',
      deepLinkEntityId: conversationId,
      metadata: {
        callSessionId: session.id,
        conversationId,
        type: dto.type,
      },
    });

    return session;
  }

  async end(sessionId: string, callerId: string): Promise<void> {
    await this.callProvider.endSession(sessionId);
    this.logger.log(`Call ${sessionId} ended by user ${callerId}`);
  }
}
