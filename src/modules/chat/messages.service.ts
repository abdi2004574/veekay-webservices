import { Injectable, Logger } from '@nestjs/common';
import {
  ConversationType,
  MediaStatus,
  MessageReceiptStatus,
} from '@prisma/client';
import { AppException } from '../../common/errors/app.exception';
import { PrismaService } from '../prisma/prisma.service';
import { MediaAssetsService } from '../storage/media-assets.service';
import { ConversationsService } from './conversations.service';
import { SendMessageDto } from './dto/send-message.dto';
import { NotificationsService } from '../notifications/services/notifications.service';

const SENDER_SELECT = {
  select: { id: true, username: true, displayName: true },
};

@Injectable()
export class MessagesService {
  private readonly logger = new Logger(MessagesService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly conversationsService: ConversationsService,
    private readonly mediaAssetsService: MediaAssetsService,
    private readonly notificationsService: NotificationsService,
  ) {}

  async send(conversationId: string, senderId: string, dto: SendMessageDto) {
    await this.conversationsService.assertAccess(conversationId, senderId);
    const type = dto.type ?? 'text';

    if (type === 'text') {
      if (!dto.body?.trim()) {
        throw AppException.badRequest('body is required for a text message.');
      }
    } else {
      if (!dto.mediaId) {
        throw AppException.badRequest(
          `mediaId is required for a ${type} message.`,
        );
      }
      const asset = await this.prisma.mediaAsset.findUnique({
        where: { id: dto.mediaId },
      });
      if (
        !asset ||
        asset.ownerId !== senderId ||
        asset.status !== MediaStatus.uploaded
      ) {
        throw AppException.badRequest(
          "Attach a photo/file you've already uploaded first.",
        );
      }
      const expectedPurpose = type === 'image' ? 'chat_image' : 'chat_document';
      if (asset.purpose !== expectedPurpose) {
        throw AppException.badRequest(
          `This media asset isn't a ${type} upload.`,
        );
      }
    }

    const message = await this.prisma.message.create({
      data: {
        conversationId,
        senderId,
        type,
        body: type === 'text' ? dto.body!.trim() : null,
        mediaId: type === 'text' ? null : dto.mediaId,
        fileName: type === 'document' ? (dto.fileName ?? null) : null,
      },
      include: { sender: SENDER_SELECT },
    });

    await this.prisma.conversation.update({
      where: { id: conversationId },
      data: { lastMessageAt: message.createdAt },
    });

    this.dispatchChatNotifications(
      conversationId,
      senderId,
      message,
      dto,
    ).catch((error) => {
      this.logger.error(
        `Notification dispatch failed for message ${message.id}: ${(error as Error).message}`,
      );
    });

    return this.attachMediaUrl(message);
  }

  private async dispatchChatNotifications(
    conversationId: string,
    senderId: string,
    message: {
      id: string;
      type: string;
      body: string | null;
      sender: { username: string | null; displayName: string | null };
    },
    dto: SendMessageDto,
  ) {
    const senderName =
      message.sender.username ?? message.sender.displayName ?? 'Someone';

    const participants = await this.prisma.conversationParticipant.findMany({
      where: { conversationId, leftAt: null, userId: { not: senderId } },
      include: { user: { select: { id: true } } },
    });

    const recipientIds = participants
      .map((p) => p.user.id)
      .filter((id): id is string => !!id);

    if (recipientIds.length === 0) return;

    const textBody =
      message.type === 'text'
        ? (message.body ?? '')
        : message.type === 'document'
          ? (dto.fileName ?? 'a document')
          : 'a photo';

    const truncatedBody =
      textBody.length > 100 ? `${textBody.slice(0, 97)}...` : textBody;

    await Promise.all(
      recipientIds.map((userId) =>
        this.notificationsService.create(userId, {
          type: 'chat_message',
          title: 'New message',
          body: `${senderName}: ${truncatedBody}`,
          deepLinkTarget: 'chat',
          deepLinkEntityId: conversationId,
        }),
      ),
    );

    if (message.type === 'document') {
      await Promise.all(
        recipientIds.map((userId) =>
          this.notificationsService.create(userId, {
            type: 'shared_file',
            title: 'Shared file',
            body: `${senderName} shared a document`,
            deepLinkTarget: 'chat',
            deepLinkEntityId: conversationId,
          }),
        ),
      );
    }
  }

