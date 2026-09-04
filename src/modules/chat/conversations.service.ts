import { Injectable } from '@nestjs/common';
import { ConversationParticipantRole, ConversationType } from '@prisma/client';
import { AppException } from '../../common/errors/app.exception';
import { PrismaService } from '../prisma/prisma.service';
import { FriendsService } from '../friends/friends.service';
import { CreateConversationDto } from './dto/create-conversation.dto';

const USER_SELECT = {
  select: { id: true, username: true, displayName: true },
};

function lastMessagePreview(
  message: {
    type: string;
    body: string | null;
    fileName: string | null;
  } | null,
): string | null {
  if (!message) return null;
  if (message.type === 'image') return '📷 Photo';
  if (message.type === 'document')
    return `📄 ${message.fileName ?? 'Document'}`;
  return message.body;
}

@Injectable()
export class ConversationsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly friendsService: FriendsService,
  ) {}

  /** Throws unless the user is a live participant, or agency staff for an agency conversation. */
  async assertAccess(conversationId: string, userId: string) {
    const conversation = await this.prisma.conversation.findUnique({
      where: { id: conversationId },
    });
    if (!conversation) {
      throw AppException.notFound('Conversation not found.');
    }

    const participant = await this.prisma.conversationParticipant.findUnique({
      where: { conversationId_userId: { conversationId, userId } },
    });
    if (participant && !participant.leftAt) {
      return { conversation, participant, isAgencyStaff: false };
    }

    if (
      conversation.type === ConversationType.agency &&
      conversation.agencyId
    ) {
      const staff = await this.prisma.agencyStaff.findUnique({
        where: { agencyId_userId: { agencyId: conversation.agencyId, userId } },
      });
      if (staff) {
        return { conversation, participant: null, isAgencyStaff: true };
      }
    }

    throw AppException.forbidden(
      'You do not have access to this conversation.',
    );
  }

  private async findExistingDirect(userIdA: string, userIdB: string) {
    return this.prisma.conversation.findFirst({
      where: {
        type: ConversationType.direct,
        participants: { some: { userId: userIdA, leftAt: null } },
        AND: { participants: { some: { userId: userIdB, leftAt: null } } },
      },
    });
  }

  async create(callerId: string, dto: CreateConversationDto) {
    if (dto.type === 'direct') {
      if (!dto.participantId) {
        throw AppException.badRequest(
          'participantId is required for a direct conversation.',
        );
      }
      if (dto.participantId === callerId) {
        throw AppException.badRequest(
          'You cannot start a conversation with yourself.',
        );
      }
      const areFriends = await this.friendsService.areFriends(
        callerId,
        dto.participantId,
      );
      if (!areFriends) {
        throw AppException.forbidden('You can only message friends directly.');
      }

      const existing = await this.findExistingDirect(
        callerId,
        dto.participantId,
      );
      if (existing) return existing;

      return this.prisma.conversation.create({
        data: {
          type: ConversationType.direct,
          createdById: callerId,
          participants: {
            create: [
              { userId: callerId, role: ConversationParticipantRole.member },
              {
                userId: dto.participantId,
                role: ConversationParticipantRole.member,
              },
            ],
          },
        },
      });
    }

    if (dto.type === 'group') {
      if (!dto.title) {
        throw AppException.badRequest(
          'title is required for a group conversation.',
        );
      }
      if (!dto.participantIds?.length) {
        throw AppException.badRequest(
          'participantIds is required for a group conversation.',
        );
      }
      const uniqueIds = [...new Set(dto.participantIds)].filter(
        (id) => id !== callerId,
      );
      for (const id of uniqueIds) {
        const areFriends = await this.friendsService.areFriends(callerId, id);
        if (!areFriends) {
          throw AppException.forbidden('You can only add friends to a group.');
        }
      }

      return this.prisma.conversation.create({
        data: {
          type: ConversationType.group,
          title: dto.title,
          createdById: callerId,
          participants: {
            create: [
              { userId: callerId, role: ConversationParticipantRole.admin },
              ...uniqueIds.map((id) => ({
                userId: id,
                role: ConversationParticipantRole.member,
              })),
            ],
          },
        },
      });
    }

    // agency
    if (!dto.agencyId) {
      throw AppException.badRequest(
        'agencyId is required for an agency conversation.',
      );
    }
    const agency = await this.prisma.agency.findUnique({
      where: { id: dto.agencyId },
    });
    if (!agency) {
      throw AppException.notFound('Agency not found.');
    }

    const existing = await this.prisma.conversation.findFirst({
      where: {
        type: ConversationType.agency,
        agencyId: dto.agencyId,
        participants: { some: { userId: callerId, leftAt: null } },
      },
    });
    if (existing) return existing;

    return this.prisma.conversation.create({
      data: {
        type: ConversationType.agency,
        createdById: callerId,
        agencyId: dto.agencyId,
        participants: {
          create: [
            { userId: callerId, role: ConversationParticipantRole.member },
          ],
        },
      },
    });
  }

  async listForUser(userId: string) {
    const [asParticipant, staffAgencyIds] = await Promise.all([
      this.prisma.conversationParticipant.findMany({
        where: { userId, leftAt: null },
        select: { conversationId: true },
      }),
      this.prisma.agencyStaff
        .findMany({ where: { userId }, select: { agencyId: true } })
        .then((rows) => rows.map((r) => r.agencyId)),
    ]);

    const conversations = await this.prisma.conversation.findMany({
      where: {
        OR: [
          { id: { in: asParticipant.map((p) => p.conversationId) } },
          ...(staffAgencyIds.length
            ? [
                {
                  type: ConversationType.agency,
                  agencyId: { in: staffAgencyIds },
                },
              ]
            : []),
        ],
      },
      orderBy: { lastMessageAt: 'desc' },
      include: {
        participants: {
          where: { leftAt: null },
          include: { user: USER_SELECT },
        },
        agency: { select: { id: true, agencyName: true } },
        messages: { orderBy: { createdAt: 'desc' }, take: 1 },
      },
    });

    return Promise.all(
      conversations.map(async (conversation) => {
        const otherParticipants = conversation.participants
          .map((p) => p.user)
          .filter((u) => u.id !== userId);
        const myParticipant = conversation.participants.find(
          (p) => p.user.id === userId,
        );

        const displayName =
          conversation.type === ConversationType.direct
            ? (otherParticipants[0]?.displayName ??
              `@${otherParticipants[0]?.username}`)
            : conversation.type === ConversationType.agency
              ? (conversation.agency?.agencyName ?? 'Agency')
              : (conversation.title ?? 'Group');

        const isStaffView =
          !myParticipant && conversation.type === ConversationType.agency;
        const readCursor = isStaffView
          ? conversation.agencyLastReadAt
          : (myParticipant?.lastReadAt ?? null);

        const unreadCount = await this.prisma.message.count({
          where: {
            conversationId: conversation.id,
            senderId: { not: userId },
            createdAt: readCursor ? { gt: readCursor } : undefined,
          },
        });

        return {
          id: conversation.id,
          type: conversation.type,
          title: displayName,
          memberCount:
            conversation.type === ConversationType.group
              ? conversation.participants.length
              : undefined,
          lastMessage: lastMessagePreview(conversation.messages[0] ?? null),
          lastMessageAt: conversation.lastMessageAt,
          unreadCount,
        };
      }),
    );
  }

  async unreadCount(userId: string) {
    const conversations = await this.listForUser(userId);
    return conversations.reduce((sum, c) => sum + c.unreadCount, 0);
  }

  async getById(conversationId: string, userId: string) {
    const { conversation } = await this.assertAccess(conversationId, userId);

    const full = await this.prisma.conversation.findUniqueOrThrow({
      where: { id: conversation.id },
      include: {
        participants: {
          where: { leftAt: null },
          include: { user: USER_SELECT },
        },
        agency: { select: { id: true, agencyName: true } },
      },
    });

    const otherParticipants = full.participants
      .map((p) => p.user)
      .filter((u) => u.id !== userId);

    const displayName =
      full.type === ConversationType.direct
        ? (otherParticipants[0]?.displayName ??
          `@${otherParticipants[0]?.username}`)
        : full.type === ConversationType.agency
          ? (full.agency?.agencyName ?? 'Agency')
          : (full.title ?? 'Group');

    return {
      id: full.id,
      type: full.type,
      title: displayName,
      members:
        full.type === ConversationType.group
          ? full.participants.map((p) => ({
              id: p.user.id,
              username: p.user.username,
              displayName: p.user.displayName,
              role: p.role,
            }))
          : undefined,
    };
  }

  async addParticipants(
    conversationId: string,
    callerId: string,
    userIds: string[],
  ) {
    const { conversation, participant } = await this.assertAccess(
      conversationId,
      callerId,
    );
    if (conversation.type !== ConversationType.group) {
      throw AppException.businessRule(
        'You can only add members to a group conversation.',
      );
    }
    if (participant?.role !== ConversationParticipantRole.admin) {
      throw AppException.forbidden('Only a group admin can add members.');
    }

    const uniqueIds = [...new Set(userIds)];
    for (const id of uniqueIds) {
      const areFriends = await this.friendsService.areFriends(callerId, id);
      if (!areFriends) {
        throw AppException.forbidden('You can only add friends to a group.');
      }
    }

    await this.prisma.conversationParticipant.createMany({
      data: uniqueIds.map((userId) => ({ conversationId, userId })),
      skipDuplicates: true,
    });
  }

  async removeParticipant(
    conversationId: string,
    callerId: string,
    targetUserId: string,
  ) {
    const { conversation, participant } = await this.assertAccess(
      conversationId,
      callerId,
    );
    if (conversation.type !== ConversationType.group) {
      throw AppException.businessRule(
        'You can only remove members from a group conversation.',
      );
    }
    const isSelfLeave = targetUserId === callerId;
    if (
      !isSelfLeave &&
      participant?.role !== ConversationParticipantRole.admin
    ) {
      throw AppException.forbidden(
        'Only a group admin can remove other members.',
      );
    }

    const target = await this.prisma.conversationParticipant.findUnique({
      where: {
        conversationId_userId: { conversationId, userId: targetUserId },
      },
    });
    if (!target || target.leftAt) {
      throw AppException.notFound('This user is not a member of the group.');
    }

    await this.prisma.conversationParticipant.update({
      where: { id: target.id },
      data: { leftAt: new Date() },
    });
  }
}
