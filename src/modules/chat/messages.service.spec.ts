import { ConversationType, MessageReceiptStatus } from '@prisma/client';
import { MessagesService } from './messages.service';

describe('MessagesService', () => {
  let prisma: any;
  let conversationsService: any;
  let mediaAssetsService: any;
  let service: MessagesService;

  beforeEach(() => {
    prisma = {
      mediaAsset: { findUnique: jest.fn() },
      message: { create: jest.fn(), findMany: jest.fn() },
      conversation: { update: jest.fn() },
      conversationParticipant: { update: jest.fn() },
      messageReceipt: { upsert: jest.fn(), findMany: jest.fn() },
    };
    conversationsService = { assertAccess: jest.fn() };
    mediaAssetsService = {
      resolveViewUrls: jest.fn().mockResolvedValue(new Map()),
    };
    const mockNotificationsService = {
      create: jest.fn().mockResolvedValue({}),
    };
    service = new MessagesService(
      prisma,
      conversationsService,
      mediaAssetsService,
      mockNotificationsService as any,
    );
  });

  describe('send', () => {
    beforeEach(() => {
      conversationsService.assertAccess.mockResolvedValue({
        conversation: { id: 'conv-1', type: ConversationType.direct },
        participant: { id: 'p-1' },
        isAgencyStaff: false,
      });
    });

    it('rejects a text message with no body', async () => {
      await expect(
        service.send('conv-1', 'user-1', { type: 'text' }),
      ).rejects.toMatchObject({ getStatus: expect.any(Function) });
    });

    it('rejects an image message with no mediaId', async () => {
      await expect(
        service.send('conv-1', 'user-1', { type: 'image' }),
      ).rejects.toMatchObject({ getStatus: expect.any(Function) });
    });

    it('rejects attaching media you do not own', async () => {
      prisma.mediaAsset.findUnique.mockResolvedValue({
        ownerId: 'someone-else',
        status: 'uploaded',
        purpose: 'chat_image',
      });

      await expect(
        service.send('conv-1', 'user-1', { type: 'image', mediaId: 'media-1' }),
      ).rejects.toMatchObject({ getStatus: expect.any(Function) });
    });

    it('rejects attaching media with the wrong purpose', async () => {
      prisma.mediaAsset.findUnique.mockResolvedValue({
        ownerId: 'user-1',
        status: 'uploaded',
        purpose: 'post_media',
      });

      await expect(
        service.send('conv-1', 'user-1', { type: 'image', mediaId: 'media-1' }),
      ).rejects.toMatchObject({ getStatus: expect.any(Function) });
    });

    it('sends a text message and bumps lastMessageAt', async () => {
      const now = new Date();
      prisma.message.create.mockResolvedValue({
        id: 'msg-1',
        conversationId: 'conv-1',
        mediaId: null,
        createdAt: now,
      });

      const result = await service.send('conv-1', 'user-1', {
        type: 'text',
        body: '  hi  ',
      });

      expect(prisma.message.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ body: 'hi', mediaId: null }),
        }),
      );
      expect(prisma.conversation.update).toHaveBeenCalledWith({
        where: { id: 'conv-1' },
        data: { lastMessageAt: now },
      });
      expect(result.mediaUrl).toBeNull();
    });

    it('sends an image message with already-confirmed media', async () => {
      prisma.mediaAsset.findUnique.mockResolvedValue({
        ownerId: 'user-1',
        status: 'uploaded',
        purpose: 'chat_image',
      });
      prisma.message.create.mockResolvedValue({
        id: 'msg-1',
        conversationId: 'conv-1',
        mediaId: 'media-1',
        createdAt: new Date(),
      });
      mediaAssetsService.resolveViewUrls.mockResolvedValue(
        new Map([['media-1', 'https://x/1']]),
      );

      const result = await service.send('conv-1', 'user-1', {
        type: 'image',
        mediaId: 'media-1',
      });

      expect(result.mediaUrl).toBe('https://x/1');
    });
  });

  describe('list', () => {
    beforeEach(() => {
      conversationsService.assertAccess.mockResolvedValue({
        conversation: { id: 'conv-1' },
        participant: { id: 'p-1' },
        isAgencyStaff: false,
      });
    });

    it('marks messages from others as delivered when fetched', async () => {
      prisma.message.findMany.mockResolvedValue([
        { id: 'm-1', senderId: 'other', createdAt: new Date(), mediaId: null },
      ]);
      prisma.messageReceipt.findMany.mockResolvedValue([]);

      await service.list('conv-1', 'user-1');

      expect(prisma.messageReceipt.upsert).toHaveBeenCalledWith({
        where: { messageId_userId: { messageId: 'm-1', userId: 'user-1' } },
        update: {},
        create: expect.objectContaining({
          messageId: 'm-1',
          userId: 'user-1',
          status: MessageReceiptStatus.delivered,
        }),
      });
    });

    it('computes read/delivered/sent status only for my own messages', async () => {
      prisma.message.findMany.mockResolvedValue([
        {
          id: 'm-mine',
          senderId: 'user-1',
          createdAt: new Date(),
          mediaId: null,
        },
      ]);
      prisma.messageReceipt.findMany.mockResolvedValue([
        { messageId: 'm-mine', status: MessageReceiptStatus.read },
      ]);

      const result = await service.list('conv-1', 'user-1');

      expect(result.items[0].status).toBe('read');
    });

    it('reports sent when no receipt exists yet for my own message', async () => {
      prisma.message.findMany.mockResolvedValue([
        {
          id: 'm-mine',
          senderId: 'user-1',
          createdAt: new Date(),
          mediaId: null,
        },
      ]);
      prisma.messageReceipt.findMany.mockResolvedValue([]);

      const result = await service.list('conv-1', 'user-1');

      expect(result.items[0].status).toBe('sent');
    });

    it('paginates with a cursor when there are more results than the limit', async () => {
      const page = Array.from({ length: 3 }, (_, i) => ({
        id: `m-${i}`,
        senderId: 'user-1',
        createdAt: new Date(),
        mediaId: null,
      }));
      prisma.message.findMany.mockResolvedValue(page);
      prisma.messageReceipt.findMany.mockResolvedValue([]);

      const result = await service.list('conv-1', 'user-1', undefined, 2);

      expect(result.items).toHaveLength(2);
      expect(result.nextCursor).toBe('m-1');
    });
  });

  describe('markRead', () => {
    it('updates the participant lastReadAt for a direct/group conversation', async () => {
      conversationsService.assertAccess.mockResolvedValue({
        conversation: { id: 'conv-1', type: ConversationType.direct },
        participant: { id: 'p-1' },
        isAgencyStaff: false,
      });
      prisma.message.findMany.mockResolvedValue([{ id: 'm-1' }]);

      await service.markRead('conv-1', 'user-1');

      expect(prisma.conversation.update).not.toHaveBeenCalled();
      expect(prisma.messageReceipt.upsert).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { messageId_userId: { messageId: 'm-1', userId: 'user-1' } },
        }),
      );
    });

    it('updates agencyLastReadAt for agency staff instead of a participant row', async () => {
      conversationsService.assertAccess.mockResolvedValue({
        conversation: { id: 'conv-1', type: ConversationType.agency },
        participant: null,
        isAgencyStaff: true,
      });
      prisma.message.findMany.mockResolvedValue([]);

      await service.markRead('conv-1', 'staff-user');

      expect(prisma.conversation.update).toHaveBeenCalledWith({
        where: { id: 'conv-1' },
        data: { agencyLastReadAt: expect.any(Date) },
      });
    });
  });
});
