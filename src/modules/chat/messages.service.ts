import { Injectable } from '@nestjs/common';
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

const SENDER_SELECT = {
  select: { id: true, username: true, displayName: true },
};

@Injectable()
export class MessagesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly conversationsService: ConversationsService,
    private readonly mediaAssetsService: MediaAssetsService,
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

    return this.attachMediaUrl(message);
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

    // Fetching messages counts as delivery for anything not already delivered/read.
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