  private async attachMediaUrl<T extends { mediaId: string | null }>(
    message: T,
  ) {
    if (!message.mediaId) {
      return { ...message, mediaUrl: null };
    }
    const urls = await this.mediaAssetsService.resolveViewUrls([
      message.mediaId,
    ]);
    return { ...message, mediaUrl: urls.get(message.mediaId) ?? null };
  }

  async list(
    conversationId: string,
    viewerId: string,
    cursor?: string,
    limit = 30,
  ) {
    await this.conversationsService.assertAccess(conversationId, viewerId);

    const messages = await this.prisma.message.findMany({
      where: { conversationId },
      orderBy: { createdAt: 'desc' },
      take: limit + 1,
      ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
      include: { sender: SENDER_SELECT },
    });

    const hasMore = messages.length > limit;
    const page = hasMore ? messages.slice(0, limit) : messages;

    const othersMessageIds = page
      .filter((m) => m.senderId !== viewerId)
      .map((m) => m.id);
    if (othersMessageIds.length > 0) {
      await Promise.all(
        othersMessageIds.map((messageId) =>
          this.prisma.messageReceipt.upsert({
            where: { messageId_userId: { messageId, userId: viewerId } },
            update: {},
            create: {
              messageId,
              userId: viewerId,
              status: MessageReceiptStatus.delivered,
              deliveredAt: new Date(),
            },
          }),
        ),
      );
    }

    const mediaIds = page
      .map((m) => m.mediaId)
      .filter((id): id is string => !!id);
    const urlsByMediaId =
      await this.mediaAssetsService.resolveViewUrls(mediaIds);

    const myMessageIds = page
      .filter((m) => m.senderId === viewerId)
      .map((m) => m.id);
    const receipts =
      myMessageIds.length > 0
        ? await this.prisma.messageReceipt.findMany({
            where: { messageId: { in: myMessageIds } },
          })
        : [];
    const receiptsByMessage = new Map<string, typeof receipts>();
    for (const r of receipts) {
      receiptsByMessage.set(r.messageId, [
        ...(receiptsByMessage.get(r.messageId) ?? []),
        r,
      ]);
    }

    const items = page.map((message) => {
      const mine = message.senderId === viewerId;
      const messageReceipts = mine
        ? (receiptsByMessage.get(message.id) ?? [])
        : [];
      const status = !mine
        ? undefined
        : messageReceipts.some((r) => r.status === MessageReceiptStatus.read)
          ? 'read'
          : messageReceipts.some(
                (r) => r.status === MessageReceiptStatus.delivered,
              )
            ? 'delivered'
            : 'sent';

      return {
        id: message.id,
        conversationId: message.conversationId,
        sender: message.sender,
        type: message.type,
        body: message.body,
        fileName: message.fileName,
        mediaUrl: message.mediaId
          ? (urlsByMediaId.get(message.mediaId) ?? null)
          : null,
        createdAt: message.createdAt,
        status,
      };
    });

    return {
      items,
      nextCursor: hasMore ? page[page.length - 1].id : null,
    };
  }

  async markRead(conversationId: string, viewerId: string) {
    const { conversation, participant, isAgencyStaff } =
      await this.conversationsService.assertAccess(conversationId, viewerId);

    const unreadMessages = await this.prisma.message.findMany({
      where: { conversationId, senderId: { not: viewerId } },
      select: { id: true },
    });

    if (unreadMessages.length > 0) {
      await Promise.all(
        unreadMessages.map(({ id }) =>
          this.prisma.messageReceipt.upsert({
            where: { messageId_userId: { messageId: id, userId: viewerId } },
            update: { status: MessageReceiptStatus.read, readAt: new Date() },
            create: {
              messageId: id,
              userId: viewerId,
              status: MessageReceiptStatus.read,
              deliveredAt: new Date(),
              readAt: new Date(),
            },
          }),
        ),
      );
    }

    if (isAgencyStaff && conversation.type === ConversationType.agency) {
      await this.prisma.conversation.update({
        where: { id: conversationId },
        data: { agencyLastReadAt: new Date() },
      });
    } else if (participant) {
      await this.prisma.conversationParticipant.update({
        where: { id: participant.id },
        data: { lastReadAt: new Date() },
      });
    }
  }
}
